"""The repository itself: line endings that do not change with the computer.

A copy of the skill made on Windows (a clone, a download, git archive) used
to get Windows line endings in every file, and an edit that matched several
lines at once failed on it. Every text file is stored with Unix endings and
checked out that way everywhere; the three Windows double-click files are the
one exception, and keep theirs.
"""
import os
import shutil
import subprocess
import sys
import unittest

sys.dont_write_bytecode = True
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as f:
        return f.read()


class LineEndings(unittest.TestCase):
    def test_every_text_file_has_unix_line_endings_everywhere(self):
        lines = read(".gitattributes").splitlines()
        self.assertIn("* text=auto eol=lf", lines)
        self.assertIn("*.cmd -text", lines)

    def test_the_starter_carries_the_same_rule_into_the_app(self):
        lines = read("skills/vibe-coding-website-builder/assets/app-starter/.gitattributes").splitlines()
        self.assertIn("* text=auto eol=lf", lines)
        self.assertIn("*.cmd -text", lines)

    @unittest.skipIf(not shutil.which("git") or not os.path.isdir(os.path.join(ROOT, ".git")), "not a git checkout")
    def test_what_git_stores_has_windows_endings_only_in_the_double_click_files(self):
        out = subprocess.run(["git", "ls-files", "--eol"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        wrong = []
        for line in out.splitlines():
            info, _, name = line.partition("\t")
            if info.startswith("i/crlf") or info.startswith("i/mixed"):
                if not name.endswith(".cmd"):
                    wrong.append(name)
        self.assertEqual(wrong, [], "stored with Windows line endings")


if __name__ == "__main__":
    unittest.main()
