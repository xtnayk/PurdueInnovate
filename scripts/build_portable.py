#!/usr/bin/env python3
"""Bundle the existing Fieldwork UI into a single offline replay HTML file.

No Node or Python runtime is needed to open the output; this build step is for
the developer only. Local stylesheet/script assets are embedded, and the live
API is replaced by explicitly labeled, prerecorded OR-Tools results.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
SCRIPT = re.compile(r"<script\b(?P<attrs>[^>]*)>.*?</script\s*>", re.I | re.S)
LINK = re.compile(r"<link\b(?P<attrs>[^>]*)>", re.I | re.S)
ATTR = re.compile(r"([\w:-]+)\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s>]+))")


def attributes(text):
    return {match[0].lower(): next((part for part in match[1:] if part), "") for match in ATTR.findall(text)}


def local_asset(url):
    parsed = urlsplit(url)
    if parsed.scheme or parsed.netloc:
        raise ValueError(f"Offline bundle cannot contain a remote asset: {url}")
    path = (WEB / parsed.path.lstrip("/")).resolve()
    if not path.is_relative_to(WEB.resolve()) or not path.is_file():
        raise ValueError(f"Local asset missing or outside web directory: {url}")
    return path


def inline_script(source, name):
    # Protect the HTML parser from JavaScript string/comment closing tags.
    source = re.sub(r"^\s*//#\s*sourceMappingURL=.*$", "", source, flags=re.M)
    escaped = re.sub(r"</script", r"<\\/script", source, flags=re.I)
    return f"\n<script>\n/* Embedded: {name} */\n{escaped}\n</script>\n"


def main():
    fixtures_path = WEB / "demo-fixtures.json"
    fixtures = json.loads(fixtures_path.read_text(encoding="utf-8"))
    if set(fixtures["scenarios"]) != {"baseline", "storm", "breakdown", "wet", "wind"}:
        raise ValueError("Capture all five scenarios before building the portable edition.")
    html = (WEB / "index.html").read_text(encoding="utf-8")
    scripts = []

    def collect_script(match):
        attrs = attributes(match["attrs"])
        if "src" not in attrs:
            scripts.append(("inline", match.group(0)))
            return ""
        path = local_asset(attrs["src"])
        if attrs.get("type") == "module":
            raise ValueError("Portable builder expects self-contained classic scripts; bundle modules first.")
        scripts.append((path.name, inline_script(path.read_text(encoding="utf-8"), str(path.relative_to(WEB)))))
        return ""

    def embed_stylesheet(match):
        attrs = attributes(match["attrs"])
        if attrs.get("rel", "").lower() != "stylesheet":
            return match.group(0)
        path = local_asset(attrs["href"])
        css = path.read_text(encoding="utf-8")
        if re.search(r"@import|url\(\s*['\"]?(?!data:|#)", css, re.I):
            raise ValueError(f"Unembedded CSS asset in {path.name}; inline it before bundling.")
        return f"<style>\n/* Embedded: {path.name} */\n{css}\n</style>"

    html = SCRIPT.sub(collect_script, html)
    # Removing indented script tags must not leave whitespace-only HTML lines.
    html = re.sub(r"(?m)^[ \t]+$", "", html)
    html = LINK.sub(embed_stylesheet, html)
    license_path = WEB / "vendor/THREE-LICENSE.txt"
    if license_path.is_file():
        license_text = license_path.read_text(encoding="utf-8").replace("--", "—")
        html = html.replace("</head>", f"<!-- Three.js license\n{license_text}\n-->\n</head>", 1)
    if not any(name == "app.js" for name, _ in scripts):
        raise ValueError("App entry point not found.")
    fixture_script = inline_script("window.FIELDWORK_FIXTURES=" + json.dumps(fixtures, ensure_ascii=False, separators=(",", ":")) + ";", "validated scenario fixtures")
    adapter_script = inline_script((WEB / "replay-adapter.js").read_text(encoding="utf-8"), "replay-adapter.js")
    embedded = []
    for name, script in scripts:
        if name == "app.js":
            embedded.extend((fixture_script, adapter_script))
        embedded.append(script)
    # All scripts execute only after the DOM markup, preserving dependency order.
    html = re.sub(r"</body\s*>", lambda _match: "\n" + "\n".join(embedded) + "\n</body>", html, count=1, flags=re.I)
    if re.search(r"<script\b[^>]*\bsrc\s*=|<link\b[^>]*rel=['\"]stylesheet", html, re.I):
        raise ValueError("A dependent script or stylesheet was not embedded.")
    output = ROOT / "output/Fieldwork.html"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html, encoding="utf-8")
    served = WEB / "downloads/Fieldwork.html"
    served.parent.mkdir(parents=True, exist_ok=True)
    served.write_text(html, encoding="utf-8")
    print(f"Built {output} ({output.stat().st_size:,} bytes)")
    print(f"Copied the same standalone file to {served}")
    print("Open it directly in a browser. It replays recorded plans and never contacts the solver.")


if __name__ == "__main__":
    main()
