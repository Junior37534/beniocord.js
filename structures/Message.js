const User = require("./User");
const Channel = require("./Channel");
const { formatUrl } = require('../helpers/index');

let client;
class Message {
  constructor(data, clientInstance) {
    this.id = data.id;
    this.content = data.content;
    this.messageType = data.message_type || "text";
    this.fileUrl = formatUrl(data.file_url);
    this.fileName = data.file_name;
    this.fileSize = data.file_size;
    this.replyTo = data.reply_to;
    this.editedAt = data.edited_at;
    this.createdAt = data.created_at;
    this.stickerId = data.sticker_id;

    this.attachments = [];

    if (data.file_url) {
      this.attachments.push({
        url: this.fileUrl,
        name: this.fileName,
        size: this.fileSize,
      });
    }

    // this.author = data.user ? new User(data.user, this) : null;
    this.author = data.user ? new User(data.user, clientInstance) : null;
    this.channel = data.channel ? new Channel(data.channel, clientInstance) : null;
    // this.member = { user: this.author }
    client = clientInstance;
  }

  async reply(content, opts = {}) {
    return client.sendMessage(this.channel.id, content, {
      replyTo: this.id,
      ...opts
    });
  }

  async edit(content) {
    return client.editMessage(this.id, content);
  }

  async delete() {
    return client.deleteMessage(this.id);
  }
}

module.exports = Message;
