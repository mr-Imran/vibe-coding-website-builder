"""Tests for skills/vibe-coding-website-builder/scripts/site_check.py.

    python3 -m unittest discover tests

Each test writes a small site into a temporary folder and checks one thing the
score depends on. Key-shaped strings are assembled at run time so that none
sits in this repository.
"""

import importlib.util
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "..", "skills", "vibe-coding-website-builder", "scripts", "site_check.py")
# Loading the script must not leave a __pycache__ folder inside the skill,
# which is copied whole when the skill is installed.
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("site_check", SCRIPT)
site_check = importlib.util.module_from_spec(spec)
sys.modules["site_check"] = site_check
spec.loader.exec_module(site_check)

GOOD_PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="Custom celebration cakes made to order in a home kitchen in Leeds.">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<meta property="og:title" content="Sugar and Thyme">
<meta property="og:image" content="images/share.jpg">
<link rel="stylesheet" href="style.css">
</head>
<body>
<header><a href="index.html">Sugar and Thyme</a> <a href="about.html">About</a></header>
<main id="main">
<h1>{h1}</h1>
<img src="images/cake.jpg" alt="A lemon cake with thyme" width="800" height="600">
{body}
<a href="https://wa.me/447700900123">Message me on WhatsApp</a>
</main>
</body>
</html>
"""
GOOD_CSS = """body { font-family: system-ui, sans-serif; margin: 0; }
img { max-width: 100%; height: auto; }
main { max-width: 60rem; margin: 0 auto; padding: 1rem; }
@media (min-width: 700px) { main { padding: 2rem; } .wide { width: 900px; } }
"""


def make_site(folder, body="", extra=None, index=None):
    files = {
        "index.html": index if index is not None else GOOD_PAGE.format(title="Sugar and Thyme: cakes in Leeds", h1="Cakes made to order", body=body),
        "about.html": GOOD_PAGE.format(title="About Sugar and Thyme", h1="About", body=""),
        "style.css": GOOD_CSS,
        "favicon.svg": "<svg xmlns='http://www.w3.org/2000/svg'/>",
        "images/cake.jpg": b"\xff\xd8\xff" + b"0" * 2000,
        "images/share.jpg": b"\xff\xd8\xff" + b"0" * 2000,
    }
    files.update(extra or {})
    for rel, content in files.items():
        if content is None:
            continue
        path = os.path.join(folder, *rel.split("/"))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        mode = "wb" if isinstance(content, bytes) else "w"
        with open(path, mode, **({} if mode == "wb" else {"encoding": "utf-8"})) as fh:
            fh.write(content)


def check(folder):
    rep = site_check.Audit(folder).run().report()
    rep["by_id"] = {c["id"]: c for c in rep["checks"]}
    return rep


class SiteCheckTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def status(self, rep, cid):
        return rep["by_id"][cid]["status"]

    def test_good_site_scores_full_and_is_ready(self):
        make_site(self.dir)
        rep = check(self.dir)
        failing = [c["id"] for c in rep["checks"] if c["status"] == "fail"]
        self.assertEqual(failing, [])
        self.assertEqual(rep["score"], 100)
        self.assertEqual(rep["verdict"], "ready")

    def test_stripe_secret_key_stops_publishing_and_is_masked(self):
        key = "sk_" + "live_" + "51Abcdefghijklmnopqrstuvwx"
        make_site(self.dir, extra={"script.js": "const k = '%s';\n" % key})
        rep = check(self.dir)
        self.assertEqual(self.status(rep, "safe.secrets"), "fail")
        self.assertEqual(rep["verdict"], "do not publish")
        self.assertNotIn(key, site_check.render(rep))

    def test_publishable_key_is_fine(self):
        key = "pk_" + "live_" + "51Abcdefghijklmnopqrstuvwx"
        make_site(self.dir, extra={"script.js": "const k = '%s';\n" % key})
        self.assertEqual(self.status(check(self.dir), "safe.secrets"), "pass")

    def test_env_file_in_site_folder_is_private(self):
        make_site(self.dir, extra={".env": "ADMIN_EMAIL=someone@somewhere.org\n"})
        rep = check(self.dir)
        self.assertEqual(self.status(rep, "safe.private"), "fail")
        self.assertEqual(rep["verdict"], "do not publish")

    def test_pretend_password_is_flagged(self):
        js = "function go(){ if (document.getElementById('pw').value === 'paws2024') { location = 'admin.html'; } }\n"
        make_site(self.dir, extra={"script.js": js})
        self.assertEqual(self.status(check(self.dir), "safe.fake_login"), "fail")

    def test_input_type_comparison_is_not_a_password_check(self):
        js = "if (field.type === 'password') { field.type = 'text'; }\n"
        make_site(self.dir, extra={"script.js": js})
        self.assertEqual(self.status(check(self.dir), "safe.fake_login"), "pass")

    def test_letter_case_mismatch_is_a_broken_link(self):
        make_site(self.dir, body='<img src="images/Cake.jpg" alt="Another cake">')
        rep = check(self.dir)
        self.assertEqual(self.status(rep, "works.links"), "fail")
        self.assertIn("capital letters differ", " ".join(rep["by_id"]["works.links"]["where"]))
        self.assertEqual(rep["verdict"], "not yet")

    def test_missing_file_is_a_broken_link(self):
        make_site(self.dir, body='<a href="menu.html">Menu</a>')
        self.assertEqual(self.status(check(self.dir), "works.links"), "fail")

    def test_localhost_address_is_flagged(self):
        make_site(self.dir, body='<a href="http://localhost:3000/menu">Menu</a>')
        self.assertEqual(self.status(check(self.dir), "works.local"), "fail")

    def test_link_that_goes_nowhere(self):
        make_site(self.dir, body='<a class="cta" href="#">Order now</a>')
        self.assertEqual(self.status(check(self.dir), "works.dead"), "fail")

    def test_form_without_destination_fails(self):
        form = '<form><label for="m">Message</label><textarea id="m" name="m"></textarea><button>Send</button></form>'
        make_site(self.dir, body=form)
        self.assertEqual(self.status(check(self.dir), "works.forms"), "fail")

    def test_form_that_only_says_thanks_fails_even_if_other_code_sends(self):
        form = '<form id="f"><label for="m">Message</label><textarea id="m" name="m"></textarea><button>Send</button></form>'
        js = ("document.getElementById('f').addEventListener('submit', function (e) { e.preventDefault(); alert('Thank you!'); });\n"
              "document.getElementById('x').addEventListener('click', function () { fetch('https://elsewhere.test/api'); });\n")
        make_site(self.dir, body=form, extra={"script.js": js})
        rep = check(self.dir)
        self.assertEqual(self.status(rep, "works.forms"), "fail")

    def test_form_posting_to_a_form_service_passes(self):
        form = ('<form action="https://formspree.io/f/mqkrbzpa" method="POST"><label for="m">Message</label>'
                '<textarea id="m" name="m"></textarea><button>Send</button></form>')
        make_site(self.dir, body=form)
        self.assertEqual(self.status(check(self.dir), "works.forms"), "pass")

    def test_form_with_stand_in_address_fails(self):
        form = ('<form action="https://formspree.io/f/YOUR_FORM_ID" method="POST"><label for="m">Message</label>'
                '<textarea id="m" name="m"></textarea><button>Send</button></form>')
        make_site(self.dir, body=form)
        self.assertEqual(self.status(check(self.dir), "works.forms"), "fail")

    def test_netlify_form_passes(self):
        form = ('<form name="contact" method="POST" data-netlify="true"><label for="m">Message</label>'
                '<textarea id="m" name="m"></textarea><button>Send</button></form>')
        make_site(self.dir, body=form)
        rep = check(self.dir)
        self.assertEqual(self.status(rep, "works.forms"), "pass")
        self.assertTrue(any("Netlify" in c for c in rep["confirm"]))

    def test_no_form_means_form_checks_are_left_out(self):
        make_site(self.dir)
        rep = check(self.dir)
        self.assertEqual(self.status(rep, "works.forms"), "skip")
        self.assertLess(rep["possible"], 100)

    def test_missing_viewport_fails(self):
        page = GOOD_PAGE.format(title="Sugar and Thyme: cakes in Leeds", h1="Cakes", body="").replace(
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n', "")
        make_site(self.dir, index=page)
        self.assertEqual(self.status(check(self.dir), "phone.viewport"), "fail")

    def test_fixed_width_outside_media_query_fails_inside_passes(self):
        make_site(self.dir, extra={"style.css": GOOD_CSS + ".box { width: 1200px; }\n"})
        self.assertEqual(self.status(check(self.dir), "phone.fixed"), "fail")
        make_site(self.dir, extra={"style.css": GOOD_CSS + ".box { width: 1200px; max-width: 100%; }\n"})
        self.assertEqual(self.status(check(self.dir), "phone.fixed"), "pass")

    def test_placeholder_text_fails(self):
        make_site(self.dir, body="<p>Lorem ipsum dolor sit amet.</p><p>Call (555) 555-0199</p>")
        rep = check(self.dir)
        self.assertEqual(self.status(rep, "real.placeholder"), "fail")
        self.assertEqual(len(rep["by_id"]["real.placeholder"]["where"]), 2)

    def test_stand_in_drawing_named_placeholder_fails(self):
        body = '<img src="images/placeholder-1.svg" alt=""><span>Photo coming soon</span>'
        make_site(self.dir, body=body, extra={"images/placeholder-1.svg": "<svg xmlns='http://www.w3.org/2000/svg'/>"})
        rep = check(self.dir)
        self.assertEqual(self.status(rep, "real.images"), "fail")
        self.assertEqual(self.status(rep, "real.placeholder"), "fail")
        self.assertEqual(rep["verdict"], "not yet")

    def test_form_label_your_name_is_not_placeholder_text(self):
        form = ('<form action="https://formspree.io/f/mqkrbzpa" method="POST"><label for="n">Your name</label>'
                '<input id="n" name="n" placeholder="you@example.com"><button>Send</button></form>')
        make_site(self.dir, body=form)
        self.assertEqual(self.status(check(self.dir), "real.placeholder"), "pass")

    def test_yellow_notes_are_counted_and_block_ready(self):
        make_site(self.dir, body='<p>Open <mark class="needs-you">your opening hours</mark></p>')
        rep = check(self.dir)
        self.assertEqual(self.status(rep, "real.needs_you"), "fail")
        self.assertEqual(self.status(rep, "real.placeholder"), "pass")
        self.assertEqual(rep["verdict"], "not yet")

    def test_default_title_fails(self):
        page = GOOD_PAGE.format(title="Document", h1="Cakes", body="")
        make_site(self.dir, index=page)
        self.assertEqual(self.status(check(self.dir), "real.title"), "fail")

    def test_claims_are_listed_for_the_owner_without_costing_points(self):
        make_site(self.dir, body="<h2>What our customers say</h2><p>Trusted by 500+ happy customers</p>")
        rep = check(self.dir)
        self.assertEqual(rep["score"], 100)
        self.assertTrue(any("only the owner can vouch" in c for c in rep["confirm"]))

    def test_heavy_picture_fails(self):
        make_site(self.dir, extra={"images/cake.jpg": b"\xff\xd8\xff" + b"0" * (600 * 1024)})
        self.assertEqual(self.status(check(self.dir), "fast.images"), "fail")

    def test_site_in_a_site_subfolder_is_found(self):
        make_site(os.path.join(self.dir, "site"))
        with open(os.path.join(self.dir, "site-notes.txt"), "w", encoding="utf-8") as fh:
            fh.write("notes for the owner\n")
        rep = check(self.dir)
        self.assertEqual(rep["folder_checked"], "site")
        self.assertEqual(rep["score"], 100)

    def test_env_outside_site_folder_is_not_a_private_file(self):
        make_site(os.path.join(self.dir, "site"))
        with open(os.path.join(self.dir, ".env"), "w", encoding="utf-8") as fh:
            fh.write("FORM_NOTES=nothing secret\n")
        rep = check(self.dir)
        self.assertEqual(self.status(rep, "safe.private"), "pass")

    def test_public_env_name_holding_a_secret_fails(self):
        make_site(os.path.join(self.dir, "site"))
        with open(os.path.join(self.dir, ".env"), "w", encoding="utf-8") as fh:
            fh.write("VITE_OPENAI_API_KEY=abc123\nVITE_SUPABASE_ANON_KEY=xyz\n")
        rep = check(self.dir)
        self.assertEqual(self.status(rep, "safe.public_env"), "fail")
        self.assertEqual(len(rep["by_id"]["safe.public_env"]["where"]), 1)

    def test_project_that_needs_building_skips_page_checks(self):
        with open(os.path.join(self.dir, "package.json"), "w", encoding="utf-8") as fh:
            fh.write('{"scripts": {"build": "vite build"}}')
        with open(os.path.join(self.dir, "index.html"), "w", encoding="utf-8") as fh:
            fh.write('<html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>')
        rep = check(self.dir)
        self.assertEqual(rep["kind"], "needs-build")
        self.assertEqual(rep["verdict"], "cannot tell yet")
        self.assertEqual(self.status(rep, "works.links"), "skip")

    def test_app_with_a_server_is_checked_through_its_public_folder(self):
        make_site(os.path.join(self.dir, "public"), index=GOOD_PAGE.format(
            title="Home - Studio", h1="Home", body="").replace('<meta property="og:title" content="Sugar and Thyme">\n', "")
            .replace('<meta property="og:image" content="images/share.jpg">\n', "").replace('href="style.css"', 'href="/style.css"'))
        with open(os.path.join(self.dir, "server.js"), "w", encoding="utf-8") as fh:
            fh.write("// if (role === 'admin') { /* server code is not a page */ }\n")
        os.makedirs(os.path.join(self.dir, "data"))
        rep = check(self.dir)
        self.assertEqual(rep["kind"], "app")
        self.assertEqual(rep["folder_checked"], "public")
        self.assertEqual(self.status(rep, "share.og"), "skip")
        self.assertEqual(self.status(rep, "works.links"), "pass")
        self.assertTrue(any("data" in n and "must not be uploaded" in n for n in rep["notes"]))
        self.assertFalse(any("start with a slash" in n for n in rep["notes"]))
        self.assertEqual(rep["verdict"], "ready")

    def test_app_addresses_without_a_file_ending_and_api_routes_are_not_broken_links(self):
        body = ('<a href="/about">About</a> <a href="/about?tab=team#main">Team</a> '
                '<a href="/api/backup" download>Backup</a> <a href="/nowhere">Gone</a>')
        make_site(os.path.join(self.dir, "public"), index=GOOD_PAGE.format(title="Home - Studio", h1="Home", body=body))
        with open(os.path.join(self.dir, "server.js"), "w", encoding="utf-8") as fh:
            fh.write("// the app")
        rep = check(self.dir)
        self.assertEqual(rep["kind"], "app")
        where = " ".join(rep["by_id"]["works.links"]["where"])
        self.assertIn("/nowhere", where)
        self.assertNotIn("/about", where)
        self.assertNotIn("/api/backup", where)
        self.assertEqual(self.status(rep, "works.anchors"), "pass")

    def test_plain_site_address_without_a_file_ending_is_still_a_broken_link(self):
        make_site(self.dir, body='<a href="about">About</a>')
        rep = check(self.dir)
        self.assertEqual(self.status(rep, "works.links"), "fail")

    def test_secret_in_an_app_s_server_code_still_stops_publishing(self):
        make_site(os.path.join(self.dir, "public"))
        key = "sk_" + "live_" + "51Abcdefghijklmnopqrstuvwx"
        with open(os.path.join(self.dir, "server.js"), "w", encoding="utf-8") as fh:
            fh.write("const stripeKey = '%s';\n" % key)
        rep = check(self.dir)
        self.assertEqual(rep["kind"], "app")
        self.assertEqual(self.status(rep, "safe.secrets"), "fail")
        self.assertEqual(rep["verdict"], "do not publish")

    def test_empty_folder(self):
        rep = check(self.dir)
        self.assertEqual(rep["kind"], "empty")
        self.assertEqual(self.status(rep, "works.index"), "fail")

    def test_command_line_min_exit_code(self):
        make_site(self.dir, body="<p>Lorem ipsum</p>")
        self.assertEqual(site_check.main([self.dir, "--summary", "--min", "100"]), 1)
        self.assertEqual(site_check.main([self.dir, "--summary", "--min", "50"]), 0)


if __name__ == "__main__":
    unittest.main()
