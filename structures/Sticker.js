const { formatUrl } = require("../helpers");

/**
 * @internal
 */
class Sticker {
  /**
   * Creates a new Sticker instance.
   * @param {Object} data - Raw sticker data.
   * @param {string|number} data.id - The unique ID of the sticker.
   * @param {string|number} data.user_id - The ID of the user who uploaded the sticker.
   * @param {string} data.name - The name of the sticker.
   * @param {string} data.url - The URL of the sticker image.
   * @param {string[]|null} data.tags - Array of tags associated with the sticker.
   * @param {string|number|Date} data.created_at - Timestamp when the sticker was created.
   * @param {string|number|Date} data.updated_at - Timestamp when the sticker was last updated.
   * @returns {Sticker} The created Sticker instance.
   * 
   * @example
   * Sticker {
   *   id: 2,
   *   userId: 1,
   *   name: 'saboroso',
   *   url: 'https://api.beniocord.site/uploads/stickers/1758986145335-603013635.png',
   *   tags: [ 'sabor', 'delicia', 'gostoso' ],
   *   createdAt: '2025-09-27T15:15:45.555Z',
   *   updatedAt: '2025-09-27T15:15:45.555Z'
   * }
   */
  constructor(data) {
    /**
     * The unique ID of the sticker.
     * @type {string|number}
     */
    this.id = data.id;

    /**
     * The ID of the user who uploaded the sticker.
     * @type {string|number}
     */
    this.userId = data.user_id;

    /**
     * The name of the sticker.
     * @type {string}
     */
    this.name = data.name;

    /**
     * Array of tags for the sticker.
     * @type {string[]}
     */
    this.tags = Array.isArray(data.tags) ? data.tags : [];

    /**
     * The formatted URL of the sticker image.
     * @type {string}
     */
    this.url = formatUrl(data.url);

    /**
     * Timestamp when the sticker was created.
     * @type {string|number|Date}
     */
    this.createdAt = data.created_at;

    /**
     * Timestamp when the sticker was last updated.
     * @type {string|number|Date}
     */
    this.updatedAt = data.updated_at;
  }
}

module.exports = Sticker;