class Emoji {
    constructor(data, api_url) {
        this.id = data.id;
        this.userId = data.user_id;
        this.name = data.name;
        this.url = data.url ? api_url + data.url : undefined;
        this.createdAt = data.created_at;
        this.updatedAt = data.updated_at;
    }
}

module.exports = Emoji;
