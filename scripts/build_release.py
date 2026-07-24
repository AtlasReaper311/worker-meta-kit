#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import subprocess
import sys
import tarfile
from io import BytesIO
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = "worker-meta-kit"
SCHEMA_VERSION = "atlas-release-artifact/v1"
RELEASE_MEMBERS = (
    "VERSION",
    "README.md",
    "LICENSE",
    "package.json",
    "package-lock.json",
    "wrangler.toml",
    "docs/adapting-the-sink.md",
    "src/envelope.js",
    "src/index.js",
    "src/meta.js",
)


def canonical_json(value: Any) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_version() -> str:
    version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    if not version:
        raise RuntimeError("VERSION must not be empty")
    return version


def validate_inputs(version: str) -> None:
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    if package.get("version") != version:
        raise RuntimeError("package.json version does not match VERSION")
    if package.get("private") is not True:
        raise RuntimeError("worker-meta-kit must remain private to prevent registry publishing")
    source = (ROOT / "src/index.js").read_text(encoding="utf-8")
    if f'version: "{version}"' not in source:
        raise RuntimeError("example Worker /_meta version does not match VERSION")
    for relative in ("src/meta.js", "src/envelope.js", "src/index.js"):
        subprocess.run(["node", "--check", relative], cwd=ROOT, check=True)


def release_manifest(version: str) -> dict[str, Any]:
    files = []
    for relative in RELEASE_MEMBERS:
        path = ROOT / relative
        if not path.is_file():
            raise RuntimeError(f"release member is missing: {relative}")
        data = path.read_bytes()
        files.append({"path": relative, "bytes": len(data), "sha256": sha256(data)})
    return {
        "schema_version": SCHEMA_VERSION,
        "package": PACKAGE,
        "version": version,
        "release_tag": f"v{version}",
        "distribution_model": "github-template-and-vendored-source-files",
        "registry_publish": False,
        "files": files,
    }


def write_tarball(output_dir: Path, version: str, manifest: dict[str, Any]) -> Path:
    archive_path = output_dir / f"{PACKAGE}-{version}.tar.gz"
    prefix = f"{PACKAGE}-{version}"
    entries = [(relative, (ROOT / relative).read_bytes()) for relative in RELEASE_MEMBERS]
    entries.append(("release-manifest.json", canonical_json(manifest)))

    with archive_path.open("wb") as raw_file:
        with gzip.GzipFile(fileobj=raw_file, mode="wb", filename="", mtime=0) as gzip_file:
            with tarfile.open(fileobj=gzip_file, mode="w") as archive:
                for relative, data in entries:
                    info = tarfile.TarInfo(f"{prefix}/{relative}")
                    info.size = len(data)
                    info.mtime = 0
                    info.mode = 0o644
                    info.uid = 0
                    info.gid = 0
                    info.uname = ""
                    info.gname = ""
                    archive.addfile(info, BytesIO(data))
    return archive_path


def build_release(output_dir: Path, *, validate: bool = True) -> dict[str, str]:
    version = read_version()
    if validate:
        validate_inputs(version)
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = release_manifest(version)
    manifest_path = output_dir / f"{PACKAGE}-{version}.release-manifest.json"
    manifest_path.write_bytes(canonical_json(manifest))
    archive_path = write_tarball(output_dir, version, manifest)
    return {
        "version": version,
        "archive": str(archive_path),
        "archive_sha256": sha256(archive_path.read_bytes()),
        "manifest": str(manifest_path),
        "manifest_sha256": sha256(manifest_path.read_bytes()),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build a deterministic worker-meta-kit release artifact."
    )
    parser.add_argument("--output-dir", type=Path, default=ROOT / "reports" / "release")
    parser.add_argument("--skip-validation", action="store_true")
    args = parser.parse_args()

    result = build_release(args.output_dir, validate=not args.skip_validation)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
