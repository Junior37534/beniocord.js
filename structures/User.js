const { formatUrl } = require("../helpers");

class User {
  constructor(data, client) {
    this.id = data.id;
    this.username = data.username;
    this.displayName = data.display_name;
    this.avatarUrl = formatUrl(data.avatar_url);
    this.status = data.status || "offline";
    this.emblems = data.emblems || [];
    this.lastSeen = data.last_seen;
    this.createdAt = data.created_at;
    this.isBot = data.is_bot;
    // this.email = data.email;
    // this.updatedAt = data.updated_at;
  }

  // displayAvatarURL() {
  //   return this.avatarUrl;
  // }

  avatarURL() {
    return this.avatarUrl;
  }
}

module.exports = User;
