const { io } = require("socket.io-client");
const axios = require("axios");
const EventEmitter = require("events");

const Message = require("./structures/Message");
const User = require("./structures/User");
const Channel = require("./structures/Channel");
const Emoji = require("./structures/Emoji");

class Client extends EventEmitter {
  constructor({ token }) {
    super();

    if (!token) {
      throw new Error("Token is required");
    }

    this.token = token;
    this.apiUrl = "https://beniocord-api.gamerjunior.shop";
    this.socket = null;
    this.isConnected = false;
    this.connectionTimeout = 10000; // 10 seconds
    this.maxRetries = 3;
    this.retryCount = 0;

    this.cache = {
      users: new Map(),
      channels: new Map(),
      messages: new Map(),
      emojis: new Map(),
      stickers: new Map(),
      presence: new Map(),
    };
  }

  async validateToken() {
    try {
      const response = await axios.get(`${this.apiUrl}/api/auth/verify`, {
        headers: { Authorization: `Bearer ${this.token}` },
        timeout: 5000
      });

      return response.data;
    } catch (error) {
      if (error.response) {
        switch (error.response.status) {
          case 401:
            throw new Error("Invalid token was provided");
          case 403:
            throw new Error("Token has expired or lacks permissions");
          default:
            throw new Error("Failed to validate token");
        }
      } else if (error.code === 'ECONNABORTED') {
        throw new Error("Token validation timeout");
      } else {
        throw new Error("Network error during token validation");
      }
    }
  }

  async login() {
    try {
      // First validate the token
      await this.validateToken();

      return await this.connectSocket();
    } catch (error) {
      this.emit("error", error);
      throw error;
    }
  }

  async connectSocket() {
    return new Promise((resolve, reject) => {
      const connectionTimeout = setTimeout(() => {
        if (this.socket) {
          this.socket.disconnect();
        }
        reject(new Error("Connection timeout - failed to connect within 10 seconds"));
      }, this.connectionTimeout);

      this.socket = io(this.apiUrl, {
        auth: { token: this.token },
        timeout: 5000,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: this.maxRetries
      });

      this.socket.on("connect", () => {
        clearTimeout(connectionTimeout);
        this.isConnected = true;
        this.retryCount = 0;
        this.emit("ready");
        resolve();
      });

      this.socket.on("disconnect", (reason) => {
        this.isConnected = false;
        this.emit("disconnect", reason);

        if (reason === "io server disconnect" || reason === "transport close") {
          this.emit("error", new Error("Disconnected by server - token may be invalid"));
        }
      });

      this.socket.on("connect_error", (error) => {
        clearTimeout(connectionTimeout);
        this.retryCount++;

        let errorMessage = "Failed to connect to server";

        if (error.message.includes("401") || error.message.includes("unauthorized")) {
          errorMessage = "Invalid token was provided";
        } else if (error.message.includes("403")) {
          errorMessage = "Token has expired or lacks permissions";
        } else if (error.message.includes("timeout")) {
          errorMessage = "Connection timeout";
        }

        const finalError = new Error(errorMessage);
        this.emit("error", finalError);

        if (this.retryCount >= this.maxRetries) {
          reject(finalError);
        }
      });

      this.socket.on("reconnect", (attemptNumber) => {
        this.isConnected = true;
        this.emit("reconnect", attemptNumber);
      });

      this.socket.on("reconnect_error", (error) => {
        this.emit("reconnectError", error);
      });

      this.socket.on("reconnect_failed", () => {
        this.emit("error", new Error("Failed to reconnect after maximum attempts"));
      });

      // Message handlers
      this.socket.on("message:new", (data) => {
        const msg = new Message(data, this);

        if (!msg.author && data.user_id) {
          msg.author = {
            id: data.user_id,
            username: data.username,
            displayName: data.display_name,
            avatarUrl: data.avatar_url
          };
        }
        if (!msg.channel && data.channel_id) {
          msg.channel = {
            id: data.channel_id,
          };
        }

        if (msg.author) this.cache.users.set(msg.author.id, msg.author);
        if (msg.channel) this.cache.channels.set(msg.channel.id, msg.channel);

        if (msg.channel) {
          const channelId = msg.channel.id;
          if (!this.cache.messages.has(channelId)) {
            this.cache.messages.set(channelId, []);
          }
          const msgs = this.cache.messages.get(channelId);
          msgs.push(msg);
          if (msgs.length > 50) msgs.shift();
        }

        this.emit("messageCreate", msg);
      });

      this.socket.on('message:deleted', (data) => {
        const { messageId } = data;
        for (const [channelId, messages] of this.cache.messages) {
          const msg = messages.find(m => m.id === messageId);
          if (msg) {
            msg.deleted = true;
            break;
          }
        }
        this.emit('messageDelete', data);
      });

      this.socket.on('message:edited', (data) => {
        const { messageId, content, editedAt } = data;

        // Atualizar mensagem no cache
        for (const [channelId, messages] of this.cache.messages) {
          const msg = messages.find(m => m.id === messageId);
          if (msg) {
            msg.content = content;
            msg.editedAt = editedAt;
            msg.edited = true;
            break;
          }
        }

        this.emit('messageEdit', data);
      });

      // Typing handlers
      this.socket.on('typing:user-start', (data) => {
        this.emit('typingStart', data);
      });

      this.socket.on('typing:user-stop', (data) => {
        this.emit('typingStop', data);
      });

      // User/Status handlers
      this.socket.on('user:status-update', (data) => {
        const { userId, status, lastSeen } = data;

        // Atualizar cache de usuários se existir
        if (this.cache.users.has(userId)) {
          const user = this.cache.users.get(userId);
          user.status = status;
          if (lastSeen) user.lastSeen = lastSeen;
        }

        // Atualizar presence
        if (this.cache.presence.has(userId)) {
          const presence = this.cache.presence.get(userId);
          presence.status = status;
        }

        this.emit('userStatusUpdate', data);
      });

      // Presence handlers
      this.socket.on('presence:update', (data) => {
        this.cache.presence.set(data.userId, data);
        this.emit('presenceUpdate', data);
      });

      // Member handlers
      this.socket.on('member:join', (data) => {
        this.emit('memberJoin', data);
      });

      this.socket.on('member:leave', (data) => {
        this.emit('memberLeave', data);
      });

      // Channel handlers
      this.socket.on('channel:update', (data) => {
        if (this.cache.channels.has(data.id)) {
          const channel = this.cache.channels.get(data.id);
          Object.assign(channel, data);
        }
        this.emit('channelUpdate', data);
      });

      this.socket.on('channel:delete', (data) => {
        this.cache.channels.delete(data.channelId);
        this.emit('channelDelete', data);
      });
    });
  }

  ensureConnected() {
    if (!this.socket || !this.socket.connected || !this.isConnected) {
      throw new Error("Socket is not connected - please call login() first");
    }
  }

  // ==================== MESSAGES ====================

  async sendMessage(channelId, content, opts = {}) {
    return new Promise((resolve, reject) => {
      try {
        this.ensureConnected();
      } catch (error) {
        return reject(error);
      }

      const timeout = setTimeout(() => {
        reject(new Error("Message send timeout"));
      }, 15000);

      this.socket.emit(
        'message:send',
        {
          channelId,
          content,
          messageType: opts.messageType || 'text',
          replyTo: opts.replyTo || null,
          fileUrl: opts.fileUrl || null,
          fileName: opts.fileName || null,
          fileSize: opts.fileSize || null,
          stickerId: opts.stickerId || null,
        },
        (response) => {
          clearTimeout(timeout);
          if (response && response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  async editMessage(messageId, newContent) {
    return new Promise((resolve, reject) => {
      try {
        this.ensureConnected();
      } catch (error) {
        return reject(error);
      }

      const timeout = setTimeout(() => {
        reject(new Error("Message edit timeout"));
      }, 15000);

      this.socket.emit(
        'message:edit',
        {
          messageId,
          content: newContent
        },
        (response) => {
          clearTimeout(timeout);
          if (response && response.error) {
            reject(new Error(response.error));
          } else {
            for (const [channelId, messages] of this.cache.messages) {
              const msg = messages.find(m => m.id === messageId);
              if (msg) {
                msg.content = newContent;
                msg.editedAt = new Date().toISOString();
                break;
              }
            }
            resolve(response);
          }
        }
      );
    });
  }

  async deleteMessage(messageId) {
    return new Promise((resolve, reject) => {
      try {
        this.ensureConnected();
      } catch (error) {
        return reject(error);
      }

      const timeout = setTimeout(() => {
        reject(new Error("Message delete timeout"));
      }, 15000);

      this.socket.emit('message:delete', { messageId }, (response) => {
        clearTimeout(timeout);
        if (response && response.error) {
          reject(new Error(response.error));
        } else {
          for (const [channelId, messages] of this.cache.messages) {
            const msg = messages.find(m => m.id === messageId);
            if (msg) {
              msg.deleted = true;
              break;
            }
          }
          resolve(response);
        }
      });
    });
  }

  async fetchChannelMessages(channelId, options = {}) {
    try {
      const params = {
        limit: options.limit || 50,
      };

      if (options.before) {
        params.before = options.before;
      }

      const res = await axios.get(`${this.apiUrl}/api/channels/${channelId}/messages`, {
        headers: { Authorization: `Bearer ${this.token}` },
        params,
        timeout: 5000
      });

      const messages = res.data.map(m => new Message(m, this));

      // Cache messages
      if (!this.cache.messages.has(channelId)) {
        this.cache.messages.set(channelId, []);
      }
      const cachedMessages = this.cache.messages.get(channelId);
      messages.forEach(msg => {
        if (!cachedMessages.find(m => m.id === msg.id)) {
          cachedMessages.push(msg);
        }
      });

      return messages;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid token was provided");
      } else if (error.response?.status === 403) {
        throw new Error("No permission to read messages in this channel");
      } else if (error.response?.status === 404) {
        throw new Error("Channel not found");
      } else if (error.code === 'ECONNABORTED') {
        throw new Error("Request timeout");
      } else {
        throw new Error("Failed to fetch messages");
      }
    }
  }

  async fetchMessage(channelId, messageId) {
    try {
      const res = await axios.get(`${this.apiUrl}/api/channels/${channelId}/messages/${messageId}`, {
        headers: { Authorization: `Bearer ${this.token}` },
        timeout: 5000
      });

      return new Message(res.data, this);
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid token was provided");
      } else if (error.response?.status === 403) {
        throw new Error("No permission to read messages in this channel");
      } else if (error.response?.status === 404) {
        throw new Error("Message not found");
      } else if (error.code === 'ECONNABORTED') {
        throw new Error("Request timeout");
      } else {
        throw new Error("Failed to fetch message");
      }
    }
  }

  // ==================== CHANNELS ====================

  async fetchChannels() {
    try {
      const res = await axios.get(`${this.apiUrl}/api/channels`, {
        headers: { Authorization: `Bearer ${this.token}` },
        timeout: 5000
      });

      const channels = res.data.map(c => {
        const channel = new Channel(c);
        this.cache.channels.set(channel.id, channel);
        return channel;
      });

      return channels;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid token was provided");
      } else if (error.code === 'ECONNABORTED') {
        throw new Error("Request timeout");
      } else {
        throw new Error("Failed to fetch channels");
      }
    }
  }

  async fetchChannel(id) {
    if (this.cache.channels.has(id)) return this.cache.channels.get(id);

    try {
      const res = await axios.get(`${this.apiUrl}/api/channels/${id}`, {
        headers: { Authorization: `Bearer ${this.token}` },
        timeout: 5000
      });
      const channel = new Channel(res.data);
      this.cache.channels.set(channel.id, channel);
      return channel;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid token was provided");
      } else if (error.response?.status === 404) {
        throw new Error("Channel not found");
      } else if (error.code === 'ECONNABORTED') {
        throw new Error("Request timeout");
      } else {
        throw new Error("Failed to fetch channel");
      }
    }
  }

  async createChannel(data) {
    try {
      const res = await axios.post(`${this.apiUrl}/api/channels`, data, {
        headers: { Authorization: `Bearer ${this.token}` },
        timeout: 5000
      });

      const channel = new Channel(res.data.channel);
      this.cache.channels.set(channel.id, channel);
      return channel;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid token was provided");
      } else if (error.response?.status === 400) {
        throw new Error(error.response.data.error || "Invalid channel data");
      } else if (error.code === 'ECONNABORTED') {
        throw new Error("Request timeout");
      } else {
        throw new Error("Failed to create channel");
      }
    }
  }

  async updateChannel(channelId, data) {
    try {
      const res = await axios.patch(`${this.apiUrl}/api/channels/${channelId}`, data, {
        headers: { Authorization: `Bearer ${this.token}` },
        timeout: 5000
      });

      const channel = new Channel(res.data.channel);
      this.cache.channels.set(channel.id, channel);
      return channel;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid token was provided");
      } else if (error.response?.status === 403) {
        throw new Error("No permission to manage this channel");
      } else if (error.response?.status === 404) {
        throw new Error("Channel not found");
      } else if (error.code === 'ECONNABORTED') {
        throw new Error("Request timeout");
      } else {
        throw new Error("Failed to update channel");
      }
    }
  }

  async deleteChannel(channelId) {
    try {
      const res = await axios.delete(`${this.apiUrl}/api/channels/${channelId}`, {
        headers: { Authorization: `Bearer ${this.token}` },
        timeout: 5000
      });

      this.cache.channels.delete(channelId);
      return res.data;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid token was provided");
      } else if (error.response?.status === 403) {
        throw new Error("Only the owner can delete the channel");
      } else if (error.response?.status === 404) {
        throw new Error("Channel not found");
      } else if (error.code === 'ECONNABORTED') {
        throw new Error("Request timeout");
      } else {
        throw new Error("Failed to delete channel");
      }
    }
  }

  // ==================== CHANNEL MEMBERS ====================

  async fetchChannelMembers(channelId) {
    try {
      const res = await axios.get(`${this.apiUrl}/api/channels/${channelId}/members`, {
        headers: { Authorization: `Bearer ${this.token}` },
        timeout: 5000
      });

      const members = res.data.map(m => {
        const user = new User(m);
        this.cache.users.set(user.id, user);
        return user;
      });

      return members;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid token was provided");
      } else if (error.response?.status === 403) {
        throw new Error("No access to this channel");
      } else if (error.response?.status === 404) {
        throw new Error("Channel not found");
      } else if (error.code === 'ECONNABORTED') {
        throw new Error("Request timeout");
      } else {
        throw new Error("Failed to fetch channel members");
      }
    }
  }

  async addChannelMember(channelId, userId, role = 'member') {
    try {
      const res = await axios.post(`${this.apiUrl}/api/channels/${channelId}/members`, {
        userId,
        role
      }, {
        headers: { Authorization: `Bearer ${this.token}` },
        timeout: 5000
      });

      return res.data;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid token was provided");
      } else if (error.response?.status === 403) {
        throw new Error("No permission to invite users");
      } else if (error.response?.status === 400) {
        throw new Error(error.response.data.error || "User already a member");
      } else if (error.code === 'ECONNABORTED') {
        throw new Error("Request timeout");
      } else {
        throw new Error("Failed to add channel member");
      }
    }
  }

  async updateChannelMember(channelId, userId, data) {
    try {
      const res = await axios.patch(`${this.apiUrl}/api/channels/${channelId}/members/${userId}`, data, {
        headers: { Authorization: `Bearer ${this.token}` },
        timeout: 5000
      });

      return res.data;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid token was provided");
      } else if (error.response?.status === 403) {
        throw new Error("No permission to manage members");
      } else if (error.response?.status === 404) {
        throw new Error("Member not found");
      } else if (error.code === 'ECONNABORTED') {
        throw new Error("Request timeout");
      } else {
        throw new Error("Failed to update channel member");
      }
    }
  }

  async removeChannelMember(channelId, userId) {
    try {
      const res = await axios.delete(`${this.apiUrl}/api/channels/${channelId}/members/${userId}`, {
        headers: { Authorization: `Bearer ${this.token}` },
        timeout: 5000
      });

      return res.data;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid token was provided");
      } else if (error.response?.status === 403) {
        throw new Error("No permission to remove members");
      } else if (error.response?.status === 404) {
        throw new Error("Member not found");
      } else if (error.code === 'ECONNABORTED') {
        throw new Error("Request timeout");
      } else {
        throw new Error("Failed to remove channel member");
      }
    }
  }

  // ==================== USERS ====================

  async fetchUser(id) {
    // if (this.cache.users.has(id)) return this.cache.users.get(id);

    try {
      const res = await axios.get(`${this.apiUrl}/api/users/${id}`, {
        headers: { Authorization: `Bearer ${this.token}` },
        timeout: 5000
      });
      const user = new User(res.data);
      this.cache.users.set(user.id, user);
      return user;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid token was provided");
      } else if (error.response?.status === 404) {
        throw new Error("User not found");
      } else if (error.code === 'ECONNABORTED') {
        throw new Error("Request timeout");
      } else {
        throw new Error("Failed to fetch user");
      }
    }
  }

  // ==================== PRESENCE ====================

  async fetchPresence(userId) {
    // if (this.cache.presence.has(userId)) return this.cache.presence.get(userId);

    try {
      const res = await axios.get(`${this.apiUrl}/api/presence/${userId}`, {
        headers: { Authorization: `Bearer ${this.token}` },
        timeout: 5000
      });

      this.cache.presence.set(userId, res.data);
      return res.data;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid token was provided");
      } else if (error.response?.status === 404) {
        throw new Error("Presence not found");
      } else if (error.code === 'ECONNABORTED') {
        throw new Error("Request timeout");
      } else {
        throw new Error("Failed to fetch presence");
      }
    }
  }

  // ==================== EMOJIS ====================

  async fetchEmoji(id) {
    // if (this.cache.emojis.has(id)) return this.cache.emojis.get(id);

    try {
      const res = await axios.get(`${this.apiUrl}/api/emojis/${id}`, {
        headers: { Authorization: `Bearer ${this.token}` },
        timeout: 5000
      });
      const emoji = new Emoji(res.data);
      this.cache.emojis.set(emoji.id, emoji);
      return emoji;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid token was provided");
      } else if (error.response?.status === 404) {
        throw new Error("Emoji not found");
      } else if (error.code === 'ECONNABORTED') {
        throw new Error("Request timeout");
      } else {
        throw new Error("Failed to fetch emoji");
      }
    }
  }

  async fetchAllEmojis(options = {}) {
    try {
      const endpoint = options.includeOthers ? '/api/emojis/all' : '/api/emojis';
      const params = {};

      if (options.search) {
        params.search = options.search;
      }

      const res = await axios.get(`${this.apiUrl}${endpoint}`, {
        headers: { Authorization: `Bearer ${this.token}` },
        params,
        timeout: 5000
      });

      const emojis = res.data.map(e => {
        const emoji = new Emoji(e);
        this.cache.emojis.set(emoji.id, emoji);
        return emoji;
      });

      return emojis;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid token was provided");
      } else if (error.code === 'ECONNABORTED') {
        throw new Error("Request timeout");
      } else {
        throw new Error("Failed to fetch emojis");
      }
    }
  }

  // ==================== STICKERS ====================

  async fetchSticker(id) {
    // if (this.cache.stickers.has(id)) return this.cache.stickers.get(id);

    try {
      const res = await axios.get(`${this.apiUrl}/api/stickers/${id}`, {
        headers: { Authorization: `Bearer ${this.token}` },
        timeout: 5000
      });

      this.cache.stickers.set(res.data.id, res.data);
      return res.data;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid token was provided");
      } else if (error.response?.status === 404) {
        throw new Error("Sticker not found");
      } else if (error.code === 'ECONNABORTED') {
        throw new Error("Request timeout");
      } else {
        throw new Error("Failed to fetch sticker");
      }
    }
  }

  async fetchAllStickers(options = {}) {
    try {
      const params = {};

      if (options.search) {
        params.search = options.search;
      }

      const res = await axios.get(`${this.apiUrl}/api/stickers/all`, {
        headers: { Authorization: `Bearer ${this.token}` },
        params,
        timeout: 5000
      });

      res.data.forEach(s => {
        this.cache.stickers.set(s.id, s);
      });

      return res.data;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid token was provided");
      } else if (error.code === 'ECONNABORTED') {
        throw new Error("Request timeout");
      } else {
        throw new Error("Failed to fetch stickers");
      }
    }
  }

  // ==================== FILE UPLOAD ====================

  async uploadFile(file) {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await axios.post(`${this.apiUrl}/api/upload`, formData, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'multipart/form-data'
        },
        timeout: 30000 // 30 seconds for file uploads
      });

      return res.data;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid token was provided");
      } else if (error.response?.status === 400) {
        throw new Error("No file provided");
      } else if (error.code === 'ECONNABORTED') {
        throw new Error("Upload timeout");
      } else {
        throw new Error("Failed to upload file");
      }
    }
  }

  // ==================== TYPING INDICATORS ====================

  startTyping(channelId) {
    try {
      this.ensureConnected();
      this.socket.emit('typing:start', { channelId });
    } catch (error) {
      this.emit("error", error);
    }
  }

  stopTyping(channelId) {
    try {
      this.ensureConnected();
      this.socket.emit('typing:stop', { channelId });
    } catch (error) {
      this.emit("error", error);
    }
  }

  // ==================== UTILITY METHODS ====================

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.isConnected = false;
    }
  }

  isReady() {
    return this.isConnected && this.socket && this.socket.connected;
  }

  clearCache() {
    this.cache.users.clear();
    this.cache.channels.clear();
    this.cache.messages.clear();
    this.cache.emojis.clear();
    this.cache.stickers.clear();
    this.cache.presence.clear();
  }
}

module.exports = Client;