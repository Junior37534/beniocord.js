const { formatUrl } = require("../helpers");

/**
 * @internal
 */
class Emoji {
    /**
     * Cria uma nova instância de Emoji.
     * @param {Object} data - Dados crus do emoji vindos da API.
     * @param {number} data.id - ID único do emoji.
     * @param {number} data.owner_id - ID do dono do emoji.
     * @param {string} data.name - Nome do emoji.
     * @param {string} data.url - URL da imagem do emoji.
     * @param {string} data.created_at - Data de criação do emoji.
     * @param {boolean} data.can_use - Se o emoji pode ser usado.
     * @param {string} data.username - Username do dono.
     * @param {string} data.display_name - Nome de exibição do dono.
     * @returns {Emoji} Instância criada de Emoji.
     * @example
     * Emoji {
     *   id: 1,
     *   ownerId: 1,
     *   name: 'shitcord',
     *   url: 'https://api.beniocord.site/uploads/emojis/1758982533925-364594757.png',
     *   createdAt: '2025-09-27T14:15:33.932Z',
     *   canUse: true,
     *   username: 'benio',
     *   displayName: 'Benio'
     * }
     */
    constructor(data) {
        /**
         * ID único do emoji.
         * @type {number}
         */
        this.id = data.id;

        /**
         * ID do dono do emoji.
         * @type {number}
         */
        this.ownerId = data.owner_id;

        /**
         * Nome do emoji.
         * @type {string}
         */
        this.name = data.name;

        /**
         * URL formatada da imagem do emoji.
         * @type {string}
         */
        this.url = formatUrl(data.url);

        /**
         * Data de criação do emoji.
         * @type {string}
         */
        this.createdAt = data.created_at;


        /**
         * Se o emoji pode ser usado.
         * @type {boolean}
         */
        this.canUse = data.can_use;

        /**
         * Username do dono do emoji.
         * @type {string}
         */
        this.username = data.username;

        /**
         * Nome de exibição do dono do emoji.
         * @type {string}
         */
        this.displayName = data.display_name;
    }
}

module.exports = Emoji;