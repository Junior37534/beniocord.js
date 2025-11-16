const EventEmitter = require('events');

class MessageCollector extends EventEmitter {
  /**
   * Creates a new MessageCollector.
   *
   * @param {Channel} channel - The channel to listen for messages.
   * @param {Object} [options={}] - Options for the collector.
   * @param {function(Message): boolean|Promise<boolean>} [options.filter] - Filter function to determine which messages are collected.
   * @param {number} [options.time=60000] - Time in milliseconds before the collector stops automatically.
   * @param {number} [options.max=Infinity] - Maximum number of messages to collect before stopping.
   * @param {Client} client - The client instance to listen for events.
   *
   * @example
   * const collector = new MessageCollector(channel, { filter: msg => msg.content.includes('hello'), time: 30000 }, client);
   * collector.on('collect', msg => console.log(`Collected message: ${msg.content}`));
   * collector.on('end', (collected, reason) => console.log(`Collector ended: ${reason}, collected ${collected.length} messages`));
   */
  constructor(channel, options = {}, client) {
    super();

    this.channel = channel;
    this.client = client;
    this.filter = options.filter || (() => true);
    this.time = options.time || 60000;
    this.max = options.max || Infinity;
    this.collected = [];
    this.ended = false;

    this._timeout = null;
    this._handleMessage = this._handleMessage.bind(this);

    this._setup();
  }

  /**
   * Initializes event listeners and timeout for automatic stop.
   * @private
   */
  _setup() {
    this.client.on('messageCreate', this._handleMessage);

    if (this.time) {
      this._timeout = setTimeout(() => {
        this.stop('time');
      }, this.time);
    }
  }

  /**
   * Internal handler for incoming messages.
   * @param {Message} message - The message received.
   * @private
   */
  async _handleMessage(message) {
    if (this.ended) return;
    if (message.channel.id !== this.channel.id) return;

    try {
      const filterResult = await this.filter(message);
      if (!filterResult) return;

      this.collected.push(message);
      this.emit('collect', message);

      if (this.collected.length >= this.max) {
        this.stop('limit');
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Stops the collector manually or automatically.
   *
   * @param {string} [reason='user'] - Reason for stopping ('user', 'time', 'limit', etc.).
   * @fires MessageCollector#end
   */
  stop(reason = 'user') {
    if (this.ended) return;

    this.ended = true;

    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = null;
    }

    this.client.removeListener('messageCreate', this._handleMessage);
    this.emit('end', this.collected, reason);
  }

  /**
   * Resets the timer for the collector.
   *
   * @param {Object} [options={}] - Options to override current timer.
   * @param {number} [options.time] - New time in milliseconds to set.
   */
  resetTimer(options = {}) {
    if (this._timeout) {
      clearTimeout(this._timeout);
    }

    const time = options.time || this.time;

    if (time) {
      this._timeout = setTimeout(() => {
        this.stop('time');
      }, time);
    }
  }
}

/**
 * Emitted when a message is successfully collected.
 * @event MessageCollector#collect
 * @param {Message} message - The collected message.
 */

/**
 * Emitted when the collector ends.
 * @event MessageCollector#end
 * @param {Message[]} collected - Array of collected messages.
 * @param {string} reason - Reason the collector ended.
 */

/**
 * Emitted when an error occurs inside the collector.
 * @event MessageCollector#error
 * @param {Error} error - The error encountered.
 */

module.exports = MessageCollector;
