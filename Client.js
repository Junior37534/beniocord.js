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

class ClientError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ClientError';
    this.code = code;
  }
}

let global = {
  token: "",
  apiUrl: "https://api-bots.beniocord.site"
};
/**
 * @fires Client#ready
 * @fires Client#messageCreate
 * @fires Client#messageDelete
 * @fires Client#messageEdit
 * @fires Client#error
 * @fires Client#disconnect
 * @fires Client#reconnect
 */
class Client extends EventEmitter {
  constructor({ token }) {
    super();

    if (!token || typeof token !== 'string' || token.trim() === '') {
      throw new ClientError("Valid token is required", "INVALID_TOKEN");
    }

    // this.token = token.trim();
    global.token = token.trim();
    // this.apiUrl = "https://api-bots.beniocord.site";
    this.socket = null;
    this.user = null;
    this.isConnected = false;
    this.isReady = false;

    this.config = {
      connectionTimeout: 15000,
      requestTimeout: 10000,
      maxRetries: 3,
      reconnectionDelay: 1000,
    };

    this.retryCount = 0;

    this.cache = {
      users: new Map(),
      channels: new Map(),
      messages: new Map(),
      emojis: new Map(),
      stickers: new Map(),
      presence: new Map(),
    };

    this._sentMessages = new Set();

    this._axios = axios.create({
      baseURL: global.apiUrl,
      timeout: this.config.requestTimeout,
      headers: {
        'Authorization': `Bearer ${global.token}`,
        'x-bot-token': global.token,
        'Content-Type': 'application/json',
        'Origin': global.apiUrl
      }
    });

    this._axios.interceptors.response.use(
      response => response,
      error => this._handleAxiosError(error)
    );

    setInterval(() => {
      if (this._sentMessages.size > 1000) {
        this._sentMessages.clear();
      }
    }, 30 * 60 * 1000);

  }

  _handleAxiosError(error) {
    if (error.response) {
      const { status, data } = error.response;
      const errorCode = data?.error || 'UNKNOWN_ERROR';
      const errorMessage = data?.message || error.message;

      switch (status) {
        case 401:
          throw new ClientError(
            errorMessage || "Invalid or expired token",
            errorCode || "UNAUTHORIZED"
          );
        case 403:
          throw new ClientError(
            errorMessage || "Token lacks necessary permissions",
            errorCode || "FORBIDDEN"
          );
        case 404:
          throw new ClientError(
            errorMessage || "Resource not found",
            errorCode || "NOT_FOUND"
          );
        case 429:
          throw new ClientError(
            errorMessage || "Rate limit exceeded",
            errorCode || "RATE_LIMITED"
          );
        default:
          throw new ClientError(
            errorMessage || "API request failed",
            errorCode
          );
      }
    } else if (error.code === 'ECONNABORTED') {
      throw new ClientError("Request timeout", "TIMEOUT");
    } else if (error.code === 'ECONNREFUSED') {
      throw new ClientError("Cannot connect to API server", "CONNECTION_REFUSED");
    } else {
      throw new ClientError(
        error.message || "Network error",
        error.code || "NETWORK_ERROR"
      );
    }
  }

  async validateToken() {
    try {
      const response = await this._axios.get('/api/auth/verify');
      return response.data;
    } catch (error) {
      if (error instanceof ClientError) {
        throw error;
      }
      throw new ClientError("Failed to validate token", "VALIDATION_FAILED");
    }
  }

  async login() {
    try {
      await this.validateToken();
      await this._connectSocket();
      await this.fetchMe();
      await this.setStatus('online');

      if (!this.user.isBot) {
        this.disconnect();
        throw new ClientError(
          "The provided token does not belong to a bot user",
          "NOT_A_BOT"
        );
      }

      await this._joinAllChannelRooms();

      this.isReady = true;
      this.emit("ready", this.user);

      return this.user;
    } catch (error) {
      this.emit("error", error);
      throw error;
    }
  }

  async _connectSocket() {
    return new Promise((resolve, reject) => {
      const connectionTimeout = setTimeout(() => {
        if (this.socket) {
          this.socket.disconnect();
        }
        reject(new ClientError(
          `Connection timeout - failed to connect within ${this.config.connectionTimeout}ms`,
          "CONNECTION_TIMEOUT"
        ));
      }, this.config.connectionTimeout);

      this.socket = io(global.apiUrl, {
        auth: { token: global.token },
        extraHeaders: { 'Origin': global.apiUrl },
        timeout: 5000,
        reconnection: true,
        reconnectionDelay: this.config.reconnectionDelay,
        reconnectionAttempts: this.config.maxRetries,
        transports: ['websocket', 'polling']
      });

      this.socket.on("connect", () => {
        clearTimeout(connectionTimeout);
        this.isConnected = true;
        this.retryCount = 0;
        this._setupSocketHandlers();
        this._startHeartbeat();
        resolve();
      });

      this.socket.on("disconnect", (reason) => {
        this.isConnected = false;
        this._stopHeartbeat(); // Para o heartbeat
        this.emit("disconnect", reason);

        if (reason === "io server disconnect") {
          this.emit("error", new ClientError(
            "Disconnected by server - token may be invalid or revoked",
            "SERVER_DISCONNECT"
          ));
        }
      });

      this.socket.on("connect_error", (error) => {
        clearTimeout(connectionTimeout);
        this.retryCount++;

        let errorCode = "CONNECTION_ERROR";
        let errorMessage = "Failed to connect to server";

        const errorStr = error.message.toLowerCase();

        if (errorStr.includes("401") || errorStr.includes("unauthorized")) {
          errorCode = "UNAUTHORIZED";
          errorMessage = "Invalid token";
        } else if (errorStr.includes("403") || errorStr.includes("forbidden")) {
          errorCode = "FORBIDDEN";
          errorMessage = "Token expired or revoked";
        } else if (errorStr.includes("timeout")) {
          errorCode = "TIMEOUT";
          errorMessage = "Connection timeout";
        }

        const clientError = new ClientError(errorMessage, errorCode);
        this.emit("error", clientError);

        if (this.retryCount >= this.config.maxRetries) {
          reject(clientError);
        }
      });

      this.socket.on("reconnect", (attemptNumber) => {
        this.isConnected = true;
        this._startHeartbeat();
        this.emit("reconnect", attemptNumber);
      });

      this.socket.on("reconnect_error", (error) => {
        this.emit("reconnectError", error);
      });

      this.socket.on("reconnect_failed", () => {
        this._stopHeartbeat();
        this.emit("error", new ClientError(
          "Failed to reconnect after maximum attempts",
          "RECONNECT_FAILED"
        ));
      });
    });
  }

  async _joinAllChannelRooms() {
    try {
      const channels = await this.fetchChannels();

      for (const channel of channels) {
        if (this.socket && this.socket.connected) {
          this.socket.emit('channel:join', { channelId: channel.id });
        }
      }
    } catch (error) {
      console.error('Erro ao entrar nas rooms dos canais:', error);
    }
  }

  /**
   * Inicia o sistema de heartbeat
   * @private
   */
  _startHeartbeat() {
    // Para qualquer heartbeat existente
    this._stopHeartbeat();

    // Intervalo de 30 segundos (mesmo do frontend)
    const HEARTBEAT_INTERVAL = 30000;

    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.isConnected) {
        // Envia heartbeat simples para bots
        // Bots não precisam de isPageVisible/isAppFocused
        this.socket.emit("presence:heartbeat", {
          status: this.status || "online",
          clientType: "bot" // Identifica como bot
        });
      }
    }, HEARTBEAT_INTERVAL);

    // Envia primeiro heartbeat imediatamente
    if (this.socket && this.isConnected) {
      this.socket.emit("presence:heartbeat", {
        status: this.status || "online",
        clientType: "bot"
      });
    }
  }

  /**
   * Para o sistema de heartbeat
   * @private
   */
  _stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Desconecta o cliente e limpa recursos
   */
  disconnect() {
    this._stopHeartbeat();

    if (this.socket) {
      // Notifica o servidor antes de desconectar
      if (this.isConnected) {
        this.socket.emit("presence:update", {
          isPageVisible: false,
          isAppFocused: false,
          status: "offline",
          clientType: "bot"
        });
      }

      this._removeSocketHandlers();

      this.socket.off("connect");
      this.socket.off("disconnect");
      this.socket.off("connect_error");
      this.socket.off("reconnect");
      this.socket.off("reconnect_error");
      this.socket.off("reconnect_failed");

      this.socket.disconnect();
      this.socket = null;
    }

    this.isConnected = false;
    this.isReady = false;
  }


  _setupSocketHandlers() {
    this._removeSocketHandlers();

    this.socket.on('message:new', async (data) => {
      try {
        if (this._sentMessages.has(data.id)) {
          this._sentMessages.delete(data.id);
          return;
        }

        const msg = await this._processSocketMessage(data);
        this._cacheMessage(msg);
        this.emit("messageCreate", msg);
      } catch (error) {
        this.emit("error", error);
      }
    });

    this.socket.on('message:deleted', (data) => {
      const { messageId } = data;
      this._markMessageDeleted(messageId);
      this.emit('messageDelete', data);
    });

    this.socket.on('message:edited', (data) => {
      const { messageId, content, editedAt } = data;
      this._updateMessageContent(messageId, content, editedAt);
      this.emit('messageEdit', data);
    });

    this.socket.on('typing:user-start', (data) => {
      this.emit('typingStart', data);
    });

    this.socket.on('typing:user-stop', (data) => {
      this.emit('typingStop', data);
    });

    this.socket.on('user:status-update', (data) => {
      this._updateUserStatus(data);
      this.emit('userStatusUpdate', data);
    });

    this.socket.on('presence:update', (data) => {
      this.cache.presence.set(data.userId, data);
      this.emit('presenceUpdate', data);
    });

    this.socket.on('member:join', async (data) => {
      const member = await this.fetchUser(data.memberId).catch(() => null);
      const channel = await this.fetchChannel(data.channelId).catch(() => null);

      if (data.addedBy) {
        data.addedBy = new User(data.addedBy, this);
      }

      data.member = member;
      data.channel = channel;

      if (data.memberId === this.user?.id) {
        if (channel && !this.cache.channels.has(data.channelId)) {
          this.cache.channels.set(data.channelId, channel);
        }

        if (this.socket && this.socket.connected) {
          this.socket.emit('channel:join', { channelId: data.channelId });
        }
      }

      if (channel && member) {
        if (!channel.members) {
          channel.members = new Map();
        }
        channel.members.set(member.id, member);
      }

      this.emit('memberJoin', data);
    });

    this.socket.on('member:leave', async (data) => {
      const member = await this.fetchUser(data.memberId).catch(() => null);
      const channel = await this.fetchChannel(data.channelId).catch(() => null);

      if (data.removedBy) {
        data.removedBy = new User(data.removedBy, this);
      }

      data.member = member;
      data.channel = channel;

      if (data.memberId === this.user?.id) {
        this.cache.channels.delete(data.channelId);
        if (this.socket && this.socket.connected) {
          this.socket.emit('channel:leave', { channelId: data.channelId });
        }
      }

      if (channel && member && channel.members) {
        channel.members.delete(member.id);
      }

      this.emit('memberLeave', data);
    });

    this.socket.on('channel:update', (data) => {
      this._updateChannel(data);
      this.emit('channelUpdate', data);
    });

    this.socket.on('channel:delete', (data) => {
      this.cache.channels.delete(data.channelId);
      this.emit('channelDelete', data);
    });

    this.socket.on('rate:limited', (data) => {
      this.emit('rateLimited', data);
    });
  }

  _removeSocketHandlers() {
    if (!this.socket) return;

    // Remove todos os listeners customizados
    this.socket.off("message:new");
    this.socket.off("message:deleted");
    this.socket.off("message:edited");
    this.socket.off("typing:user-start");
    this.socket.off("typing:user-stop");
    this.socket.off("user:status-update");
    this.socket.off("presence:update");
    this.socket.off("member:join");
    this.socket.off("member:leave");
    this.socket.off("channel:update");
    this.socket.off("channel:delete");
    this.socket.off("rate:limited");
  }

  async _processSocketMessage(data) {
    const msg = new Message(data, this);

    if (!msg.author && data.user_id) {
      msg.author = new User({
        id: data.user_id,
        username: data.username,
        display_name: data.display_name,
        avatar_url: data.avatar_url
      }, this);
    }

    if (!msg.channel && data.channel_id) {
      msg.channel = await this.fetchChannel(data.channel_id);
    }

    return msg;
  }

  _cacheMessage(msg) {
    if (msg.author) {
      this._ensureCached(this.cache.users, msg.author.id, msg.author);
    }

    if (msg.channel) {
      this._ensureCached(this.cache.channels, msg.channel.id, msg.channel);

      if (!this.cache.messages.has(msg.channel.id)) {
        this.cache.messages.set(msg.channel.id, []);
      }

      const messages = this.cache.messages.get(msg.channel.id);
      messages.push(msg);

      if (messages.length > 50) {
        messages.shift();
      }
    }
  }

  _markMessageDeleted(messageId) {
    for (const [channelId, messages] of this.cache.messages) {
      const msg = messages.find(m => m.id === messageId);
      if (msg) {
        msg.deleted = true;
        break;
      }
    }
  }

  _updateMessageContent(messageId, content, editedAt) {
    for (const [channelId, messages] of this.cache.messages) {
      const msg = messages.find(m => m.id === messageId);
      if (msg) {
        msg.content = content;
        msg.editedAt = editedAt;
        msg.edited = true;
        break;
      }
    }
  }

  _updateUserStatus(data) {
    const { userId, status, lastSeen } = data;

    if (this.cache.users.has(userId)) {
      const user = this.cache.users.get(userId);
      user.status = status;
      if (lastSeen) user.lastSeen = lastSeen;
    }

    if (this.cache.presence.has(userId)) {
      const presence = this.cache.presence.get(userId);
      presence.status = status;
    }
  }

  _updateChannel(data) {
    if (this.cache.channels.has(data.id)) {
      const channel = this.cache.channels.get(data.id);
      Object.assign(channel, data);
    }
  }

  _ensureCached(map, key, value) {
    const existing = map.get(key);
    if (existing) return existing;
    map.set(key, value);
    return value;
  }

  _ensureConnected() {
    if (!this.socket || !this.socket.connected || !this.isConnected) {
      throw new ClientError(
        "Socket is not connected - please call login() first",
        "NOT_CONNECTED"
      );
    }
  }

  /**
   * Set the user status
   * @param {string} status - Status: "online", "away", "dnd", "offline"
   */
  async setStatus(status) {
    const validStatuses = ["online", "offline", "away", "dnd"];

    if (!validStatuses.includes(status)) {
      throw new ClientError(
        `Invalid status. Valid statuses are: ${validStatuses.join(", ")}`,
        "INVALID_STATUS"
      );
    }

    this._ensureConnected();
    this.socket.emit('status:update', { status });
  }


  // async sendMessage(channelId, content, opts = {}) {
  //   return new Promise(async (resolve, reject) => {
  //     try {
  //       this._ensureConnected();

  //       let toSend = content;

  //       if (content instanceof MessageEmbed) {
  //         toSend = content.toText();
  //       }

  //       if (opts instanceof MessageAttachment) {
  //         const uploadedFile = await this.uploadFile(opts);

  //         if (uploadedFile) {
  //           const mimetype = opts.name.split('.').pop().toLowerCase();
  //           const messageType = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(mimetype)
  //             ? 'image'
  //             : 'file';

  //           opts = {
  //             fileUrl: uploadedFile.url,
  //             fileName: uploadedFile.originalName,
  //             fileSize: uploadedFile.size,
  //             messageType
  //           };
  //         }
  //       }

  //       if (opts.file) {
  //         const fileData = await this._handleFileUpload(opts.file, opts.fileName);
  //         opts.fileUrl = fileData.url;
  //         opts.fileName = fileData.originalName;
  //         opts.fileSize = fileData.size;
  //         opts.messageType = opts.messageType || fileData.detectedType;
  //       }

  //       // const timeout = setTimeout(() => {
  //       //   reject(new ClientError("Message send timeout", "SEND_TIMEOUT"));
  //       // }, 15000);

  //       this.socket.emit(
  //         'message:send',
  //         {
  //           channelId,
  //           content: toSend,
  //           messageType: opts.messageType || 'text',
  //           replyTo: opts.replyTo || null,
  //           fileUrl: opts.fileUrl || null,
  //           fileName: opts.fileName || null,
  //           fileSize: opts.fileSize || null,
  //           stickerId: opts.stickerId || null,
  //         },
  //         async (response) => {
  //           // clearTimeout(timeout);

  //           if (response && response.error) {
  //             reject(new ClientError(response.error, "SEND_ERROR"));
  //           } else {
  //             this._sentMessages.add(response.id);
  //             const msg = await this._processSocketMessage(response);
  //             this._cacheMessage(msg);
  //             resolve(msg);
  //           }
  //         }
  //       );

  //     } catch (error) {
  //       reject(error instanceof ClientError ? error : new ClientError(error.message, "SEND_ERROR"));
  //     }
  //   });
  // }


  /**
   * Send a message
   * @param {string} channelId - Channel ID
   * @param {string|MessageEmbed} content - Message content or MessageEmbed
   * @param {Object|MessageAttachment} opts - Extra options
   * @returns {Promise<Message>}
   */
  async sendMessage(channelId, content, opts = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        this._ensureConnected();

        let toSend = content;
        let messageType = 'text';
        let embedData = null;

        // Se o conteúdo é um MessageEmbed
        if (content instanceof MessageEmbed) {
          try {
            content.validate(); // Valida o embed
            embedData = content.toJSON();
            toSend = ''; // Embed não precisa de conteúdo de texto
            messageType = 'embed';
          } catch (error) {
            return reject(new ClientError(`Invalid embed: ${error.message}`, "INVALID_EMBED"));
          }
        }

        // Se opts é um MessageAttachment (mantém compatibilidade)
        if (opts instanceof MessageAttachment) {
          const uploadedFile = await this.uploadFile(opts);
          if (uploadedFile) {
            const mimetype = opts.name.split('.').pop().toLowerCase();
            const detectedType = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(mimetype)
              ? 'image'
              : 'file';
            opts = {
              fileUrl: uploadedFile.url,
              fileName: uploadedFile.originalName,
              fileSize: uploadedFile.size,
              messageType: detectedType
            };
            messageType = detectedType;
          }
        }

        // Se opts.file existe (upload de arquivo)
        if (opts.file) {
          const fileData = await this._handleFileUpload(opts.file, opts.fileName);
          opts.fileUrl = fileData.url;
          opts.fileName = fileData.originalName;
          opts.fileSize = fileData.size;
          messageType = opts.messageType || fileData.detectedType;
        }

        // Se opts.embed existe (nova forma de enviar embed)
        if (opts.embed) {
          if (opts.embed instanceof MessageEmbed) {
            try {
              opts.embed.validate();
              embedData = opts.embed.toJSON();
              messageType = 'embed';
            } catch (error) {
              return reject(new ClientError(`Invalid embed: ${error.message}`, "INVALID_EMBED"));
            }
          } else if (typeof opts.embed === 'object') {
            embedData = opts.embed;
            messageType = 'embed';
          }
        }

        // Sobrescreve messageType se fornecido explicitamente
        if (opts.messageType && !embedData) {
          messageType = opts.messageType;
        }

        this.socket.emit(
          'message:send',
          {
            channelId,
            content: toSend,
            messageType: messageType,
            replyTo: opts.replyTo || null,
            fileUrl: opts.fileUrl || null,
            fileName: opts.fileName || null,
            fileSize: opts.fileSize || null,
            stickerId: opts.stickerId || null,
            embedData: embedData, // Nova propriedade
          },
          async (response) => {
            if (response && response.error) {
              reject(new ClientError(response.error, "SEND_ERROR"));
            } else {
              this._sentMessages.add(response.id);
              const msg = await this._processSocketMessage(response);
              this._cacheMessage(msg);
              resolve(msg);
            }
          }
        );
      } catch (error) {
        reject(error instanceof ClientError ? error : new ClientError(error.message, "SEND_ERROR"));
      }
    });
  }

  async _handleFileUpload(file, fileName) {
    let fileBuffer;
    let finalFileName;
    let detectedType;

    if (Buffer.isBuffer(file)) {
      if (!fileName) {
        throw new ClientError('fileName is required when sending a Buffer', 'MISSING_FILENAME');
      }
      fileBuffer = file;
      finalFileName = fileName;
    }
    else if (typeof file === 'string') {
      if (file.startsWith('data:')) {
        const matches = file.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
          throw new ClientError('Invalid base64 string', 'INVALID_BASE64');
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
        finalFileName = fileName || `file${ext}`;
      }
      else if (file.match(/^[A-Za-z0-9+/=]+$/)) {
        if (!fileName) {
          throw new ClientError('fileName is required when sending base64 without data URI', 'MISSING_FILENAME');
        }
        fileBuffer = Buffer.from(file, 'base64');
        finalFileName = fileName;
      }
      else {
        if (!fs.existsSync(file)) {
          throw new ClientError('File not found', 'FILE_NOT_FOUND');
        }
        fileBuffer = fs.readFileSync(file);
        finalFileName = path.basename(file);
      }
    } else {
      throw new ClientError('Invalid file type. Expected Buffer, base64 string, or file path', 'INVALID_FILE_TYPE');
    }

    const ext = path.extname(finalFileName).toLowerCase();
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
    formData.append('file', fileBuffer, finalFileName);

    try {
      const uploadResponse = await this._axios.post('/api/upload', formData, {
        headers: formData.getHeaders(),
        timeout: 30000
      });

      return {
        ...uploadResponse.data,
        detectedType
      };
    } catch (error) {
      throw new ClientError(`File upload error: ${error.message}`, 'UPLOAD_FAILED');
    }
  }

  /**
   * @param {string} messageId
   * @param {string} newContent
   */
  async editMessage(messageId, newContent) {
    return new Promise((resolve, reject) => {
      try {
        this._ensureConnected();
      } catch (error) {
        return reject(error);
      }

      // const timeout = setTimeout(() => {
      //   reject(new ClientError("Message edit timeout", "EDIT_TIMEOUT"));
      // }, 15000);

      this.socket.emit(
        'message:edit',
        { messageId, content: newContent },
        (response) => {
          // clearTimeout(timeout);

          if (response && response.error) {
            reject(new ClientError(response.error, "EDIT_ERROR"));
          } else {
            this._updateMessageContent(messageId, newContent, new Date().toISOString());
            resolve(response);
          }
        }
      );
    });
  }

  /**
   * @param {string} messageId
   */
  async deleteMessage(messageId) {
    return new Promise((resolve, reject) => {
      try {
        this._ensureConnected();
      } catch (error) {
        return reject(error);
      }

      // const timeout = setTimeout(() => {
      //   reject(new ClientError("Message delete timeout", "DELETE_TIMEOUT"));
      // }, 15000);

      this.socket.emit('message:delete', { messageId }, (response) => {
        clearTimeout(timeout);

        if (response && response.error) {
          reject(new ClientError(response.error, "DELETE_ERROR"));
        } else {
          this._markMessageDeleted(messageId);
          resolve(response);
        }
      });
    });
  }

  /**
   * @param {string} channelId
   * @param {object} options
   */
  async fetchChannelMessages(channelId, options = {}) {
    try {
      const params = {
        limit: Math.min(options.limit || 50, 100),
      };

      if (options.before) {
        params.before = options.before;
      }

      const res = await this._axios.get(`/api/channels/${channelId}/messages`, { params });
      const messages = res.data.map(m => new Message(m, this));

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
      throw error instanceof ClientError ? error : new ClientError(error.message, "FETCH_MESSAGES_ERROR");
    }
  }

  /**
   * @param {string} channelId
   * @param {string} messageId
   */
  async fetchMessage(channelId, messageId) {
    try {
      const res = await this._axios.get(`/api/channels/${channelId}/messages/${messageId}`);
      return new Message(res.data, this);
    } catch (error) {
      throw error instanceof ClientError ? error : new ClientError(error.message, "FETCH_MESSAGE_ERROR");
    }
  }

  async fetchChannels() {
    try {
      const res = await this._axios.get('/api/channels');
      const channels = res.data.map(c => {
        const channel = new Channel(c, this);
        this.cache.channels.set(channel.id, channel);
        return channel;
      });

      return channels;
    } catch (error) {
      throw error instanceof ClientError ? error : new ClientError(error.message, "FETCH_CHANNELS_ERROR");
    }
  }

  /**
   * @param {string} id
   */
  async fetchChannel(id, force = false) {
    if (!force && this.cache.channels.has(id)) {
      return this.cache.channels.get(id);
    }

    try {
      const res = await this._axios.get(`/api/channels/${id}`);
      const channel = new Channel(res.data, this);
      this.cache.channels.set(channel.id, channel);
      return channel;
    } catch (error) {
      throw error instanceof ClientError
        ? error
        : new ClientError(error.message, "FETCH_CHANNEL_ERROR");
    }
  }

  /**
   * @param {object} options
   * @param {string} options.name
   * @param {string} options.description
   */
  async createChannel({ name, description = "" }) {
    if (!name || name.trim() === "") {
      throw new ClientError("Channel name is required", "INVALID_CHANNEL_NAME");
    }

    try {
      const data = {
        name: name.trim(),
        description,
        type: "text"
      };

      const res = await this._axios.post('/api/channels', data);
      const channel = new Channel(res.data.channel, this);
      this.cache.channels.set(channel.id, channel);
      return channel;
    } catch (error) {
      throw error instanceof ClientError ? error : new ClientError(error.message, "CREATE_CHANNEL_ERROR");
    }
  }

  /**
   * @param {string} channelId
   * @param {object} options
   */
  async updateChannel(channelId, { name, description }) {
    if (!name && !description) {
      throw new ClientError("At least one field must be provided to update", "NO_UPDATE_FIELDS");
    }

    try {
      const data = { type: "text" };
      if (name !== undefined) data.name = name.trim();
      if (description !== undefined) data.description = description;

      const res = await this._axios.patch(`/api/channels/${channelId}`, data);
      const channel = new Channel(res.data.channel, this);
      this.cache.channels.set(channel.id, channel);
      return channel;
    } catch (error) {
      throw error instanceof ClientError ? error : new ClientError(error.message, "UPDATE_CHANNEL_ERROR");
    }
  }

  /**
   * @param {string} channelId
   */
  async deleteChannel(channelId) {
    try {
      const res = await this._axios.delete(`/api/channels/${channelId}`);
      this.cache.channels.delete(channelId);
      return res.data;
    } catch (error) {
      throw error instanceof ClientError ? error : new ClientError(error.message, "DELETE_CHANNEL_ERROR");
    }
  }

  /**
   * @param {string} channelId
   */
  async fetchChannelMembers(channelId) {
    try {
      const res = await this._axios.get(`/api/channels/${channelId}/members`);
      const members = res.data.map(m => {
        const user = new User(m, this);
        this.cache.users.set(user.id, user);
        return user;
      });

      return members;
    } catch (error) {
      throw error instanceof ClientError ? error : new ClientError(error.message, "FETCH_MEMBERS_ERROR");
    }
  }

  /**
   * @param {string} channelId
   * @param {string} userId
   * @param {string} role
   */
  async addChannelMember(channelId, userId, role = 'member') {
    try {
      const res = await this._axios.post(`/api/channels/${channelId}/members`, {
        userId,
        role
      });
      return res.data;
    } catch (error) {
      throw error instanceof ClientError ? error : new ClientError(error.message, "ADD_MEMBER_ERROR");
    }
  }

  /**
   * @param {string} channelId
   * @param {string} userId
   * @param {object} data
   */
  async updateChannelMember(channelId, userId, data) {
    try {
      const res = await this._axios.patch(`/api/channels/${channelId}/members/${userId}`, data);
      return res.data;
    } catch (error) {
      throw error instanceof ClientError ? error : new ClientError(error.message, "UPDATE_MEMBER_ERROR");
    }
  }

  /**
   * @param {string} channelId
   * @param {string} userId
   */
  async removeChannelMember(channelId, userId) {
    try {
      const res = await this._axios.delete(`/api/channels/${channelId}/members/${userId}`);
      return res.data;
    } catch (error) {
      throw error instanceof ClientError ? error : new ClientError(error.message, "REMOVE_MEMBER_ERROR");
    }
  }

  /**
   * @param {string} id
   */
  async fetchUser(id, force = false) {
    if (!force && this.cache.users.has(id)) {
      return this.cache.users.get(id);
    }

    try {
      const res = await this._axios.get(`/api/users/${id}`);
      const user = new User(res.data, this);
      this.cache.users.set(user.id, user);
      return user;
    } catch (error) {
      throw error instanceof ClientError
        ? error
        : new ClientError(error.message, "FETCH_USER_ERROR");
    }
  }

  async fetchMe(force = false) {
    if (!force && this.user) {
      return this.user;
    }

    try {
      const res = await this._axios.get('/api/users/me');
      const user = new User(res.data, this);
      this.cache.users.set(user.id, user);
      this.user = user;
      return user;
    } catch (error) {
      throw error instanceof ClientError
        ? error
        : new ClientError(error.message, "FETCH_ME_ERROR");
    }
  }

  /**
   * @param {string} userId
   */
  async fetchPresence(userId) {
    try {
      const res = await this._axios.get(`/api/presence/${userId}`);
      this.cache.presence.set(userId, res.data);
      return res.data;
    } catch (error) {
      throw error instanceof ClientError ? error : new ClientError(error.message, "FETCH_PRESENCE_ERROR");
    }
  }

  /**
   * @param {string} id
   */
  async fetchEmoji(id, force = false) {
    if (!force && this.cache.emojis.has(id)) {
      return this.cache.emojis.get(id);
    }

    try {
      const res = await this._axios.get(`/api/emojis/${id}`);
      const emoji = new Emoji(res.data);
      this.cache.emojis.set(emoji.id, emoji);
      return emoji;
    } catch (error) {
      throw error instanceof ClientError
        ? error
        : new ClientError(error.message, "FETCH_EMOJI_ERROR");
    }
  }

  /**
   * @param {object} options
   */
  async fetchAllEmojis(options = {}) {
    try {
      const endpoint = options.includeOthers ? '/api/emojis/all' : '/api/emojis';
      const params = {};

      if (options.search) {
        params.search = options.search;
      }

      const res = await this._axios.get(endpoint, { params });
      const emojis = res.data.map(e => {
        const emoji = new Emoji(e);
        this.cache.emojis.set(emoji.id, emoji);
        return emoji;
      });

      return emojis;
    } catch (error) {
      throw error instanceof ClientError ? error : new ClientError(error.message, "FETCH_EMOJIS_ERROR");
    }
  }

  /**
   * @param {string} id
   */
  async fetchSticker(id, force = false) {
    if (!force && this.cache.stickers.has(id)) {
      return this.cache.stickers.get(id);
    }

    try {
      const res = await this._axios.get(`/api/stickers/${id}`);
      this.cache.stickers.set(res.data.id, res.data);
      return res.data;
    } catch (error) {
      throw error instanceof ClientError
        ? error
        : new ClientError(error.message, "FETCH_STICKER_ERROR");
    }
  }

  /**
   * @param {object} options
   */
  async fetchAllStickers(options = {}) {
    try {
      const params = {};

      if (options.search) {
        params.search = options.search;
      }

      const res = await this._axios.get('/api/stickers/all', { params });
      res.data.forEach(s => {
        this.cache.stickers.set(s.id, s);
      });

      return res.data;
    } catch (error) {
      throw error instanceof ClientError ? error : new ClientError(error.message, "FETCH_STICKERS_ERROR");
    }
  }

  async uploadFile(file) {
    try {
      const formData = new FormData();
      formData.append('file', file.buffer, { filename: file.name });
      const res = await this._axios.post('/api/upload', formData, {
        headers: formData.getHeaders(),
        timeout: 30000
      });

      return res.data;
    } catch (error) {
      throw error instanceof ClientError ? error : new ClientError(error.message, "UPLOAD_ERROR");
    }
  }

  /**
   * @param {string} channelId
   */
  startTyping(channelId) {
    try {
      this._ensureConnected();
      this.socket.emit('typing:start', { channelId });
    } catch (error) {
      this.emit("error", error);
    }
  }

  /**
   * @param {string} channelId
   */
  stopTyping(channelId) {
    try {
      this._ensureConnected();
      this.socket.emit('typing:stop', { channelId });
    } catch (error) {
      this.emit("error", error);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.isConnected = false;
      this.isReady = false;
    }
  }

  ready() {
    return this.isReady && this.isConnected && this.socket && this.socket.connected;
  }

  clearCache() {
    this.cache.users.clear();
    this.cache.channels.clear();
    this.cache.messages.clear();
    this.cache.emojis.clear();
    this.cache.stickers.clear();
    this.cache.presence.clear();
  }

  getCacheStats() {
    return {
      users: this.cache.users.size,
      channels: this.cache.channels.size,
      messages: Array.from(this.cache.messages.values()).reduce((acc, arr) => acc + arr.length, 0),
      emojis: this.cache.emojis.size,
      stickers: this.cache.stickers.size,
      presence: this.cache.presence.size,
    };
  }

  getConnectionInfo() {
    return {
      connected: this.isConnected,
      ready: this.isReady,
      socketId: this.socket?.id,
      retryCount: this.retryCount,
      user: this.user ? {
        id: this.user.id,
        username: this.user.username,
        isBot: this.user.isBot
      } : null
    };
  }
}

Client.MessageEmbed = MessageEmbed;
Client.ClientError = ClientError;
module.exports = Client;