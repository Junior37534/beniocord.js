const test = require("node:test");
const assert = require("node:assert/strict");
const Client = require("../Client");
const Channel = require("../structures/Channel");

const make = (token = "t") => new Client({ token, api_url: "https://bots.example.com/" });

// A socket whose acks answer with whatever the test says.
function fakeSocket(client, ack) {
  const timedSocket = { emit: (event, payload, cb) => setImmediate(() => ack(cb, event, payload)) };
  client.socket = { connected: true, timeout: () => timedSocket };
  client.isConnected = true;
}

test("each client keeps its own token", () => {
  const a = make("first");
  const b = make("second");
  assert.equal(a._token, "first");
  assert.equal(b._token, "second");
  assert.equal(a._axios.defaults.headers["x-bot-token"], "first");
  assert.equal(a._axios.defaults.maxRedirects, 0);
});

test("structures talk to the client that created them", async () => {
  const a = make();
  const b = make();
  const channel = new Channel({ id: 1 }, a);
  new Channel({ id: 2 }, b);
  let used = null;
  a.sendMessage = async () => { used = "a"; };
  b.sendMessage = async () => { used = "b"; };
  await channel.send("x");
  assert.equal(used, "a");
});

test("a refused or unanswered ack rejects instead of hanging", async () => {
  const client = make();

  fakeSocket(client, (cb) => cb(null, false));
  await assert.rejects(client.sendMessage(1, "x"), { code: "SEND_ERROR" });

  fakeSocket(client, (cb) => cb(null, { error: "Rate limited", retryAfter: 500 }));
  await assert.rejects(client.deleteMessage(1), { code: "DELETE_ERROR", retryAfter: 500 });

  fakeSocket(client, (cb) => cb(new Error("timeout")));
  await assert.rejects(client.editMessage(1, "x"), { code: "ACK_TIMEOUT" });
});

test("error text survives unless a friendly one exists", async () => {
  const client = make();
  await assert.rejects(client.createChannel({ name: " " }), { message: "Channel name is required" });

  const error = () => client._handleAxiosError({ response: { status: 429, data: { error: "Too many requests", message: "blocked", retryAfter: 42 } } });
  assert.throws(error, { code: "RATE_LIMITED", message: "blocked", retryAfter: 42, status: 429 });

  const known = () => client._handleAxiosError({ response: { status: 403, data: { error: "EMOJI_NOT_ALLOWED" } }, message: "x" });
  assert.throws(known, { code: "EMOJI_NOT_ALLOWED", message: "You do not have access to this emoji." });
});

test("an unheard error event does not throw", () => {
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(make().emit("error", new Error("x")), false);
  } finally {
    console.error = original;
  }
});

test("channel:update changes the cached channel", () => {
  const client = make();
  client.cache.channels.set(1, new Channel({ id: 1, name: "old" }, client));
  client._updateChannel({ channelId: 1, updates: { name: "new" } });
  assert.equal(client.cache.channels.get(1).name, "new");
});

test("a failing member list does not lose the message, and a stale count is fetched once", async () => {
  const client = make();
  const channel = new Channel({ id: 1, member_count: 3 }, client);
  client.cache.channels.set(1, channel);

  client._axios.get = async () => { throw new Error("down"); };
  const msg = await client._processSocketMessage({ id: 1, channel_id: 1, user_id: 2, username: "a" });
  assert.equal(msg.author.id, 2);

  let fetches = 0;
  client._axios.get = async () => {
    fetches++;
    return { data: [{ id: 2, username: "a", is_bot: true }] };
  };
  const first = await client._processSocketMessage({ id: 2, channel_id: 1, user_id: 2 });
  await client._processSocketMessage({ id: 3, channel_id: 1, user_id: 2 });
  assert.equal(fetches, 1);
  assert.equal(first.author.isBot, true);
});
