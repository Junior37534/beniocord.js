class Channel {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.description = data.description;
    this.type = data.type || "text";
    this.isPrivate = data.is_private || false;
    this.isDm = data.is_dm || false;
    this.iconUrl = data.icon_url;
    this.createdBy = data.created_by;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }
}

module.exports = Channel;
