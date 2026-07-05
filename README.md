<div align="center">
  <img src="https://raw.githubusercontent.com/AtlasReaper311/AtlasReaper311/main/atlas-icon-dark-256.png" width="88" alt="Atlas Systems"/>
</div>

# worker-meta-kit

```
┌───────────────────────────────────────────────┐
│  ATLAS SYSTEMS // worker-meta-kit             │
│  every worker answers /_meta; every alert     │
│  speaks one envelope                          │
└───────────────────────────────────────────────┘
```

[![Check](https://github.com/AtlasReaper311/worker-meta-kit/actions/workflows/check.yml/badge.svg)](https://github.com/AtlasReaper311/worker-meta-kit/actions)
![Runtime](https://img.shields.io/badge/runtime-cloudflare_workers-f5a623?style=flat-square&labelColor=0a0a0f)
![Deps](https://img.shields.io/badge/dependencies-zero-aaa9a0?style=flat-square&labelColor=0a0a0f)
![Cost](https://img.shields.io/badge/cost-%C2%A30-aaa9a0?style=flat-square&labelColor=0a0a0f)

Two 50-line conventions that keep a fleet of Cloudflare Workers legible to itself: a fixed `/_meta` endpoint so infrastructure can be asked what exists, and a fixed alert envelope so notification plumbing is written once instead of once per Worker. This repo is a GitHub template: a deployable example Worker carrying both, plus the two vendorable modules and the docs to adapt them.

## The problem this solves

Small Workers multiply. Each one is trivial; the fleet is not. Six months in, the questions that hurt are never about code: what is deployed right now, what does each thing expose, and why did nobody notice that one of them has been failing since Tuesday. Wikis answer the first two until they drift. Per-Worker webhook URLs answer the third until the day the notification target changes and the fix is a fleet-wide redeploy.

Both problems are contract problems, and both contracts fit in one file each.

**`/_meta`** makes every Worker self-documenting: `GET <route-prefix>/_meta` returns a fixed JSON shape (name, description, version, endpoints, status, source). The description lives in the same repo that deploys the code, so it cannot drift the way a wiki does; adding a route and adding its `/_meta` line are the same commit. Once the shape is fixed fleet-wide, a registry, a dashboard, or a colleague with `curl` can enumerate the estate instead of excavating it.

**The envelope** makes every alert the same five fields: `source`, `level`, `title`, `message`, `fields`, with `level` closed at exactly four values (`success | info | warning | failure`). Emitters send the envelope to one sink Worker over a [service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) and never learn what Discord, Slack, or anything else wants. Swap the sink's one adapter function and the whole fleet's notifications move with it. Granting a new Worker a voice is one `wrangler.toml` block, not a webhook URL copied into one more place.

## What's in the box

```
src/meta.js         the /_meta module; vendor this file, add one import line
src/envelope.js     the envelope emitter; binding first, URL fallback,
                    console tier so a fleet is observable before a sink exists
src/index.js        a working example Worker: /, /health, /boom, /_meta
docs/adapting-the-sink.md   a complete minimal sink plus Slack, generic
                    webhook, and console adapters
wrangler.toml       deployable as-is; the fleet wiring is documented inline
```

Zero dependencies beyond native Workers APIs. `envelope.notify()` never throws; an alert about a failure must not become a second failure, and the example calls it through `ctx.waitUntil()` so delivery never blocks a response either.

## Quickstart

**New Worker:** click **Use this template**, clone, `wrangler deploy`. Then:

```
curl https://<your-worker>.workers.dev/_meta
curl https://<your-worker>.workers.dev/boom
wrangler tail    # the failure envelope appears on the console tier
```

Edit `META` in `src/index.js` to describe your real routes and build outward.

**Existing Worker:** copy `src/meta.js` and `src/envelope.js` into its `src/`, add a `META` object, and mount one line before your routing:

```js
const meta = handleMeta(url, META);
if (meta) return meta;
```

Vendoring is the point, not a compromise: these are 50-line files, and copying them beats a package dependency, a publish step, and a supply chain at this size. Keep one repo's copies canonical; changes land there first and re-vendor outward.

## The rules that make the contracts hold

- The `/_meta` shape evolves additively only. Add fields freely; never remove or rename the six base fields once anything consumes them.
- The `level` vocabulary stays closed at four. A fifth level invented by one Worker is a rendering bug in every consumer; finer grain belongs in `fields`.
- Honest descriptions or none. A self-reported registry is only as useful as its worst entry.

## Template repository note

After creating a repo from this code, its owner should tick **Settings, then Template repository** so consumers get the green **Use this template** button instead of forking. Forks carry history and an upstream link nobody wants for a starting point; templates copy files cleanly.

## How it fits into Atlas Systems

This kit is the generalised form of contracts running in production across the [Atlas Systems](https://atlas-systems.uk) estate: [`atlas-api-index`](https://github.com/AtlasReaper311/atlas-api-index) crawls every Worker's `/_meta` hourly into a self-updating registry (the live system map at [atlas-systems.uk/lab](https://atlas-systems.uk/lab/) renders from it), and the envelope is the shape every estate Worker speaks to [`atlas-notify`](https://github.com/AtlasReaper311/atlas-notify), which routes it onward. Nothing here is speculative; it is the estate's own plumbing with the estate-specific names removed.

The transferable principle: a fleet stays legible when its members agree on tiny fixed contracts, because a contract in every repo cannot drift the way documentation about every repo does.

---

Part of [atlas-systems.uk](https://atlas-systems.uk) · MIT License
