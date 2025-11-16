/**
 * Represents a user.
 */
class User {
  /**
   * Creates a new User instance.
   * @param {Object} data - Raw user data.
   * @param {string|number} data.id - The unique ID of the user.
   * @param {string} data.username - The username of the user.
   * @param {string} data.display_name - The display name of the user.
   * @param {string} data.avatar_url - The URL of the user's avatar.
   * @param {string} [data.status='offline'] - The user's status.
   * @param {Array<string>} [data.emblems=[]] - Array of user emblems.
   * @param {boolean} data.is_bot - Whether the user is a bot.
   * @param {string|number|Date} data.last_seen - Last seen timestamp.
   * @param {string|number|Date} data.created_at - Account creation timestamp.
   * @param {Object} client - The client instance (optional, internal use).
   */
  constructor(data, client) {
    this.id = data.id;
    this.username = data.username;
    this.displayName = data.display_name;
    this.avatarUrl = formatUrl(data.avatar_url);
    this.status = data.status || "offline";
    this.emblems = data.emblems || [];
    this.isBot = data.is_bot;
    this.lastSeen = data.last_seen;
    this.createdAt = data.created_at;
  }

  /**
   * Returns the avatar URL of the user.
   * @returns {string} The avatar URL.
   */
  avatarURL() {
    return this.avatarUrl;
  }
}

module.exports = User;
