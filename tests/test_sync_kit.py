"""Tests for tools/sync_kit.py. Python standard library only; needs git on PATH.

Run: python -X utf8 -m unittest discover -s tests -p "test_*.py" -v

Every kit repository, archive and destination lives in a temporary folder that is removed afterwards;
nothing outside it is read or written.
"""
from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import io
import json
import os
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
SYNC = ROOT / "tools" / "sync_kit.py"
TAG = "v0.1.0"

spec = importlib.util.spec_from_file_location("sync_kit", SYNC)
sync_kit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync_kit)

PAYLOAD = {"a.txt": b"alpha\n", "sub/b.txt": b"beta\n"}


def manifest_for(files: dict[str, bytes], name: str = "portfolio-kit") -> bytes:
    entries = [{"file": n, "bytes": len(d), "sha256": hashlib.sha256(d).hexdigest()} for n, d in sorted(files.items())]
    return (json.dumps({"name": name, "version": TAG, "files": entries}, indent=2) + "\n").encode()


MANIFEST = manifest_for(PAYLOAD)
COPY = {**PAYLOAD, "MANIFEST.json": MANIFEST, "VERSION": f"{TAG}\n".encode()}

# Keep the user's git configuration (autocrlf, signing, identity) out of the throwaway repositories.
GIT_CONFIG = {"core.autocrlf": "false", "commit.gpgsign": "false", "tag.gpgsign": "false", "user.name": "Test", "user.email": "test@example.org"}
GIT_ENV = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
GIT_ENV["GIT_CONFIG_COUNT"] = str(len(GIT_CONFIG))
for number, (key, value) in enumerate(GIT_CONFIG.items()):
    GIT_ENV[f"GIT_CONFIG_KEY_{number}"] = key
    GIT_ENV[f"GIT_CONFIG_VALUE_{number}"] = value


def _make_writable(func, path, *_):
    os.chmod(path, stat.S_IWRITE)
    func(path)


def remove_tree(path: Path) -> None:
    """rmtree that also removes the read-only object files git writes on Windows."""
    if sys.version_info >= (3, 12):
        shutil.rmtree(path, onexc=_make_writable)
    else:
        shutil.rmtree(path, onerror=_make_writable)


def snapshot(folder: Path) -> dict[str, bytes]:
    return {p.relative_to(folder).as_posix(): p.read_bytes() for p in sorted(folder.rglob("*")) if p.is_file()}


def make_tar(members: list[tuple[str, bytes]], extra: list[tarfile.TarInfo] | None = None) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as archive:
        for name, data in members:
            info = tarfile.TarInfo(name)
            info.size = len(data)
            archive.addfile(info, io.BytesIO(data))
        for info in extra or []:
            archive.addfile(info)
    return buffer.getvalue()


GOOD_MEMBERS = [("dist/MANIFEST.json", MANIFEST), *((f"dist/{name}", data) for name, data in PAYLOAD.items())]


@unittest.skipUnless(shutil.which("git"), "git is not on PATH")
class SyncKitTest(unittest.TestCase):
    @classmethod
    def git(cls, *args: str) -> None:
        subprocess.run(["git", *args], cwd=cls.kit, env=GIT_ENV, check=True, capture_output=True)

    @classmethod
    def commit(cls, tag: str, dist: dict[str, bytes]) -> None:
        """Replace dist/ in the throwaway kit repository by `dist`, commit it and put an annotated tag on it."""
        if (cls.kit / "dist").exists():
            remove_tree(cls.kit / "dist")
        files = {".gitattributes": b"* -text\n", "VERSION": f"{TAG}\n".encode(), **{f"dist/{n}": d for n, d in dist.items()}}
        for name, data in files.items():
            target = cls.kit / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        cls.git("add", "-A")
        cls.git("commit", "-q", "-m", tag)
        cls.git("tag", "-a", tag, "-m", tag)

    @classmethod
    def setUpClass(cls) -> None:
        cls.base = Path(tempfile.mkdtemp(prefix="sync-kit-test-"))
        cls.addClassCleanup(remove_tree, cls.base)
        cls.kit = cls.base / "kit"
        cls.kit.mkdir()
        cls.git("init", "-q")
        cls.commit(TAG, {**PAYLOAD, "MANIFEST.json": MANIFEST})
        cls.broken = {
            "bad-json": (b"{not json", "is not valid JSON"),
            "bad-bytes": (b"\xff\xfe\x00", "is not valid JSON"),
            "bad-keys": (b'{"name": "portfolio-kit"}', "is not a portfolio-kit manifest"),
            "bad-list": (b"[]", "is not a portfolio-kit manifest"),
            "other-name": (manifest_for(PAYLOAD, name="other-kit"), "is not a portfolio-kit manifest"),
            "mismatch": (manifest_for({**PAYLOAD, "a.txt": b"something else\n"}), "does not match its own MANIFEST.json"),
        }
        for tag, (manifest, _) in cls.broken.items():
            cls.commit(tag, {**PAYLOAD, "MANIFEST.json": manifest})
        cls.commit("no-manifest", dict(PAYLOAD))

    def setUp(self) -> None:
        self.work = Path(tempfile.mkdtemp(prefix="sync-kit-work-"))
        self.addCleanup(remove_tree, self.work)
        self.dest = self.work / "web" / "kit"

    # helpers

    def cli(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, "-X", "utf8", str(SYNC), *args], cwd=self.work, env=GIT_ENV, capture_output=True, text=True, encoding="utf-8"
        )

    def sync(self, tag: str = TAG) -> subprocess.CompletedProcess:
        return self.cli("--kit", str(self.kit), "--tag", tag, "--dest", str(self.dest))

    def check(self) -> subprocess.CompletedProcess:
        return self.cli("--kit", str(self.kit), "--check", "--dest", str(self.dest))

    def main_with_archive(self, raw: bytes) -> tuple[int, str]:
        """Run sync_kit.main() in this process against a ready-made archive instead of git; return (exit code, stderr)."""
        err = io.StringIO()
        args = ["--kit", str(self.work), "--tag", TAG, "--dest", str(self.dest)]
        with mock.patch.object(sync_kit, "git_archive", return_value=raw), contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(err):
            try:
                code = sync_kit.main(args)
            except SystemExit as exc:
                code = exc.code
        return code, err.getvalue()

    def assertNoLeftovers(self) -> None:
        parent = self.dest.parent
        self.assertEqual([p.name for p in parent.iterdir() if p.name.startswith(".kit-")] if parent.exists() else [], [])

    def assertClean(self, done: subprocess.CompletedProcess, code: int) -> None:
        self.assertEqual(done.returncode, code, done.stdout + done.stderr)
        self.assertNotIn("Traceback", done.stderr)

    # copy and check

    def test_copy_into_a_missing_destination(self) -> None:
        done = self.sync()
        self.assertClean(done, 0)
        self.assertEqual(done.stdout.strip(), f"copied 2 files of portfolio-kit {TAG} into {self.dest.as_posix()}")
        self.assertEqual(snapshot(self.dest), COPY)
        self.assertNoLeftovers()

    def test_copy_into_an_empty_folder(self) -> None:
        self.dest.mkdir(parents=True)
        self.assertClean(self.sync(), 0)
        self.assertEqual(snapshot(self.dest), COPY)
        self.assertNoLeftovers()

    def test_an_earlier_copy_is_replaced(self) -> None:
        self.assertClean(self.sync(), 0)
        (self.dest / "a.txt").write_bytes(b"edited\n")
        (self.dest / "stray.txt").write_bytes(b"left over\n")
        self.assertClean(self.sync(), 0)
        self.assertEqual(snapshot(self.dest), COPY)
        self.assertNoLeftovers()

    def test_check_passes_after_a_copy(self) -> None:
        self.assertClean(self.sync(), 0)
        done = self.check()
        self.assertClean(done, 0)
        self.assertEqual(done.stdout.strip(), f"{self.dest.as_posix()} matches portfolio-kit {TAG}")

    def test_check_reports_a_tampered_file(self) -> None:
        self.assertClean(self.sync(), 0)
        with open(self.dest / "a.txt", "ab") as handle:
            handle.write(b" ")
        done = self.check()
        self.assertClean(done, 1)
        self.assertEqual(done.stdout.splitlines(), ["changed: a.txt", f"{self.dest.as_posix()} differs from portfolio-kit {TAG} (1 problem(s))"])

    def test_check_with_a_corrupt_local_manifest_is_a_clean_failure(self) -> None:
        self.assertClean(self.sync(), 0)
        (self.dest / "MANIFEST.json").write_bytes(b"{not json")
        done = self.check()
        self.assertClean(done, 1)
        self.assertIn("is not valid JSON", done.stderr)

    def test_missing_tag_is_a_usage_error(self) -> None:
        done = self.cli("--kit", str(self.kit), "--dest", str(self.dest))
        self.assertClean(done, 2)
        self.assertIn("--tag is required unless --check is given", done.stderr)

    # destination guard

    def test_a_folder_that_is_not_a_kit_copy_is_never_replaced(self) -> None:
        cases = {
            "lowercase manifest.json and no VERSION": {"manifest.json": b'{"name": "portfolio-kit"}', "notes.txt": b"keep\n"},
            "lowercase manifest.json with VERSION": {"manifest.json": MANIFEST, "VERSION": b"v0.0.1\n"},
            "MANIFEST.json but no VERSION": {"MANIFEST.json": MANIFEST, "notes.txt": b"keep\n"},
            "MANIFEST.json of another name": {"MANIFEST.json": b'{"name": "other-kit", "files": []}', "VERSION": b"v1\n"},
            "MANIFEST.json that is not JSON": {"MANIFEST.json": b"{not json", "VERSION": b"v1\n"},
            "MANIFEST.json that is a list": {"MANIFEST.json": b"[]", "VERSION": b"v1\n"},
            "unrelated files": {"index.html": b"<p>mine</p>\n", "css/site.css": b"p{}\n"},
        }
        for label, files in cases.items():
            with self.subTest(label):
                if self.dest.exists():
                    remove_tree(self.dest)
                for name, data in files.items():
                    (self.dest / name).parent.mkdir(parents=True, exist_ok=True)
                    (self.dest / name).write_bytes(data)
                before = snapshot(self.dest)
                done = self.sync()
                self.assertClean(done, 1)
                self.assertIn("refusing to replace", done.stderr)
                self.assertEqual(snapshot(self.dest), before)
                self.assertNoLeftovers()

    def test_a_file_at_the_destination_is_never_replaced(self) -> None:
        self.dest.parent.mkdir(parents=True)
        self.dest.write_bytes(b"not a folder\n")
        done = self.sync()
        self.assertClean(done, 1)
        self.assertIn("refusing to replace", done.stderr)
        self.assertEqual(self.dest.read_bytes(), b"not a folder\n")
        self.assertNoLeftovers()

    def test_the_working_folder_itself_is_never_replaced(self) -> None:
        done = self.cli("--kit", str(self.kit), "--tag", TAG, "--dest", ".")
        self.assertClean(done, 2)
        self.assertIn("refusing to replace", done.stderr)

    # tag guard

    def test_a_tag_that_starts_with_a_dash_is_a_usage_error(self) -> None:
        done = self.cli("--kit", str(self.kit), "--tag=--output=x", "--dest", str(self.dest))
        self.assertClean(done, 2)
        self.assertIn("must not start with '-'", done.stderr)
        self.assertFalse(self.dest.exists())
        self.assertFalse((self.work / "x").exists())

    def test_a_pinned_tag_that_starts_with_a_dash_is_a_usage_error(self) -> None:
        self.assertClean(self.sync(), 0)
        (self.dest / "VERSION").write_bytes(b"--output=x\n")
        done = self.check()
        self.assertClean(done, 2)
        self.assertIn("must not start with '-'", done.stderr)

    def test_no_git_call_is_made_for_a_tag_that_starts_with_a_dash(self) -> None:
        err = io.StringIO()
        with mock.patch.object(sync_kit.subprocess, "run", side_effect=AssertionError("git must not run")):
            with contextlib.redirect_stderr(err), self.assertRaises(SystemExit) as caught:
                sync_kit.main(["--kit", str(self.kit), "--tag=-x", "--dest", str(self.dest)])
        self.assertEqual(caught.exception.code, 2)

    # archive members

    def test_a_good_archive_installs(self) -> None:
        code, err = self.main_with_archive(make_tar(GOOD_MEMBERS))
        self.assertEqual((code, err), (0, ""))
        self.assertEqual(snapshot(self.dest), COPY)

    def test_unsafe_member_names_are_refused_and_the_destination_stays(self) -> None:
        self.assertEqual(self.main_with_archive(make_tar(GOOD_MEMBERS))[0], 0)
        before = snapshot(self.dest)
        names = [
            "dist/../evil.txt",
            "dist/sub/../../evil.txt",
            "../dist/evil.txt",
            "dist/a\\b.txt",
            "dist\\evil.txt",
            "dist/C:evil.txt",
            "dist/a.txt:stream",
            "/dist/evil.txt",
            "/evil.txt",
        ]
        for name in names:
            with self.subTest(name):
                code, err = self.main_with_archive(make_tar([*GOOD_MEMBERS, (name, b"evil\n")]))
                self.assertEqual(code, 1, err)
                self.assertIn("unsafe path in the archive", err)
                self.assertNotIn("Traceback", err)
                self.assertEqual(snapshot(self.dest), before)
                self.assertNoLeftovers()
                for outside in (self.dest.parent / "evil.txt", self.work / "evil.txt", self.work.parent / "evil.txt"):
                    self.assertFalse(outside.exists(), outside)

    def test_a_nul_in_a_member_name_is_refused_and_the_destination_stays(self) -> None:
        self.assertEqual(self.main_with_archive(make_tar(GOOD_MEMBERS))[0], 0)
        before = snapshot(self.dest)
        # A plain tar header would cut the name at the NUL, so the name travels in a PAX record.
        nul = tarfile.TarInfo("dist/bad\x00name")
        nul.pax_headers = {"path": "dist/bad\x00name"}
        code, err = self.main_with_archive(make_tar(GOOD_MEMBERS, [nul]))
        self.assertEqual(code, 1, err)
        self.assertIn("unsafe path in the archive", err)
        self.assertNotIn("Traceback", err)
        self.assertEqual(snapshot(self.dest), before)
        self.assertNoLeftovers()

    def test_special_members_are_refused(self) -> None:
        link = tarfile.TarInfo("dist/link")
        link.type = tarfile.SYMTYPE
        link.linkname = "a.txt"
        cases = {
            "symbolic link": (make_tar(GOOD_MEMBERS, [link]), "not a regular file"),
            "member outside dist/": (make_tar([*GOOD_MEMBERS, ("other/x.txt", b"x\n")]), "unexpected path"),
            "duplicate member": (make_tar([*GOOD_MEMBERS, ("dist/a.txt", b"alpha\n")]), "duplicate path"),
            "not a tar archive": (b"this is not a tar archive", "cannot read the archive"),
            "empty output": (b"", "cannot read the archive"),
        }
        for label, (raw, message) in cases.items():
            with self.subTest(label):
                code, err = self.main_with_archive(raw)
                self.assertEqual(code, 1, err)
                self.assertIn(message, err)
                self.assertFalse(self.dest.exists())
                self.assertNoLeftovers()

    # manifest in the archive

    def test_a_broken_manifest_in_the_archive_is_a_clean_failure(self) -> None:
        cases = {**{tag: message for tag, (_, message) in self.broken.items()}, "no-manifest": "dist/MANIFEST.json is missing"}
        for tag, message in cases.items():
            with self.subTest(tag):
                done = self.sync(tag)
                self.assertClean(done, 1)
                self.assertTrue(done.stderr.startswith("sync_kit: "), done.stderr)
                self.assertIn(message, done.stderr)
                self.assertFalse(self.dest.exists())
                self.assertNoLeftovers()

    def test_a_deeply_nested_manifest_in_the_archive_is_a_clean_failure(self) -> None:
        raw = make_tar([("dist/MANIFEST.json", b"[" * 100000), *((f"dist/{n}", d) for n, d in PAYLOAD.items())])
        code, err = self.main_with_archive(raw)
        self.assertEqual(code, 1, err)
        self.assertIn("is not valid JSON", err)
        self.assertNotIn("Traceback", err)
        self.assertFalse(self.dest.exists())
        self.assertNoLeftovers()

    # failure while installing

    def test_a_failed_move_puts_the_earlier_copy_back(self) -> None:
        self.assertEqual(self.main_with_archive(make_tar(GOOD_MEMBERS))[0], 0)
        before = snapshot(self.dest)
        newer = {**PAYLOAD, "a.txt": b"alpha, newer\n"}
        raw = make_tar([("dist/MANIFEST.json", manifest_for(newer)), *((f"dist/{n}", d) for n, d in newer.items())])
        real_replace = os.replace

        def fail_final_move(src, dst):
            if Path(dst) == self.dest and Path(src).name.startswith(".kit-") and not Path(src).name.startswith(".kit-old-"):
                raise OSError("disk unplugged")
            return real_replace(src, dst)

        with mock.patch.object(sync_kit.os, "replace", side_effect=fail_final_move):
            code, err = self.main_with_archive(raw)
        self.assertEqual(code, 2, err)
        self.assertIn("disk unplugged", err)
        self.assertEqual(snapshot(self.dest), before)
        self.assertNoLeftovers()


if __name__ == "__main__":
    unittest.main()
