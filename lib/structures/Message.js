const User = require("./User");
const Channel = require("./Channel");

class Message {
  constructor(data, client) {
    this.id = data.id;
    this.content = data.content;
    this.messageType = data.message_type || "text";
    this.fileUrl = data.file_url ? client.apiUrl + data.file_url : undefined;
    this.fileName = data.file_name;
    this.fileSize = data.file_size;
    this.replyTo = data.reply_to;
    this.editedAt = data.edited_at;
    this.createdAt = data.created_at;
    this.stickerId = data.sticker_id;

    // this.author = data.user ? new User(data.user, this) : null;
    this.author = data.user ? new User(data.user, client) : null;
    this.channel = data.channel ? new Channel(data.channel, client) : null;

    this.client = client;
  }

  async reply(content) {
    return this.client.sendMessage(this.channel.id, content, {
      replyTo: this.id,
    });
  }
}

module.exports = Message;
