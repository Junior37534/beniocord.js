const User = require("./User");
const Channel = require("./Channel");
const { formatUrl } = require('../helpers/index');

let client;

/**
 * @internal
 */
class Message {
  /**
   * Creates a new Message instance.
   * @param {Object} data - Raw message data.
   * @param {number} data.id - The unique ID of the message.
   * @param {number} data.channel_id - The channel ID where the message was sent.
   * @param {number} data.user_id - The user ID of the author.
   * @param {string} data.content - The content of the message.
   * @param {"text"|"image"|"video"|"audio"|"file"|"sticker"|"embed"} data.message_type - The type of the message.
   * @param {string|null} data.file_url - URL of the attached file.
   * @param {string|null} data.file_name - Name of the attached file.
   * @param {number|null} data.file_size - Size of the attached file in bytes.
   * @param {number|null} data.reply_to - ID of the message this is replying to.
   * @param {string} [data.reply_content] - Content of the replied message.
   * @param {string|null} [data.reply_message_type] - Type of the replied message.
   * @param {string} [data.reply_username] - Username of the replied user.
   * @param {string|null} [data.reply_display_name] - Display name of the replied user.
   * @param {string|null} [data.reply_avatar_url] - Avatar URL of the replied user.
   * @param {string|null} [data.reply_user_id] - User ID of the replied user.
   * @param {string|null} data.edited_at - Timestamp when the message was edited.
   * @param {string} data.created_at - Timestamp when the message was created.
   * @param {number|null} [data.sticker_id] - Sticker ID attached to the message.
   * @param {string|null} [data.embed_data] - Embed data if present.
   * @param {Object} clientInstance - The client instance.
   * @returns {Message} The created Message instance.
   * @example
   * Message {
   *   id: 1875,
   *   channelId: 4,
   *   userId: 1,
   *   content: 'Sticker: crazy',
   *   messageType: 'sticker',
   *   fileUrl: 'https://api.beniocord.site/uploads/stickers/1765027757156-305382752.png',
   *   fileName: 'crazy.png',
   *   fileSize: null,
   *   editedAt: null,
   *   createdAt: '2025-12-20T20:54:46.247Z',
   *   stickerId: 3,
   *   embedData: null,
   *   replyToId: 1874,
   *   replyMessage: {
   *     content: 'Hello world',
   *     username: 'juniorcanary',
   *     displayName: 'Junior canary',
   *     avatarUrl: 'https://api.beniocord.site/uploads/avatars/1764896784903-442484585.png',
   *     messageType: 'text',
   *     userId: 1
   *   },
   *   author: User {...},
   *   channel: Channel {...},
   *   sticker: Sticker {...}
   * }
   */
  constructor(data, clientInstance) {
    this.id = data.id;
    this.channelId = data.channel_id;
    this.userId = data.user_id;
    this.content = data.content;
    this.messageType = data.message_type;
    this.fileUrl = data.file_url ? formatUrl(data.file_url) : null;
    this.fileName = data.file_name ?? null;
    this.fileSize = data.file_size ?? null;
    this.editedAt = data.edited_at ?? null;
    this.createdAt = data.created_at;
    this.stickerId = data.sticker_id ?? null;
    this.embedData = data.embed_data ?? null;
    // Reply fields
    if (data.reply_to != null) {
      this.replyToId = data.reply_to;
      this.replyMessage = {
        content: data.reply_content ?? '',
        username: data.reply_username ?? '',
        displayName: data.reply_display_name ?? null,
        avatarUrl: data.reply_avatar_url ? formatUrl(data.reply_avatar_url) : null,
        messageType: data.reply_message_type ?? '',
        userId: data.reply_user_id ?? ''
      };
    } else {
      this.replyToId = null;
      this.replyMessage = null;
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
