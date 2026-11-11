const test = require("node:test");
const assert = require("node:assert/strict");
const Client = require("../Client");
const Message = require("../structures/Message");
const Channel = require("../structures/Channel");

function setup() {
  const client = new Client({ token: "t", api_url: "https://bots.example.com" });
  client.user = { id: 9 };
  const calls = [];
  client._axios.request = async (config) => {
    calls.push(config);
    return { data: client.reply ?? { success: true, count: 1 } };
  };
  const channel = new Channel({ id: 1, name: "x" }, client);
  client.cache.channels.set(1, channel);
  const msg = new Message({ id: 5, channel_id: 1, reactions: [{ emoji: "👍", count: 1, me: false }] }, client);
  channel.messages.set(5, msg);
  return { client, calls, msg };
}

test("react encodes the emoji and accepts custom ones", async () => {
  const { calls, msg } = setup();
  await msg.react("✅");
  await msg.react(12);
  await msg.react({ id: 13 });
  await msg.react("<&14>");
  assert.deepEqual(calls.map(c => [c.method, c.url]), [
    ["put", "/api/channels/1/messages/5/reactions/%E2%9C%85/@me"],
    ["put", "/api/channels/1/messages/5/reactions/%3C%2612%3E/@me"],
    ["put", "/api/channels/1/messages/5/reactions/%3C%2613%3E/@me"],
    ["put", "/api/channels/1/messages/5/reactions/%3C%2614%3E/@me"],
  ]);
});

test("remove and clear hit the right routes", async () => {
  const { calls, msg } = setup();
  await msg.removeReaction("✅");
  await msg.removeReaction("✅", 7);
  await msg.clearReactions("✅");
  await msg.clearReactions();
  assert.deepEqual(calls.map(c => c.url), [
    "/api/channels/1/messages/5/reactions/%E2%9C%85/@me",
    "/api/channels/1/messages/5/reactions/%E2%9C%85/7",
    "/api/channels/1/messages/5/reactions/%E2%9C%85",
    "/api/channels/1/messages/5/reactions",
  ]);
});

test("bad ids and emojis never reach the API", async () => {
  const { client, calls } = setup();
  await assert.rejects(client.addReaction("1/../../users", 5, "✅"), { code: "INVALID_ID" });
  await assert.rejects(client.addReaction(1, 5, ""), { code: "INVALID_EMOJI" });
  await assert.rejects(client.removeChannelMember(1, ".."), { code: "INVALID_ID" });
  assert.equal(calls.length, 0);
});

test("fetchReactionUsers maps the camelCase payload and keeps numeric ids", async () => {
  const { client, msg } = setup();
  client.reply = [{ id: "7", username: "a", displayName: "A", avatarUrl: null, isBot: true }];
  const [user] = await msg.fetchReactionUsers("✅");
  assert.deepEqual([user.id, user.displayName, user.isBot], [7, "A", true]);
  assert.equal(client.cache.users.get(7), user);
});

test("waits out the rate limit, then gives up", async () => {
  const { client } = setup();
  let tries = 0;
  client._axios.request = async () => {
    tries++;
    if (tries < 3) client._handleAxiosError({ response: { status: 429, data: { retryAfter: 1 } } });
    return { data: { success: true, count: 2 } };
  };
  assert.equal((await client.addReaction(1, 5, "✅")).count, 2);

  tries = -10;
  await assert.rejects(client.addReaction(1, 5, "✅"), { code: "RATE_LIMITED" });
  assert.equal(tries, -7);
});

test("reaction events keep the cached message in sync", () => {
  const { client, msg } = setup();
  const event = (data, opts) => client._applyReactionEvent({ channelId: 1, messageId: 5, ...data }, opts);

  const added = event({ userId: 9, emoji: "✅", count: 1 }, { added: true });
  assert.equal(added.message, msg);
  assert.deepEqual(msg.reactions[1], { emoji: "✅", count: 1, me: true });

  event({ userId: 2, emoji: "👍", count: 2 }, { added: true });
  assert.deepEqual(msg.reactions[0], { emoji: "👍", count: 2, me: false });

  event({ userId: 9, emoji: "✅", count: 1 });
  assert.equal(msg.reactions[1].me, false);
  event({ userId: 2, emoji: "✅", count: 0 });
  assert.deepEqual(msg.reactions.map(r => r.emoji), ["👍"]);

  event({ emoji: "👍" }, { cleared: true });
  assert.deepEqual(msg.reactions, []);
  assert.equal(event({ messageId: 99, userId: 2, emoji: "x", count: 1 }).message, null);
});

test("messages arrive with their reactions, without exposing the client", () => {
  const { msg } = setup();
  assert.deepEqual(msg.reactions, [{ emoji: "👍", count: 1, me: false }]);
  assert.equal(new Message({ id: 1 }, {}).reactions.length, 0);
  assert.ok(!Object.keys(msg).includes("_client"));
});
