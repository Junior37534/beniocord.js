class Channel {
  constructor(data, client) {
    this.client = client;

    this.id = data.id;
    this.name = data.name;
    this.description = data.description;
    this.type = data.type || "text";
    this.isPrivate = data.is_private;
    this.isDm = data.is_dm;
    this.iconUrl = data.icon_url;
    this.createdBy = data.created_by;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  async send(content, opts = {}) {
    return this.client.sendMessage(this.id, content, opts);
  }
}

module.exports = Channel;