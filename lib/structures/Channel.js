const { formatUrl } = require('../helpers');
const MessageCollector = require('./MessageCollector');
const Collection = require('../collection').Collection;

let client;
class Channel {
  constructor(data, clientInstance) {
    client = clientInstance;

    this.id = data.id;
    this.ownerId = data.created_by;
    this.name = data.name;
    this.description = data.description;
    this.type = data.type || "text";
    this.isPrivate = data.is_private;
    this.isLocked = data.is_locked;
    this.iconUrl = formatUrl(data.icon_url) || null;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
    this.memberCount = data.member_count;

    this.members = new Collection();
    this.members.fetch = async () => {
      const members = await client.fetchChannelMembers(this.id);
      this.members.clear();
      for (const member of members) {
        this.members.set(member.id, member);
      }
      return this.members;
    };

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

  async send(content, opts = {}) {
    return client.sendMessage(this.id, content, opts);
  }

  startTyping() {
    return client.startTyping(this.id);
  }

  stopTyping() {
    return client.stopTyping(this.id);
  }

  createMessageCollector(options = {}) {
    return new MessageCollector(this, options, client);
  }

}

module.exports = Channel;