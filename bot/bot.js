const Client = require("../lib/Client");
// const Client = require("beniocord.js")
const { OpenAI } = require('openai');
require('dotenv').config();


let systemPrompt = `You are **Benio**, a friendly and conversational chatbot living on the Beniocord chat platform.

* You can **only send messages within Beniocord**.
* You **cannot interact with the real world** in any way.
* You are **not a personal assistant** and **cannot perform tasks** or take actions outside chatting.
* Your purpose is to **have friendly, engaging conversations** with users.
* Speak in a **casual, natural style**, using **short messages** similar to normal text chatting.
* Be approachable, cheerful, and easy to talk to, making users feel comfortable.
* Avoid giving commands, advice for real-world actions, or impersonating humans.

Focus on **chatting, listening, and keeping conversations flowing naturally**.`

const aiKey = process.env.AI_KEY;
const aiUrl = process.env.AI_URL;
const botToken = process.env.BOT_TOKEN;
// const apiUrl = process.env.API_URL;

const client = new Client({ token: botToken });


client.on("ready", () => {
  console.log("🤖 Bot conectado!");
});

client.on("messageCreate", async (msg) => {
  if (msg.author?.id === client.user?.id) return;
  if (!msg.content) return;

  // console.log(`[${msg.author.displayName}] - ${msg.content}`);
  const channelMessages = msg.channel?.messages || [];

  const history = channelMessages.map(m => ({
    role: m.author.id === client.user?.id ? "assistant" : "user",
    content: m.content
  }));


  // client.cache.messages.set(msg.channel.id, history);

  if (msg.content.includes("@benio")) {
    client.startTyping(msg.channel.id);

    const safeHistory = history
      .map(m => {
        if (m.role && typeof m.content === "string") return { role: m.role, content: m.content };
        return null;
      }).filter(Boolean);

    const messages = [
      { role: "system", content: systemPrompt },
      ...safeHistory
    ];

    try {
      const response = await OpenAi(messages, {});
      const reply = response.choices?.[0]?.message?.content || "Não entendi 😅";

      history.push({ role: "assistant", content: reply });
      client.cache.messages.set(msg.channel.id, history);

      await client.sendMessage(msg.channel.id, reply);
    } catch (err) {
      console.error("Erro no OpenAI:", err);
      await client.sendMessage(msg.channel.id, "Ops, deu erro 😅");
    } finally {
      client.stopTyping(msg.channel.id);
    }

  } else if (msg.content.toLowerCase().startsWith("!ping")) {
    const start = Date.now();
    const sent = await client.sendMessage(msg.channel.id, "Pinging...");
    const end = Date.now();
    const latency = end - start;
    client.editMessage(sent.id, `🏓 Pong! Latência: ${latency}ms`);
  } else if (msg.content.toLowerCase().startsWith("!deletar")) {
    const sent = await client.sendMessage(msg.channel.id, "Vou deletar essa msg em 3s");
    setTimeout(() => { client.deleteMessage(sent.id); }, 3000);
  } else if (msg.content.toLowerCase().startsWith("!eval") && (msg.author.id === 1 || msg.author.id === 2)) {
    try {
      const args = msg.content.slice(5).trim().split(/ +/g);
      let result = eval(args.join(" "));

      if (result instanceof Promise) {
        await result;
      }

      result = require('util').inspect(result, { depth: 1 })
      result = result.replace(client.token, "[TOKEN]");

      await client.sendMessage(msg.channel.id, `\`\`\`js\n${result}\n\`\`\``.slice(0, 1950));
    } catch (err) {
      await client.sendMessage(msg.channel.id, `\`\`\`js\n${err}\n\`\`\``)
    }
  }
});


// client.on("messageCreate", (msg) => { client.sendMessage(3, `messageCreate: ${msg.content || 'New message'}`) });
client.on("messageEdit", (data) => { client.sendMessage(3, `messageEdit: ${data.messageId} - ${data.content}`) });
client.on("messageDelete", (data) => { client.sendMessage(3, `messageDelete: ${data.messageId}`) });

// client.on("typingStart", (data) => { client.sendMessage(3, `typingStart: ${data.username} in channel ${data.channelId}`) });
// client.on("typingStop", (data) => { client.sendMessage(3, `typingStop: User ${data.userId} in channel ${data.channelId}`) });
// client.on("userStatusUpdate", (data) => { client.sendMessage(3, `userStatusUpdate: User ${data.userId} is now ${data.status}`) });
client.on("presenceUpdate", (data) => { client.sendMessage(3, `presenceUpdate: ${JSON.stringify(data)}`) });
client.on("memberJoin", (data) => { client.sendMessage(3, `memberJoin: ${JSON.stringify(data)}`) });
client.on("memberLeave", (data) => { client.sendMessage(3, `memberLeave: ${JSON.stringify(data)}`) });
client.on("channelUpdate", (data) => { client.sendMessage(3, `channelUpdate: ${data.id} - ${data.name || 'Updated'}`) });
client.on("channelDelete", (data) => { client.sendMessage(3, `channelDelete: ${data.channelId}`) });

client.on("unreadCounts", (data) => { client.sendMessage(3, `unreadCounts: ${JSON.stringify(data)}`) });
// client.on("error", (data) => { client.sendMessage(3, `error: ${data.message}`) });


client.login();

async function OpenAi(msgs) {
  const client = new OpenAI({ baseURL: aiUrl, apiKey: aiKey });

  const response = await client.chat.completions.create({
    messages: msgs,
    model: 'gpt-4o-mini',
    temperature: 1,
    max_tokens: 256,
    top_p: 0.8,
    stream: false
  });
  return response
};