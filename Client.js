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
    };
  }

  // Token validation
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

  // Main login method
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

  // Socket connection with timeout and retry logic
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
          // Server disconnected us, probably token issue
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
        this.emit('messageDelete', messageId);
      });
    });
  }

  // Connection check helper
  ensureConnected() {
    if (!this.socket || !this.socket.connected || !this.isConnected) {
      throw new Error("Socket is not connected - please call login() first");
    }
  }

  // Messages
  async sendMessage(channelId, content, opts = {}) {
    return new Promise((resolve, reject) => {
      try {
        this.ensureConnected();
      } catch (error) {
        return reject(error);
      }

      const timeout = setTimeout(() => {
        reject(new Error("Message send timeout"));
      }, 5000);

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
      }, 5000);

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
            // Update local cache
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
      }, 5000);

      this.socket.emit('message:delete', { messageId }, (response) => {
        clearTimeout(timeout);
        if (response && response.error) {
          reject(new Error(response.error));
        } else {
          // Update local cache
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

  // Fetch methods with better error handling
  async fetchUser(id) {
    if (this.cache.users.has(id)) return this.cache.users.get(id);
    
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

  async fetchEmoji(id) {
    if (this.cache.emojis.has(id)) return this.cache.emojis.get(id);

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

  async fetchAllEmojis() {
    try {
      const res = await axios.get(`${this.apiUrl}/api/emojis`, {
        headers: { Authorization: `Bearer ${this.token}` },
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

  // Typing indicators
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

  // Utility methods
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.isConnected = false;
    }
  }

  isReady() {
    return this.isConnected && this.socket && this.socket.connected;
  }
}

module.exports = Client;