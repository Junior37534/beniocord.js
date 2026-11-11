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
    return { data: client.reply ?? { success: true, changed: true, pinnedAt: "2026-11-04T12:00:00.000Z" } };
  };
  const channel = new Channel({ id: 1, name: "x" }, client);
  client.cache.channels.set(1, channel);
  const msg = new Message({ id: 5, channel_id: 1 }, client);
  channel.messages.set(5, msg);
  return { client, calls, msg, channel };
}

test("pin and unpin hit the pins routes and update the message", async () => {
  const { calls, msg } = setup();
  assert.equal(msg.pinned, false);
  await msg.pin();
  assert.deepEqual([msg.pinned, msg.pinnedAt], [true, "2026-11-04T12:00:00.000Z"]);
  await msg.unpin();
  assert.deepEqual([msg.pinned, msg.pinnedAt], [false, null]);
  assert.deepEqual(calls.map(c => [c.method, c.url]), [
    ["put", "/api/channels/1/pins/5"],
    ["delete", "/api/channels/1/pins/5"],
  ]);
});

test("pinned_at from the API marks the message as pinned", () => {
  const { client } = setup();
  const msg = new Message({ id: 6, channel_id: 1, pinned_at: "2026-11-01T00:00:00Z", pinned_by: 3 }, client);
  assert.deepEqual([msg.pinned, msg.pinnedAt, msg.pinnedBy], [true, "2026-11-01T00:00:00Z", 3]);
});

test("fetchPins maps the list and links the cached channel", async () => {
  const { client, calls, channel } = setup();
  client.reply = { pins: [{ id: 7, channel_id: 1, user_id: 2, username: "a", content: "hi", pinned_at: "x", pinned_by: 9 }], canPin: true, max: 50 };
  const [pin] = await channel.fetchPins();
  assert.equal(calls[0].url, "/api/channels/1/pins");
  assert.deepEqual([pin.id, pin.content, pin.pinned, pin.author.username], [7, "hi", true, "a"]);
  assert.equal(pin.channel, channel);
  assert.equal(client.cache.users.get(2), pin.author);
});

test("pin events update the cached message", () => {
  const { client, msg } = setup();
  const pinned = client._applyPinEvent({ channelId: 1, messageId: 5, pinnedBy: 3, pinnedAt: "t" }, true);
  assert.equal(pinned.message, msg);
  assert.deepEqual([msg.pinned, msg.pinnedBy, msg.pinnedAt], [true, 3, "t"]);
  client._applyPinEvent({ channelId: 1, messageId: 5, unpinnedBy: 3 }, false);
  assert.deepEqual([msg.pinned, msg.pinnedBy, msg.pinnedAt], [false, null, null]);
  assert.equal(client._applyPinEvent({ messageId: 99 }, true).message, null);
});

test("bad ids never reach the API", async () => {
  const { client, calls } = setup();
  await assert.rejects(client.pinMessage("1/../x", 5), { code: "INVALID_ID" });
  await assert.rejects(client.unpinMessage(1, "5?x"), { code: "INVALID_ID" });
  await assert.rejects(client.fetchPinnedMessages(".."), { code: "INVALID_ID" });
  assert.equal(calls.length, 0);
});
