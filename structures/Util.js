/* Compatibilidade com outros sistemas */

class MessageEmbed {
    setTitle(title) {
        this.title = title;
        return this;
    }

    setDescription(description) {
        this.description = description;
        return this;
    }

    setColor(color) {
        this.color = color;
        return this;
    }

    addField(name, value, inline = false) {
        if (!this.fields) this.fields = [];
        this.fields.push({ name, value, inline });
        return this;
    }

    setFooter(text, icon_url) {
        this.footer = { text, icon_url };
        return this;
    }

    setTimestamp(timestamp = Date.now()) {
        this.timestamp = new Date(timestamp).toISOString();
        return this;
    }

    setAuthor(name, icon_url, url) {
        this.author = { name, icon_url, url };
        return this;
    }

    toJSON() {
        const json = {};
        if (this.title) json.title = this.title;
        if (this.description) json.description = this.description;
        if (this.color) json.color = this.color;
        if (this.fields) json.fields = this.fields;
        if (this.footer) json.footer = this.footer;
        if (this.timestamp) json.timestamp = this.timestamp;
        return json;
    }

    toText() {
        let text = '';
        
        // Author section
        if (this.author) {
            text += `**${this.author.name}**\n`;
            if (this.author.url) text += `${this.author.url}\n`;
            text += '\n';
        }
        
        // Title section
        if (this.title) {
            text += `# ${this.title}\n\n`;
        }
        
        // Description section
        if (this.description) {
            text += `${this.description}\n\n`;
        }
        
        // Fields section
        if (this.fields && this.fields.length > 0) {
            text += '───────────────────────\n\n';
            for (const field of this.fields) {
                text += `**${field.name}**\n`;
                text += `${field.value}\n\n`;
            }
        }
        
        // Footer section
        if (this.footer || this.timestamp) {
            text += '───────────────────────\n';
            if (this.footer) {
                text += `_${this.footer.text}_`;
            }
            if (this.timestamp) {
                const date = new Date(this.timestamp).toLocaleString('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short'
                });
                text += this.footer ? ` • ${date}` : `_${date}_`;
            }
            text += '\n';
        }
        
        return text.trim();
    }
}

class MessageAttachment {
    constructor(buffer, name) {
        this.buffer = buffer;
        this.name = name;
    }
}

module.exports = {
    MessageEmbed,
    MessageAttachment
}