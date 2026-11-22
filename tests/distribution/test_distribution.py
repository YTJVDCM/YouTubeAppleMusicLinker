import json
import contextlib
import io
import os
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from verify_distribution import REQUIRED, main, verify_archive


class DistributionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.archive = Path(self.tmp.name) / "addon.zip"
        self.files = {name: "// browser runtime" for name in REQUIRED}
        self.files["LICENSE"] = "Mozilla Public License Version 2.0"
        self.files["manifest.json"] = json.dumps({
            "manifest_version": 3, "version": "0.2.3",
            "background": {"scripts": ["background.js"]},
            "action": {"default_popup": "popup.html"},
            "options_ui": {"page": "options.html"},
            "content_scripts": [{"js": ["youtube.js"]}],
        })
        for name in ("options", "popup"):
            self.files[f"{name}.html"] = f'<!doctype html><script src="{name}.js"></script>'

    def write(self):
        with zipfile.ZipFile(self.archive, "w") as bundle:
            for name, data in self.files.items():
                bundle.writestr(name, data)

    def test_complete_runtime_package(self):
        self.write()
        self.assertEqual(set(verify_archive(self.archive, "0.2.3")), REQUIRED)

    def test_development_files_are_rejected(self):
        for name in ("package.json", "node_modules/x.js", "tests/test.js", "worker/index.js", ".env", "youtube.js.map"):
            with self.subTest(name=name):
                self.files[name] = "unwanted"
                self.write()
                with self.assertRaises(ValueError):
                    verify_archive(self.archive, "0.2.3")
                del self.files[name]

    def test_missing_runtime_file_is_rejected(self):
        del self.files["popup.js"]
        self.write()
        with self.assertRaises(ValueError):
            verify_archive(self.archive, "0.2.3")

    def test_root_manifest_cannot_leak_into_distribution(self):
        manifest = json.loads(self.files["manifest.json"])
        manifest["action"]["default_popup"] = "dist/extension/popup.html"
        self.files["manifest.json"] = json.dumps(manifest)
        self.write()
        with self.assertRaises(ValueError):
            verify_archive(self.archive, "0.2.3")

    def test_remote_scripts_are_rejected(self):
        self.files["popup.html"] = '<!doctype html><script src="https://example.com/remote.js"></script>'
        self.write()
        with self.assertRaises(ValueError):
            verify_archive(self.archive, "0.2.3")

    def test_wrong_version_is_rejected(self):
        self.write()
        with self.assertRaises(ValueError):
            verify_archive(self.archive, "9.9.9")

    def prepare_ci(self):
        root = Path(self.tmp.name)
        (root / "package.json").write_text('{"version":"0.2.3"}')
        (root / "web-ext-artifacts").mkdir()
        self.archive = root / "web-ext-artifacts/youtube_apple_music_linker-0.2.3.zip"
        return root, {"GITHUB_REPOSITORY": "example/project", "GITHUB_SHA": "a" * 40,
                      "DISTRIBUTION_VERSION": "0.2.3", "WEB_EXT_FILENAME": self.archive.name,
                      "GITHUB_OUTPUT": str(root / "outputs"), "GITHUB_STEP_SUMMARY": str(root / "summary")}

    def test_ci_outputs_exact_zip_path_and_checksum(self):
        root, env = self.prepare_ci()
        self.files["SOURCE.txt"] = f'Source code: https://github.com/example/project/tree/{"a" * 40}\n'
        self.write()
        previous = Path.cwd()
        try:
            os.chdir(root)
            with patch.dict(os.environ, env), contextlib.redirect_stdout(io.StringIO()):
                main()
        finally:
            os.chdir(previous)
        self.assertIn("zip=web-ext-artifacts/youtube_apple_music_linker-0.2.3.zip\n", (root / "outputs").read_text())
        self.assertRegex((root / "outputs").read_text(), r"sha256=[a-f0-9]{64}")
        self.assertIn("SHA-256", (root / "summary").read_text())

    def test_ci_requires_the_exact_source_revision(self):
        root, env = self.prepare_ci()
        self.files["SOURCE.txt"] = "Source code: wrong revision\n"
        self.write()
        previous = Path.cwd()
        try:
            os.chdir(root)
            with patch.dict(os.environ, env), self.assertRaises(ValueError):
                main()
        finally:
            os.chdir(previous)

    def test_ci_tag_version_overrides_package_version_without_modifying_it(self):
        root, env = self.prepare_ci()
        env.update(DISTRIBUTION_VERSION="1.2.3", WEB_EXT_FILENAME="youtube_apple_music_linker-1.2.3.zip")
        self.archive = root / "web-ext-artifacts" / env["WEB_EXT_FILENAME"]
        manifest = json.loads(self.files["manifest.json"])
        manifest["version"] = "1.2.3"
        self.files["manifest.json"] = json.dumps(manifest)
        self.files["SOURCE.txt"] = f'Source code: https://github.com/example/project/tree/{"a" * 40}\n'
        self.write()
        previous = Path.cwd()
        try:
            os.chdir(root)
            with patch.dict(os.environ, env), contextlib.redirect_stdout(io.StringIO()):
                main()
        finally:
            os.chdir(previous)
        self.assertIn("-1.2.3.zip", (root / "outputs").read_text())
        self.assertEqual(json.loads((root / "package.json").read_text())["version"], "0.2.3")


if __name__ == "__main__":
    unittest.main()
