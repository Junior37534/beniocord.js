const MessageCollector = require('./MessageCollector');

let client;
class Channel {
  constructor(data, clientInstance) {
    client = clientInstance;

    this.id = data.id;
    this.name = data.name;
    this.description = data.description;
    this.type = data.type || "text";
    this.isPrivate = data.is_private;
    this.isDm = data.is_dm;
    this.iconUrl = data.icon_url ? 'https://api.beniocord.site' + data.icon_url : undefined;
    this.createdBy = data.created_by;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
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