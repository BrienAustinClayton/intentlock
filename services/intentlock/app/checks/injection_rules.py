"""Fast heuristic HTML scan for prompt injection and hidden agent instructions.

Checks for hidden CSS, HTML comments, aria-hidden text, zero-size fonts,
off-screen positioning, white-on-white text, and agent-targeted instruction phrases.
"""

from __future__ import annotations

import ipaddress
import logging
import re
import socket
from collections.abc import Iterable
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup, Comment

logger = logging.getLogger("intentlock.checks.injection")

MAX_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 3
REPO_ROOT = Path(__file__).resolve().parents[4]
FIXTURE_ROOT = REPO_ROOT / "data" / "lab" / "pages"

INSTRUCTION_PHRASES: tuple[re.Pattern, ...] = (
    re.compile(r"\bai\s+agents?\b", re.IGNORECASE),
    re.compile(r"\bassistants?\b", re.IGNORECASE),
    re.compile(r"ignore\s+(?:(?:all|any|previous|prior|above)\s+)*instructions", re.IGNORECASE),
    re.compile(r"add\s+\S+.{0,200}?\s+to\s+(the\s+)?cart", re.IGNORECASE),
    re.compile(r"do\s+not\s+(tell|mention)", re.IGNORECASE),
    re.compile(r"user\s+(has\s+)?approved", re.IGNORECASE),
    re.compile(r"\bgift\s+cards?\b", re.IGNORECASE),
    re.compile(r"\bsystem\s+prompt\b", re.IGNORECASE),
)

ALLOWED_TECHNIQUES: frozenset[str] = frozenset(
    {
        "hidden_css",
        "html_comment",
        "aria_hidden",
        "offscreen",
        "zero_font",
        "white_on_white",
        "phrase",
    }
)


def has_instruction_phrase(text: str) -> bool:
    """True if text contains any recognized agent prompt-injection phrase."""
    return any(p.search(text) for p in INSTRUCTION_PHRASES)


def extract_phrase_snippet(text: str, max_len: int = 200) -> str:
    """Extract snippet centered on matching instruction phrase."""
    for p in INSTRUCTION_PHRASES:
        m = p.search(text)
        if m:
            start = max(0, m.start() - 20)
            end = min(len(text), m.end() + 80)
            snippet = text[start:end].strip()
            return snippet[:max_len]
    return text[:max_len].strip()


class FetchError(Exception):
    """Page could not be fetched or read safely. Message is a generic code."""


def _resolve_host(host: str) -> list[str]:
    """Resolve host to IP strings. Separate function so tests can stub DNS."""
    infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    return [info[4][0] for info in infos]


def _check_remote_url(url: str, allowed_hosts: frozenset[str] | None) -> None:
    """Raise FetchError unless url is http(s) to an allowed, public host."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise FetchError("scheme_not_allowed")
    if parsed.username is not None or parsed.password is not None:
        raise FetchError("userinfo_not_allowed")
    host = (parsed.hostname or "").rstrip(".").lower()
    if not host:
        raise FetchError("no_host")
    if allowed_hosts is not None and host not in allowed_hosts:
        raise FetchError("host_not_allowed")
    try:
        ips = _resolve_host(host)
    except (OSError, UnicodeError):
        raise FetchError("dns_failed") from None
    if not ips:
        raise FetchError("dns_failed")
    for raw in ips:
        try:
            ip = ipaddress.ip_address(raw.split("%", 1)[0])
        except ValueError:
            raise FetchError("bad_ip") from None
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
            ip = ip.ipv4_mapped
        if (
            not ip.is_global
            or ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise FetchError("private_address")


def _fetch_remote(url: str, timeout_s: float, allowed_hosts: frozenset[str] | None) -> str:
    current = url
    with httpx.Client(timeout=timeout_s, follow_redirects=False, trust_env=False) as client:
        for _hop in range(MAX_REDIRECTS + 1):
            _check_remote_url(current, allowed_hosts)
            with client.stream("GET", current) as resp:
                if resp.status_code in (301, 302, 303, 307, 308):
                    location = resp.headers.get("location")
                    if not location:
                        raise FetchError("bad_redirect")
                    current = urljoin(current, location)
                    continue
                if resp.status_code >= 400:
                    raise FetchError("http_error")
                declared = resp.headers.get("content-length")
                if declared is not None:
                    try:
                        if int(declared) > MAX_BYTES:
                            raise FetchError("too_large")
                    except ValueError:
                        pass
                buf = bytearray()
                for chunk in resp.iter_bytes():
                    buf.extend(chunk)
                    if len(buf) > MAX_BYTES:
                        raise FetchError("too_large")
                return bytes(buf).decode(resp.encoding or "utf-8", errors="replace")
    raise FetchError("too_many_redirects")


def _read_fixture(path_str: str) -> str:
    """Read a local file only if it resolves inside data/lab/pages."""
    try:
        root = FIXTURE_ROOT.resolve()
        p = Path(path_str)
        candidate = p if p.is_absolute() else root / p
        resolved = candidate.resolve()
        if not resolved.is_relative_to(root):
            raise FetchError("path_not_allowed")
        if not resolved.is_file():
            raise FetchError("not_found")
        with resolved.open("rb") as fh:
            data = fh.read(MAX_BYTES + 1)
    except FetchError:
        raise
    except (OSError, ValueError):
        raise FetchError("read_failed") from None
    if len(data) > MAX_BYTES:
        raise FetchError("too_large")
    return data.decode("utf-8", errors="replace")


def fetch_or_read_html(
    url_or_path: str,
    timeout_s: float = 3.0,
    *,
    allow_fixtures: bool = False,
    allowed_hosts: Iterable[str] | None = None,
) -> str:
    """Fetch an http(s) URL (SSRF-guarded, size-capped) or read a lab fixture.

    Local paths are read only when allow_fixtures=True and the resolved path is
    inside <repo>/data/lab/pages. Everything else raises FetchError.
    """
    if not isinstance(url_or_path, str) or not url_or_path:
        raise FetchError("bad_url")
    hosts = frozenset(h.lower().rstrip(".") for h in allowed_hosts) if allowed_hosts is not None else None
    scheme = urlparse(url_or_path).scheme.lower()
    if scheme in ("http", "https"):
        return _fetch_remote(url_or_path, timeout_s, hosts)
    if scheme and len(scheme) > 1:  # file:, ftp:, gopher: ... (len 1 = drive letter)
        raise FetchError("scheme_not_allowed")
    if not allow_fixtures:
        raise FetchError("local_not_allowed")
    return _read_fixture(url_or_path)


# ---------------------------------------------------------------- CSS helpers

NAMED_COLORS: dict[str, str] = {
    "white": "#ffffff", "black": "#000000", "red": "#ff0000", "lime": "#00ff00",
    "blue": "#0000ff", "yellow": "#ffff00", "cyan": "#00ffff", "aqua": "#00ffff",
    "magenta": "#ff00ff", "fuchsia": "#ff00ff", "silver": "#c0c0c0", "gray": "#808080",
    "grey": "#808080", "maroon": "#800000", "olive": "#808000", "green": "#008000",
    "purple": "#800080", "teal": "#008080", "navy": "#000080", "orange": "#ffa500",
    "pink": "#ffc0cb", "brown": "#a52a2a", "gold": "#ffd700", "ivory": "#fffff0",
    "beige": "#f5f5dc", "snow": "#fffafa", "azure": "#f0ffff", "honeydew": "#f0fff0",
    "mintcream": "#f5fffa", "ghostwhite": "#f8f8ff", "whitesmoke": "#f5f5f5",
    "seashell": "#fff5ee", "linen": "#faf0e6", "oldlace": "#fdf5e6", "floralwhite": "#fffaf0",
    "lightgray": "#d3d3d3", "lightgrey": "#d3d3d3", "gainsboro": "#dcdcdc",
    "darkgray": "#a9a9a9", "darkgrey": "#a9a9a9", "dimgray": "#696969", "dimgrey": "#696969",
    "lightyellow": "#ffffe0", "lavender": "#e6e6fa", "aliceblue": "#f0f8ff",
    "darkred": "#8b0000", "darkblue": "#00008b", "darkgreen": "#006400",
    "lightblue": "#add8e6", "lightgreen": "#90ee90", "skyblue": "#87ceeb",
    "tan": "#d2b48c", "coral": "#ff7f50", "salmon": "#fa8072", "khaki": "#f0e68c",
    "indigo": "#4b0082", "violet": "#ee82ee", "turquoise": "#40e0d0",
}
_HEX_RE = re.compile(r"#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])")
_RGB_RE = re.compile(r"rgba?\(\s*([^)]*)\)")
_WORD_RE = re.compile(r"[a-z]+")
_NUM_RE = re.compile(r"^(-?(?:\d+\.?\d*|\.\d+))\s*(px|em|rem|pt|%|vw|vh)?$")


def _channel(tok: str) -> int | None:
    tok = tok.strip()
    try:
        if tok.endswith("%"):
            return max(0, min(255, round(float(tok[:-1]) * 2.55)))
        return max(0, min(255, round(float(tok))))
    except ValueError:
        return None


def _normalize_color(value: str) -> str | None:
    """Return '#rrggbb' for hex, rgb()/rgba() and named colours; None if unknown/transparent."""
    value = value.lower().strip()
    m = _HEX_RE.search(value)
    if m:
        h = m.group(1)
        if len(h) in (3, 4):
            h = "".join(ch * 2 for ch in h[:3])
        return "#" + h[:6]
    m = _RGB_RE.search(value)
    if m:
        toks = [t for t in re.split(r"[\s,/]+", m.group(1)) if t]
        chans = [_channel(t) for t in toks[:3]]
        if len(chans) == 3 and None not in chans:
            return "#{:02x}{:02x}{:02x}".format(*chans)
        return None
    for w in _WORD_RE.findall(value):
        if w in NAMED_COLORS:
            return NAMED_COLORS[w]
    return None


def _parse_decls(css: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for part in css.split(";"):
        if ":" not in part:
            continue
        k, v = part.split(":", 1)
        k = k.strip().lower()
        v = re.sub(r"!\s*important", "", v.lower()).strip()
        if k:
            out[k] = v
    return out


def _px_value(v: str) -> float | None:
    m = _NUM_RE.match(v.strip())
    return float(m.group(1)) if m else None


def _hiding_flags(d: dict[str, str]) -> dict[str, bool]:
    display = d.get("display", "")
    visibility = d.get("visibility", "")
    opacity = d.get("opacity", "")
    hidden_css = display == "none" or visibility in ("hidden", "collapse")
    if opacity:
        try:
            if float(opacity) == 0.0:
                hidden_css = True
        except ValueError:
            pass
    fs = d.get("font-size", "")
    zero_font = False
    if fs:
        num = _px_value(fs)
        if num is not None and (num == 0 or (num <= 1 and fs.strip().endswith("px"))):
            zero_font = True
        if d.get("line-height", "").strip() in ("0", "0px") and num is not None and num <= 1:
            zero_font = True
    color = _normalize_color(d["color"]) if "color" in d else None
    bg_raw = d.get("background-color") or d.get("background")
    bg = _normalize_color(bg_raw) if bg_raw else None
    same_color = color is not None and bg is not None and color == bg
    pos = d.get("position", "")
    offscreen = False
    if pos in ("absolute", "fixed"):
        for side in ("left", "top", "right", "bottom"):
            num = _px_value(d.get(side, ""))
            if num is not None and num <= -100:
                offscreen = True
    ti = _px_value(d.get("text-indent", ""))
    if ti is not None and ti <= -100:
        offscreen = True
    return {
        "hidden_css": hidden_css,
        "zero_font": zero_font,
        "white_on_white": same_color,
        "offscreen": offscreen,
    }


_RULE_RE = re.compile(r"([^{}]+)\{([^{}]*)\}")


def _stylesheet_decls(soup: BeautifulSoup) -> list[tuple[Any, dict[str, str]]]:
    """(element, declarations) for every element matched by a <style> rule."""
    matched: list[tuple[Any, dict[str, str]]] = []
    for style_tag in soup.find_all("style"):
        css = re.sub(r"/\*.*?\*/", " ", style_tag.get_text(), flags=re.S)
        for m in _RULE_RE.finditer(css):
            selector_text, body = m.group(1).strip(), m.group(2)
            if selector_text.startswith("@"):
                continue
            decls = _parse_decls(body)
            if not any(
                k in decls
                for k in ("display", "visibility", "opacity", "font-size", "color",
                          "background", "background-color", "position", "text-indent",
                          "line-height")
            ):
                continue
            for sel in selector_text.split(","):
                sel = sel.strip()
                if not sel:
                    continue
                try:
                    els = soup.select(sel)
                except Exception:  # noqa: BLE001 - unsupported selector, skip
                    continue
                for el in els:
                    matched.append((el, decls))
    return matched


def _error_result(code: str) -> dict[str, Any]:
    return {
        "result": "error",
        "detected": False,
        "confidence": None,
        "findings": [],
        "hidden_text": "",
        "visible_text": "",
        "error": code,
    }


def scan_page_html(html: Any, url: str = "") -> dict[str, Any]:
    """Scan raw HTML for hidden instructions and calculate heuristic score.

    Never raises. Non-str/bytes input or an internal failure returns an error
    result with confidence None.
    """
    try:
        if isinstance(html, (bytes, bytearray)):
            html = bytes(html).decode("utf-8", errors="replace")
        if not isinstance(html, str):
            return _error_result("bad_input")
        if len(html) > MAX_BYTES:
            return _error_result("too_large")
        return _scan_page_html(html, url if isinstance(url, str) else "")
    except Exception:  # noqa: BLE001 - includes RecursionError on pathological markup
        logger.warning("scan_page_html failed")
        return _error_result("scan_failed")


def _scan_page_html(html: str, url: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    findings: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    hidden_texts: list[str] = []

    def add(technique: str, text: str) -> None:
        snippet = extract_phrase_snippet(text)
        key = (technique, snippet)
        if key in seen:
            return
        seen.add(key)
        findings.append({"url": url, "technique": technique, "snippet": snippet})

    # 1. HTML comments
    for c in soup.find_all(string=lambda t: isinstance(t, Comment)):
        c_text = str(c).strip()
        if c_text:
            hidden_texts.append(c_text)
            if has_instruction_phrase(c_text):
                add("html_comment", c_text)

    # 2. aria-hidden (case-insensitive)
    for el in soup.find_all(attrs={"aria-hidden": re.compile(r"^\s*true\s*$", re.IGNORECASE)}):
        t = el.get_text(separator=" ").strip()
        if t:
            hidden_texts.append(t)
            if has_instruction_phrase(t):
                add("aria_hidden", t)

    # 3. CSS hiding: <style> rules merged with inline style per element
    per_el: dict[int, tuple[Any, dict[str, str]]] = {}
    for el, decls in _stylesheet_decls(soup):
        entry = per_el.setdefault(id(el), (el, {}))
        entry[1].update(decls)
    for el in soup.find_all(style=True):
        raw = el.get("style")
        if isinstance(raw, list):
            raw = " ".join(raw)
        if not isinstance(raw, str):
            continue
        entry = per_el.setdefault(id(el), (el, {}))
        entry[1].update(_parse_decls(raw))

    for el, decls in per_el.values():
        if el.name in ("style", "script", "head", "html"):
            continue
        t = el.get_text(separator=" ").strip()
        if not t:
            continue
        flags = _hiding_flags(decls)
        if not any(flags.values()):
            continue
        hidden_texts.append(t)
        if has_instruction_phrase(t):
            for tech in ("white_on_white", "zero_font", "offscreen", "hidden_css"):
                if flags[tech]:
                    add(tech, t)
                    break

    # 4. JSON-LD
    for s in soup.find_all("script", type="application/ld+json"):
        t = s.get_text(separator=" ").strip()
        if t and has_instruction_phrase(t):
            hidden_texts.append(t)
            add("phrase", t)

    # 5. alt and title attributes
    for el in soup.find_all(attrs={"alt": True}):
        v = el.get("alt")
        if isinstance(v, str) and v.strip() and has_instruction_phrase(v):
            add("phrase", v.strip())
    for el in soup.find_all(attrs={"title": True}):
        v = el.get("title")
        if isinstance(v, str) and v.strip() and has_instruction_phrase(v):
            add("phrase", v.strip())

    # 6. Visible text
    for tag in soup(["script", "style"]):
        tag.extract()
    visible_text = soup.get_text(separator=" ").strip()
    if has_instruction_phrase(visible_text) and not findings:
        add("phrase", visible_text)

    has_hidden_findings = any(f["technique"] != "phrase" for f in findings)
    has_phrase_findings = any(f["technique"] == "phrase" for f in findings)
    has_hidden_text_only = len(hidden_texts) > 0 and len(findings) == 0

    if has_hidden_findings:
        confidence = 0.90
    elif has_phrase_findings:
        confidence = 0.90 if any(has_instruction_phrase(h) for h in hidden_texts) else 0.60
    elif has_hidden_text_only:
        confidence = 0.20
    else:
        confidence = 0.00

    return {
        "detected": confidence >= 0.50,
        "confidence": confidence,
        "findings": findings,
        "hidden_text": " ".join(hidden_texts),
        "visible_text": visible_text,
    }


def scan_injection(
    page_urls: Any,
    *,
    allow_fixtures: bool = False,
    allowed_hosts: Iterable[str] | None = None,
) -> dict[str, Any]:
    """Scan page URLs and return the aggregate scan_injection result.

    Fails closed: invalid input, nothing scanned, or any page error returns
    {"result": "error", "confidence": None, ...} so policy holds. Never raises.
    """
    try:
        if (
            not isinstance(page_urls, list)
            or not page_urls
            or not all(isinstance(u, str) for u in page_urls)
        ):
            return _error_result("bad_page_urls")

        all_findings: list[dict[str, str]] = []
        max_confidence = 0.0
        all_hidden: list[str] = []
        all_visible: list[str] = []
        errors: list[dict[str, Any]] = []
        scanned = 0

        for idx, url in enumerate(page_urls):
            try:
                html = fetch_or_read_html(
                    url, allow_fixtures=allow_fixtures, allowed_hosts=allowed_hosts
                )
            except FetchError as e:
                logger.warning("page %d not scanned: %s", idx, e)
                errors.append({"index": idx, "error": str(e)})
                continue
            except Exception:  # noqa: BLE001 - httpx errors etc.
                logger.warning("page %d not scanned: fetch_failed", idx)
                errors.append({"index": idx, "error": "fetch_failed"})
                continue
            res = scan_page_html(html, url=url)
            if res.get("result") == "error" or not isinstance(res.get("confidence"), (int, float)):
                errors.append({"index": idx, "error": str(res.get("error", "scan_failed"))})
                continue
            scanned += 1
            all_findings.extend(res["findings"])
            max_confidence = max(max_confidence, res["confidence"])
            if res["hidden_text"]:
                all_hidden.append(res["hidden_text"])
            if res["visible_text"]:
                all_visible.append(res["visible_text"])

        if errors or scanned == 0:
            out = _error_result("page_errors" if errors else "nothing_scanned")
            out["findings"] = all_findings
            out["errors"] = errors
            return out

        return {
            "detected": max_confidence >= 0.50,
            "confidence": round(max_confidence, 2),
            "findings": all_findings,
            "hidden_text": " ".join(all_hidden),
            "visible_text": " ".join(all_visible),
        }
    except Exception:  # noqa: BLE001
        logger.warning("scan_injection failed")
        return _error_result("scan_failed")
