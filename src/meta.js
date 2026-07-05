/**
 * meta.js :: the /_meta convention.
 *
 * Every Worker in a fleet answers GET <route-prefix>/_meta with the same
 * fixed JSON shape describing itself. A crawler, a dashboard, a teammate,
 * or curl can then ask the fleet what exists instead of asking a wiki
 * that stopped being true two deploys ago.
 *
 * Contract (fixed fleet-wide; the value is that it never varies):
 *
 *   {
 *     "name":        "worker-name",
 *     "description": "one honest sentence",
 *     "version":     "1.0.0",
 *     "endpoints":   [{ "method": "GET", "path": "/x", "description": "..." }],
 *     "status":      "live",
 *     "source":      "https://github.com/you/worker-repo"
 *   }
 *
 * Customising the shape: add fields freely (owner, tier, deployed_at,
 * whatever your fleet needs); never remove or rename the six above once
 * anything consumes them. A self-documentation contract only pays off
 * while every Worker speaks the same one, so evolve it additively and
 * change this file first, then re-vendor.
 *
 * Vendored, not npm-published: this is a 50-line file. Copy it into each
 * Worker's src/ and keep one repo's copy canonical. One file and one
 * import line per Worker beats a package registry dependency, a publish
 * step, and a supply chain, for something this small.
 *
 * Usage, one line at the top of fetch(), before your routing:
 *
 *   import { handleMeta } from "./meta.js";
 *   const meta = handleMeta(url, META);
 *   if (meta) return meta;
 */

/**
 * Answer GET /_meta under any route prefix, or return null.
 *
 * Matching on the path suffix means the same line works whether the
 * Worker owns api.example.com/thing* or a bare workers.dev hostname:
 * the endpoint appears at <route-prefix>/_meta either way. The response
 * is read-only and identical for every caller, so no method guard is
 * applied on purpose; registries send GET, and anything else receives
 * the same harmless truth.
 *
 * @param {URL} url - the parsed request URL
 * @param {object} meta - this Worker's self-description (see contract)
 * @param {object} [options]
 * @param {number} [options.cacheSeconds=60] - edge/browser cache window;
 *   long enough to absorb a noisy crawler, short enough that a deploy
 *   shows up inside a minute
 * @param {boolean} [options.cors=true] - allow browser dashboards to
 *   read the fleet directly
 * @returns {Response|null}
 */
export function handleMeta(url, meta, options = {}) {
  const path = url.pathname;
  if (path !== "/_meta" && !path.endsWith("/_meta")) return null;

  const cacheSeconds = Number.isFinite(options.cacheSeconds)
    ? options.cacheSeconds
    : 60;

  const headers = {
    "cache-control": `public, max-age=${cacheSeconds}`,
  };
  if (options.cors !== false) {
    headers["access-control-allow-origin"] = "*";
  }

  // status defaults to "live" so a Worker only has to say something when
  // something is wrong; meta spreads second so it can override.
  return Response.json({ status: "live", ...meta }, { headers });
}
