const User = require("./User");
const Channel = require("./Channel");
const { MessageAttachment } = require("./Util");
const { formatUrl } = require('../helpers/index');

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
   * @param {Array<{emoji: string, count: number, me: boolean}>} [data.reactions] - Reactions on the message.
   * @param {string|null} [data.pinned_at] - When the message was pinned (null if it isn't).
   * @param {number|null} [data.pinned_by] - Who pinned the message.
   * @param {Object} clientInstance - The client instance.
   * @returns {Message} The created Message instance.
   * @example
   * Message {
   *   id: 1875,
   *   channelId: 4,
   *   userId: 1,
   *   content: 'Sticker: crazy',
   *   messageType: 'sticker',
   *   fileUrl: 'https://beniocord.com/uploads/stickers/1765027757156-305382752.png',
   *   fileName: 'crazy.png',
   *   fileSize: null,
   *   editedAt: null,
   *   createdAt: '2025-12-20T20:54:46.247Z',
   *   stickerId: 3,
   *   embedData: null,
   *   reactions: [ { emoji: '✅', count: 2, me: true } ],
   *   pinned: false,
   *   pinnedAt: null,
   *   pinnedBy: null,
   *   replyToId: 1874,
   *   replyMessage: {
   *     content: 'Hello world',
   *     username: 'juniorcanary',
   *     displayName: 'Junior canary',
   *     avatarUrl: 'https://beniocord.com/uploads/avatars/1764896784903-442484585.png',
   *     messageType: 'text',
   *     userId: 1
   *   },
   *   author: User {...},
   *   channel: Channel {...},
   *   sticker: Sticker {...}
   * }
   */
  constructor(data, clientInstance) {
    Object.defineProperty(this, '_client', { value: clientInstance });

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
    this.reactions = (data.reactions ?? []).map(r => ({ ...r }));
    this.pinned = data.pinned_at != null;
    this.pinnedAt = data.pinned_at ?? null;
    this.pinnedBy = data.pinned_by ?? null;
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
    return this._client.sendMessage(this.channelId ?? this.channel.id, content, {
      replyTo: this.id,
      ...(opts instanceof MessageAttachment ? { attachment: opts } : opts)
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
    return this._client.editMessage(this.id, content);
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
    return this._client.deleteMessage(this.id);
  }

  /**
   * Pins this message to its channel.
   * @returns {Promise<{success: boolean, changed: boolean, pinnedAt: string|null}>}
   *
   * @example
   * await msg.pin();
   */
  async pin() {
    const result = await this._client.pinMessage(this.channelId ?? this.channel.id, this.id);
    this.pinned = true;
    if (result?.pinnedAt) this.pinnedAt = result.pinnedAt;
    return result;
  }

  /**
   * Unpins this message.
   * @returns {Promise<{success: boolean, changed: boolean}>}
   */
  async unpin() {
    const result = await this._client.unpinMessage(this.channelId ?? this.channel.id, this.id);
    this.pinned = false;
    this.pinnedAt = null;
    this.pinnedBy = null;
    return result;
  }

  /**
   * Reacts to this message.
   * @param {string|number|Object} emoji - Unicode emoji, custom emoji (id or Emoji) or '<&id>'.
   * @returns {Promise<{success: boolean, count: number}>} How many reacted with this emoji.
   *
   * @example
   * // Reacting to a message
   * await msg.react("✅");
   */
  async react(emoji) {
    return this._client.addReaction(this.channelId ?? this.channel.id, this.id, emoji);
  }

  /**
   * Removes a reaction from this message.
   * @param {string|number|Object} emoji - The reaction to remove.
   * @param {string|number} [userId] - Whose reaction (default: the bot's own).
   * @returns {Promise<{success: boolean, count: number}>} How many still have this reaction.
   */
  async removeReaction(emoji, userId) {
    return this._client.removeReaction(this.channelId ?? this.channel.id, this.id, emoji, userId);
  }

  /**
   * Removes every reaction of this message, or only those of one emoji.
   * @param {string|number|Object} [emoji] - Only clear this emoji.
   * @returns {Promise<{success: boolean}>}
   */
  async clearReactions(emoji) {
    return this._client.clearReactions(this.channelId ?? this.channel.id, this.id, emoji);
  }

  /**
   * Fetches who reacted to this message with an emoji.
   * @param {string|number|Object} emoji - The reaction to look up.
   * @param {Object} [options] - See Client#fetchReactionUsers.
   * @returns {Promise<User[]>}
   */
  async fetchReactionUsers(emoji, options) {
    return this._client.fetchReactionUsers(this.channelId ?? this.channel.id, this.id, emoji, options);
  }
}

module.exports = Message;
