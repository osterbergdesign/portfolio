"""
Contact form mailer for the portfolio.

Receives the form on /consulting/ (POST /api/contact, proxied here by nginx) and emails it to you
over SMTP. Python standard library only; settings come from environment variables, normally the
.env file next to docker-compose.yml (see .env.example).

Spam protection: a hidden "company" field that people never fill in, a minimum time on the page,
and a limit on messages per visitor IP. Nothing is stored.
"""

import json
import logging
import os
import re
import smtplib
import ssl
import threading
import time
from collections import defaultdict, deque
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs

SMTP_HOST = os.environ.get("SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587") or 587)
SMTP_USER = os.environ.get("SMTP_USER", "").strip()
SMTP_PASS = os.environ.get("SMTP_PASS", "").replace(" ", "")  # Gmail shows app passwords in groups of four
# "starttls" (port 587), "ssl" (port 465) or "none" (local testing only)
SMTP_SECURITY = (os.environ.get("SMTP_SECURITY") or ("ssl" if SMTP_PORT == 465 else "starttls")).lower()
CONTACT_TO = (os.environ.get("CONTACT_TO") or SMTP_USER).strip()
CONTACT_FROM = (os.environ.get("CONTACT_FROM") or SMTP_USER or CONTACT_TO).strip()
SITE_NAME = os.environ.get("SITE_NAME", "Portfolio").strip()
RATE_LIMIT = int(os.environ.get("RATE_LIMIT", "5"))  # messages per visitor ...
RATE_WINDOW = int(os.environ.get("RATE_WINDOW_MINUTES", "15")) * 60  # ... per this many minutes
MIN_SECONDS_ON_PAGE = 3
SENT_PAGE = "/consulting/sent/"
BACK_PAGE = "/consulting/#contact"
MAX_BODY = 32 * 1024

EMAIL_RE = re.compile(r"^[^@\s<>()\[\],;:\"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$")

logging.basicConfig(level=logging.INFO, format="%(asctime)s contact %(levelname)s %(message)s")
log = logging.getLogger("contact")

_hits: dict[str, deque] = defaultdict(deque)
_hits_lock = threading.Lock()


def configured() -> bool:
    return bool(SMTP_HOST and CONTACT_TO and CONTACT_FROM)


def rate_limited(ip: str) -> bool:
    now = time.monotonic()
    with _hits_lock:
        q = _hits[ip]
        while q and now - q[0] > RATE_WINDOW:
            q.popleft()
        if len(q) >= RATE_LIMIT:
            return True
        q.append(now)
        # Forget visitors who have gone quiet so the table can't grow forever.
        if len(_hits) > 5000:
            for key in [k for k, v in _hits.items() if not v or now - v[-1] > RATE_WINDOW]:
                del _hits[key]
        return False


def clean_line(value, limit: int) -> str:
    """A single-line field: no line breaks (they could inject email headers), trimmed, length-capped."""
    value = str(value or "")
    if "\r" in value or "\n" in value:
        raise ValueError("line break")
    return " ".join(value.split())[:limit]


def validate(form: dict) -> tuple[dict, str | None]:
    try:
        name = clean_line(form.get("name"), 100)
        email = clean_line(form.get("email"), 254)
        topic = clean_line(form.get("topic"), 80)
    except ValueError:
        return {}, "Please keep name, email and topic on one line."
    message = str(form.get("message") or "").replace("\r\n", "\n").strip()
    if not name:
        return {}, "Please add your name."
    if not EMAIL_RE.match(email):
        return {}, "Please check your email address — I need it to reply."
    if len(message) < 10:
        return {}, "Please write a little more about what you need."
    if len(message) > 5000:
        return {}, "Please keep the message under 5000 characters."
    return {"name": name, "email": email, "topic": topic, "message": message}, None


def send(data: dict, ip: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = f"[{SITE_NAME}] {data['topic'] or 'Enquiry'} — {data['name']}"
    msg["From"] = formataddr((f"{SITE_NAME} contact form", CONTACT_FROM))
    msg["To"] = CONTACT_TO
    msg["Reply-To"] = formataddr((data["name"], data["email"]))
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=CONTACT_FROM.rsplit("@", 1)[-1] or None)
    msg.set_content(
        f"{data['message']}\n\n"
        f"—\n"
        f"Name:  {data['name']}\n"
        f"Email: {data['email']}\n"
        f"Topic: {data['topic'] or '-'}\n"
        f"Sent from the contact form on {SITE_NAME} (visitor IP {ip}). Reply to this email to answer.\n"
    )

    context = ssl.create_default_context()
    if SMTP_SECURITY == "ssl":
        server = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20, context=context)
    else:
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20)
    with server:
        if SMTP_SECURITY == "starttls":
            server.starttls(context=context)
        if SMTP_USER and SMTP_PASS:
            server.login(SMTP_USER, SMTP_PASS)
        server.send_message(msg)


PAGE = """<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title><body style="font:18px/1.5 system-ui,sans-serif;max-width:36em;margin:15vh auto;padding:0 20px;color:#1f2636;background:#faf8f3">
<h1 style="font-size:32px;line-height:1.1">{title}</h1><p>{text}</p><p><a href="{back}">Back to the form</a></p></body></html>"""


class Handler(BaseHTTPRequestHandler):
    server_version = "contact"
    sys_version = ""
    timeout = 15  # seconds; drops connections that stall mid-request

    def log_message(self, fmt, *args):  # keep request logs quiet; outcomes are logged below
        pass

    def client_ip(self) -> str:
        return self.headers.get("X-Real-IP") or self.client_address[0]

    def wants_json(self) -> bool:
        return "application/json" in (self.headers.get("Accept", "") + self.headers.get("Content-Type", ""))

    def reply(self, status: int, error: str | None = None) -> None:
        if self.wants_json():
            body = json.dumps({"ok": True} if error is None else {"ok": False, "error": error}).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
        elif error is None:
            # Browser without JavaScript: go to the thank-you page.
            self.send_response(303)
            self.send_header("Location", SENT_PAGE)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        else:
            body = PAGE.format(title="Message not sent", text=error, back=BACK_PAGE).encode()
            self.send_response(status)
            self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.rstrip("/") == "/api/health":
            body = json.dumps({"ok": True, "configured": configured()}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path.split("?")[0].rstrip("/") != "/api/contact":
            self.send_error(404)
            return
        ip = self.client_ip()
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if length < 0 or length > MAX_BODY:
            self.reply(413, "That message is too long.")
            return
        raw = self.rfile.read(length).decode("utf-8", "replace")
        try:
            if "application/json" in self.headers.get("Content-Type", ""):
                form = json.loads(raw or "{}")
                if not isinstance(form, dict):
                    raise ValueError
            else:
                form = {k: v[0] for k, v in parse_qs(raw).items()}
        except ValueError:
            self.reply(400, "The form data couldn't be read.")
            return

        # Bots: pretend all went well so they don't learn anything.
        elapsed = str(form.get("elapsed", ""))
        if form.get("company") or (elapsed.isdigit() and int(elapsed) < MIN_SECONDS_ON_PAGE * 1000):
            log.info("dropped likely spam from %s", ip)
            self.reply(200)
            return

        data, error = validate(form)
        if error:
            self.reply(400, error)
            return
        if not configured():
            log.warning("message from %s not sent: SMTP is not configured (see .env.example)", ip)
            self.reply(503, "The contact form isn't set up yet. Please send an email instead.")
            return
        if rate_limited(ip):
            self.reply(429, "That's a lot of messages in a short time — please try again in a little while, or email me.")
            return
        try:
            send(data, ip)
        except Exception as exc:  # noqa: BLE001 — any SMTP/network failure means "not sent"
            log.error("sending failed for message from %s: %s", ip, exc)
            self.reply(502, "The message couldn't be sent just now. Please email me instead.")
            return
        log.info("sent message from %s", ip)
        self.reply(200)


def main() -> None:
    port = int(os.environ.get("PORT", "8000"))
    if configured():
        log.info("ready on port %d, sending to %s via %s:%d (%s)", port, CONTACT_TO, SMTP_HOST, SMTP_PORT, SMTP_SECURITY)
    else:
        log.warning("ready on port %d, but SMTP is not configured — messages will be refused until .env is filled in", port)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
