const EventEmitter = require('events');

class MessageCollector extends EventEmitter {
  constructor(channel, options = {}, client) {
    super();
    
    this.channel = channel;
    this.client = client;
    // this.client = channel.client;
    this.filter = options.filter || (() => true);
    this.time = options.time || 60000;
    this.max = options.max || Infinity;
    this.collected = [];
    this.ended = false;
    
    this._timeout = null;
    this._handleMessage = this._handleMessage.bind(this);
    
    this._setup();
  }
  
  _setup() {
    this.client.on('messageCreate', this._handleMessage);
    
    if (this.time) {
      this._timeout = setTimeout(() => {
        this.stop('time');
      }, this.time);
    }
  }
  
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

module.exports = MessageCollector;