/**
 * index.js :: the minimal Worker this template ships running.
 *
 * Three routes and both contracts:
 *   GET /        hello, points at /_meta
 *   GET /health  the boring liveness answer
 *   GET /boom    fails on purpose, emits a failure envelope, returns 500
 *   GET /_meta   answered by handleMeta before any routing
 *
 * Deploy it untouched with `wrangler deploy`, then:
 *   curl https://<your-worker>.workers.dev/_meta
 *   curl https://<your-worker>.workers.dev/boom
 *   wrangler tail   (the envelope appears on the console tier until a
 *                    sink binding or NOTIFY_URL is configured)
 */

import { handleMeta } from "./meta.js";
import { notify } from "./envelope.js";

/**
 * The self-description the fleet reads. Keep it honest: the whole value
 * of /_meta is that it is generated from the same repo that deploys the
 * code, so it cannot drift the way a wiki does. When you add a route,
 * adding its line here is part of the change, not a follow-up.
 */
const META = {
  name: "worker-meta-kit-example",
  description:
    "Template example: self-documenting via /_meta, alerting via the fixed envelope",
  version: "1.0.0",
  endpoints: [
    { method: "GET", path: "/", description: "Hello; points at /_meta" },
    { method: "GET", path: "/health", description: "Liveness" },
    {
      method: "GET",
      path: "/boom",
      description: "Deliberate failure; emits a failure envelope",
    },
  ],
  source: "https://github.com/AtlasReaper311/worker-meta-kit",
};

function json(status, data) {
  return Response.json(data, { status });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // One line, before routing. Suffix matching inside the module means
    // this works identically behind a route prefix or a bare
    // workers.dev hostname.
    const meta = handleMeta(url, META);
    if (meta) return meta;

    if (url.pathname === "/" || url.pathname === "") {
      return json(200, {
        hello: "from worker-meta-kit",
        try: ["/_meta", "/health", "/boom"],
      });
    }

    if (url.pathname === "/health") {
      return json(200, { ok: true, name: META.name, version: META.version });
    }

    if (url.pathname === "/boom") {
      try {
        // Stand-in for the real work that can fail: an upstream fetch, a
        // storage write, a parse. It fails every time so the alert path
        // is demonstrable on demand.
        throw new Error("demonstration failure: the upstream said no");
      } catch (err) {
        // waitUntil, not await: the visitor gets the 500 immediately and
        // delivery happens after the response. An alert about a failure
        // must never slow the failure down.
        ctx.waitUntil(
          notify(env, {
            level: "failure",
            title: "boom endpoint failed (as designed)",
            message: err.message,
            fields: {
              path: url.pathname,
              method: request.method,
              colo: (request.cf && request.cf.colo) || "unknown",
            },
          }),
        );
        return json(500, { ok: false, error: err.message });
      }
    }

    return json(404, { ok: false, error: "no such route; see /_meta" });
  },
};
