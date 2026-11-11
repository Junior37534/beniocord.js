# Getting Started

## Introduction <span style="font-size:0.8em;">Intro</span>

### Beniocord.js

A powerful JavaScript library for building Beniocord bots with ease.

[![npm version](https://img.shields.io/npm/v/beniocord.js?color=crimson&logo=npm&style=flat-square)](https://www.npmjs.com/package/beniocord.js)
[![npm downloads](https://img.shields.io/npm/dt/beniocord.js?color=crimson&logo=npm&style=flat-square)](https://www.npmjs.com/package/beniocord.js)
[![GitHub stars](https://img.shields.io/github/stars/Junior37534/beniocord.js?color=yellow&logo=github&style=flat-square)](https://github.com/Junior37534/beniocord.js)
[![GitHub issues](https://img.shields.io/github/issues/Junior37534/beniocord.js?color=green&logo=github&style=flat-square)](https://github.com/Junior37534/beniocord.js/issues)
[![Join Beniocord](https://img.shields.io/badge/Join-Beniocord-5865F2?style=flat-square&logoColor=white)](https://beniocord.com/download)
[![Better Stack Badge](https://uptime.betterstack.com/status-badges/v2/monitor/284m0.svg)](https://uptime.betterstack.com/?utm_source=status_badge)

---

### About

Beniocord.js is a powerful Node.js module that allows you to easily interact with the API of [Beniocord](https://beniocord.com), a free chat app for communities, friends and bots. It provides an intuitive and modern approach to bot development.

<!-- 
### Requirements

- Node.js >= 18
- NPM >= 9 -->

<!-- --- -->

## Installation

Install via NPM:

```bash
npm install beniocord.js
````

---

## Quick Example

```js
const Beniocord = require("beniocord.js");
const client = new Beniocord({ token: 'YOUR_BOT_TOKEN' });

client.on("ready", () => {
  console.log("🤖 Bot connected!");
});

client.on("messageCreate", async (msg) => {
  if (msg.author?.id === client.user?.id) return;
  if (!msg.content.startsWith('!')) return;

  const comando = msg.content.slice('!'.length).split(' ')[0];
  const args = msg.content.slice(comando.length + '!'.length + 1).trim().split(' ');

  if (comando === "ping") {
    const msgTimestamp = Date.now() - Date.parse(msg.createdAt);
    const sent = await msg.channel.send("🏓 Pinging...");
    const editTimestamp = Date.now() - Date.parse(sent.createdAt);

    await sent.edit(
        `🏓 **Pong!**\n` +
        `📨 **Message → Bot:** ${msgTimestamp}ms\n` +
        `✏️ **Send → Edit:** ${editTimestamp}ms`
    );
  }
});

client.login();
```

---

## Reactions

```js
await msg.react("✅");                     // unicode, custom emoji id, Emoji or "<&id>"
await msg.removeReaction("✅");            // your own; pass a userId to moderate
const users = await msg.fetchReactionUsers("✅", { limit: 50 });
console.log(msg.reactions);               // [{ emoji: "✅", count: 2, me: true }]

client.on("messageReactionAdd", ({ messageId, userId, emoji, count, message }) => {
  // `message` is the cached message, or null if it isn't cached
});
client.on("messageReactionRemove", (data) => {});
client.on("messageReactionClear", ({ messageId, emoji }) => {}); // emoji: null = all
```

---

## Pins

```js
await msg.pin();                          // needs moderation rights (anyone can pin in DMs)
await msg.unpin();
console.log(msg.pinned, msg.pinnedAt);    // true "2026-11-04T12:00:00.000Z"

const pins = await channel.fetchPins();   // or client.fetchPinnedMessages(channelId), newest pin first

client.on("messagePin", ({ messageId, pinnedBy, message }) => {});
client.on("messageUnpin", ({ messageId, unpinnedBy, message }) => {});
```

A channel holds up to 50 pinned messages; past that, `pin()` throws `MAX_PINS_REACHED`.

---

## Useful Links

* [Official Website](https://beniocord.com)
* [Documentation](https://docs.beniocord.com)
* [Join Beniocord](https://beniocord.com/download)
* [Uptime monitor](https://uptime.beniocord.site)