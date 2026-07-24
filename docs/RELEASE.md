# Release process

`worker-meta-kit` is distributed as a GitHub template repository and as a GitHub Release artifact. It is intentionally not published to npm.

The package stays marked as private so an accidental registry publish fails before leaving the repository.

## Version source

The release version is declared in:

- `VERSION`;
- `package.json`;
- the example Worker `META.version` in `src/index.js`;
- the README version badge.

All version declarations must move together in the same pull request.

## Build

Run:

```bash
npm run check
python3 -m py_compile scripts/build_release.py
npm run release:pack
git diff --check
```

The release artifact contains the vendorable source modules, the deployable example Worker, the sink-adaptation guide, Worker configuration, licence, package metadata, and a release manifest with SHA-256 fingerprints.

## Publish

Create an annotated tag that matches `VERSION`, for example:

```bash
git tag -a v1.0.0 -m "worker-meta-kit v1.0.0"
git push origin v1.0.0
```

The release workflow validates the template again and uploads the deterministic archive as a short-retention workflow artifact.

Manual `workflow_dispatch` is available for building an artifact from an existing tag, but it must use a tag in the form `v<version>`.

After reviewing the workflow artifact, publish the GitHub Release explicitly:

```bash
gh release create v1.0.0 reports/release/* \
  --title "worker-meta-kit v1.0.0" \
  --notes-file reports/release/worker-meta-kit-1.0.0.release-manifest.json \
  --verify-tag
```

## Rollback

Consumers either create from the template or vendor individual files. To roll back, replace the copied files with the previous release artifact and re-run the consuming Worker's own syntax, preview, and deployment checks.
