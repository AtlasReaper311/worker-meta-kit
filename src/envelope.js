/**
 * envelope.js :: the alert envelope convention.
 *
 * Every Worker in a fleet emits the same five-field event shape and lets
 * ONE sink Worker decide what a notification looks like. The alternative
 * is each Worker owning a webhook URL and a formatting function, which
 * means changing your notification target is a fleet-wide redeploy and
 * every Worker has its own slightly different idea of an alert.
 *
 * The envelope (fixed fleet-wide):
 *
 *   {
 *     "source":  "worker-name",        who is speaking
 *     "level":   "failure",            success | info | warning | failure
 *     "title":   "KV write rejected",  one line, human-first
 *     "message": "detail...",          the paragraph under the line
 *     "fields":  { "key": "84ms" }     optional structured extras
 *   }
 *
 * The level vocabulary is deliberately four values and closed. Sinks
 * colour, route, and filter on it; a fifth level invented by one Worker
 * is a rendering bug in every consumer. If a fleet needs finer grain,
 * that belongs in fields, not in level.
 *
 * Sink resolution, in order:
 *   1. env.NOTIFY        service binding to your sink Worker; stays on
 *                        the provider's internal network, no public hop,
 *                        and grants a Worker a voice with one wrangler.toml
 *                        block instead of a shared secret sprayed around
 *   2. env.NOTIFY_URL    plain HTTPS POST; local dev, or a sink that
 *                        lives outside your account
 *   3. console           structured JSON on stdout, visible in
 *                        `wrangler tail`; a dev affordance so the example
 *                        works with zero extra infrastructure, not a
 *                        delivery guarantee
 *
 * Auth: when env.NOTIFY_TOKEN is set it rides along as a Bearer header.
 * Set it with `wrangler secret put NOTIFY_TOKEN` (the interactive prompt;
 * secret values do not belong in files or shell history).
 *
 * This function NEVER throws. An alert about a failure must not become
 * a second failure; call it through ctx.waitUntil() so delivery never
 * blocks the response either.
 */

export const LEVELS = ["success", "info", "warning", "failure"];

/**
 * Emit one envelope toward whatever sink is configured.
 *
 * @param {object} env - the Worker env (bindings, vars, secrets)
 * @param {object} event
 * @param {string} event.level - one of LEVELS; anything else is coerced
 *   to "info" rather than thrown, because the alert path never throws
 * @param {string} event.title - one line
 * @param {string} [event.message]
 * @param {object} [event.fields] - flat structured extras
 * @param {string} [event.source] - defaults to env.SERVICE_NAME, then
 *   "worker"; the sink routes and labels on this
 * @param {object} [options]
 * @param {string} [options.path="/notify"] - the sink's ingest path
 * @returns {Promise<{delivered: boolean, via: "binding"|"url"|"console"}>}
 */
export async function notify(env, event, options = {}) {
  const level = LEVELS.includes(event.level) ? event.level : "info";
  const body = {
    source: event.source || env.SERVICE_NAME || "worker",
    level,
    title: event.title,
    message: event.message,
    fields: event.fields,
  };
  // Undefined keys out before serialisation; the sink should never have
  // to distinguish "absent" from "present but undefined".
  Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);

  const path = options.path || "/notify";
  const requestInit = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.NOTIFY_TOKEN
        ? { authorization: `Bearer ${env.NOTIFY_TOKEN}` }
        : {}),
    },
    body: JSON.stringify(body),
  };

  try {
    if (env.NOTIFY) {
      // The hostname in a service-binding fetch is routing-irrelevant but
      // must parse; the path is what the sink switches on.
      const res = await env.NOTIFY.fetch(`https://sink${path}`, requestInit);
      return { delivered: res.ok, via: "binding" };
    }
    if (env.NOTIFY_URL) {
      const res = await fetch(env.NOTIFY_URL, requestInit);
      return { delivered: res.ok, via: "url" };
    }
    // No sink configured: say so where a developer is already looking.
    console.log(JSON.stringify({ envelope: body, delivered: false }));
    return { delivered: false, via: "console" };
  } catch (err) {
    console.log(
      JSON.stringify({
        envelope: body,
        delivered: false,
        error: String(err && err.message ? err.message : err),
      }),
    );
    return { delivered: false, via: "console" };
  }
}
