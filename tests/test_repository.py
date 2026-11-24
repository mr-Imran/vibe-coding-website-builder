"""The repository itself: line endings that do not change with the computer.

A copy of the skill made on Windows (a clone, a download, git archive) used
to get Windows line endings in every file, and an edit that matched several
lines at once failed on it. Every text file is stored with Unix endings and
checked out that way everywhere; the three Windows double-click files are the
one exception, and keep theirs.
"""
import os
import re
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


def repeated_passages(text, shortest=120):
    """Paragraphs, bullets and sentences long enough to matter that a file has twice."""
    seen, twice = set(), []
    for chunk in re.split(r"\n\s*\n|\n(?=\s*[-*] )|\n(?=\d+\. )", text):
        for part in re.split(r"(?<=[.!?:])\s+(?=[A-Z`\"(])", chunk):
            words = " ".join(part.split())
            if len(words) < shortest:
                continue
            if words in seen and words not in twice:
                twice.append(words)
            seen.add(words)
    return twice


class Guides(unittest.TestCase):
    """A patch that was run twice once left paragraphs of app.md printed three times."""

    def test_the_test_finds_a_repeated_paragraph(self):
        para = "- **A rule** that is long enough to be a real paragraph of the guide, and says something an agent would read twice and wonder about."
        self.assertEqual(len(repeated_passages(para + "\n" + para + "\n")), 1)
        self.assertEqual(repeated_passages(para + "\n- **Another** short one.\n"), [])

    def test_no_guide_says_the_same_thing_twice(self):
        skill = os.path.join(ROOT, "skills", "vibe-coding-website-builder")
        files = [os.path.join(skill, "SKILL.md")] + [
            os.path.join(skill, "references", name) for name in sorted(os.listdir(os.path.join(skill, "references"))) if name.endswith(".md")]
        found = {}
        for path in files:
            with open(path, encoding="utf-8") as f:
                twice = repeated_passages(f.read())
            if twice:
                found[os.path.relpath(path, ROOT)] = [w[:80] for w in twice]
        self.assertEqual(found, {}, "printed more than once")


if __name__ == "__main__":
    unittest.main()
