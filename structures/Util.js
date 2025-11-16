class MessageEmbed {
    static LIMITS = {
        TITLE: 256,
        DESCRIPTION: 4096,
        FIELD_NAME: 256,
        FIELD_VALUE: 1024,
        FIELDS_COUNT: 25,
        FOOTER_TEXT: 2048,
        AUTHOR_NAME: 256,
        URL_MAX: 2048
    };

    static URL_REGEX = /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/;
    static COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

    /**
     * Creates a new MessageEmbed instance.
     * 
     * @param {Object} [data] - Initial embed data
     * @param {string} data.color - Embed color in hex format (#RRGGBB)
     * @param {Object} data.author - Author options
     * @param {string} data.author.name - Author name
     * @param {string} data.author.iconUrl - Author icon URL
     * @param {string} data.author.url - Author URL
     * @param {string} data.title - Embed title
     * @param {string} data.url - Embed title URL
     * @param {string} data.description - Embed description
     * @param {Array<Object>} data.fields - Array of embed fields
     * @param {string} data.thumbnail - Thumbnail image URL
     * @param {string} data.image - Main image URL
     * @param {Object} data.footer - Footer data
     * @param {string} data.footer.text - Footer text
     * @param {string} data.footer.iconUrl - Footer icon URL
     * @param {Date|number|string} data.timestamp - Timestamp
     * 
     * @example
     * const embed = new Client.MessageEmbed()
     *   .setColor('#FF0000')
     *   .setAuthor('Bot Name', 'https://example.com/icon.png')
     *   .setTitle('Hello World')
     *   .setURL('https://example.com')
     *   .setDescription('This is a complete embed example.')
     *   .addField('Field 1', 'Some value here')
     *   .addField('Inline Field', 'Inline value', true)
     *   .setThumbnail('https://example.com/thumb.png')
     *   .setImage('https://example.com/image.png')
     *   .setFooter('Footer text', 'https://example.com/footer.png')
     *   .setTimestamp();
     */
    constructor(data = {}) {
        this.color = null;
        this.author = null;
        this.title = null;
        this.url = null;
        this.description = null;
        this.fields = [];
        this.thumbnail = null;
        this.image = null;
        this.footer = null;
        this.timestamp = null;

        // Aplica dados iniciais com validação
        if (data.color) this.setColor(data.color);
        if (data.author) this.setAuthor(data.author.name, data.author.iconUrl, data.author.url);
        if (data.title) this.setTitle(data.title);
        if (data.url) this.setURL(data.url);
        if (data.description) this.setDescription(data.description);
        if (data.fields) data.fields.forEach(f => this.addField(f.name, f.value, f?.inline));
        if (data.thumbnail) this.setThumbnail(data.thumbnail);
        if (data.image) this.setImage(data.image);
        if (data.footer) this.setFooter(data.footer.text, data.footer.iconUrl);
        if (data.timestamp) this.setTimestamp(data.timestamp);
    }

    /**
     * Checks if a string is valid: non-empty, not disguised JSON, and optionally within a maximum length.
     * @param {string} value - The string to validate.
     * @param {number} [maxLength=null] - Optional maximum allowed length for the string.
     * @returns {boolean} True if the string is valid.
     * @throws {Error} Throws if the string is empty, too long, or contains JSON content.
     */
    static _isValidString(value, maxLength = null) {
        if (typeof value !== 'string') {
            throw new Error('Value must be a string');
        }

        const trimmed = value.trim();
        if (trimmed.length === 0) {
            throw new Error('Value cannot be empty');
        }

        if (maxLength && value.length > maxLength) {
            throw new Error(`Value exceeds maximum length of ${maxLength} characters`);
        }

        // Previne JSON/objetos disfarçados
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                JSON.parse(trimmed);
                throw new Error('Value cannot be a JSON string. Use plain text only.');
            } catch (e) {
                if (e.message.includes('JSON')) throw e;
                // Não é JSON válido, tudo certo
            }
        }

        return true;
    }

    /**
     * Validates a URL string against allowed format and dangerous protocols.
     * @param {string} url - The URL to validate.
     * @returns {boolean} True if the URL is valid.
     * @throws {Error} Throws if the URL is invalid, too long, or contains dangerous protocols.
     */
    static _isValidUrl(url) {
        if (typeof url !== 'string') {
            throw new Error('URL must be a string');
        }

        if (url.length > this.LIMITS.URL_MAX) {
            throw new Error(`URL exceeds maximum length of ${this.LIMITS.URL_MAX} characters`);
        }

        if (!this.URL_REGEX.test(url)) {
            throw new Error('Invalid URL format. Only HTTP/HTTPS URLs are allowed.');
        }

        // Previne URLs maliciosas
        const lowerUrl = url.toLowerCase();
        const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
        if (dangerousProtocols.some(proto => lowerUrl.includes(proto))) {
            throw new Error('URL contains dangerous protocol');
        }

        return true;
    }

    /**
     * Sanitizes a string by removing dangerous or non-printable characters.
     * @param {string} str - The string to sanitize.
     * @returns {string} The sanitized string.
     */
    static _isValidColor(color) {
        if (typeof color !== 'string') return false;
        return this.COLOR_REGEX.test(color);
    }

    /**
     * Sanitiza string removendo caracteres perigosos
     */
    static _sanitizeString(str) {
        if (typeof str !== 'string') return '';
        // Remove null bytes e caracteres de controle
        return str.replace(/\0/g, '').replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '').trim();
    }

    /**
     * Sets the embed color.
     *
     * @param {string|number} color Hex color (#RRGGBB) or a numeric value
     * @returns {MessageEmbed}
     */
    setColor(color) {
        if (typeof color === 'number') {
            // Converte número para hex
            if (color < 0 || color > 0xFFFFFF) {
                throw new Error('Color number must be between 0 and 16777215 (0xFFFFFF)');
            }
            this.color = `#${color.toString(16).padStart(6, '0').toUpperCase()}`;
        } else if (typeof color === 'string') {
            let hexColor = color.startsWith('#') ? color : `#${color}`;
            hexColor = hexColor.toUpperCase();

            if (!MessageEmbed._isValidColor(hexColor)) {
                throw new Error('Color must be a valid hex color (e.g., #FF0000 or FF0000)');
            }
            this.color = hexColor;
        } else {
            throw new Error('Color must be a string or number');
        }
        return this;
    }

    /**
     * Sets the embed author.
     *
     * @param {string} name Author name
     * @param {string} [iconUrl] Author icon URL
     * @param {string} [url] Author link URL
     * @returns {MessageEmbed}
     */
    setAuthor(name, iconUrl = null, url = null) {
        MessageEmbed._isValidString(name, MessageEmbed.LIMITS.AUTHOR_NAME);

        this.author = {
            name: MessageEmbed._sanitizeString(name)
        };

        if (iconUrl !== null && iconUrl !== undefined) {
            MessageEmbed._isValidUrl(iconUrl);
            this.author.iconUrl = iconUrl;
        }

        if (url !== null && url !== undefined) {
            MessageEmbed._isValidUrl(url);
            this.author.url = url;
        }

        return this;
    }

    /**
     * Sets the embed title.
     *
     * @param {string} title Title text
     * @returns {MessageEmbed}
     */
    setTitle(title) {
        MessageEmbed._isValidString(title, MessageEmbed.LIMITS.TITLE);
        this.title = MessageEmbed._sanitizeString(title);
        return this;
    }

    /**
     * Sets the title URL.
     *
     * @param {string} url Valid HTTP/HTTPS URL
     * @returns {MessageEmbed}
     */
    setURL(url) {
        MessageEmbed._isValidUrl(url);
        this.url = url;
        return this;
    }

    /**
     * Sets the embed description.
     *
     * @param {string} description Description text
     * @returns {MessageEmbed}
     */
    setDescription(description) {
        MessageEmbed._isValidString(description, MessageEmbed.LIMITS.DESCRIPTION);
        this.description = MessageEmbed._sanitizeString(description);
        return this;
    }

    /**
     * Adds a field to the embed.
     *
     * @param {string} name Field name
     * @param {string} value Field value
     * @param {boolean} [inline=false] Whether the field should be inline
     * @returns {MessageEmbed}
     */
    addField(name, value, inline = false) {
        if (!this.fields) {
            this.fields = [];
        }

        if (this.fields.length >= MessageEmbed.LIMITS.FIELDS_COUNT) {
            throw new Error(`Embeds cannot have more than ${MessageEmbed.LIMITS.FIELDS_COUNT} fields`);
        }

        if (name == null || value == null) {
            throw new Error('Field name and value are required');
        }

        MessageEmbed._isValidString(name, MessageEmbed.LIMITS.FIELD_NAME);
        MessageEmbed._isValidString(value, MessageEmbed.LIMITS.FIELD_VALUE);

        if (typeof inline !== 'boolean') {
            throw new Error('Field inline must be a boolean');
        }

        this.fields.push({
            name: MessageEmbed._sanitizeString(name),
            value: MessageEmbed._sanitizeString(value),
            inline
        });

        return this;
    }

    /**
     * Adds multiple fields at once.
     *
     * @param {...Object} fields Array of field objects
     * @returns {MessageEmbed}
     */
    addFields(...fields) {
        if (!Array.isArray(fields) && fields.length === 1 && Array.isArray(fields[0])) {
            // Suporta addFields([{...}, {...}])
            fields = fields[0];
        }

        fields.forEach(field => {
            if (!field || typeof field !== 'object') {
                throw new Error('Each field must be an object with name and value properties');
            }
            this.addField(field.name, field.value, field.inline || false);
        });

        return this;
    }

    /**
     * Sets the thumbnail image.
     *
     * @param {string} url Thumbnail URL
     * @returns {MessageEmbed}
     */
    setThumbnail(url) {
        MessageEmbed._isValidUrl(url);
        this.thumbnail = url;
        return this;
    }

    /**
     * Sets the main embed image.
     *
     * @param {string} url Image URL
     * @returns {MessageEmbed}
     */
    setImage(url) {
        MessageEmbed._isValidUrl(url);
        this.image = url;
        return this;
    }

    /**
     * Sets the embed footer.
     *
     * @param {string} text Footer text
     * @param {string} [iconUrl] Footer icon URL
     * @returns {MessageEmbed}
     */
    setFooter(text, iconUrl = null) {
        MessageEmbed._isValidString(text, MessageEmbed.LIMITS.FOOTER_TEXT);

        this.footer = {
            text: MessageEmbed._sanitizeString(text)
        };

        if (iconUrl !== null && iconUrl !== undefined) {
            MessageEmbed._isValidUrl(iconUrl);
            this.footer.iconUrl = iconUrl;
        }

        return this;
    }

    /**
     * Sets the embed timestamp.
     *
     * @param {Date|number|string} [timestamp] Date object, timestamp number or ISO string
     * @returns {MessageEmbed}
     */
    setTimestamp(timestamp = null) {
        if (timestamp === null || timestamp === undefined) {
            this.timestamp = new Date().toISOString();
        } else if (timestamp instanceof Date) {
            if (isNaN(timestamp.getTime())) {
                throw new Error('Invalid Date object');
            }
            this.timestamp = timestamp.toISOString();
        } else if (typeof timestamp === 'number') {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) {
                throw new Error('Invalid timestamp number');
            }
            this.timestamp = date.toISOString();
        } else if (typeof timestamp === 'string') {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) {
                throw new Error('Invalid timestamp string. Use ISO 8601 format.');
            }
            this.timestamp = date.toISOString();
        } else {
            throw new Error('Timestamp must be a Date, number, or ISO 8601 string');
        }

        return this;
    }

    /**
     * Converts the embed into a JSON object compatible with the BenioCord API.
     *
     * @returns {Object} Embed JSON representation
     */
    toJSON() {
        // Valida antes de converter
        this.validate();

        const json = {};

        if (this.color) json.color = this.color;
        if (this.author) json.author = this.author;
        if (this.title) json.title = this.title;
        if (this.url) json.url = this.url;
        if (this.description) json.description = this.description;
        if (this.fields && this.fields.length > 0) json.fields = this.fields;
        if (this.thumbnail) json.thumbnail = this.thumbnail;
        if (this.image) json.image = this.image;
        if (this.footer) json.footer = this.footer;
        if (this.timestamp) json.timestamp = this.timestamp;

        return json;
    }

    /**
     * Converts the embed into a plain-text fallback format.
     *
     * @returns {string}
     */
    toText() {
        let text = '';

        if (this.author) {
            text += `**${this.author.name}**\n`;
        }

        if (this.title) {
            text += `**${this.title}**\n`;
        }

        if (this.description) {
            text += `${this.description}\n`;
        }

        if (this.fields && this.fields.length > 0) {
            text += '\n';
            this.fields.forEach(field => {
                text += `**${field.name}**\n${field.value}\n`;
            });
        }

        if (this.footer) {
            text += `\n_${this.footer.text}_`;
        }

        return text.trim();
    }

    /**
     * Validates the embed content and size limits.
     *
     * @throws {Error} If the embed contains invalid data
     * @returns {boolean} Whether the embed is valid
     */
    validate() {
        // Pelo menos título ou descrição deve existir
        if (!this.title && !this.description) {
            throw new Error('Embed must have at least a title or description');
        }

        // Validações de tamanho
        if (this.title && this.title.length > MessageEmbed.LIMITS.TITLE) {
            throw new Error(`Embed title exceeds ${MessageEmbed.LIMITS.TITLE} characters`);
        }

        if (this.description && this.description.length > MessageEmbed.LIMITS.DESCRIPTION) {
            throw new Error(`Embed description exceeds ${MessageEmbed.LIMITS.DESCRIPTION} characters`);
        }

        if (this.fields && this.fields.length > MessageEmbed.LIMITS.FIELDS_COUNT) {
            throw new Error(`Embed has more than ${MessageEmbed.LIMITS.FIELDS_COUNT} fields`);
        }

        if (this.footer && this.footer.text.length > MessageEmbed.LIMITS.FOOTER_TEXT) {
            throw new Error(`Footer text exceeds ${MessageEmbed.LIMITS.FOOTER_TEXT} characters`);
        }

        if (this.author && this.author.name.length > MessageEmbed.LIMITS.AUTHOR_NAME) {
            throw new Error(`Author name exceeds ${MessageEmbed.LIMITS.AUTHOR_NAME} characters`);
        }

        // Valida campos individualmente
        if (this.fields) {
            this.fields.forEach((field, index) => {
                if (!field.name || !field.value) {
                    throw new Error(`Field ${index + 1} is missing name or value`);
                }
                if (field.name.length > MessageEmbed.LIMITS.FIELD_NAME) {
                    throw new Error(`Field ${index + 1} name exceeds ${MessageEmbed.LIMITS.FIELD_NAME} characters`);
                }
                if (field.value.length > MessageEmbed.LIMITS.FIELD_VALUE) {
                    throw new Error(`Field ${index + 1} value exceeds ${MessageEmbed.LIMITS.FIELD_VALUE} characters`);
                }
                if (typeof field.inline !== 'boolean') {
                    throw new Error(`Field ${index + 1} inline must be a boolean`);
                }
            });
        }

        // Valida URLs se presentes
        if (this.url) {
            MessageEmbed._isValidUrl(this.url);
        }
        if (this.thumbnail) {
            MessageEmbed._isValidUrl(this.thumbnail);
        }
        if (this.image) {
            MessageEmbed._isValidUrl(this.image);
        }
        if (this.author && this.author.url) {
            MessageEmbed._isValidUrl(this.author.url);
        }
        if (this.author && this.author.iconUrl) {
            MessageEmbed._isValidUrl(this.author.iconUrl);
        }
        if (this.footer && this.footer.iconUrl) {
            MessageEmbed._isValidUrl(this.footer.iconUrl);
        }

        // Valida cor se presente
        if (this.color && !MessageEmbed._isValidColor(this.color)) {
            throw new Error('Invalid color format. Use hex format: #RRGGBB');
        }

        // Valida timestamp se presente
        if (this.timestamp) {
            const date = new Date(this.timestamp);
            if (isNaN(date.getTime())) {
                throw new Error('Invalid timestamp');
            }
        }

        return true;
    }
}

MessageEmbed.Colors = {
    DEFAULT: '#5865F2',
    BLUE: '#3498DB',
    GREEN: '#2ECC71',
    RED: '#E74C3C',
    YELLOW: '#F1C40F',
    ORANGE: '#E67E22',
    PURPLE: '#9B59B6',
    PINK: '#E91E63',
    AQUA: '#1ABC9C',
    DARK_BLUE: '#206694',
    DARK_GREEN: '#1F8B4C',
    DARK_RED: '#992D22',
    DARK_GOLD: '#C27C0E',
    DARK_ORANGE: '#A84300',
    DARK_PURPLE: '#71368A',
    DARK_PINK: '#AD1457',
    DARK_AQUA: '#11806A',
    WHITE: '#FFFFFF',
    GREY: '#95A5A6',
    DARK_GREY: '#607D8B',
    BLACK: '#000000',
    // Cores específicas BenioCord
    BENIOCORD: '#00D9FF',
    SUCCESS: '#00FF00',
    ERROR: '#FF0000',
    WARNING: '#FFA500',
    INFO: '#3498DB'
};

/**
 * @class
 */
class MessageAttachment {
    /**
     * Creates a new MessageAttachment instance.
     *
     * @param {Buffer|Uint8Array|string} buffer - The data of the attachment. Can be a Buffer, Uint8Array, or base64 string.
     * @param {string} name - The name of the attachment file (e.g., "image.png").
     *
     * @throws {Error} If the buffer is not provided.
     * @throws {Error} If the name is not a valid string.
     *
     * @example
     * const attachment = new MessageAttachment(fileBuffer, "photo.png");
     */
    constructor(buffer, name) {
        if (!buffer) {
            throw new Error('Attachment buffer is required');
        }
        if (!name || typeof name !== 'string') {
            throw new Error('Attachment name must be a valid string');
        }
        this.buffer = buffer;
        this.name = name;
    }
}

module.exports = { MessageEmbed, MessageAttachment };