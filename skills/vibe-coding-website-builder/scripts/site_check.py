#!/usr/bin/env python3
"""site check: score how ready a simple website is to publish (0-100).

Standard library only. Reads a folder of website files. Runs nothing, sends
nothing, changes nothing.

    python3 site_check.py [FOLDER] [--summary] [--json] [--min N]

The score is a checklist of things that go wrong on websites made by people who
cannot read the code: leaked keys, links that break once the site is online,
pages that do not fit a phone, placeholder text, forms that send nothing. It
does not judge the design, and it cannot tell whether visitors will come.
"""

import argparse
import base64
import fnmatch
import json
import os
import re
import sys
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit

SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", ".next", ".nuxt", ".cache",
             ".idea", ".vscode", ".svelte-kit", ".astro", ".vercel", ".netlify", "coverage"}
BUILT_DIRS = ("dist", "build", "out", "_site")
PLAIN_DIRS = ("site", "public", "docs", "www", "html", "website", "dist", "build", "out", "_site")
TEXT_EXTS = {".html", ".htm", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".vue", ".svelte", ".astro",
             ".json", ".css", ".txt", ".md", ".yml", ".yaml", ".toml", ".xml", ".svg", ".php", ".py",
             ".map", ".ini", ".cfg", ".conf", ""}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".tif", ".tiff", ".svg", ".ico"}
MAX_SCAN_BYTES = 5 * 1024 * 1024
BIG_IMAGE = 500 * 1024           # one picture heavier than this slows a phone down
HOME_BUDGET = 3 * 1024 * 1024    # everything the home page loads from this folder
PHONE_WIDTH = 480                # a fixed width above this does not fit a phone

AREAS = [
    ("safe", "Safe to publish"),
    ("works", "Everything works"),
    ("phone", "Fits a phone"),
    ("real", "Real content"),
    ("share", "Found and shared"),
    ("easy", "Easy and fast"),
]

# id: (area, points, short title)
CHECKS = {
    "safe.secrets":     ("safe", 15, "No secret keys in the files"),
    "safe.private":     ("safe", 6,  "No private files in the folder that goes online"),
    "safe.fake_login":  ("safe", 4,  "No pretend password protection"),
    "safe.https":       ("safe", 3,  "Nothing is loaded or sent over an insecure address"),
    "safe.public_env":  ("safe", 2,  "No secrets in settings that get built into the site"),
    "works.index":      ("works", 5, "There is a home page called index.html"),
    "works.links":      ("works", 8, "Every picture, page and file that is linked exists"),
    "works.anchors":    ("works", 2, "Links to a spot on a page find that spot"),
    "works.local":      ("works", 3, "Nothing points at this computer"),
    "works.dead":       ("works", 3, "Every link and button does something"),
    "works.forms":      ("works", 4, "Every form really sends what people type"),
    "phone.viewport":   ("phone", 5, "Every page tells phones to fit it to the screen"),
    "phone.responsive": ("phone", 3, "The layout adapts to the screen size"),
    "phone.fixed":      ("phone", 2, "Nothing is fixed wider than a phone"),
    "real.placeholder": ("real", 5,  "No placeholder text"),
    "real.images":      ("real", 2,  "No placeholder pictures"),
    "real.needs_you":   ("real", 3,  "No open yellow notes"),
    "real.title":       ("real", 2,  "No leftover default titles"),
    "real.action":      ("real", 3,  "A visitor can do something: call, write, book or buy"),
    "share.title":      ("share", 3, "Each page has its own title"),
    "share.description": ("share", 2, "The home page has a description for search results"),
    "share.lang":       ("share", 1, "Each page says which language it is in"),
    "share.h1":         ("share", 1, "Each page has one main heading"),
    "share.favicon":    ("share", 2, "There is a small icon for the browser tab"),
    "share.og":         ("share", 3, "A shared link shows a title and a picture"),
    "easy.alt":         ("easy", 2,  "Pictures have a text description"),
    "easy.labels":      ("easy", 1,  "Form fields have labels"),
    "easy.linktext":    ("easy", 1,  "Links and buttons say what they do"),
    "easy.zoom":        ("easy", 1,  "Visitors can zoom in"),
    "fast.images":      ("easy", 2,  "No picture is heavy enough to slow a phone"),
    "fast.home":        ("easy", 1,  "The home page is light"),
}

# What to tell the person, and what done looks like. Fix groups are ordered by
# the points they are worth when the report is printed.
FIX_GROUPS = [
    ("Secret keys", ("safe.secrets", "safe.public_env"),
     "Take the key out of the site. Then make a new key at the service it came from and switch the "
     "old one off: a key that was ever online or shared must be treated as stolen. Anything that "
     "needs a secret key has to run on a hosted service, not inside the page."),
    ("Private files", ("safe.private",),
     "Move these files out of the folder that goes online, or delete them if nobody needs them."),
    ("Pretend password", ("safe.fake_login",),
     "A password that is checked inside the page protects nothing, because the page and the password "
     "are both sent to every visitor. Remove it, or put the private part behind a real service."),
    ("Insecure addresses", ("safe.https",),
     "Change each http:// address to https://. Browsers block or warn about the rest."),
    ("Home page", ("works.index",),
     "The first page must be named index.html, all lower case, at the top of the folder that goes online."),
    ("Broken links and pictures", ("works.links", "works.anchors"),
     "Fix each address so it matches a real file exactly, including upper and lower case letters. "
     "A wrong letter case works on a Windows or Mac computer and breaks once the site is online."),
    ("Addresses that only work on this computer", ("works.local",),
     "Replace them with addresses inside the site folder (for example images/photo.jpg)."),
    ("Links and buttons that do nothing", ("works.dead",),
     "Give each one a real destination, or remove it."),
    ("Forms", ("works.forms",),
     "Connect the form to a form service (it emails you what people type), or replace it with an "
     "email or chat link. Until then nobody's message arrives anywhere."),
    ("Phone layout", ("phone.viewport", "phone.responsive", "phone.fixed"),
     "Add the viewport line to every page, and let wide things shrink (max-width: 100%) instead of "
     "fixing their width."),
    ("Placeholder text and pictures", ("real.placeholder", "real.images", "real.title"),
     "Replace each with the real thing. If the real thing is not known yet, ask for it."),
    ("Yellow notes", ("real.needs_you",),
     "Each yellow note marks something only the owner knows. Ask for it and fill it in."),
    ("A way to get in touch", ("real.action",),
     "Add at least one clear way to act: a phone link, an email link, a chat link, a form, a booking "
     "or a payment link."),
    ("Titles, description and sharing", ("share.title", "share.description", "share.lang", "share.h1",
                                         "share.favicon", "share.og"),
     "These decide how the site looks in search results, in the browser tab and when someone shares "
     "the link in a chat."),
    ("Descriptions and labels", ("easy.alt", "easy.labels", "easy.linktext", "easy.zoom"),
     "People who use a screen reader, and search engines, rely on these."),
    ("Heavy pictures", ("fast.images", "fast.home"),
     "Shrink each picture to the size it is shown at (about 1600 pixels wide is plenty) and save it "
     "as JPEG or WebP."),
]

# ------------------------------------------------------------------ patterns

SECRET_RES = [
    ("Stripe secret key", re.compile(r"\b[sr]k_(?:live|test)_[0-9A-Za-z]{16,}")),
    ("Anthropic API key", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}")),
    ("OpenAI API key", re.compile(r"\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}|\bsk-[A-Za-z0-9]{40,}")),
    ("AWS access key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("GitHub token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}")),
    ("Slack token", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}")),
    ("Slack webhook address", re.compile(r"https://hooks\.slack\.com/services/[A-Za-z0-9/]{20,}")),
    ("Discord webhook address", re.compile(r"https://(?:ptb\.|canary\.)?discord(?:app)?\.com/api/webhooks/\d+/[A-Za-z0-9_-]{20,}")),
    ("Telegram bot token", re.compile(r"\b\d{8,10}:AA[A-Za-z0-9_-]{30,}")),
    ("SendGrid API key", re.compile(r"\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}")),
    ("Resend API key", re.compile(r"\bre_[A-Za-z0-9]{6,}_[A-Za-z0-9]{16,}")),
    ("Supabase secret key", re.compile(r"\bsb_secret_[A-Za-z0-9_-]{16,}")),
    ("Private key", re.compile(r"-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----")),
    ("Database address with a password", re.compile(
        r"\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|amqps?)://[^\s\"'`:@/]+:[^\s\"'`@/]{3,}@")),
]
JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}")
GOOGLE_KEY_RE = re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")
GEMINI_HINT_RE = re.compile(r"generativelanguage\.googleapis|gemini|google(?:-|\s)?genai|GoogleGenerativeAI", re.I)
GENERIC_KEY_RE = re.compile(
    r"\b(?:api[_-]?key|apikey|secret|auth[_-]?token|access[_-]?token|bearer)\b\s*[\"']?\s*[:=]\s*[\"'`]"
    r"([A-Za-z0-9_\-]{24,})[\"'`]", re.I)
FAKE_LOGIN_RE = re.compile(
    r"\b\w*(?:password|passwd|passcode|pwd|pass|pin)\w*(?:\.value)?\s*(?:===?|!==?)\s*[\"'`][^\"'`\n]{2,}[\"'`]"
    r"|[\"'`][^\"'`\n]{2,}[\"'`]\s*(?:===?|!==?)\s*\w*(?:password|passwd|passcode|pwd)\w*", re.I)
VALUE_COMPARE_RE = re.compile(r"\.value(?:\.trim\(\))?\s*(?:===?|!==?)\s*[\"'`][^\"'`\n]{3,}[\"'`]")
LOGIN_WORD_RE = re.compile(r"\b(?:pw|pwd|pass\w*|pin|log-?in|signin|sign-in|admin\w*|unlock\w*|secret\w*)\b", re.I)
PUBLIC_ENV_PREFIX_RE =re.compile(r"^(?:VITE_|NEXT_PUBLIC_|REACT_APP_|PUBLIC_|NUXT_PUBLIC_|GATSBY_|EXPO_PUBLIC_)")
SECRET_NAME_RE = re.compile(
    r"SECRET|PRIVATE|SERVICE_ROLE|PASSWORD|PASSWD|OPENAI|ANTHROPIC|CLAUDE|GEMINI|RESEND|SENDGRID|MAILGUN|"
    r"TWILIO_AUTH|DATABASE_URL|DB_URL|ADMIN", re.I)
PRIVATE_FILE_PATTERNS = [
    ".env", ".env.*", "*.pem", "*.p12", "*.pfx", "*.key", "*.keystore", "id_rsa", "id_dsa", "id_ecdsa",
    "id_ed25519", "credentials.json", "secrets.json", "secret.json", "service-account*.json", ".netrc",
    ".htpasswd", "wp-config.php", "*.sql", "*.sqlite", "*.sqlite3", "*.db", "*.bak", "*.log",
]
PRIVATE_FILE_OK = {".env.example", ".env.sample", ".env.template"}

LOCAL_RE = re.compile(
    r"^(?:https?:)?//(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(?=[:/]|$)"
    r"|^file:|^[A-Za-z]:[\\/]|^/(?:Users|home|mnt|var|tmp)/|^\\\\", re.I)
LOCAL_IN_JS_RE = re.compile(
    r"[\"'`]((?:https?:)?//(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?[^\"'`\s]*)[\"'`]", re.I)

PLACEHOLDER_RES = [
    re.compile(r"lorem ipsum|dolor sit amet|consectetur adipisc", re.I),
    re.compile(r"\[(?:your|insert|add|company|business|name|phone|address|email|city|price|date|link)\b[^\]\n]{0,50}\]", re.I),
    re.compile(r"\{\{[^}\n]{1,60}\}\}"),
    re.compile(r"\byour (?:company|business|brand|store|shop) name\b|\byour (?:tagline|slogan|logo|headline|text|title) (?:goes )?here\b", re.I),
    re.compile(r"\b(?:text|title|description|content|image|logo|headline|name) goes here\b|\binsert [^.\n]{0,40} here\b", re.I),
    re.compile(r"\b(?:sample|placeholder|dummy|filler) (?:text|content|copy)\b", re.I),
    re.compile(r"\b(?:photo|picture|image|video|text|content|detail)s? (?:is |are )?coming soon\b|\bphoto (?:to follow|goes here)\b", re.I),
    re.compile(r"\bTODO\b|\bFIXME\b|\bTBD\b"),
    re.compile(r"\b123 Main St(?:reet)?\b|\b1234 (?:Main|Street|Elm)\b", re.I),
    re.compile(r"\(?\b\d{3}\)?[-.\s]555[-.\s]\d{4}\b|\b123[-.\s]456[-.\s]7890\b|\(123\)\s?456[-.\s]7890|\+1\s?234\s?567\s?890\d?"),
    re.compile(r"[\w.+-]+@(?:example\.(?:com|org|net)|domain\.com|yourdomain\.\w+|youremail\.\w+|email\.com|company\.com|mail\.com)\b", re.I),
    re.compile(r"\b(?:www\.)?(?:yourdomain|yoursite|yourwebsite|yourcompany|yourbusiness)\.(?:com|org|net)\b", re.I),
    re.compile(r"\b(?:John|Jane) (?:Doe|Smith)\b|\bAcme (?:Inc|Corp|Co)\b"),
]
PLACEHOLDER_IMG_RE = re.compile(
    r"via\.placeholder\.com|placehold\.co|placeholder\.com|placekitten|picsum\.photos|dummyimage\.com|"
    r"source\.unsplash\.com|loremflickr|placeimg|fakeimg\.pl|ui-avatars\.com|randomuser\.me|pravatar\.cc|"
    r"placebear|placecage|lorempixel|robohash\.org|"
    # a file in the site's own folder that is named as a stand-in
    r"(?:^|[/_-])(?:placeholder|place-holder|dummy|stand-?in|coming-?soon|sample-?(?:image|photo|pic))s?[-_.\d]", re.I)
DEFAULT_TITLE_RE = re.compile(
    r"^(?:document|untitled(?: document)?|title|page title|new page|home|index|welcome|my (?:web)?site|website|"
    r"vite(?: \+ \w+)*(?: \+ \w+)?|vite app|react app|create next app|next\.?js app|nuxt app|astro|sveltekit app|"
    r"my app|app|test|landing page)$", re.I)
CLAIM_RES = [
    ("reviews or testimonials", re.compile(r"testimonial|what (?:our |my )?(?:customers|clients|users|people|they) (?:say|are saying)|\breviews?\b", re.I)),
    ("star ratings", re.compile(r"[★⭐]{3,}|\b[45](?:\.\d)?\s?(?:/|out of)\s?5\b|\b[45]\.\d stars?\b", re.I)),
    ("customer numbers", re.compile(r"\b\d[\d,.]*\s?[kKmM]?\+?\s(?:happy |satisfied |loyal )?(?:customers|clients|users|members|downloads|subscribers|projects|students|orders)\b", re.I)),
    ("\"trusted by\" or \"as seen in\" claims", re.compile(r"\btrusted by\b|\bas (?:seen|featured) (?:in|on)\b|\bfeatured in\b", re.I)),
    ("awards, certificates or guarantees", re.compile(r"\baward[- ]winning\b|\bcertified\b|\blicensed\b|\bmoney[- ]back\b|\bguarantee[ds]?\b|#1\b|\bnumber one\b", re.I)),
    ("years in business", re.compile(r"\b(?:since|established|est\.?|founded in)\s(?:19|20)\d\d\b|\b\d{1,2}\+? years (?:of )?(?:experience|in business)\b", re.I)),
]
ACTION_HREF_RE = re.compile(
    r"^(?:tel:|mailto:|sms:|whatsapp:)|wa\.me/|api\.whatsapp\.com|m\.me/|t\.me/|calendly\.com|cal\.com|"
    r"buy\.stripe\.com|book\.stripe\.com|paypal\.(?:com|me)|gumroad\.com|lemonsqueezy\.com|ko-fi\.com|"
    r"buymeacoffee\.com|instagram\.com|facebook\.com|tiktok\.com|linkedin\.com|x\.com|twitter\.com|"
    r"youtube\.com|maps\.app\.goo\.gl|google\.[a-z.]+/maps|goo\.gl/maps|etsy\.com|shopify\.com|"
    r"squareup\.com|square\.site|typeform\.com|tally\.so|forms\.gle|docs\.google\.com/forms|"
    r"booking\.com|opentable\.|airbnb\.|linktr\.ee|substack\.com|"
    # for a software project, the thing to do is to get the code or the package
    r"github\.com|gitlab\.com|npmjs\.com|pypi\.org", re.I)
ACTION_EMBED_RE = re.compile(
    r"calendly|cal\.com|stripe-buy-button|js\.stripe\.com|paypal|tally\.so|typeform|google\.com/maps|"
    r"docs\.google\.com/forms", re.I)
UNWIRED_FORM_RE = re.compile(
    r"YOUR[_-]|your[_-]form|your[_-]id|your[_-]access|\{form|FORM[_-]?ID|xxxx|example\.com|"
    r"formspree\.io/f/?(?:$|your|abc|123|\{|\[|<)|access[_-]?key[_-]?here", re.I)
SENDS_RE = re.compile(
    r"\bfetch\s*\(|XMLHttpRequest|sendBeacon|emailjs|\baxios\b|\$\.(?:post|ajax)|\.submit\s*\(|mailto:|"
    r"wa\.me/|api\.whatsapp\.com|supabase|firebase|formData", re.I)
RESPONSIVE_RE = re.compile(
    r"@media[^{]*(?:width|orientation)|@container|flex-wrap\s*:\s*wrap|auto-fi(?:t|ll)|minmax\(|clamp\(|"
    r"max-width\s*:\s*100%|\bvw\b|\bdvw\b", re.I)
RESPONSIVE_CLASS_RE = re.compile(r"(?:^|\s)(?:sm|md|lg|xl|2xl):[\w\[\]./%-]+|\bcol-(?:sm|md|lg|xl)-\d+\b|\bcontainer(?:-fluid)?\b")
RESPONSIVE_LINK_RE = re.compile(r"bootstrap|tailwind|bulma|pico(?:\.min)?\.css|foundation|uikit|water\.css|simple\.css|mvp\.css", re.I)
SHELL_RE = re.compile(r"<div\s+id=[\"'](?:root|app|__next|__nuxt|svelte)[\"']\s*>\s*</div>", re.I)
SRC_MODULE_RE = re.compile(r"<script[^>]+src=[\"']/?src/[^\"']+[\"']", re.I)
HANDLER_ATTR_RE = re.compile(r"^(?:on\w+|@[\w.:-]+|x-[\w.:-]+|hx-[\w-]+|v-on[\w.:-]*|wire:[\w.-]+|data-[\w-]+|:[\w-]+|up-[\w-]+)$", re.I)
TOP_LINK_RE = re.compile(r"\btop\b|^home$|^\W*$", re.I)
SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")


# ------------------------------------------------------------------- helpers

def read_text(path, limit=MAX_SCAN_BYTES):
    try:
        if os.path.getsize(path) > limit:
            return ""
        with open(path, "rb") as fh:
            raw = fh.read()
    except OSError:
        return ""
    if b"\x00" in raw[:2048]:
        return ""
    for enc in ("utf-8-sig", "utf-8"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            pass
    return raw.decode("latin-1", errors="replace")


def walk(folder, skip_dirs=SKIP_DIRS, max_files=6000):
    """Yield folder-relative posix paths, largest folders pruned."""
    count = 0
    for base, dirs, files in os.walk(folder):
        dirs[:] = sorted(d for d in dirs if d not in skip_dirs)
        for name in sorted(files):
            count += 1
            if count > max_files:
                return
            yield os.path.relpath(os.path.join(base, name), folder).replace(os.sep, "/")


def mask(secret):
    secret = secret.strip()
    if len(secret) <= 12:
        return secret[:4] + "..."
    return secret[:9] + "..." + " (%d characters)" % len(secret)


def line_of(text, pos):
    return text.count("\n", 0, pos) + 1


def human_size(n):
    if n >= 1024 * 1024:
        return "%.1f MB" % (n / (1024 * 1024))
    return "%d KB" % max(1, round(n / 1024))


def clip(text, n=70):
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= n else text[:n - 3] + "..."


class Lister:
    """Directory listings, cached, so that file names can be compared exactly.

    Windows and macOS find Photo.JPG when a page asks for photo.jpg. The
    computers that host websites do not, so the comparison here is exact.
    """

    def __init__(self):
        self.cache = {}

    def names(self, folder):
        if folder not in self.cache:
            try:
                self.cache[folder] = os.listdir(folder)
            except OSError:
                self.cache[folder] = []
        return self.cache[folder]

    def resolve(self, root, rel):
        """rel is a posix path under root. Returns (status, real_rel).

        status: ok, case (exists with other letter case), missing, outside.
        """
        parts = []
        for part in rel.split("/"):
            if part in ("", "."):
                continue
            if part == "..":
                if not parts:
                    return "outside", rel
                parts.pop()
            else:
                parts.append(part)
        here, real, status = root, [], "ok"
        for i, part in enumerate(parts):
            names = self.names(here)
            if part in names:
                found = part
            else:
                lowered = [n for n in names if n.lower() == part.lower()]
                if not lowered:
                    return "missing", rel
                found, status = lowered[0], "case"
            real.append(found)
            here = os.path.join(here, found)
        if os.path.isdir(here):
            if "index.html" in self.names(here):
                real.append("index.html")
            elif any(n.lower() in ("index.html", "index.htm") for n in self.names(here)):
                real.append("index.html")
                status = "case" if status == "ok" else status
            else:
                return "missing", rel
        return status, "/".join(real)


# --------------------------------------------------------------- HTML reading

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source",
        "track", "wbr"}
HIDDEN_TEXT = {"script", "style", "noscript", "template"}


class Page(HTMLParser):
    def __init__(self, rel):
        super().__init__(convert_charrefs=True)
        self.rel = rel
        self.tags = []            # (tag, attrs, line)
        self.texts = []           # (text, line) visible text
        self.title = None
        self.scripts = []         # inline script text
        self.styles = []          # inline <style> text
        self.ids = set()
        self.label_for = set()
        self.clickables = []      # dicts: tag, attrs, line, text, has_img_alt, in_form
        self.fields = []          # dicts: attrs, line, in_label, tag
        self.forms = []           # dicts: attrs, line
        self._open = []           # open a/button records
        self._hidden = None
        self._in_title = False
        self._label_depth = 0
        self._form_depth = 0
        self._buf = []

    def handle_starttag(self, tag, attrs):
        a = {}
        for k, v in attrs:
            if k not in a:
                a[k] = v if v is not None else ""
        line = self.getpos()[0]
        self.tags.append((tag, a, line))
        if a.get("id"):
            self.ids.add(a["id"])
        if tag == "a" and a.get("name"):
            self.ids.add(a["name"])
        if tag in HIDDEN_TEXT:
            self._hidden, self._buf = tag, []
        elif tag == "title" and self.title is None:
            self._in_title, self._buf = True, []
        elif tag == "label":
            self._label_depth += 1
            if a.get("for"):
                self.label_for.add(a["for"])
        elif tag == "form":
            self._form_depth += 1
            self.forms.append({"attrs": a, "line": line})
        elif tag in ("a", "button"):
            rec = {"tag": tag, "attrs": a, "line": line, "text": "", "named": False,
                   "in_form": self._form_depth > 0}
            self.clickables.append(rec)
            self._open.append(rec)
        elif tag in ("input", "select", "textarea"):
            self.fields.append({"tag": tag, "attrs": a, "line": line, "in_label": self._label_depth > 0})
        if tag in ("img", "svg") and self._open:
            if a.get("alt") or a.get("aria-label") or a.get("title"):
                for rec in self._open:
                    rec["named"] = True

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if self._hidden == tag:
            text = "".join(self._buf)
            if tag == "script":
                self.scripts.append(text)
            elif tag == "style":
                self.styles.append(text)
            self._hidden = None
        elif tag == "title" and self._in_title:
            self.title = re.sub(r"\s+", " ", "".join(self._buf)).strip()
            self._in_title = False
        elif tag == "label":
            self._label_depth = max(0, self._label_depth - 1)
        elif tag == "form":
            self._form_depth = max(0, self._form_depth - 1)
        elif tag in ("a", "button"):
            for i in range(len(self._open) - 1, -1, -1):
                if self._open[i]["tag"] == tag:
                    del self._open[i]
                    break

    def handle_data(self, data):
        if self._hidden or self._in_title:
            self._buf.append(data)
            return
        if data.strip():
            self.texts.append((data, self.getpos()[0]))
            for rec in self._open:
                rec["text"] += data

    def meta(self, key):
        key = key.lower()
        for tag, a, _ in self.tags:
            if tag == "meta" and (a.get("name", "").lower() == key or a.get("property", "").lower() == key):
                return a.get("content", "")
        return None


def parse_page(path, rel):
    page = Page(rel)
    page.source = read_text(path)
    try:
        page.feed(page.source)
        page.close()
    except Exception:
        pass
    return page


def css_urls(css):
    out = []
    for m in re.finditer(r"url\(\s*([\"']?)([^\"')]+)\1\s*\)", css):
        out.append((m.group(2).strip(), line_of(css, m.start())))
    for m in re.finditer(r"@import\s+[\"']([^\"']+)[\"']", css):
        out.append((m.group(1).strip(), line_of(css, m.start())))
    return out


def top_level_rules(css):
    """Yield (selector, body) for rules outside @media and friends."""
    css = re.sub(r"/\*.*?\*/", " ", css, flags=re.S)
    i, n, start = 0, len(css), 0
    while i < n:
        ch = css[i]
        if ch == "{":
            head = css[start:i].strip()
            depth, j = 1, i + 1
            while j < n and depth:
                if css[j] == "{":
                    depth += 1
                elif css[j] == "}":
                    depth -= 1
                j += 1
            body = css[i + 1:j - 1]
            if not head.startswith("@"):
                yield head, body
            i = start = j
            continue
        if ch == ";" or ch == "}":
            start = i + 1
        i += 1


def fixed_widths(css):
    out = []
    for selector, body in top_level_rules(css):
        if "{" in body:
            continue
        for m in re.finditer(r"(?<![\w-])(min-)?width\s*:\s*(\d{3,5})px", body, re.I):
            if int(m.group(2)) <= PHONE_WIDTH:
                continue
            if not m.group(1) and re.search(r"max-width\s*:", body, re.I):
                continue
            out.append("%s { %swidth: %spx }" % (clip(selector, 40), m.group(1) or "", m.group(2)))
    return out


# ------------------------------------------------------------- finding the site

def find_site(folder):
    """Return (site_root, kind, note). kind: plain, app, built, needs-build, empty."""
    lister_names = os.listdir(folder) if os.path.isdir(folder) else []
    # An app: a program (server.js) that serves its pages from public/.
    if "server.js" in lister_names and os.path.isfile(os.path.join(folder, "public", "index.html")):
        return (os.path.join(folder, "public"), "app",
                "This is an app: a program that serves the pages in its 'public' folder. Checked those pages. "
                "The check reads pages; it does not test sign-in, the database or the rules. The app's own "
                "tests do that (node --test).")
    has_pkg, build_script, pkg_text = False, False, ""
    if "package.json" in lister_names:
        has_pkg = True
        pkg_text = read_text(os.path.join(folder, "package.json"))
        try:
            pkg = json.loads(pkg_text)
            build_script = bool((pkg.get("scripts") or {}).get("build"))
        except Exception:
            pass
    if has_pkg and build_script:
        for d in BUILT_DIRS:
            if os.path.isfile(os.path.join(folder, d, "index.html")):
                return (os.path.join(folder, d), "built",
                        "This project is turned into a website by a build step. Checked the built "
                        "folder '%s'. Build again after every change, or the check is looking at an old copy." % d)
        return (folder, "needs-build",
                "This project has to be built before it is a website (package.json has a build step) "
                "and no built folder was found. Page checks are skipped; build it, then run the check again.")
    if "index.html" in lister_names or any(n.lower().endswith((".html", ".htm")) for n in lister_names):
        index = os.path.join(folder, "index.html")
        if os.path.isfile(index):
            src = read_text(index)
            if SHELL_RE.search(src) and SRC_MODULE_RE.search(src):
                return (folder, "needs-build",
                        "index.html is an empty shell that loads source code, so this project has to be "
                        "built before it is a website. Page checks are skipped.")
        return folder, "plain", ""
    for d in PLAIN_DIRS:
        if os.path.isfile(os.path.join(folder, d, "index.html")):
            return (os.path.join(folder, d), "plain",
                    "No index.html at the top of the folder. Checked the '%s' folder inside it." % d)
    subs = [d for d in lister_names if os.path.isdir(os.path.join(folder, d)) and d not in SKIP_DIRS
            and os.path.isfile(os.path.join(folder, d, "index.html"))]
    if len(subs) == 1:
        return (os.path.join(folder, subs[0]), "plain",
                "No index.html at the top of the folder. Checked the '%s' folder inside it." % subs[0])
    for rel in walk(folder):
        if rel.lower().endswith((".html", ".htm")):
            return folder, "plain", ""
    return folder, "empty", "No web pages (.html files) were found in this folder."


# ------------------------------------------------------------------ the audit

class Audit:
    def __init__(self, folder):
        self.project = os.path.abspath(folder)
        self.root, self.kind, self.kind_note = find_site(self.project)
        self.lister = Lister()
        self.results = {}       # id -> dict(status, where, detail)
        self.confirm = []       # things only a person can confirm
        self.notes = []
        if self.kind_note:
            self.notes.append(self.kind_note)
        self.files = list(walk(self.root))
        self.pages = {}
        if self.kind in ("plain", "built", "app"):
            for rel in self.files:
                if rel.lower().endswith((".html", ".htm")):
                    self.pages[rel] = parse_page(os.path.join(self.root, rel), rel)
        self.css = {}           # rel -> text (local stylesheets)
        self.js = {}            # rel -> text (local scripts)
        for rel in self.files:
            low = rel.lower()
            if low.endswith(".css"):
                self.css[rel] = read_text(os.path.join(self.root, rel))
            elif low.endswith((".js", ".mjs")):
                self.js[rel] = read_text(os.path.join(self.root, rel))
        self.js_text = "\n".join(self.js.values()) + "\n" + "\n".join(
            s for p in self.pages.values() for s in p.scripts)

    # -- recording

    def set(self, cid, ok, where=None, detail=""):
        self.results[cid] = {"status": "pass" if ok else "fail", "where": where or [], "detail": detail}

    def skip(self, cid, why):
        self.results[cid] = {"status": "skip", "where": [], "detail": why}

    # -- link helpers

    def target(self, page_rel, url):
        """Classify a URL found on a page. Returns (kind, value, fragment)."""
        url = (url or "").strip()
        if not url:
            return "empty", "", ""
        if LOCAL_RE.search(url):
            return "local-machine", url, ""
        if url.startswith("//") or SCHEME_RE.match(url):
            scheme = "https" if url.startswith("//") else url.split(":", 1)[0].lower()
            return ("web" if scheme in ("http", "https") else "other"), url, ""
        if url.startswith("#"):
            return "anchor", "", url[1:]
        parts = urlsplit(url)
        path = unquote(parts.path)
        if path.startswith("/"):
            rel = path.lstrip("/")
        else:
            rel = (os.path.dirname(page_rel) + "/" + path) if os.path.dirname(page_rel) else path
        return "file", rel, parts.fragment

    def check_file(self, base_rel, url):
        """For a local reference, return None when fine or a text describing the problem."""
        kind, rel, frag = self.target(base_rel, url)
        if kind != "file":
            return None
        status, real = self.lister.resolve(self.root, rel)
        if status == "ok":
            return None
        if status == "case":
            return "%s  (the file is named %s: the capital letters differ, so this breaks once online)" % (url, real)
        if status == "outside":
            return "%s  (points outside the folder that goes online)" % url
        return "%s  (no such file)" % url

    # -- checks

    def run(self):
        self.check_safe()
        if self.kind in ("needs-build", "empty"):
            why = "no built pages to read" if self.kind == "needs-build" else "no pages found"
            for cid in CHECKS:
                if cid not in self.results:
                    self.skip(cid, why)
            if self.kind == "empty":
                self.set("works.index", False, detail="No index.html, and no other .html file either.")
            return self
        self.check_works()
        self.check_phone()
        self.check_real()
        self.check_share()
        self.check_easy()
        return self

    def scan_files(self):
        """Text files worth scanning for secrets: the whole project, built output included."""
        seen = set()
        for base, label in ((self.root, ""), (self.project, None)):
            for rel in walk(base):
                full = os.path.join(base, rel)
                if full in seen:
                    continue
                seen.add(full)
                name = os.path.basename(rel).lower()
                ext = os.path.splitext(name)[1]
                if name in ("package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb"):
                    continue
                if ext in TEXT_EXTS or name.startswith(".env"):
                    shown = os.path.relpath(full, self.project).replace(os.sep, "/")
                    yield full, shown

    def check_safe(self):
        secrets, public_env, fake, generic, google = [], [], [], [], []
        root_prefix = os.path.relpath(self.root, self.project).replace(os.sep, "/")
        for full, shown in self.scan_files():
            text = read_text(full)
            if not text:
                continue
            name = os.path.basename(full)
            is_env = name.lower().startswith(".env") and name.lower() not in PRIVATE_FILE_OK
            in_site = root_prefix == "." or shown.startswith(root_prefix + "/")
            is_code = os.path.splitext(name)[1].lower() in (
                ".html", ".htm", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".vue", ".svelte", ".astro", ".php")
            if is_env:
                for n, raw in enumerate(text.splitlines(), 1):
                    m = re.match(r"\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)", raw)
                    if not m:
                        continue
                    key, val = m.group(1), m.group(2).strip().strip("\"'")
                    if not val or not PUBLIC_ENV_PREFIX_RE.match(key):
                        continue
                    looks_secret = any(rx.search(val) for _, rx in SECRET_RES) or self.jwt_is_secret(val)
                    harmless = re.search(r"ANON|PUBLISHABLE|PUBLIC_KEY|_URL$|SITE_KEY|PROJECT_ID|MEASUREMENT", key, re.I)
                    if looks_secret or (SECRET_NAME_RE.search(key) and not harmless):
                        public_env.append("%s:%d  %s (a name starting like this is copied into the site, where anyone can read it)"
                                          % (shown, n, key))
                if not in_site:
                    continue   # a .env outside the site folder is where secrets belong
            for label, rx in SECRET_RES:
                for m in rx.finditer(text):
                    secrets.append("%s:%d  %s  %s" % (shown, line_of(text, m.start()), label, mask(m.group(0))))
            for m in JWT_RE.finditer(text):
                if self.jwt_is_secret(m.group(0)):
                    secrets.append("%s:%d  Supabase service_role key (full access to the database)  %s"
                                   % (shown, line_of(text, m.start()), mask(m.group(0))))
            for m in GOOGLE_KEY_RE.finditer(text):
                where = "%s:%d  %s" % (shown, line_of(text, m.start()), mask(m.group(0)))
                if GEMINI_HINT_RE.search(text):
                    secrets.append(where.replace("  AIza", "  Google AI (Gemini) key  AIza"))
                else:
                    google.append(where)
            if is_code and (in_site or self.kind in ("built", "needs-build")):
                for m in FAKE_LOGIN_RE.finditer(text):
                    snippet = clip(m.group(0), 60)
                    if re.search(r"[\"'`](?:password|text|submit|hidden|email|string|undefined|object)[\"'`]", snippet, re.I):
                        continue
                    fake.append("%s:%d  %s" % (shown, line_of(text, m.start()),
                                               re.sub(r"([\"'`])[^\"'`]{2,}\1", r"\1...\1", snippet)))
                # the same thing written as: someField.value === 'the password'
                for m in VALUE_COMPARE_RE.finditer(text):
                    around = text[max(0, m.start() - 200):m.end() + 200]
                    if LOGIN_WORD_RE.search(around):
                        fake.append("%s:%d  %s" % (shown, line_of(text, m.start()),
                                                   re.sub(r"([\"'`])[^\"'`]{2,}\1", r"\1...\1", clip(m.group(0), 60))))
                for m in GENERIC_KEY_RE.finditer(text):
                    val = m.group(1)
                    if val.startswith(("AIza", "pk_", "sb_publishable", "eyJ")) or re.fullmatch(r"[A-Za-z_-]+", val):
                        continue
                    if any(rx.search(val) for _, rx in SECRET_RES):
                        continue
                    generic.append("%s:%d  %s" % (shown, line_of(text, m.start()), mask(val)))
        secrets = sorted(set(secrets))
        self.set("safe.secrets", not secrets, secrets[:20],
                 "%d secret key%s found. Anyone who opens the site can copy %s." % (
                     len(secrets), "" if len(secrets) == 1 else "s", "it" if len(secrets) == 1 else "them")
                 if secrets else "")
        self.set("safe.public_env", not public_env, public_env[:10])
        self.set("safe.fake_login", not fake, sorted(set(fake))[:10],
                 "The page itself compares what a visitor types with a password that is written in the page." if fake else "")
        if google:
            self.confirm.append("Google key in the page (%s). That is normal for Maps and Firebase, but only safe when "
                                "the key is restricted to your web address in the Google console. If it is used "
                                "for anything that costs money per use, it must not be in the page." % "; ".join(sorted(set(google))[:3]))
        if generic:
            self.confirm.append("Something that looks like a key or token: %s. If it is a secret (it gives access to "
                                "an account, or its service says to keep it private), it must not be in the site."
                                % "; ".join(sorted(set(generic))[:4]))

        private = []
        for rel in self.files:
            name = os.path.basename(rel)
            if name.lower() in PRIVATE_FILE_OK:
                continue
            if any(fnmatch.fnmatch(name.lower(), pat) for pat in PRIVATE_FILE_PATTERNS):
                private.append(rel)
        self.set("safe.private", not private, private[:15],
                 "These would be uploaded with the site, and anyone who guesses the address could download them." if private else "")
        if os.path.isdir(os.path.join(self.root, ".git")) and self.kind == "plain":
            self.notes.append("The folder has a hidden .git folder (the project's saved history). It is not needed "
                              "online. If the site is published by dragging the folder to a host, leave it out.")
        if self.kind == "app":
            if os.path.isdir(os.path.join(self.project, "data")):
                self.notes.append("The 'data' folder holds this computer's copy of the database, which may include "
                                  "test accounts. It must not be uploaded with the app.")
            env_files = [n for n in os.listdir(self.project) if n.lower().startswith(".env") and n.lower() not in PRIVATE_FILE_OK]
            if env_files:
                self.notes.append("Settings file(s) %s are in the project folder. They must not be uploaded or "
                                  "committed; on the host, type the settings into its variables screen." % ", ".join(env_files))
        if os.path.isdir(os.path.join(self.root, "node_modules")):
            self.notes.append("The folder that goes online contains node_modules (thousands of tool files). Do not upload it.")

        insecure = []
        for rel, page in self.pages.items():
            for tag, a, line in page.tags:
                for attr in ("src", "href", "action", "poster", "data"):
                    val = (a.get(attr) or "").strip()
                    if not val.lower().startswith("http://") or LOCAL_RE.search(val):
                        continue
                    if tag == "a" and attr == "href":
                        continue    # an ordinary link out to an old site still opens
                    if tag == "link" and "stylesheet" not in a.get("rel", "").lower() and "icon" not in a.get("rel", "").lower():
                        continue
                    insecure.append("%s:%d  <%s %s=\"%s\">" % (rel, line, tag, attr, clip(val, 60)))
        if self.pages:
            self.set("safe.https", not insecure, insecure[:10])
        else:
            self.skip("safe.https", "no pages to read")

    @staticmethod
    def jwt_is_secret(token):
        m = JWT_RE.search(token)
        if not m:
            return False
        payload = m.group(1)
        try:
            data = base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)).decode("utf-8", "replace")
        except Exception:
            return False
        return bool(re.search(r"\"role\"\s*:\s*\"service_role\"", data))

    def check_works(self):
        names = self.lister.names(self.root)
        if "index.html" in names:
            self.set("works.index", True)
        else:
            near = [n for n in names if n.lower() in ("index.html", "index.htm", "home.html", "main.html", "default.html")]
            self.set("works.index", False, near,
                     "The first page must be called exactly index.html (lower case), or the address shows an error page."
                     + (" Found %s instead." % ", ".join(near) if near else ""))

        broken, anchors, local, rooted = [], [], [], 0
        for rel, page in self.pages.items():
            for tag, a, line in page.tags:
                refs = []
                for attr in ("src", "href", "poster", "data-src"):
                    if a.get(attr) is not None and not (tag == "a" and attr == "href" and a.get(attr, "").strip() in ("", "#")):
                        refs.append(a[attr])
                if tag == "object" and a.get("data"):
                    refs.append(a["data"])
                for attr in ("srcset", "imagesrcset"):
                    for piece in (a.get(attr) or "").split(","):
                        piece = piece.strip().split(" ")[0]
                        if piece:
                            refs.append(piece)
                if tag == "meta" and a.get("property", "").lower() in ("og:image", "twitter:image") and a.get("content"):
                    refs.append(a["content"])
                if tag == "form" and a.get("action"):
                    refs.append(a["action"])
                if a.get("style"):
                    refs.extend(u for u, _ in css_urls(a["style"]))
                for url in refs:
                    url = url.strip()
                    if not url or url.startswith(("data:", "blob:", "about:", "javascript:")) or "{{" in url or "${" in url:
                        continue
                    kind, val, frag = self.target(rel, url)
                    if kind == "local-machine":
                        local.append("%s:%d  %s" % (rel, line, clip(url, 80)))
                    elif kind == "file":
                        if url.startswith("/"):
                            rooted += 1
                        problem = self.check_file(rel, url)
                        if problem:
                            broken.append("%s:%d  %s" % (rel, line, problem))
                        elif frag:
                            status, real = self.lister.resolve(self.root, val)
                            other = self.pages.get(real)
                            if other is not None and frag not in other.ids:
                                anchors.append("%s:%d  %s  (nothing on that page is marked \"%s\")" % (rel, line, url, frag))
                    elif kind == "anchor" and val == "" and frag and frag not in page.ids and frag != "top":
                        anchors.append("%s:%d  #%s  (nothing on this page is marked \"%s\")" % (rel, line, frag, frag))
            for block in page.styles:
                for url, _ in css_urls(block):
                    if url.startswith(("data:", "#")):
                        continue
                    problem = self.check_file(rel, url)
                    if problem:
                        broken.append("%s  (in its style block)  %s" % (rel, problem))
            for block in page.scripts:
                for m in LOCAL_IN_JS_RE.finditer(block):
                    local.append("%s  (in its script)  %s" % (rel, clip(m.group(1), 80)))
        for rel, css in self.css.items():
            for url, line in css_urls(css):
                if url.startswith(("data:", "#")):
                    continue
                if LOCAL_RE.search(url):
                    local.append("%s:%d  %s" % (rel, line, clip(url, 80)))
                    continue
                problem = self.check_file(rel, url)
                if problem:
                    broken.append("%s:%d  %s" % (rel, line, problem))
        for rel, js in self.js.items():
            for m in LOCAL_IN_JS_RE.finditer(js):
                local.append("%s:%d  %s" % (rel, line_of(js, m.start()), clip(m.group(1), 80)))
        broken, anchors, local = sorted(set(broken)), sorted(set(anchors)), sorted(set(local))
        self.set("works.links", not broken, broken[:25],
                 "%d address%s on the site lead%s to nothing." % (
                     len(broken), "" if len(broken) == 1 else "es", "s" if len(broken) == 1 else "") if broken else "")
        self.set("works.anchors", not anchors, anchors[:10])
        self.set("works.local", not local, local[:10],
                 "These only exist on the computer the site was made on. Visitors will see nothing there." if local else "")
        if rooted and self.kind != "app":
            self.notes.append("%d address%s start with a slash (like /images/photo.jpg). They work on most hosts, "
                              "but not when the page is opened by double-clicking the file, and not when the site "
                              "lives in a sub-folder of an address. Addresses without the leading slash work everywhere."
                              % (rooted, "" if rooted == 1 else "es"))

        dead = []
        for rel, page in self.pages.items():
            for rec in page.clickables:
                a = rec["attrs"]
                text = clip(rec["text"], 40) or a.get("aria-label", "") or "(no text)"
                if self.is_handled(a):
                    continue
                if rec["tag"] == "a":
                    href = a.get("href")
                    if href is None:
                        if rec["text"].strip():
                            dead.append("%s:%d  link \"%s\" has no destination" % (rel, rec["line"], text))
                        continue
                    h = href.strip().lower()
                    if h in ("", "#", "#!", "javascript:void(0)", "javascript:void(0);", "javascript:;", "javascript:"):
                        if TOP_LINK_RE.search(rec["text"].strip()) or re.search(r"top|logo|brand|home", " ".join(
                                [a.get("class", ""), a.get("aria-label", ""), a.get("title", "")]), re.I):
                            continue
                        dead.append("%s:%d  link \"%s\" goes nowhere" % (rel, rec["line"], text))
                else:
                    kind = a.get("type", "").lower()
                    if rec["in_form"] and kind in ("", "submit", "reset"):
                        continue
                    if a.get("form") or a.get("popovertarget") or a.get("commandfor"):
                        continue
                    dead.append("%s:%d  button \"%s\" does nothing when clicked" % (rel, rec["line"], text))
        self.set("works.dead", not dead, dead[:15])

        forms, mailto_forms, netlify_forms = [], [], []
        any_form = False
        for rel, page in self.pages.items():
            for form in page.forms:
                any_form = True
                a = form["attrs"]
                action = (a.get("action") or "").strip()
                hidden_keys = " ".join(f["attrs"].get("value", "") for f in page.fields
                                       if f["attrs"].get("type", "").lower() == "hidden")
                where = "%s:%d" % (rel, form["line"])
                if UNWIRED_FORM_RE.search(action) or UNWIRED_FORM_RE.search(hidden_keys):
                    forms.append("%s  the form still has a stand-in where its real form address or key goes" % where)
                elif action.lower().startswith("mailto:"):
                    mailto_forms.append(where)
                elif action and action not in ("#", "/") and not action.lower().startswith("javascript:"):
                    continue
                elif any(k in a for k in ("netlify", "data-netlify")):
                    netlify_forms.append(where)
                elif any(k in a for k in ("hx-post", "hx-get", "data-static-form-name")):
                    continue
                elif self.is_handled(a) or re.search(r"[\"'`]submit[\"'`]|onsubmit|document\.forms|querySelector(?:All)?\(\s*[\"'`]form", self.js_text):
                    if self.form_only_pretends(a.get("onsubmit", "")):
                        forms.append("%s  the form says thank you but sends what people type nowhere" % where)
                else:
                    forms.append("%s  the form is not connected to anything, so messages are lost" % where)
        if any_form:
            self.set("works.forms", not forms, forms[:10])
        else:
            self.skip("works.forms", "the site has no form")
        if netlify_forms:
            self.confirm.append("The form at %s uses Netlify's own form feature. It delivers messages only when the site "
                                "is hosted on Netlify, form detection is switched on in the Netlify dashboard, and the "
                                "site has been published again after that. Until a test message has arrived, treat the "
                                "form as unproven." % ", ".join(netlify_forms))
        if mailto_forms:
            self.confirm.append("A form at %s opens the visitor's own email program instead of sending. On many phones "
                                "and computers nothing happens. A form service or a plain email link is more reliable."
                                % ", ".join(mailto_forms))

    def form_only_pretends(self, inline=""):
        """True when the code that runs on submit shows a thank-you and sends nothing.

        Looks at the code right after each submit handler. Sending that happens
        elsewhere in the scripts (another button, another feature) does not count.
        """
        if not SENDS_RE.search(self.js_text + inline):
            return True
        windows = [inline] if inline.strip() else []
        for m in re.finditer(r"[\"'`]submit[\"'`]|\.onsubmit\s*=", self.js_text):
            rest = self.js_text[m.end():m.end() + 1500]
            nxt = re.search(r"addEventListener\s*\(", rest)
            windows.append(rest[:nxt.start()] if nxt else rest)
        if not windows:
            return False
        thanks = re.compile(r"alert\s*\(|thank|success|has been sent|message sent|we(?:'|’)ll (?:get|be) (?:back|in touch)", re.I)
        return all(thanks.search(w) and not SENDS_RE.search(w) for w in windows)

    def is_handled(self, attrs):
        """True when something other than the tag itself makes the element do its job."""
        for key in attrs:
            if key != "data-needs-you" and HANDLER_ATTR_RE.match(key):
                return True
        ident = attrs.get("id")
        if ident and re.search(r"(?<![\w-])" + re.escape(ident) + r"(?![\w-])", self.js_text):
            return True
        for cls in (attrs.get("class") or "").split():
            if len(cls) > 2 and re.search(r"[.\"'`]" + re.escape(cls) + r"(?![\w-])", self.js_text):
                return True
        return False

    def all_css(self, page):
        return "\n".join(page.styles) + "\n" + "\n".join(self.css.values())

    def check_phone(self):
        missing, zoom = [], []
        for rel, page in self.pages.items():
            vp = page.meta("viewport")
            if vp is None or "width=device-width" not in vp.replace(" ", "").lower():
                missing.append(rel)
            elif re.search(r"user-scalable\s*=\s*(?:no|0)|maximum-scale\s*=\s*1(?:\.0)?\b", vp, re.I):
                zoom.append("%s  (%s)" % (rel, vp))
        self.set("phone.viewport", not missing, missing[:15],
                 "Without this line a phone shows the page tiny, as if it were a desktop screen." if missing else "")
        self.set("easy.zoom", not zoom, zoom[:10])

        css = "\n".join(self.css.values()) + "\n" + "\n".join(s for p in self.pages.values() for s in p.styles)
        classes = " ".join(a.get("class", "") for p in self.pages.values() for _, a, _ in p.tags)
        sheets = " ".join(a.get("href", "") + " " + a.get("src", "") for p in self.pages.values()
                          for tag, a, _ in p.tags if tag in ("link", "script"))
        responsive = bool(RESPONSIVE_RE.search(css) or RESPONSIVE_CLASS_RE.search(classes) or RESPONSIVE_LINK_RE.search(sheets))
        has_layout = bool(re.search(r"display\s*:\s*(?:flex|grid)|float\s*:|position\s*:\s*(?:absolute|fixed)|width\s*:", css))
        self.set("phone.responsive", responsive or not has_layout,
                 detail="" if (responsive or not has_layout) else
                 "The styles never mention screen size, so the desktop layout is squeezed onto phones.")

        fixed = []
        for rel, text in self.css.items():
            fixed.extend("%s  %s" % (rel, f) for f in fixed_widths(text))
        for rel, page in self.pages.items():
            for block in page.styles:
                fixed.extend("%s  %s" % (rel, f) for f in fixed_widths(block))
            for tag, a, line in page.tags:
                m = re.search(r"(?<![\w-])(?:min-)?width\s*:\s*(\d{3,5})px", a.get("style", ""))
                if m and int(m.group(1)) > PHONE_WIDTH and "max-width" not in a.get("style", ""):
                    fixed.append("%s:%d  <%s style=\"%s\">" % (rel, line, tag, clip(a["style"], 50)))
        self.set("phone.fixed", not fixed, fixed[:10],
                 "Anything fixed wider than a phone makes the page scroll sideways." if fixed else "")

    def check_real(self):
        hits, needs, images, titles = [], [], [], []
        claims = {}
        for rel, page in self.pages.items():
            chunks = list(page.texts)
            for tag, a, line in page.tags:
                if tag == "img" and a.get("alt"):
                    chunks.append((a["alt"], line))
                if tag == "meta" and a.get("name", "").lower() == "description":
                    chunks.append((a.get("content", ""), line))
                if tag == "a" and a.get("href", "").lower().startswith(("mailto:", "tel:")):
                    chunks.append((a["href"], line))
                cls = a.get("class", "").split()
                if "needs-you" in cls or "data-needs-you" in a:
                    needs.append((rel, line))
                for attr in ("src", "srcset", "poster"):
                    if PLACEHOLDER_IMG_RE.search(a.get(attr, "")):
                        images.append("%s:%d  %s" % (rel, line, clip(a[attr], 70)))
                for url, _ in css_urls(a.get("style", "")):
                    if PLACEHOLDER_IMG_RE.search(url):
                        images.append("%s:%d  %s" % (rel, line, clip(url, 70)))
            if page.title is not None:
                chunks.append((page.title, 1))
                if DEFAULT_TITLE_RE.match(page.title):
                    titles.append("%s  title is \"%s\"" % (rel, page.title))
            for text, line in chunks:
                for rx in PLACEHOLDER_RES:
                    m = rx.search(text)
                    if m:
                        hits.append("%s:%d  \"%s\"" % (rel, line, clip(m.group(0), 50)))
                        break
            body = " ".join(t for t, _ in page.texts)
            for label, rx in CLAIM_RES:
                m = rx.search(body)
                if m:
                    claims.setdefault(label, []).append("%s (\"%s\")" % (rel, clip(m.group(0), 40)))
        for rel, css in self.css.items():
            for url, line in css_urls(css):
                if PLACEHOLDER_IMG_RE.search(url):
                    images.append("%s:%d  %s" % (rel, line, clip(url, 70)))
        # text sitting inside a needs-you element is expected to be a stand-in, so
        # count the notes once instead of also reporting their wording
        note_lines = {(rel, line) for rel, line in needs}
        hits = [h for h in sorted(set(hits))
                if (h.split(":")[0], int(h.split(":")[1].split()[0])) not in note_lines]
        self.set("real.placeholder", not hits, hits[:20],
                 "Visitors would read this as written." if hits else "")
        self.set("real.images", not images, sorted(set(images))[:10],
                 "These are stand-in pictures loaded from a placeholder service." if images else "")
        self.set("real.needs_you", not needs, ["%s:%d" % n for n in needs][:25],
                 "%d yellow note%s still mark%s something only the owner can supply." % (
                     len(needs), "" if len(needs) == 1 else "s", "s" if len(needs) == 1 else "") if needs else "")
        self.set("real.title", not titles, titles[:10])
        if claims:
            listed = "; ".join("%s in %s" % (label, ", ".join(places[:2])) for label, places in claims.items())
            self.confirm.append("The site makes claims that only the owner can vouch for: %s. Anything that was made "
                                "up to fill the page has to go. Invented reviews and numbers mislead visitors and "
                                "are illegal in many countries." % listed)

        acts = False
        for page in self.pages.values():
            if page.forms:
                acts = True
            for tag, a, _ in page.tags:
                if tag == "a" and ACTION_HREF_RE.search(a.get("href", "")):
                    acts = True
                if tag in ("iframe", "script", "stripe-buy-button") and (
                        tag == "stripe-buy-button" or ACTION_EMBED_RE.search(a.get("src", ""))):
                    acts = True
        self.set("real.action", acts, detail="" if acts else
                 "No phone, email, chat, form, booking, payment or social link was found on any page.")

        external = set()
        for rel, page in self.pages.items():
            for tag, a, line in page.tags:
                src = a.get("src", "")
                if tag == "img" and re.match(r"(?:https?:)?//", src) and not PLACEHOLDER_IMG_RE.search(src):
                    external.add(urlsplit(src if not src.startswith("//") else "https:" + src).netloc)
        if external:
            self.confirm.append("Pictures are loaded from other websites (%s). They disappear when that site changes, "
                                "and they may belong to someone. Use pictures the owner has the right to use, saved "
                                "inside the site folder." % ", ".join(sorted(external)[:5]))

    def check_share(self):
        no_title, seen, dup, long_titles = [], {}, [], []
        no_lang, h1 = [], []
        for rel, page in self.pages.items():
            if not page.title:
                no_title.append("%s  has no title" % rel)
            else:
                seen.setdefault(page.title, []).append(rel)
                if len(page.title) > 70:
                    long_titles.append(rel)
            html_tag = next((a for tag, a, _ in page.tags if tag == "html"), {})
            if not html_tag.get("lang", "").strip():
                no_lang.append(rel)
            count = sum(1 for tag, _, _ in page.tags if tag == "h1")
            if count != 1:
                h1.append("%s  has %d main headings (h1)" % (rel, count))
        for title, rels in seen.items():
            if len(rels) > 1:
                dup.append("%s  all share the title \"%s\"" % (", ".join(rels[:4]), clip(title, 40)))
        self.set("share.title", not (no_title or dup), (no_title + dup)[:10],
                 "The title is what shows in the browser tab and as the blue line in search results." if (no_title or dup) else "")
        if long_titles:
            self.notes.append("Titles longer than about 60 characters are cut off in search results: %s." % ", ".join(long_titles[:5]))
        self.set("share.lang", not no_lang, no_lang[:10])
        self.set("share.h1", not h1, h1[:10])

        home = self.pages.get("index.html")
        if home is None:
            for cid in ("share.description", "share.og"):
                self.skip(cid, "no index.html to look at")
        elif self.kind == "app":
            # An app's first page sits behind sign-in: nobody finds it in a
            # search or shares it for its preview picture.
            self.skip("share.description", "the first page of an app is behind sign-in")
            self.skip("share.og", "the first page of an app is behind sign-in")
        else:
            desc = (home.meta("description") or "").strip()
            self.set("share.description", len(desc) >= 30, detail="" if len(desc) >= 30 else (
                "The home page has no description." if not desc else "The description is too short to be useful (%d characters)." % len(desc)))
            og_title, og_image = home.meta("og:title"), home.meta("og:image")
            problems = []
            if not og_title:
                problems.append("index.html  no og:title")
            if not og_image:
                problems.append("index.html  no og:image (the picture shown when the link is shared in a chat or on social media)")
            else:
                issue = self.check_file("index.html", og_image)
                if issue:
                    problems.append("index.html  og:image  " + issue)
                elif not re.match(r"https?://", og_image):
                    self.notes.append("The sharing picture (og:image) is given as a short address (%s). Chat and social "
                                      "apps need the full address, starting with https://. Fill it in once the site "
                                      "has its real address." % og_image)
            self.set("share.og", not problems, problems)

        icon = False
        for page in self.pages.values():
            for tag, a, _ in page.tags:
                if tag == "link" and "icon" in a.get("rel", "").lower() and a.get("href"):
                    if self.check_file(page.rel, a["href"]) is None:
                        icon = True
        if not icon and any(n == "favicon.ico" for n in self.lister.names(self.root)):
            icon = True
        self.set("share.favicon", icon, detail="" if icon else "Without it the browser tab shows a blank page icon.")

    def check_easy(self):
        no_alt, unlabeled, unnamed = [], [], []
        for rel, page in self.pages.items():
            for tag, a, line in page.tags:
                if tag == "img" and "alt" not in a and a.get("role") != "presentation" and a.get("aria-hidden") != "true":
                    no_alt.append("%s:%d  %s" % (rel, line, clip(a.get("src", ""), 60)))
            for f in page.fields:
                a = f["attrs"]
                kind = a.get("type", "text").lower()
                if f["tag"] == "input" and kind in ("hidden", "submit", "button", "reset", "image"):
                    continue
                if f["in_label"] or a.get("aria-label") or a.get("aria-labelledby") or a.get("title"):
                    continue
                if a.get("id") and a["id"] in page.label_for:
                    continue
                unlabeled.append("%s:%d  <%s name=\"%s\">" % (rel, f["line"], f["tag"], a.get("name", "")))
            for rec in page.clickables:
                a = rec["attrs"]
                if rec["text"].strip() or rec["named"] or a.get("aria-label") or a.get("aria-labelledby") or a.get("title"):
                    continue
                if rec["tag"] == "a" and a.get("href") is None:
                    continue
                unnamed.append("%s:%d  <%s> with no text" % (rel, rec["line"], rec["tag"]))
        self.set("easy.alt", not no_alt, no_alt[:15])
        any_field = any(p.fields for p in self.pages.values())
        if any_field:
            self.set("easy.labels", not unlabeled, unlabeled[:10],
                     "Grey hint text inside a box does not count: it vanishes when someone starts typing." if unlabeled else "")
        else:
            self.skip("easy.labels", "the site has no form fields")
        self.set("easy.linktext", not unnamed, unnamed[:10])

        heavy = []
        for rel in self.files:
            if os.path.splitext(rel)[1].lower() in IMAGE_EXTS:
                try:
                    size = os.path.getsize(os.path.join(self.root, rel))
                except OSError:
                    continue
                if size > BIG_IMAGE:
                    heavy.append((size, rel))
        heavy.sort(reverse=True)
        self.set("fast.images", not heavy, ["%s  %s" % (rel, human_size(size)) for size, rel in heavy[:15]],
                 "On a phone connection each of these takes seconds to appear." if heavy else "")

        home = self.pages.get("index.html")
        if home is None:
            self.skip("fast.home", "no index.html to look at")
            return
        loaded = {"index.html"}
        for tag, a, _ in home.tags:
            for attr in ("src", "href", "poster"):
                if tag == "a" or not a.get(attr):
                    continue
                if tag == "link" and not re.search(r"stylesheet|icon|preload", a.get("rel", ""), re.I):
                    continue
                kind, rel, _ = self.target("index.html", a[attr])
                if kind == "file":
                    status, real = self.lister.resolve(self.root, rel)
                    if status in ("ok", "case"):
                        loaded.add(real)
        for rel in list(loaded):
            if rel in self.css:
                for url, _ in css_urls(self.css[rel]):
                    kind, target, _ = self.target(rel, url)
                    if kind == "file":
                        status, real = self.lister.resolve(self.root, target)
                        if status in ("ok", "case"):
                            loaded.add(real)
        total = 0
        for rel in loaded:
            try:
                total += os.path.getsize(os.path.join(self.root, rel))
            except OSError:
                pass
        self.home_weight = total
        self.set("fast.home", total <= HOME_BUDGET,
                 detail="" if total <= HOME_BUDGET else "The home page loads %s from this folder. Under %s keeps it quick on a phone."
                 % (human_size(total), human_size(HOME_BUDGET)))

    # -- result

    def report(self):
        checks, earned, possible = [], 0, 0
        area_tot = {key: [0, 0] for key, _ in AREAS}
        for cid, (area, points, title) in CHECKS.items():
            res = self.results.get(cid) or {"status": "skip", "where": [], "detail": "not checked"}
            got = points if res["status"] == "pass" else 0
            if res["status"] != "skip":
                possible += points
                earned += got
                area_tot[area][0] += got
                area_tot[area][1] += points
            checks.append({"id": cid, "area": area, "points": points, "earned": got, "status": res["status"],
                           "title": title, "detail": res["detail"], "where": res["where"]})
        score = round(100 * earned / possible) if possible else 0
        status = {c["id"]: c["status"] for c in checks}
        stop = [c["title"] for c in checks if c["status"] == "fail" and c["id"] in
                ("safe.secrets", "safe.private", "safe.fake_login", "safe.public_env")]
        blockers = [cid for cid in ("works.index", "works.links", "works.forms", "works.local", "real.placeholder",
                                    "real.images", "real.needs_you", "phone.viewport") if status.get(cid) == "fail"]
        if stop:
            verdict = "do not publish"
        elif self.kind in ("needs-build", "empty"):
            verdict = "cannot tell yet"
        elif blockers or score < 80:
            verdict = "not yet"
        else:
            verdict = "ready"
        fixes = []
        for title, ids, how in FIX_GROUPS:
            failing = [c for c in checks if c["id"] in ids and c["status"] == "fail"]
            if failing:
                fixes.append({"title": title, "gain": sum(c["points"] for c in failing), "how": how,
                              "checks": [c["id"] for c in failing],
                              "stop": any(c["id"].startswith("safe.") and c["id"] != "safe.https" for c in failing)})
        fixes.sort(key=lambda f: (not f["stop"], -f["gain"]))
        return {
            "site": os.path.basename(self.project.rstrip("/\\")) or self.project,
            "folder_checked": os.path.relpath(self.root, self.project).replace(os.sep, "/"),
            "kind": self.kind,
            "pages": sorted(self.pages),
            "score": score, "earned": earned, "possible": possible,
            "verdict": verdict,
            "areas": [{"key": key, "name": name, "earned": area_tot[key][0], "possible": area_tot[key][1]}
                      for key, name in AREAS],
            "checks": checks,
            "fixes": fixes,
            "confirm": self.confirm,
            "notes": self.notes,
        }


def render(rep, summary=False):
    out = []
    folder = "" if rep["folder_checked"] == "." else "   (folder checked: %s/)" % rep["folder_checked"]
    out.append("site check: %s%s" % (rep["site"], folder))
    out.append("")
    scope_note = "  (the pages only)" if rep["kind"] == "app" else ""
    out.append("Score: %d/100    Verdict: %s%s" % (rep["score"], rep["verdict"].upper(), scope_note))
    scope = "%d of %d points" % (rep["earned"], rep["possible"])
    if rep["possible"] < 100:
        skipped = [c["title"] for c in rep["checks"] if c["status"] == "skip"]
        scope += "; %d check%s left out because they do not apply here" % (len(skipped), "" if len(skipped) == 1 else "s")
    out.append("(%s. A checklist of common problems, not a judgement of the design.)" % scope)
    out.append("")
    for area in rep["areas"]:
        if area["possible"]:
            out.append("  %-20s %2d/%-2d" % (area["name"], area["earned"], area["possible"]))
        else:
            out.append("  %-20s  not checked" % area["name"])
    if rep["verdict"] == "do not publish":
        out.append("")
        out.append("STOP. Something in these files must not go online. Fix that before anything else.")
    if summary:
        return "\n".join(out)
    by_id = {c["id"]: c for c in rep["checks"]}
    if rep["fixes"]:
        out.append("")
        out.append("What to fix, most important first (gains are in points out of %d)" % rep["possible"])
        for n, fix in enumerate(rep["fixes"], 1):
            out.append("")
            out.append("%d. %s  (+%d)%s" % (n, fix["title"], fix["gain"], "  <-- do this first" if fix["stop"] else ""))
            for cid in fix["checks"]:
                c = by_id[cid]
                out.append("   Not met: %s" % c["title"])
                if c["detail"]:
                    out.append("     %s" % c["detail"])
                for w in c["where"]:
                    out.append("     - %s" % w)
            out.append("   How: %s" % fix["how"])
    else:
        out.append("")
        out.append("Nothing on the checklist is failing.")
    if rep["confirm"]:
        out.append("")
        out.append("Only a person can confirm")
        for item in rep["confirm"]:
            out.append("  - %s" % item)
    if rep["notes"]:
        out.append("")
        out.append("Notes")
        for item in rep["notes"]:
            out.append("  - %s" % item)
    return "\n".join(out)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Score how ready a simple website is to publish (0-100).")
    ap.add_argument("folder", nargs="?", default=".", help="the website folder (default: current folder)")
    ap.add_argument("--summary", action="store_true", help="print only the score and the area totals")
    ap.add_argument("--json", action="store_true", help="print the full result as JSON")
    ap.add_argument("--min", type=int, default=None, metavar="N", help="exit with status 1 when the score is below N")
    args = ap.parse_args(argv)
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    if not os.path.isdir(args.folder):
        print("Not a folder: %s" % args.folder, file=sys.stderr)
        return 2
    rep = Audit(args.folder).run().report()
    if args.json:
        print(json.dumps(rep, indent=2, ensure_ascii=False))
    else:
        print(render(rep, summary=args.summary))
    if args.min is not None and rep["score"] < args.min:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
