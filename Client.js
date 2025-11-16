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
const { formatUrl } = require("./helpers");

let global = {
  token: "",
  apiUrl: "https://api-bots.beniocord.site"
};

class Client extends EventEmitter {
  /**
   * @typedef {Object} ClientEvents
   * @property {User} ready - Fired when the client finishes connecting
   * @property {Message} messageCreate - Fired when a new message is created
   * @property {Message} messageUpdate - Fired when a message is updated
   * @property {Message} messageDelete - Fired when a message is deleted
   * @property {Channel} channelCreate - Fired when a new channel is created
   * @property {Channel} channelDelete - Fired when a channel is deleted
   * @property {Channel} channelUpdate - Fired when a channel is updated
   * @property {{channel: Channel, member: User}} channelMemberAdd - Fired when a member joins a channel
   * @property {{channel: Channel, member: User}} channelMemberRemove - Fired when a member leaves a channel
   * @property {User} channelMemberUpdate - Fired when a member updates their info in a channel
   * @property {Emoji} emojiCreate - Fired when a new emoji is created
   * @property {Emoji} emojiDelete - Fired when an emoji is deleted
   * @property {Error} error - Fired when an error occurs
   * @property {void} disconnect - Fired when disconnected from the gateway
   * @property {void} reconnect - Fired when reconnecting to the gateway
   * 
   * @fires Client#ready
   * @fires Client#messageCreate
   * @fires Client#messageDelete
   * @fires Client#messageEdit
   * @fires Client#error
   * @fires Client#disconnect
   * @fires Client#reconnect
   * @fires Client#emojiCreate
   * @fires Client#emojiDelete
   * @fires Client#stickerCreate
   * @fires Client#stickerDelete
   * @fires Client#channelCreate
   * @fires Client#channelDelete
   * @fires Client#channelUpdate
   * @fires Client#channelMemberAdd
   * @fires Client#channelMemberRemove
   * @fires Client#channelMemberUpdate
   * @fires Client#typingStart
   * @fires Client#typingStop
   * @class Client
   * @description The main class of BenioCord.js, responsible for managing API communication and bot events.
   * @param {Object} options - Opções de configuração do cliente
   * @param {string} options.token - Token do bot para autenticação
   * @example
   * const Beniocord = require('beniocord.js');
   * const client = new Beniocord({ token: 'YOUR_BOT_TOKEN' });
   * client.login();
   */
  constructor({ token }) {
    super();

    if (!token || typeof token !== 'string' || token.trim() === '') {
      throw new ClientError("Valid token is required", "INVALID_TOKEN");
    }

    // Global configuration
    global.token = token.trim();

    // Client state
    this.socket = null;
    this.user = null;
    this.isConnected = false;
    this.isReady = false;
    this.status = 'online';
    this.version = require('./package.json').version;

    // Configuration options
    this.config = {
      connectionTimeout: 15000,
      requestTimeout: 10000,
      maxRetries: 3,
      reconnectionDelay: 1000,
    };

    this.retryCount = 0;
    this.heartbeatInterval = null;

    // Cache system
    this.cache = {
      users: new Map(),
      channels: new Map(),
      messages: new Map(),
      emojis: new Map(),
      stickers: new Map(),
    };

    // Track sent messages to avoid duplicates
    this._sentMessages = new Set();

    // Setup axios instance
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

    // Clean up sent messages cache periodically
    setInterval(() => {
      if (this._sentMessages.size > 1000) {
        this._sentMessages.clear();
      }
    }, 30 * 60 * 1000);
  }

  // ============================================================================
  // PUBLIC API METHODS - Authentication & Connection
  // ============================================================================

  /**
   * Validates the bot token with the API
   * @returns {Promise<Object>} Validation response
   */
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

  /**
   * Logs in the bot and establishes connection
   * @returns {Promise<User>} The bot user object
   */
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

      /**
       * @event Client#ready
       */
      this.emit("ready", this.user);

      return this.user;
    } catch (error) {
      this.emit("error", error);
      throw error;
    }
  }

  /**
   * Checks if the client is ready and connected
   * @returns {boolean} True if ready and connected
   */
  ready() {
    return this.isReady && this.isConnected && this.socket && this.socket.connected;
  }

  /**
   * Kills the connection to the server
   * @returns {void}
   */
  disconnect() {
    this._stopHeartbeat();

    if (this.socket) {
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

  // ============================================================================
  // PUBLIC API METHODS - User & Bot Status
  // ============================================================================

  /**
   * Sets the bot's status
   * @param {string} status - Status: "online", "away", "dnd", "offline"
   * @returns {Promise<Object>}
   * @example
   * client.setStatus("dnd").then((data) => {
   *  console.log("Status updated:", data);
   * });
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
    this.status = status;

    return new Promise((resolve) => {
      this.socket.once('user:status-update', (data) => {
        resolve(data);
      });

      this.socket.emit('status:update', { status });
    });
  }

  /**
   * Fetches information about the bot user
   * @param {boolean} [force=false] - Force fetch from API instead of cache
   * @returns {Promise<User>} Bot user object
   */
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
   * Fetches a user by ID
   * @param {string} id - User ID
   * @param {boolean} [force=false] - Force fetch from API instead of cache
   * @returns {Promise<User>} User object
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

  // ============================================================================
  // PUBLIC API METHODS - Channels
  // ============================================================================

  /**
   * Fetches all available channels
   * @returns {Promise<Channel[]>} Array of channel objects
   */
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
   * Fetches a specific channel by ID
   * @param {string} id - Channel ID
   * @param {boolean} [force=false] - Force fetch from API instead of cache
   * @returns {Promise<Channel>} Channel object
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
   * Creates a new channel
   * @param {Object} options - Channel options
   * @param {string} options.name - Channel name
   * @param {string} options.description - Channel description
   * @returns {Promise<Channel>} Created channel object
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
   * Updates a channel's information
   * @param {string} channelId - Channel ID
   * @param {Object} options - Update options
   * @param {string} options.name - New channel name
   * @param {string} options.description - New channel description
   * @returns {Promise<Channel>} Updated channel object
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
   * Deletes a channel
   * @param {string} channelId - Channel ID
   * @returns {Promise<Object>} Deletion response
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

  // ============================================================================
  // PUBLIC API METHODS - Channel Members
  // ============================================================================

  /**
   * Fetches all members of a channel
   * @param {string} channelId - Channel ID
   * @returns {Promise<User[]>} Array of user objects
   */
  async fetchChannelMembers(channelId) {
    try {
      const res = await this._axios.get(`/api/channels/${channelId}/members`);
      const channel = this.cache.channels.get(channelId);

      if (!channel) throw new ClientError("Canal não encontrado", "CHANNEL_NOT_FOUND");

      const members = res.data.map(m => {
        const user = new User(m, this);
        this.cache.users.set(user.id, user);
        channel.members.set(user.id, user);
        return user;
      });

      return members;
    } catch (error) {
      throw error instanceof ClientError ? error : new ClientError(error.message, "FETCH_MEMBERS_ERROR");
    }
  }

  /**
   * Adds a member to a channel
   * @param {string} channelId - Channel ID
   * @param {string} userId - User ID to add
   * @param {string} [role] - Member role (default: 'member')
   * @returns {Promise<Object>} Response data
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
   * Updates a channel member's information
   * @param {string} channelId - Channel ID
   * @param {string} userId - User ID
   * @param {Object} data - Update data
   * @returns {Promise<Object>} Response data
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
   * Removes a member from a channel
   * @param {string} channelId - Channel ID
   * @param {string} userId - User ID to remove
   * @returns {Promise<Object>} Response data
   */
  async removeChannelMember(channelId, userId) {
    try {
      const res = await this._axios.delete(`/api/channels/${channelId}/members/${userId}`);
      return res.data;
    } catch (error) {
      throw error instanceof ClientError ? error : new ClientError(error.message, "REMOVE_MEMBER_ERROR");
    }
  }

  // ============================================================================
  // PUBLIC API METHODS - Messages
  // ============================================================================

  /**
   * Sends a message to a channel
   * @param {string} channelId - Channel ID
   * @param {string|MessageEmbed} content - Message content or embed
   * @param {Object|MessageAttachment} opts - Additional options
   * @returns {Promise<Message>} Sent message object
   */
  async sendMessage(channelId, content, opts = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        this._ensureConnected();

        let toSend = content;
        let messageType = 'text';
        let embedData = null;

        // Handle MessageEmbed as content
        if (content instanceof MessageEmbed) {
          try {
            content.validate();
            embedData = content.toJSON();
            toSend = '';
            messageType = 'embed';
          } catch (error) {
            return reject(new ClientError(`Invalid embed: ${error.message}`, "INVALID_EMBED"));
          }
        }

        // Handle MessageAttachment as opts (backward compatibility)
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

        // Handle file upload
        if (opts.file) {
          const fileData = await this._handleFileUpload(opts.file, opts.fileName);
          opts.fileUrl = fileData.url;
          opts.fileName = fileData.originalName;
          opts.fileSize = fileData.size;
          messageType = opts.messageType || fileData.detectedType;
        }

        // Handle embed in opts
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

        // Override messageType if explicitly provided
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
            embedData: embedData,
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

  /**
   * Edits a message
   * @param {string} messageId - Message ID
   * @param {string} newContent - New message content
   * @returns {Promise<Object>} Response data
   */
  async editMessage(messageId, newContent) {
    return new Promise((resolve, reject) => {
      try {
        this._ensureConnected();
      } catch (error) {
        return reject(error);
      }

      this.socket.emit(
        'message:edit',
        { messageId, content: newContent },
        (response) => {
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
   * Deletes a message
   * @param {string} messageId - Message ID
   * @returns {Promise<Object>} Response data
   */
  async deleteMessage(messageId) {
    return new Promise((resolve, reject) => {
      try {
        this._ensureConnected();
      } catch (error) {
        return reject(error);
      }

      this.socket.emit('message:delete', { messageId }, (response) => {
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
   * Fetches messages from a channel
   * @param {string} channelId - Channel ID
   * @param {Object} options - Fetch options
   * @param {number} options.limit - Maximum number of messages (default: 50, max: 100)
   * @param {string} options.before - Fetch messages before this message ID
   * @returns {Promise<Message[]>} Array of message objects
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
   * Fetches a specific message
   * @param {string} channelId - Channel ID
   * @param {string} messageId - Message ID
   * @returns {Promise<Message>} Message object
   */
  async fetchMessage(channelId, messageId) {
    try {
      const res = await this._axios.get(`/api/channels/${channelId}/messages/${messageId}`);
      const raw = res.data;

      // --- USER ---
      const userData = {
        id: raw.user_id,
        username: raw.username,
        display_name: raw.display_name,
        avatar_url: raw.avatar_url,
        status: raw.status || 'online',
        emblems: raw.emblems || [],
        is_bot: raw.is_bot ?? false,
        last_seen: raw.last_seen ?? raw.created_at,
        created_at: raw.created_at,
      };
      const messageData = { ...raw, user: userData };

      // Cria a mensagem
      const message = new Message(messageData, this);

      // Cache do author
      if (message.author) this.cache.users.set(message.author.id, message.author);

      // --- CHANNEL ---
      if (!message.channel && raw.channel_id) {
        // Tenta pegar da cache
        let channel = this.cache.channels.get(raw.channel_id);
        if (!channel) {
          channel = await this.fetchChannel(raw.channel_id);
        }
        message.channel = channel;
      }

      return message;
    } catch (error) {
      throw error instanceof ClientError
        ? error
        : new ClientError(error.message, "FETCH_MESSAGE_ERROR");
    }
  }

  // ============================================================================
  // PUBLIC API METHODS - Typing Indicators
  // ============================================================================

  /**
   * Starts typing indicator in a channel
   * @param {string} channelId - Channel ID
   * @returns {void}
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
   * Stops typing indicator in a channel
   * @param {string} channelId - Channel ID
   * @returns {void}
   */
  stopTyping(channelId) {
    try {
      this._ensureConnected();
      this.socket.emit('typing:stop', { channelId });
    } catch (error) {
      this.emit("error", error);
    }
  }

  // ============================================================================
  // PUBLIC API METHODS - Emojis & Stickers
  // ============================================================================

  /**
   * Fetches an emoji by ID
   * @param {string} id - Emoji ID
   * @param {boolean} [force=false] - Force fetch from API instead of cache
   * @returns {Promise<Emoji>} Emoji object
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
   * Fetches all available emojis
   * @param {Object} options - Fetch options
   * @param {string} options.search - Search query
   * @returns {Promise<Emoji[]>} Array of emoji objects
   */
  async fetchAllEmojis(options = {}) {
    try {
      const endpoint = '/api/emojis/all';
      const params = {};

      if (options.search) {
        params.search = options.search;
      }

      const res = await this._axios.get(endpoint, { params });

      const emojis = res.data.map(e => {
        if (!e.user_id) e.user_id = this.user.id;
        const emoji = new Emoji(e);
        this.cache.emojis.set(emoji.id, emoji);
        return emoji;
      });

      return emojis;
    } catch (error) {
      throw error instanceof ClientError
        ? error
        : new ClientError(error.message, "FETCH_EMOJIS_ERROR");
    }
  }

  /**
   * Fetches a sticker by ID
   * @param {string} id - Sticker ID
   * @param {boolean} [force=false] - Force fetch from API instead of cache
   * @returns {Promise<Object>} Sticker data
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
   * Fetches all available stickers
   * @param {Object} options - Fetch options
   * @param {string} options.search - Search query
   * @returns {Promise<Object[]>} Array of sticker objects
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

  // ============================================================================
  // PUBLIC API METHODS - File Upload
  // ============================================================================

  /**
   * Uploads a file to the server
   * @param {MessageAttachment} file - File attachment to upload
   * @returns {Promise<Object>} Upload response with file URL
   */
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

  // ============================================================================
  // PUBLIC API METHODS - Cache Management
  // ============================================================================

  /**
   * Clears all cached data
   * @returns {void}
   */
  clearCache() {
    this.cache.users.clear();
    this.cache.channels.clear();
    this.cache.messages.clear();
    this.cache.emojis.clear();
    this.cache.stickers.clear();
  }

  // ============================================================================
  // PRIVATE METHODS - Socket Connection & Management
  // ============================================================================

  /**
   * Establishes WebSocket connection to the server
   * @private
   */
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
        this._stopHeartbeat();
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
        this.emit("error", error);
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

  /**
   * Joins all channel rooms on connection
   * @private
   */
  async _joinAllChannelRooms() {
    try {
      const channels = await this.fetchChannels();

      for (const channel of channels) {
        if (this.socket && this.socket.connected) {
          this.socket.emit('channel:join', { channelId: channel.id });
        }
      }
    } catch (error) {
      console.error('Error joining channel rooms:', error);
    }
  }

  /**
   * Sets up all socket event handlers
   * @private
   */
  _setupSocketHandlers() {
    this._removeSocketHandlers();

    /**
     * @event Client#messageCreate
     */
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

    /**
     * @event Client#messageDelete
     */
    this.socket.on('message:deleted', (data) => {
      const { messageId } = data;
      this._markMessageDeleted(messageId);
      this.emit('messageDelete', data);
    });

    /**
     * @event Client#messageEdit
     */
    this.socket.on('message:edited', (data) => {
      const { messageId, content, editedAt } = data;
      this._updateMessageContent(messageId, content, editedAt);
      this.emit('messageEdit', data);
    });

    /**
     * @event Client#typingStart
     */
    this.socket.on('typing:user-start', (data) => {
      this.emit('typingStart', data);
    });

    /**
     * @event Client#typingStop
     */
    this.socket.on('typing:user-stop', (data) => {
      this.emit('typingStop', data);
    });

    /**
     * @event Client#userStatusUpdate
     */
    this.socket.on('user:status-update', (data) => {
      this._updateUserStatus(data);
      this.emit('userStatusUpdate', data);
    });

    /**
     * @event Client#memberJoin
     */
    this.socket.on('member:join', async (data) => {
      const member = await this.fetchUser(data.memberId).catch(() => null);
      const channel = this.cache.channels.get(data.channelId);
      if (!channel || !member) return;
      channel.members.set(member.id, member);
      channel.memberCount = (channel.memberCount || 0) + 1;
      this.emit('memberJoin', { channel, member });
    });

    /**
     * @event Client#memberLeave
     */
    this.socket.on('member:leave', async (data) => {
      const channel = this.cache.channels.get(data.channelId);
      const member = this.cache.users.get(data.memberId);

      if (channel && member) {
        const wasDeleted = channel.members.delete(member.id);

        if (wasDeleted && channel.memberCount > 0) {
          channel.memberCount -= 1;
        }
      }

      this.emit('memberLeave', { channel, member });
    });

    /**
     * @event Client#channelUpdate
     */
    this.socket.on('channel:update', (data) => {
      this._updateChannel(data);
      this.emit('channelUpdate', data);
    });

    /**
     * @event Client#channelDelete
     */
    this.socket.on('channel:delete', (data) => {
      this.cache.channels.delete(data.channelId);
      this.emit('channelDelete', data);
    });

    /**
     * @event Client#rateLimited
     */
    this.socket.on('rate:limited', (data) => {
      this.emit('rateLimited', data);
    });
  }

  /**
   * Removes all socket event handlers
   * @private
   */
  _removeSocketHandlers() {
    if (!this.socket) return;

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

  /**
   * Starts the heartbeat interval to maintain connection
   * @private
   */
  _startHeartbeat() {
    this._stopHeartbeat();

    const HEARTBEAT_INTERVAL = 30000;

    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.isConnected) {
        this.socket.emit("presence:heartbeat", {
          status: this.status || "online",
          clientType: "bot"
        });
      }
    }, HEARTBEAT_INTERVAL);

    if (this.socket && this.isConnected) {
      this.socket.emit("presence:heartbeat", {
        status: this.status || "online",
        clientType: "bot"
      });
    }
  }

  /**
   * Stops the heartbeat interval
   * @private
   */
  _stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // ============================================================================
  // PRIVATE METHODS - Error Handling
  // ============================================================================

  /**
   * Handles axios request errors
   * @private
   */
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

  /**
   * Ensures the socket is connected before performing operations
   * @private
   */
  _ensureConnected() {
    if (!this.socket || !this.socket.connected || !this.isConnected) {
      throw new ClientError(
        "Socket is not connected - please call login() first",
        "NOT_CONNECTED"
      );
    }
  }

  // ============================================================================
  // PRIVATE METHODS - Message Processing
  // ============================================================================

  /**
   * Processes raw socket message data into Message object
   * @private
   */
  async _processSocketMessage(data) {
    const msg = new Message(data, this);

    if (!msg.author && data.user_id) {
      const cachedUser = this.cache.users.get(data.user_id);
      if (cachedUser) {
        cachedUser.username = data.username || cachedUser.username;
        cachedUser.displayName = data.display_name || cachedUser.displayName;
        cachedUser.avatarUrl = formatUrl(data.avatar_url) || cachedUser.avatarUrl;
        msg.author = cachedUser;
      } else {
        msg.author = new User({
          id: data.user_id,
          username: data.username,
          display_name: data.display_name,
          avatar_url: data.avatar_url,
        }, this);
        this.cache.users.set(msg.author.id, msg.author);
      }
    }

    if (!msg.channel && data.channel_id) {
      msg.channel = await this.fetchChannel(data.channel_id);
    }

    if (msg.channel.memberCount !== msg.channel.members.size) {
      await msg.channel.members.fetch();
    }

    return msg;
  }

  /**
   * Caches a message and related entities
   * @private
   */
  _cacheMessage(msg) {
    if (msg.author) {
      this._ensureCached(this.cache.users, msg.author.id, msg.author);
    }

    if (msg.channel) {
      const channel = msg.channel;
      this._ensureCached(this.cache.channels, channel.id, channel);

      // guarda a mensagem no canal
      channel.messages.set(msg.id, msg);

      // limita a 50 mensagens
      if (channel.messages.size > 50) {
        const firstKey = channel.messages.firstKey(); // método do Collection
        channel.messages.delete(firstKey);
      }
    }
  }

  /**
   * Marks a message as deleted in cache
   * @private
   */
  _markMessageDeleted(messageId) {
    for (const [channelId, messages] of this.cache.messages) {
      const msg = messages.find(m => m.id === messageId);
      if (msg) {
        msg.deleted = true;
        break;
      }
    }
  }

  /**
   * Updates message content in cache
   * @private
   */
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

  // ============================================================================
  // PRIVATE METHODS - Cache Utilities
  // ============================================================================

  /**
   * Updates user status in cache
   * @private
   */
  _updateUserStatus(data) {
    const { userId, status, lastSeen } = data;

    if (this.cache.users.has(userId)) {
      const user = this.cache.users.get(userId);
      user.status = status;
      if (lastSeen) user.lastSeen = lastSeen;
    }
  }

  /**
   * Updates channel data in cache
   * @private
   */
  _updateChannel(data) {
    if (this.cache.channels.has(data.id)) {
      const channel = this.cache.channels.get(data.id);
      Object.assign(channel, data);
    }
  }

  /**
   * Ensures a value is cached and returns it
   * @private
   */
  _ensureCached(map, key, value) {
    const existing = map.get(key);
    if (existing) return existing;
    map.set(key, value);
    return value;
  }

  // ============================================================================
  // PRIVATE METHODS - File Upload Handling
  // ============================================================================

  /**
   * Handles file upload from various input types
   * @private
   */
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

  // ============================================================================
  // EVENT EMITTER OVERRIDES
  // ============================================================================

  /**
   * Attaches an event listener.
   * @superInternal
   * @template {keyof ClientEvents} K
   * @param {K} event The event name.
   * @param {(arg: ClientEvents[K]) => void} listener
   * @returns {this}
   */
  on(event, listener) {
    return super.on(event, listener);
  }

  /**
   * Emits an event with typed arguments.
   * @internal
   * @template {keyof ClientEvents} K
   * @param {K} event
   * @param {ClientEvents[K]} payload
   * @returns {this}
   */
  emit(event, payload) {
    return super.emit(event, payload);
  }
}

/**
 * @internal
 */
class ClientError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} code - Error code
  */
  constructor(message, code) {
    super(message);
    this.name = 'ClientError';
    this.code = code;
  }
}

Client.MessageEmbed = MessageEmbed;
// Client.ClientError = ClientError;
module.exports = Client;