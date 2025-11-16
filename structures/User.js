const { formatUrl } = require("../helpers");
let client;

/**
 * @internal
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
   * @param {Array<Object>} [data.emblems=[]] - Array of user emblems.
   * @param {boolean} data.is_bot - Whether the user is a bot.
   * @param {string|number|Date} data.last_seen - Last seen timestamp.
   * @param {string|number|Date} data.created_at - Account creation timestamp.
   * @param {import('./Client')} clientInstance - The client instance.
   * @returns {User} The created User instance.
   * @example
   * User {
   *   id: 1,
   *   username: 'junior9244',
   *   displayName: 'Junior',
   *   avatarUrl: 'https://api.beniocord.site/uploads/avatars/1760736025811-629632107.png',
   *   status: 'online',
   *   emblems: [ [Object], [Object] ],
   *   isBot: false,
   *   lastSeen: '2025-11-16T14:44:19.394Z',
   *   createdAt: '2025-09-21T15:00:07.753Z'
   * }
   */
  constructor(data, clientInstance) {
    client = clientInstance;

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
   * @example
   * https://api.beniocord.site/uploads/avatars/1760736025811-629632107.png
   */
  avatarURL() {
    return this.avatarUrl;
  }

  /**
   * Fetches or refreshes this user from the API.
   * @param {boolean} [force=false] - Whether to force fetch even if cached.
   * @returns {Promise<User>} The updated User instance.
   * @example
   * const freshUser = await user.fetch();
   */
  async fetch(force = false) {
    if (!client) throw new Error("Client instance not available.");
    const updatedUser = await client.fetchUser(this.id, force);
    Object.assign(this, updatedUser);
    return this;
  }
}

module.exports = User;