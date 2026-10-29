#!/usr/bin/env python3
"""Vendor portfolio-kit's dist/ at a tag into web/kit/, or check that web/kit/ still matches it.

Reference copy from https://github.com/HARISPAARTAN/portfolio-kit (tools/sync_kit.py). Consumers copy this
file into their own tools/ folder. Python 3.10 or newer, standard library only.

  python tools/sync_kit.py --tag v0.1.0          copy dist/ at v0.1.0 into web/kit/ and write web/kit/VERSION
  python tools/sync_kit.py --check               compare web/kit/ with dist/ at the tag named in web/kit/VERSION
  python tools/sync_kit.py --check --kit .kit    the same against another clone (the consumer's CI)

The kit clone defaults to $PORTFOLIO_KIT, then E:/GITGUB/portfolio-kit.
Exit codes: 0 match or copied, 1 differences, 2 usage or git error.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path, PurePosixPath
from typing import NoReturn


def die(message: str) -> NoReturn:
    print(f"sync_kit: {message}", file=sys.stderr)
    sys.exit(2)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def kit_files(kit: str, tag: str) -> dict[str, bytes]:
    """Read dist/ at the tag with git archive and return {path below dist/: bytes}."""
    try:
        out = subprocess.run(["git", "-C", kit, "archive", "--format=tar", tag, "dist"], check=True, capture_output=True)
    except FileNotFoundError:
        die("git is not on PATH")
    except subprocess.CalledProcessError as exc:
        die(f"cannot read dist/ at {tag} from {kit}: {exc.stderr.decode(errors='replace').strip()}")
    files: dict[str, bytes] = {}
    with tarfile.open(fileobj=io.BytesIO(out.stdout)) as archive:
        for member in archive.getmembers():
            path = PurePosixPath(member.name)
            if not member.isfile() or path.parts[:1] != ("dist",):
                continue
            if path.is_absolute() or ".." in path.parts:
                die(f"unsafe path in the archive: {member.name}")
            files[path.relative_to("dist").as_posix()] = archive.extractfile(member).read()
    if "MANIFEST.json" not in files:
        die(f"dist/MANIFEST.json is missing at {tag}")
    return files


def compare(manifest: dict, files: dict[str, bytes]) -> list[str]:
    """List the differences between a MANIFEST.json and {path: bytes}."""
    want = {entry["file"]: entry for entry in manifest["files"]}
    problems = []
    for name in sorted(files):
        entry = want.pop(name, None)
        data = files[name]
        if entry is None:
            problems.append(f"not in MANIFEST.json: {name}")
        elif entry["bytes"] != len(data) or entry["sha256"] != sha256(data):
            problems.append(f"changed: {name}")
    problems.extend(f"missing: {name}" for name in sorted(want))
    return problems


def read_dest(dest: Path) -> dict[str, bytes]:
    files = {}
    for path in sorted(dest.rglob("*")):
        name = path.relative_to(dest).as_posix()
        if path.is_file() and name not in ("MANIFEST.json", "VERSION"):
            files[name] = path.read_bytes()
    return files


def sync(kit: str, tag: str, dest: Path) -> int:
    files = kit_files(kit, tag)
    payload = {name: data for name, data in files.items() if name != "MANIFEST.json"}
    problems = compare(json.loads(files["MANIFEST.json"]), payload)
    if problems:
        die(f"dist/ at {tag} does not match its own MANIFEST.json ({problems[0]})")
    if dest.resolve() in (Path.cwd().resolve(), Path(kit).resolve()):
        die(f"refusing to replace {dest.as_posix()}: choose a folder such as web/kit")
    if dest.exists():
        if not dest.is_dir() or (any(dest.iterdir()) and not (dest / "MANIFEST.json").is_file()):
            die(f"refusing to replace {dest.as_posix()}: it is not an earlier copy of the kit")
        shutil.rmtree(dest)
    for name, data in files.items():
        target = dest / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    (dest / "VERSION").write_bytes(f"{tag}\n".encode())
    print(f"copied {len(payload)} files of portfolio-kit {tag} into {dest.as_posix()}")
    return 0


def check(kit: str, tag: str | None, dest: Path) -> int:
    if not (dest / "MANIFEST.json").is_file():
        die(f"{dest.as_posix()}/MANIFEST.json not found: copy the kit first with --tag")
    version = dest / "VERSION"
    pinned = version.read_text(encoding="utf-8").strip() if version.is_file() else None
    tag = tag or pinned
    if not tag:
        die(f"no --tag given and no {dest.as_posix()}/VERSION")
    local = (dest / "MANIFEST.json").read_bytes()
    problems = [] if pinned == tag else [f"VERSION says {pinned}, expected {tag}"]
    problems += compare(json.loads(local), read_dest(dest))
    if kit_files(kit, tag)["MANIFEST.json"] != local:
        problems.append(f"MANIFEST.json differs from dist/MANIFEST.json at {tag}")
    for problem in problems:
        print(problem)
    if problems:
        print(f"{dest.as_posix()} differs from portfolio-kit {tag} ({len(problems)} problem(s))")
        return 1
    print(f"{dest.as_posix()} matches portfolio-kit {tag}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Vendor portfolio-kit's dist/ into web/kit/, or check the copy.")
    parser.add_argument("--tag", help="tag or commit of portfolio-kit; --check defaults to the tag in <dest>/VERSION")
    parser.add_argument("--kit", default=os.environ.get("PORTFOLIO_KIT", "E:/GITGUB/portfolio-kit"), help="local clone of portfolio-kit")
    parser.add_argument("--dest", default=Path("web/kit"), type=Path, help="vendored folder (default: web/kit)")
    parser.add_argument("--check", action="store_true", help="compare instead of copying")
    args = parser.parse_args(argv)
    if args.check:
        return check(args.kit, args.tag, args.dest)
    if not args.tag:
        parser.error("--tag is required unless --check is given")
    return sync(args.kit, args.tag, args.dest)


if __name__ == "__main__":
    sys.exit(main())
