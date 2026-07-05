# Adapting the sink

The envelope is the fleet-wide half of the pattern; the sink is the one
place that decides what a notification looks like. Swap the sink and the
whole fleet's alerts move with it, because no emitter ever learned what
Discord (or Slack, or anything) wants.

## A complete minimal sink

Deploy this as its own Worker, point the emitters' `NOTIFY` service
binding at it, and set the same `NOTIFY_TOKEN` secret on both sides.
This version delivers to Discord; the adapters below swap in with one
line.

```js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "POST" || !url.pathname.endsWith("/notify")) {
      return Response.json({ ok: false, error: "POST /notify only" }, { status: 405 });
    }

    // Shared-secret gate. The binding already restricts callers to your
    // own account; the token is defence in depth and makes the URL
    // fallback safe to expose for local dev.
    const auth = request.headers.get("authorization") || "";
    if (!env.NOTIFY_TOKEN || auth !== `Bearer ${env.NOTIFY_TOKEN}`) {
      return Response.json({ ok: false, error: "unauthorised" }, { status: 401 });
    }

    let envelope;
    try {
      envelope = await request.json();
    } catch {
      return Response.json({ ok: false, error: "body must be JSON" }, { status: 400 });
    }

    // One adapter call is the entire presentation layer.
    const delivered = await toDiscord(env, envelope);
    return Response.json({ ok: delivered });
  },
};

const LEVEL_COLOUR = {
  success: 0x4ade80,
  info: 0xaaa9a0,
  warning: 0xf5a623,
  failure: 0xe24b4a,
};

async function toDiscord(env, e) {
  if (!env.DISCORD_WEBHOOK_URL) return false;
  const res = await fetch(env.DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        title: `${e.source} :: ${e.title}`,
        description: e.message || "",
        color: LEVEL_COLOUR[e.level] ?? LEVEL_COLOUR.info,
        fields: Object.entries(e.fields || {}).map(([name, value]) => ({
          name,
          value: String(value),
          inline: true,
        })),
        timestamp: new Date().toISOString(),
      }],
    }),
  });
  return res.ok;
}
```

## Other adapters

Each is a drop-in replacement for the `toDiscord` call. The sink's
contract with the fleet never changes; only this function does.

**Slack** (incoming webhook):

```js
async function toSlack(env, e) {
  if (!env.SLACK_WEBHOOK_URL) return false;
  const icon = { success: ":white_check_mark:", info: ":information_source:",
                 warning: ":warning:", failure: ":x:" }[e.level] || "";
  const fields = Object.entries(e.fields || {})
    .map(([k, v]) => `*${k}:* ${v}`).join("  ");
  const res = await fetch(env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: `${icon} *${e.source}* :: ${e.title}\n${e.message || ""}${fields ? "\n" + fields : ""}`,
    }),
  });
  return res.ok;
}
```

**Generic JSON forward** (PagerDuty-style ingestors, home-grown
dashboards, anything that accepts a POST): the envelope is already the
payload, so the adapter is a passthrough.

```js
async function toWebhook(env, e) {
  if (!env.FORWARD_URL) return false;
  const res = await fetch(env.FORWARD_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(e),
  });
  return res.ok;
}
```

**Console** (staging sinks, tests): `console.log(JSON.stringify(e))` and
read it in `wrangler tail`. The emitter already falls back to this tier
when no sink is configured, so a brand-new fleet is observable before
any sink exists.

## Patterns worth stealing once the sink exists

**Route on `source`.** One sink, many destinations: CI events to one
channel, runtime failures to another, by switching on `envelope.source`
inside the sink. Emitters never know channels exist.

**Persist a ring buffer.** Before forwarding, unshift a compact summary
`{ts, source, level, title}` onto a small KV- or storage-backed array
capped at a couple of hundred entries. The fleet gains a
"what happened recently" API for a status page at near-zero cost, and it
is the sink's concern alone; no emitter changes.

**Fan out.** `Promise.allSettled([toDiscord(env, e), toWebhook(env, e)])`
when two audiences need the same event. Settled, not all: one slow
destination must not lose the other.
