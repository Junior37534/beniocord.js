const { io } = require("socket.io-client");
const axios = require("axios");
const EventEmitter = require("events");
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const Message = require("./structures/Message");
const User = require("./structures/User");
const Channel = require("./structures/Channel");
const Emoji = require("./structures/Emoji");
const { MessageEmbed, MessageAttachment } = require("./structures/Util");
const FormData = require('form-data');

/**
 * Controlador de chat.
 * 
 * @fires Client#messageCreate
 */
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
        timeout: 15000
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
      await this.validateToken();
      return await this.connectSocket();
    } catch (error) {
      this.emit("error", error);
      throw error;
    }
  }

  async socketMsgToMsg(data) {
    const msg = new Message(data, this);

    if (!msg.author && data.user_id) {
      /*msg.author = {
        id: data.user_id,
        username: data.username,
        displayName: data.display_name,
        avatarUrl: data.avatar_url
      };*/
      msg.author = new User({
        id: data.user_id,
        username: data.username,
        displayName: data.display_name,
        avatarUrl: data.avatar_url
      })

      msg.member = { user: msg.author };
    }
    if (!msg.channel && data.channel_id) {
      msg.channel = await this.fetchChannel(data.channel_id)
    }

    return msg;
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

      this.socket.on("connect", async () => {
        clearTimeout(connectionTimeout);
        this.isConnected = true;
        this.retryCount = 0;
        await this.fetchMe();
        if (!this.user.isBot) {
          throw new Error("The provided token does not belong to a bot user");
        }
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
      this.socket.on("message:new", async (data) => {
        const msg = await this.socketMsgToMsg(data)

        if (!msg.author && data.user_id) {
          msg.author = {
            id: data.user_id,
            username: data.username,
            displayName: data.display_name,
            avatarUrl: data.avatar_url
          };
        }
        if (!msg.channel && data.channel_id) {
          msg.channel = await this.fetchChannel(data.channel_id)
        }

        if (msg.author) {
          msg.author = ensureCached(
            this.cache.users,
            msg.author.id,
            new User(msg.author, this)
          );
        }

        if (msg.channel) {
          msg.channel = ensureCached(
            this.cache.channels,
            msg.channel.id,
            new Channel(msg.channel, this)
          );

          if (!this.cache.messages.has(msg.channel.id)) {
            this.cache.messages.set(msg.channel.id, []);
          }
          msg.channel.messages = this.cache.messages.get(msg.channel.id);
          msg.channel.messages.push(msg);
          if (msg.channel.messages.length > 50) msg.channel.messages.shift();
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

      function ensureCached(map, key, value) {
        const existing = map.get(key);
        if (existing) return existing;
        map.set(key, value);
        return value;
      }
    });
  }

  ensureConnected() {
    if (!this.socket || !this.socket.connected || !this.isConnected) {
      throw new Error("Socket is not connected - please call login() first");
    }
  }

  // ==================== CLIENT USER ====================

  setStatus(status) {
    try {
      if (!["online", "offline", "away", "dnd"].includes(status)) {
        throw new Error('Invalid status. Valid statuses are: "online", "offline", "away", "dnd"');
      }
      this.ensureConnected();
      this.socket.emit('status:update', { status });
    } catch (error) {
      this.emit("error", error);
    }
  }

  // ==================== MESSAGES ====================

  async sendMessage(channelId, content, opts = {}) {
    return new Promise(async (resolve, reject) => {
      let toSend = content;

      if (content instanceof MessageEmbed) {
        toSend = content.toText();
      }

      if (opts instanceof MessageAttachment) {
        const uploadedFile = await this.uploadFile(opts);

        if (uploadedFile) {
          let mimetype = opts.name.split('.').pop();
          let messagetype = mimetype === "png" || mimetype === "jpg" || mimetype === "jpeg" || mimetype === "gif" ? "image" : "file";

          opts = { fileUrl: uploadedFile.url, fileName: uploadedFile.originalName, fileSize: uploadedFile.size, messageType: messagetype };
        }
      }

      try {
        this.ensureConnected();

        let fileData = null;

        if (opts.file) {
          try {
            let fileBuffer;
            let fileName;
            let detectedType;

            if (Buffer.isBuffer(opts.file)) {
              if (!opts.fileName) {
                throw new Error('fileName is required when sending a Buffer');
              }
              fileBuffer = opts.file;
              fileName = opts.fileName;
            } else if (typeof opts.file === 'string') {
              if (opts.file.startsWith('data:')) {
                const matches = opts.file.match(/^data:([^;]+);base64,(.+)$/);
                if (!matches) {
                  throw new Error('Invalid base64 string');
                }

                const mimeType = matches[1];
                const base64Data = matches[2];
                fileBuffer = Buffer.from(base64Data, 'base64');

                const mimeToExt = {
                  'image/png': '.png',
                  'image/jpeg': '.jpg',
                  'image/jpg': '.jpg',
                  'image/gif': '.gif',
                  'image/webp': '.webp',
                  'video/mp4': '.mp4',
                  'video/webm': '.webm',
                };

                const ext = mimeToExt[mimeType] || '.bin';
                fileName = opts.fileName || `file${ext}`;
              } else if (opts.file.match(/^[A-Za-z0-9+/=]+$/)) {
                if (!opts.fileName) {
                  throw new Error('fileName is required when sending base64 without data URI');
                }
                fileBuffer = Buffer.from(opts.file, 'base64');
                fileName = opts.fileName;
              } else {
                if (!fs.existsSync(opts.file)) {
                  throw new Error('File not found');
                }
                fileBuffer = fs.readFileSync(opts.file);
                fileName = path.basename(opts.file);
              }
            } else {
              throw new Error('Invalid file type. Expected Buffer, base64 string, or file path');
            }

            const ext = path.extname(fileName).toLowerCase();
            const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
            const videoExts = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm'];

            if (imageExts.includes(ext)) {
              detectedType = 'image';
            } else if (videoExts.includes(ext)) {
              detectedType = 'video';
            } else {
              detectedType = 'file';
            }

            const formData = new FormData();
            formData.append('file', fileBuffer, fileName);

            const axios = require('axios');

            const uploadResponse = await axios.post(`${this.apiUrl}/api/upload`, formData, {
              headers: {
                'Authorization': `Bearer ${this.token}`,
                ...formData.getHeaders()
              }
            });

            fileData = uploadResponse.data;

            opts.fileUrl = fileData.url;
            opts.fileName = fileData.originalName;
            opts.fileSize = fileData.size;
            opts.messageType = opts.messageType || detectedType;

          } catch (uploadError) {
            return reject(new Error(`File upload error: ${uploadError.message}`));
          }
        }

        const timeout = setTimeout(() => {
          reject(new Error("Message send timeout"));
        }, 15000);

        this.socket.emit(
          'message:send',
          {
            channelId,
            content: toSend,
            messageType: opts.messageType || 'text',
            replyTo: opts.replyTo || null,
            fileUrl: opts.fileUrl || null,
            fileName: opts.fileName || null,
            fileSize: opts.fileSize || null,
            stickerId: opts.stickerId || null,
          },
          async (response) => {
            clearTimeout(timeout);
            if (response && response.error) {
              reject(new Error(response.error));
            } else {
              resolve(await this.socketMsgToMsg(response));
            }
          }
        );

      } catch (error) {
        reject(error);
      }
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
        const channel = new Channel(c, this);
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
      const channel = new Channel(res.data, this);
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

  async createChannel({ name, description = "" }) {
    try {
      if (!name || name.trim() === "") {
        throw new Error("Channel name is required");
      }

      const data = {
        name: name.trim(),
        description,
        type: "text"
      };

      const res = await axios.post(`${this.apiUrl}/api/channels`, data, {
        headers: { Authorization: `Bearer ${this.token}` },
        timeout: 5000
      });

      const channel = new Channel(res.data.channel, this);
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
        throw error;
      }
    }
  }

  async updateChannel(channelId, { name, description }) {
    try {
      if (!name && !description) {
        throw new Error("At least one field must be provided to update");
      }

      const data = {};
      if (name !== undefined) data.name = name.trim();
      if (description !== undefined) data.description = description;
      data.type = "text";

      const res = await axios.patch(`${this.apiUrl}/api/channels/${channelId}`, data, {
        headers: { Authorization: `Bearer ${this.token}` },
        timeout: 5000
      });

      const channel = new Channel(res.data.channel, this);
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
        throw error;
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
        const user = new User(m, this);
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
      const user = new User(res.data, this);
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

  async fetchMe() {
    // if (this.cache.users.has(id)) return this.cache.users.get(id);

    try {
      const res = await axios.get(`${this.apiUrl}/api/users/me`, {
        headers: { Authorization: `Bearer ${this.token}` },
        timeout: 5000
      });
      const user = new User(res.data, this);
      this.cache.users.set(user.id, user);
      this.user = user;
      return user;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid token was provided");
      } else if (error.response?.status === 404) {
        throw new Error("Not found");
      } else if (error.code === 'ECONNABORTED') {
        throw new Error("Request timeout");
      } else {
        throw new Error("Failed to fetch me");
      }
    }
  }

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
        throw new Error("Failed to fetch presence: " + error.message);
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
      const emoji = new Emoji(res.data, this.apiUrl);
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
        const emoji = new Emoji(e, this.apiUrl);
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
    return new Promise(async (resolve, reject) => {
      try {
      const formData = new FormData();
      formData.append('file', file.buffer, { filename: file.name });

      const res = await axios.post(`${this.apiUrl}/api/upload`, formData, {
        headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'multipart/form-data'
        },
        timeout: 30000 // 30 seconds for file uploads
      });
      console.log(res)
      resolve(res.data);
      } catch (error) {
      if (error.response?.status === 401) {
        reject(new Error("Invalid token was provided"));
      } else if (error.response?.status === 400) {
        reject(new Error("No file provided"));
      } else if (error.code === 'ECONNABORTED') {
        reject(new Error("Upload timeout"));
      } else {
        reject(new Error("Failed to upload file"));
      }
      }
    });
  }

  // ==================== TYPING INDICATORS ====================

  startTyping(channelId) {
    try {
      this.ensureConnected();
      return this.socket.emit('typing:start', { channelId });
    } catch (error) {
      this.emit("error", error);
    }
  }

  stopTyping(channelId) {
    try {
      this.ensureConnected();
      return this.socket.emit('typing:stop', { channelId });
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

/**
 * Evento disparado quando uma mensagem é criada.
 * 
 * @event Client#messageCreate
 * @type {Message}
 */

module.exports = Client;