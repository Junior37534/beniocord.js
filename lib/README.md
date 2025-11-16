# Beniocord.js

**Beniocord.js** is a Node.js library for creating bots easily, with basic moderation features, automatic responses, and event handling.

> ⚠️ This is an early version — meant to give you a starting point for building your bot.

---

## Installation

```bash
npm install beniocord.js
```

> Make sure you have Node.js >= 18 installed.

---

## Basic Example

```js
const Client = require("beniocord.js");
const { MessageEmbed } = Client;
require('dotenv').config();

const client = new Client({ token: process.env.BOT_TOKEN });

client.on("ready", () => {
  console.log("🤖 Bot connected!");
});

client.on("messageCreate", async (msg) => {
  if (msg.author?.id === client.user?.id) return;
  if (!msg.content) return;

  if (msg.content.toLowerCase() === "!ping") {
    await client.sendMessage(msg.channel.id, "🏓 Pong!");
  }
  
  if (msg.content.toLowerCase() === "!embed") {
    const embed = new MessageEmbed()
      .setTitle("Hello from Beniocord!")
      .setDescription("This is an example embed")
      .setColor("#147bba")
      .setFooter(msg.author.displayName, msg.author.avatarURL());
    
    await msg.reply(embed);
  }
});

client.login();
```

---

## Features

* **Basic events**: `messageCreate`, `messageEdit`, `messageDelete`, `memberJoin`, `memberLeave`, `presenceUpdate`, `channelUpdate`, and more.
* **Basic moderation**: delete messages, edit messages, etc.
* **Embeds support**: create rich messages with `MessageEmbed`.
* **Event-driven**: easy to handle events in real-time.

---

## Events

```js
client.on("messageCreate", msg => {...});
client.on("memberJoin", data => {...});
client.on("channelUpdate", data => {...});
// and many more...
```

You can add custom events and interact with your bot in real-time.

---