class Emoji {
    constructor(data) {
        this.id = data.id;
        this.userId = data.user_id;
        this.name = data.name;
        this.url = data.url ? 'https://api.beniocord.site' + data.url : undefined;
        this.createdAt = data.created_at;
        this.updatedAt = data.updated_at;
    }
}

module.exports = Emoji;
