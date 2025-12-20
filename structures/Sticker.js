const { formatUrl } = require("../helpers");

/**
 * @internal
 */
class Sticker {
  /**
   * Cria uma nova instância de Sticker.
   * @param {Object} data - Dados crus do sticker vindos da API.
   * @param {number} data.id - ID único do sticker.
   * @param {number} data.owner_id - ID do dono do sticker.
   * @param {string} data.name - Nome do sticker.
   * @param {string} data.url - URL da imagem do sticker.
   * @param {string|string[]} data.tags - Tags associadas ao sticker.
   * @param {string} data.created_at - Data de criação do sticker.
   * @param {boolean} data.can_use - Se o sticker pode ser usado.
   * @param {string} data.username - Username do dono.
   * @param {string} data.display_name - Nome de exibição do dono.
   * @returns {Sticker} Instância criada de Sticker.
   *
   * @example
   * Sticker {
   *   id: 4,
   *   ownerId: 7,
   *   name: 'osuhow',
   *   tags: [],
   *   url: 'https://api.beniocord.site/uploads/stickers/1766100944970-73288347.png',
   *   createdAt: '2025-12-18T23:35:44.985Z',
   *   canUse: false,
   *   username: 'joneor',
   *   displayName: 'Juner'
   * }
   */
  constructor(data) {
    /**
     * ID único do sticker.
     * @type {number}
     */
    this.id = data.id;

    /**
     * ID do dono do sticker.
     * @type {number}
     */
    this.ownerId = data.owner_id;

    /**
     * Nome do sticker.
     * @type {string}
     */
    this.name = data.name;

    /**
     * Tags associadas ao sticker.
     * @type {string[]}
     */
    if (Array.isArray(data.tags)) {
      this.tags = data.tags;
    } else if (typeof data.tags === 'string' && data.tags.length > 0) {
      this.tags = data.tags.split(',').map(t => t.trim()).filter(Boolean);
    } else {
      this.tags = [];
    }

    /**
     * URL formatada da imagem do sticker.
     * @type {string}
     */
    this.url = formatUrl(data.url);

    /**
     * Data de criação do sticker.
     * @type {string}
     */
    this.createdAt = data.created_at;


    /**
     * Se o sticker pode ser usado.
     * @type {boolean}
     */
    this.canUse = data.can_use;

    /**
     * Username do dono do sticker.
     * @type {string}
     */
    this.username = data.username;

    /**
     * Nome de exibição do dono do sticker.
     * @type {string}
     */
    this.displayName = data.display_name;
  }
}

module.exports = Sticker;