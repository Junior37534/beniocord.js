const MessageCollector = require('./MessageCollector');

class Channel {
  constructor(data, client) {
    this.client = client;

    this.id = data.id;
    this.name = data.name;
    this.description = data.description;
    this.type = data.type || "text";
    this.isPrivate = data.is_private;
    this.isDm = data.is_dm;
    this.iconUrl = data.icon_url ? client.apiUrl + data.icon_url : undefined;
    this.createdBy = data.created_by;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  async send(content, opts = {}) {
    return this.client.sendMessage(this.id, content, opts);
  }

  startTyping() {
    return this.client.startTyping(this.id);
  }

  stopTyping() {
    return this.client.stopTyping(this.id);
  }

  createMessageCollector(options = {}) {
    return new MessageCollector(this, options);
  }

}

module.exports = Channel;