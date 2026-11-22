"""Fail closed if an extension ZIP contains development files or missing assets."""
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import stat
import zipfile

REQUIRED = frozenset({
    "manifest.json", "background.js", "youtube.js", "options.js", "popup.js",
    "options.html", "popup.html", "LICENSE",
})
ALLOWED = REQUIRED | {"SOURCE.txt"}


class ScriptReferences(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            src = dict(attrs).get("src")
            if not src:
                raise ValueError("Inline script in distribution HTML")
            self.paths.append(src)


def verify_archive(archive, expected_version):
    with zipfile.ZipFile(archive) as bundle:
        entries = bundle.infolist()
        names = [entry.filename for entry in entries]
        if len(names) != len(set(names)):
            raise ValueError("Duplicate ZIP entry")
        if not REQUIRED <= set(names) or not set(names) <= ALLOWED:
            raise ValueError(f"Unexpected or missing ZIP files: {sorted(set(names) ^ REQUIRED)}")
        if sum(entry.file_size for entry in entries) > 5_000_000:
            raise ValueError("Distribution exceeds expected size")
        for entry in entries:
            if stat.S_ISLNK(entry.external_attr >> 16):
                raise ValueError("Symlink in distribution")
        if bundle.testzip() is not None:
            raise ValueError("Corrupt ZIP entry")
        manifest = json.loads(bundle.read("manifest.json"))
        if manifest.get("manifest_version") != 3 or manifest.get("version") != expected_version:
            raise ValueError("Manifest version mismatch")
        refs = list(manifest["background"]["scripts"])
        refs += [manifest["action"]["default_popup"], manifest["options_ui"]["page"]]
        for content in manifest["content_scripts"]:
            refs.extend(content["js"])
            refs.extend(content.get("css", []))
        for name in ("options.html", "popup.html"):
            html = bundle.read(name).decode("utf-8")
            if not html.lower().startswith("<!doctype html>"):
                raise ValueError(f"Missing doctype: {name}")
            parser = ScriptReferences()
            parser.feed(html)
            refs.extend(parser.paths)
        if any(ref not in names for ref in refs):
            raise ValueError("Unresolved manifest or HTML resource")
        if not bundle.read("LICENSE").strip():
            raise ValueError("Empty license")
        return sorted(names)


def main():
    version = os.getenv("DISTRIBUTION_VERSION") or json.loads(Path("package.json").read_text())["version"]
    if not re.fullmatch(r"(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})", version):
        raise ValueError("Unsupported package version")
    filename = os.getenv("WEB_EXT_FILENAME") or f"youtube_apple_music_linker-{version}.zip"
    if not re.fullmatch(rf"youtube_apple_music_linker-{re.escape(version)}(?:-dev-[a-f0-9]{{12}})?\.zip", filename):
        raise ValueError("Distribution filename/version mismatch")
    archive = Path("web-ext-artifacts") / filename
    names = verify_archive(archive, version)
    repository, revision = os.getenv("GITHUB_REPOSITORY"), os.getenv("GITHUB_SHA")
    if repository and revision:
        expected_source = f"Source code: https://github.com/{repository}/tree/{revision}\n"
        with zipfile.ZipFile(archive) as bundle:
            if "SOURCE.txt" not in names or not bundle.read("SOURCE.txt").decode().startswith(expected_source):
                raise ValueError("Missing CI source revision notice")
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    print(f"Verified {archive}: {', '.join(names)}\nSHA-256: {digest}")
    if output := os.getenv("GITHUB_OUTPUT"):
        with open(output, "a", encoding="utf-8") as stream:
            stream.write(f"zip={archive.as_posix()}\nsha256={digest}\n")
    if summary := os.getenv("GITHUB_STEP_SUMMARY"):
        with open(summary, "a", encoding="utf-8") as stream:
            stream.write(f"### Firefox distribution\n\nVersion: `{version}`\n\nFile: `{archive.name}`\n\nSHA-256: `{digest}`\n\n"
                         "ZIP verified: extension runtime files and license only; no Node.js dependencies or tests.\n")


if __name__ == "__main__":
    main()
