# Getting Started

## Introduction <span style="font-size:0.8em;">Intro</span>

### Beniocord.js

A powerful JavaScript library for building Beniocord bots with ease.

[![npm version](https://img.shields.io/npm/v/beniocord.js?color=crimson&logo=npm&style=flat-square)](https://www.npmjs.com/package/beniocord.js)
[![npm downloads](https://img.shields.io/npm/dt/beniocord.js?color=crimson&logo=npm&style=flat-square)](https://www.npmjs.com/package/beniocord.js)
[![GitHub stars](https://img.shields.io/github/stars/Junior37534/beniocord.js?color=yellow&logo=github&style=flat-square)](https://github.com/Junior37534/beniocord.js)
[![GitHub issues](https://img.shields.io/github/issues/Junior37534/beniocord.js?color=green&logo=github&style=flat-square)](https://github.com/Junior37534/beniocord.js/issues)
[![Join Beniocord](https://img.shields.io/badge/Join-Beniocord-5865F2?style=flat-square&logoColor=white)](https://beniocord.site/register)
[![Better Stack Badge](https://uptime.betterstack.com/status-badges/v2/monitor/284m0.svg)](https://uptime.betterstack.com/?utm_source=status_badge)

---

### About

Beniocord.js is a powerful Node.js module that allows you to easily interact with the Beniocord API. It provides an intuitive and modern approach to bot development.

### Features

- 🚀 Easy to use and beginner-friendly
- ⚡ Fast and efficient
- 📦 Object-oriented design
- 🔄 Promise-based architecture
- 🎯 Full Beniocord API coverage
- 💪 TypeScript support

### Requirements

- Node.js >= 18
- NPM >= 9

---

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

## Useful Links

* [Official Website](https://beniocord.site)
* [Documentation](https://docs.beniocord.site)
* [Join Beniocord](https://beniocord.site/register)