const User = require("./User");
const Channel = require("./Channel");
const { formatUrl } = require('../helpers/index');

let client;

/**
 * Represents a message in a channel.
 */
class Message {
  /**
   * Creates a new Message instance.
   * @param {Object} data - Raw message data.
   * @param {string|number} data.id - The unique ID of the message.
   * @param {string} data.content - The content of the message.
   * @param {string} [data.message_type="text"] - The type of the message (text, file, etc.).
   * @param {string} [data.file_url] - URL of the attached file.
   * @param {string} [data.file_name] - Name of the attached file.
   * @param {number} [data.file_size] - Size of the attached file in bytes.
   * @param {Object} [data.user] - Author user data.
   * @param {Object} [data.channel] - Channel data where the message was sent.
   * @param {string|number} [data.reply_to] - ID of the message this is replying to.
   * @param {string|number} [data.sticker_id] - ID of a sticker attached to the message.
   * @param {string|number|Date} [data.edited_at] - Timestamp when the message was edited.
   * @param {string|number|Date} [data.created_at] - Timestamp when the message was created.
   * @param {Object} clientInstance - The client instance to send/edit/delete messages.
   * @example
   * // Creating a message instance
   * const msg = new Message({ id: 1, content: "Hello!" }, client);
   * 
   */
  constructor(data, clientInstance) {
    this.id = data.id;
    this.content = data.content;
    this.messageType = data.message_type || "text";
    this.fileUrl = formatUrl(data.file_url);
    this.fileName = data.file_name;
    this.fileSize = data.file_size;
    this.attachments = [];
    this.replyTo = data.reply_to;
    this.stickerId = data.sticker_id;
    this.editedAt = data.edited_at;
    this.createdAt = data.created_at;

    if (data.file_url) {
      this.attachments.push({
        url: this.fileUrl,
        name: this.fileName,
        size: this.fileSize,
      });
    }

    this.author = data.user ? new User(data.user, clientInstance) : null;
    this.channel = data.channel ? new Channel(data.channel, clientInstance) : null;
    client = clientInstance;
  }

  /**
   * Replies to this message.
   * @param {string} content - Content of the reply.
   * @param {Object} [opts={}] - Additional options for the reply.
   * @returns {Promise<Message>} The sent reply message.
   *
   * @example
   * // Replying to a message
   * await msg.reply("Thanks for your message!");
   */
  async reply(content, opts = {}) {
    return client.sendMessage(this.channel.id, content, {
      replyTo: this.id,
      ...opts
    });
  }

  /**
   * Edits this message.
   * @param {string} content - New content for the message.
   * @returns {Promise<Message>} The edited message.
   *
   * @example
   * // Editing a message
   * await msg.edit("Updated content!");
   */
  async edit(content) {
    return client.editMessage(this.id, content);
  }

  /**
   * Deletes this message.
   * @returns {Promise<void>}
   *
   * @example
   * // Deleting a message
   * await msg.delete();
   */
  async delete() {
    return client.deleteMessage(this.id);
  }
}

module.exports = Message;
