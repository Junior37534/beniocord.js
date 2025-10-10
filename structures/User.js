class User {
  constructor(data) {
    this.id = data.id;
    this.username = data.username;
    this.displayName = data.display_name;
    this.email = data.email;
    this.avatarUrl = data.avatar_url;
    this.status = data.status || "offline";
    this.emblems = data.emblems || [];
    this.lastSeen = data.last_seen;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }
}

module.exports = User;
