const { formatUrl } = require("../helpers");

/**
 * @internal
 */
class Emoji {
    /**
     * Creates a new Emoji instance.
     * @param {Object} data - Raw emoji data.
     * @param {string|number} data.id - The unique ID of the emoji.
     * @param {string|number} data.user_id - The ID of the user who uploaded the emoji.
     * @param {string} data.name - The name of the emoji.
     * @param {string} data.url - The URL of the emoji image.
     * @param {string|number|Date} data.created_at - Timestamp when the emoji was created.
     * @returns {Emoji} The created Emoji instance.
     * @example 
     * Emoji {
     *   id: 1,
     *   userId: 1,
     *   name: 'shitcord',
     *   url: 'https://api.beniocord.site/uploads/emojis/1758982533925-364594757.png',
     *   createdAt: '2025-09-27T14:15:33.932Z'
     * }
     * 
     */
    constructor(data) {
        /**
         * The unique ID of the emoji.
         * @type {string|number}
         */
        this.id = data.id;

        /**
         * The ID of the user who uploaded the emoji.
         * @type {string|number}
         */
        this.userId = data.user_id;

        /**
         * The name of the emoji.
         * @type {string}
         */
        this.name = data.name;

        /**
         * The URL of the emoji image.
         * @type {string}
         */
        this.url = formatUrl(data.url);

        /**
         * Timestamp when the emoji was created.
         * @type {string|number|Date}
         */
        this.createdAt = data.created_at;
    }
}

module.exports = Emoji;