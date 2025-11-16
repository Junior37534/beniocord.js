const { formatUrl } = require('../helpers');
const MessageCollector = require('./MessageCollector');
const Collection = require('@discordjs/collection').Collection;

let client;

/**
 * @internal
 */
class Channel {
  /**
   * Creates a new Channel instance.
   * @param {Object} data - Raw channel data.
   * @param {string|number} data.id - The unique ID of the channel.
   * @param {string} data.name - The name of the channel.
   * @param {string} [data.description] - The channel description.
   * @param {string} [data.type="text"] - The type of the channel (text, voice, etc.).
   * @param {string} [data.icon_url] - The URL of the channel icon.
   * @param {string|number} data.created_by - ID of the channel owner.
   * @param {boolean} [data.is_private=false] - Whether the channel is private.
   * @param {boolean} [data.is_locked=false] - Whether the channel is locked.
   * @param {number|string} [data.member_count=0] - Number of members in the channel.
   * @param {string|Date} data.created_at - Creation timestamp.
   * @param {string|Date} data.updated_at - Last update timestamp.
   * @param {import('./Client')} clientInstance - The client instance.
   * @returns {Channel} The created Channel instance.
   * @example
   * // msg.channel
   * Channel {
   *   id: 2,
   *   name: 'Privado',
   *   description: 'DM Privada para conversar secretas!\n',
   *   type: 'text',
   *   iconUrl: 'https://api.beniocord.site/uploads/1762899895145-938680330.gif',
   *   ownerId: 1,
   *   isPrivate: true,
   *   isLocked: false,
   *   memberCount: 8,
   *   createdAt: '2025-09-21T15:28:43.610Z',
   *   updatedAt: '2025-11-11T23:49:54.906Z',
   *   members: Collection(0) [Map] { fetch: [AsyncFunction (anonymous)] },
   *   messages: Collection(0) [Map] { fetch: [AsyncFunction (anonymous)] }
   * }
   */
  constructor(data, clientInstance) {
    client = clientInstance;

    this.id = data.id;
    this.name = data.name;
    this.description = data.description;
    this.type = data.type || "text";
    this.iconUrl = formatUrl(data.icon_url) || null;
    this.ownerId = data.created_by;
    this.isPrivate = data.is_private;
    this.isLocked = data.is_locked;
    this.memberCount = Number(data.member_count);
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;

    /**
     * Cached members of the channel.
     * @type {Collection<string, import('./User')>}
     */
    this.members = new Collection();
    this.members.fetch = async () => {
      const members = await client.fetchChannelMembers(this.id);
      this.members.clear();
      for (const member of members) {
        this.members.set(member.id, member);
      }
      return this.members;
    };

    /**
     * Cached messages of the channel.
     * @type {Collection<string, import('./Message')>}
     */
    this.messages = new Collection();
    this.messages.fetch = async (id) => {
      if (client.fetchMessage) {
        const message = await client.fetchMessage(this.id, id);
        if (message) this.messages.set(message.id, message);
        return message;
      }
      return null;
    };

    Object.defineProperty(this.members, '_cache', {
      value: new Map(),
      writable: true,
      enumerable: false,
    });
  }

  /**
   * Sends a message to the channel.
   * @param {string|Object} content - The content of the message.
   * @param {Object} [opts] - Optional message options.
   * @returns {Promise<import('./Message')>} The sent message.
   */
  async send(content, opts = {}) {
    return client.sendMessage(this.id, content, opts);
  }

  /**
   * Starts typing indicator in the channel.
   * @returns {Promise<void>}
   */
  startTyping() {
    return client.startTyping(this.id);
  }

  /**
   * Stops typing indicator in the channel.
   * @returns {Promise<void>}
   */
  stopTyping() {
    return client.stopTyping(this.id);
  }

  /**
   * Creates a new message collector in this channel.
   * @param {Object} [options={}] - Collector options.
   * @returns {MessageCollector} The created message collector.
   */
  createMessageCollector(options = {}) {
    return new MessageCollector(this, options, client);
  }
}

module.exports = Channel;