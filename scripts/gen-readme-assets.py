#!/usr/bin/env python3
"""Generate README visuals for dsh-progress-payment (docs/assets/).

Outputs (idempotent overwrite):
  dsh-progress-payment-hero-{zh,en}-{light,dark}.webp   1440x576 (Pillow)
  dsh-progress-payment-flow-v5-{light,dark}.svg         1100x660 (hand-written)

Design notes
------------
Hero -- left column is prose (kicker / two-line wordmark / two value lines /
  one subtitle / one meta / footer). The right column is this plugin's own
  semantic graphic, a period sign-off bench:
    * card 1  progress_audit sign-off: period amount 50,763.60, declared
      51,627.60, price adjustment -864.00, cumulative 614,145.00, cumulative
      ratio 84.62% on a bar against the contract amount 725,750.00, status
      needs_review / 3 blocking;
    * card 2  issues[] ledger: the three real blocking issues -- over quantity
      (101.5 > 95), price mismatch (65.00 != 55.00) and duplicate item (x2,
      counted=no) -- with their row numbers;
    * strip   progress_export: the 8-row worksheet, 1,291 bytes, UTF-8 BOM,
      sha256 prefix and the $DSH_HOME exports path.
  Every number comes from samples/quickstart/expected/result.json (7 rows,
  6 items, batch pg_ea0edb1548cb530b); nothing is invented.

Flow -- a ledger bench, not a row of five boxes. Grammar:
  two source cards (declaration CSV, 7 columns; optional contract baseline CSV,
  3 columns, "baseline wins") fold into the progress_ingest batch bar; the
  bench then shows a 6-item x 3-axis check matrix (over_qty / price / dup)
  with the real period amount and cumulative ratio per item, a summary
  scoreboard (period / declared / price adjustment / cumulative / contract /
  ratio bar / needs_review) and one progress_export rail carrying the
  worksheet facts plus the three E_PROGRESS_* codes. Text is token-only
  (English CSV headers, tool names, field names, amounts), so one light/dark
  pair serves all five README languages.

Run once:  python scripts/gen-readme-assets.py
Requires:  Python 3.10+ with Pillow; Windows fonts msyh.ttc / msyhbd.ttc /
           consola.ttf / consolab.ttf.
"""
from __future__ import annotations

import os
from xml.sax.saxutils import escape

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "assets")

FONT_FILE = {
    "cjk": r"C:\Windows\Fonts\msyh.ttc",
    "cjk_bold": r"C:\Windows\Fonts\msyhbd.ttc",
    "mono": r"C:\Windows\Fonts\consola.ttf",
    "mono_bold": r"C:\Windows\Fonts\consolab.ttf",
}
for _kind, _path in FONT_FILE.items():
    if not os.path.exists(_path):
        raise SystemExit(f"FATAL: font missing: {_path}")

WARNINGS: list[str] = []
_font_cache: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}


def font(size: float, kind: str = "cjk") -> ImageFont.FreeTypeFont:
    key = (kind, max(8, int(round(size))))
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(FONT_FILE[kind], key[1], index=0)
    return _font_cache[key]


_measure = ImageDraw.Draw(Image.new("RGB", (8, 8)))


def hx(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def text_w(text: str, size: float, kind: str = "cjk") -> float:
    return _measure.textlength(text, font=font(size, kind))


def fit(text: str, kind: str, limit: float, start: float, floor: float) -> float:
    size = float(start)
    while size > floor and text_w(text, size, kind) > limit:
        size -= 0.5
    if text_w(text, size, kind) > limit:
        raise SystemExit(
            f"FATAL: cannot fit {text!r} into {limit:.0f}px "
            f"(floor {floor}px, needs {text_w(text, size, kind):.0f}px)")
    return size


def put(d: ImageDraw.ImageDraw, xy: tuple[float, float], text: str,
        size: float, kind: str, color: str, *, limit: float | None = None,
        anchor: str = "ls", tag: str = "") -> float:
    width = text_w(text, size, kind)
    if limit is not None and width > limit:
        raise SystemExit(
            f"FATAL: overflow in {tag or 'text'}: {text!r} is "
            f"{width:.0f}px > {limit:.0f}px at {size}px")
    d.text(xy, text, font=font(size, kind), fill=hx(color), anchor=anchor)
    return width


# ---------------------------------------------------------------- primitives
SKIN = {
    "light": dict(
        bg_from="#f9f6fd", bg_to="#e4eaf8", card="#ffffff",
        card_edge="#e4e1ee", zone="#f5f2fb", zone_edge="#e3def1",
        text="#141419", sub="#4d5261", faint="#8f94a4",
        accent="#4B67B4", warn="#c2410c", good="#16a34a",
        pill="#ece7f9", track="#eae6f3", grid="#e7e4f0",
        shadow=(32, 26, 64),
    ),
    "dark": dict(
        bg_from="#131a2a", bg_to="#0c1016", card="#1b2231",
        card_edge="#2e374b", zone="#171e2d", zone_edge="#2b3448",
        text="#f0f3f9", sub="#a8b1c4", faint="#737b8d",
        accent="#8496f5", warn="#d9a03c", good="#3fb950",
        pill="#242d42", track="#243049", grid="#1e2636",
        shadow=(0, 0, 0),
    ),
}


def gradient(w: int, h: int, c1: str, c2: str) -> Image.Image:
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    a, b = hx(c1), hx(c2)
    for y in range(h):
        t = 0.25 * (y / h) + 0.75 * (y / h) ** 1.6
        d.line([(0, y), (w, y)],
               fill=tuple(int(p + (q - p) * t) for p, q in zip(a, b)))
    return img


def glow(img: Image.Image, cx: float, cy: float, r: float, color: str,
         alpha: int = 30) -> Image.Image:
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in range(10, 0, -1):
        rr = r * i / 10
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr],
                  fill=hx(color) + (int(alpha * (1 - i / 11)),))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def card(img: Image.Image, box: tuple[int, int, int, int], skin: dict,
         radius: int = 22, shadow: int = 26) -> Image.Image:
    x0, y0, x1, y1 = box
    sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    for i in range(shadow, 0, -3):
        sd.rounded_rectangle([x0 - i // 5, y0 + i // 2, x1 + i // 5, y1 + i],
                             radius=radius + i // 5,
                             fill=skin["shadow"] + (int(7 * (1 - i / shadow)),))
    base = Image.alpha_composite(img.convert("RGBA"),
                                 sh.filter(ImageFilter.GaussianBlur(12)))
    d = ImageDraw.Draw(base)
    d.rounded_rectangle(box, radius=radius, fill=hx(skin["card"]),
                        outline=hx(skin["card_edge"]), width=2)
    return base.convert("RGB")


def pill(img: Image.Image, box: tuple[int, int, int, int], text: str,
         size: float, kind: str, fg: str, bg: str,
         anchor_center: tuple[float, float] | None = None) -> Image.Image:
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(box, radius=(box[3] - box[1]) // 2, fill=hx(bg))
    if anchor_center is not None:
        d.text(anchor_center, text, font=font(size, kind), fill=hx(fg),
               anchor="mm")
    return img


# --------------------------------------------------------------- hero model
HERO = {
    "zh": dict(
        kicker="DeepSeek Harness · 进度款审核",
        title=("dsh-progress-", "payment"),
        value=("按合同基准逐项核量、核价、查重复",
               "整数分算出本期签认与累计比例"),
        sub="申报 CSV + 合同基准 → 问题清单 → 底稿 CSV",
        meta="R0 只读 / R1 本地写 · 全程本地 · 不联网 · 不调模型",
        foot="Apache-2.0 · PerryLink DSH plugin family · dsh ≥0.2.1 <0.4.0",
        c1_label="progress_audit · R0",
        c1_title="本期签认",
        c1_cents="5,076,360 分 · CNY",
        c1_rows=(("申报", "51,627.60"), ("价差", "−864.00"),
                 ("累计", "614,145.00")),
        c1_ratio="累计比例",
        c1_note="合同 725,750.00",
        c1_status="needs_review · 3 blocking",
        c2_label="issues[] · progress_audit",
        c2_title="3 个阻塞问题",
        c2_rows=(("E_PROGRESS_OVER_QTY", "row 4",
                  "010402001 · 101.5 > 95 m³"),
                 ("E_PROGRESS_PRICE_MISMATCH", "row 6",
                  "011702001 · 65.00 ≠ 55.00"),
                 ("E_PROGRESS_DUP_ITEM", "row 7",
                  "010101003 · ×2 → 计入=否")),
        c2_foot1="batch pg_ea0edb1548cb530b",
        c2_foot2="按行号排序 · 重复行不计入",
        strip_label="progress_export · R1",
        strip_mid="worksheet · 8 rows · 1,291 B · UTF-8 BOM",
        strip_sha="sha256 24cca857…",
        strip_dir="$DSH_HOME/dsh-progress-payment/exports/",
        strip_file="progress-audit-2026-10.csv",
        strip_note="不联网 · 不调模型 · 不上传",
        strip_right="源 CSV 只读",
    ),
    "en": dict(
        kicker="DeepSeek Harness · progress-payment audit",
        title=("dsh-progress-", "payment"),
        value=("Quantity, price and duplicate checks",
               "Integer-cent amounts and ratio"),
        sub="Declaration + baseline → issue list → CSV",
        meta="R0 read-only / R1 local write · offline, no model call",
        foot="Apache-2.0 · PerryLink DSH plugin family · dsh ≥0.2.1 <0.4.0",
        c1_label="progress_audit · R0",
        c1_title="period sign-off",
        c1_cents="5,076,360 cents · CNY",
        c1_rows=(("declared", "51,627.60"), ("price adj", "−864.00"),
                 ("cumulative", "614,145.00")),
        c1_ratio="cum ratio",
        c1_note="contract 725,750.00",
        c1_status="needs_review · 3 blocking",
        c2_label="issues[] · progress_audit",
        c2_title="3 blocking issues",
        c2_rows=(("E_PROGRESS_OVER_QTY", "row 4",
                  "010402001 · 101.5 > 95 m³"),
                 ("E_PROGRESS_PRICE_MISMATCH", "row 6",
                  "011702001 · 65.00 ≠ 55.00"),
                 ("E_PROGRESS_DUP_ITEM", "row 7",
                  "010101003 · ×2 → counted=no")),
        c2_foot1="batch pg_ea0edb1548cb530b",
        c2_foot2="sorted by row · dup rows excluded",
        strip_label="progress_export · R1",
        strip_mid="worksheet · 8 rows · 1,291 B · UTF-8 BOM",
        strip_sha="sha256 24cca857…",
        strip_dir="$DSH_HOME/dsh-progress-payment/exports/",
        strip_file="progress-audit-2026-10.csv",
        strip_note="no network · no model call · no upload",
        strip_right="source CSV read-only",
    ),
}

# gold numbers from samples/quickstart/expected/result.json
PERIOD_CENTS = 5_076_360
PERIOD = "50,763.60"
DECLARED = "51,627.60"
PRICE_ADJ = "−864.00"
CUMULATIVE = "614,145.00"
CONTRACT = "725,750.00"
RATIO = 0.8462
RATIO_TXT = "84.62%"


def hero(lang: str, skin_name: str) -> None:
    s = SKIN[skin_name]
    h = HERO[lang]
    w, hgt = 1440, 576
    img = gradient(w, hgt, s["bg_from"], s["bg_to"])
    img = glow(img, 1245, 30, 430, s["accent"],
               24 if skin_name == "light" else 44)
    img = glow(img, 105, 585, 300, s["accent"],
               10 if skin_name == "light" else 16)
    d = ImageDraw.Draw(img)

    # ------------------------------------------------------- left column
    m, col = 60, 620
    ksize = 19
    kw = text_w(h["kicker"], ksize, "cjk_bold")
    img = pill(img, (m, 54, m + kw + 74, 96), h["kicker"], ksize,
               "cjk_bold", s["accent"], s["pill"], None)
    d = ImageDraw.Draw(img)
    d.ellipse([m + 24, 71, m + 32, 79], fill=hx(s["accent"]))
    put(d, (m + 46, 75), h["kicker"], ksize, "cjk_bold", s["accent"],
        limit=col - 90, anchor="lm", tag="hero.kicker")

    tsize = 84
    put(d, (m - 2, 190), h["title"][0], tsize, "mono_bold", s["text"],
        limit=col, tag="hero.title1")
    put(d, (m - 2, 268), h["title"][1], tsize, "mono_bold", s["text"],
        limit=col, tag="hero.title2")

    vkind = "cjk_bold"
    vmax, vfloor = 36, 24
    vsize = min(
        fit(h["value"][0], vkind, col, vmax, vfloor),
        fit(h["value"][1], vkind, col, vmax, vfloor),
    )
    put(d, (m, 340), h["value"][0], vsize, vkind, s["text"], limit=col,
        tag="hero.value1")
    put(d, (m, 340 + vsize + 10), h["value"][1], vsize, vkind, s["text"],
        limit=col, tag="hero.value2")

    put(d, (m, 470), h["sub"], 25, "cjk", s["sub"], limit=col,
        tag="hero.sub")
    put(d, (m, 508), h["meta"], 20, "cjk", s["faint"], limit=col,
        tag="hero.meta")
    d.line([m, 524, m + 560, 524], fill=hx(s["grid"]), width=2)
    put(d, (m, 550), h["foot"], 16, "cjk", s["faint"], limit=col,
        tag="hero.foot")

    # ------------------------------------------------- period sign-off card
    img = card(img, (700, 44, 1024, 424), s)
    d = ImageDraw.Draw(img)
    put(d, (724, 76), h["c1_label"], 14, "mono", s["accent"], limit=270,
        tag="hero.c1_label")
    put(d, (724, 106), h["c1_title"], 20, "cjk_bold", s["text"], limit=276,
        tag="hero.c1_title")
    put(d, (724, 154), PERIOD, 40, "mono_bold", s["text"], limit=276,
        tag="hero.c1_amount")
    put(d, (724, 180), h["c1_cents"], 14, "cjk", s["sub"], limit=276,
        tag="hero.c1_cents")
    d.line([724, 196, 1000, 196], fill=hx(s["grid"]), width=2)
    for i, (label, value) in enumerate(h["c1_rows"]):
        y = 224 + i * 28
        put(d, (724, y), label, 15, "cjk", s["sub"], limit=110,
            tag=f"hero.c1_row{i}")
        put(d, (1000, y), value, 16, "mono_bold", s["text"], anchor="rs",
            limit=160, tag=f"hero.c1_val{i}")
    d.line([724, 300, 1000, 300], fill=hx(s["grid"]), width=2)
    put(d, (724, 326), h["c1_ratio"], 15, "cjk_bold", s["sub"], limit=120,
        tag="hero.c1_ratio")
    put(d, (1000, 328), RATIO_TXT, 22, "mono_bold", s["accent"],
        anchor="rs", limit=150, tag="hero.c1_ratio_value")
    bar_w = 276
    d.rounded_rectangle([724, 342, 724 + bar_w, 354], radius=6,
                        fill=hx(s["track"]))
    d.rounded_rectangle([724, 342, 724 + int(bar_w * RATIO), 354], radius=6,
                        fill=hx(s["accent"]))
    d.line([1000, 338, 1000, 358], fill=hx(s["faint"]), width=2)
    put(d, (724, 376), h["c1_note"], 13.5, "cjk", s["faint"], limit=170,
        tag="hero.c1_note")
    put(d, (1000, 376), "100%", 13, "mono", s["faint"], anchor="rs",
        limit=60, tag="hero.c1_100")
    img = pill(img, (724, 388, 1000, 418), h["c1_status"], 15, "cjk_bold",
               s["warn"], s["pill"], (862, 403))

    # ------------------------------------------------------ issue ledger card
    img = card(img, (1048, 44, 1380, 424), s)
    d = ImageDraw.Draw(img)
    put(d, (1072, 76), h["c2_label"], 14, "mono", s["accent"], limit=284,
        tag="hero.c2_label")
    put(d, (1072, 108), h["c2_title"], 20, "cjk_bold", s["text"], limit=284,
        tag="hero.c2_title")
    d.line([1072, 124, 1356, 124], fill=hx(s["grid"]), width=2)
    for i, (code, row_tag, detail) in enumerate(h["c2_rows"]):
        y = 152 + i * 76
        put(d, (1072, y), code, 13.5, "mono_bold", s["warn"], limit=210,
            tag=f"hero.c2_code{i}")
        put(d, (1356, y), row_tag, 13, "mono", s["faint"], anchor="rs",
            limit=60, tag=f"hero.c2_row{i}")
        put(d, (1072, y + 22), detail, 14, "cjk", s["text"], limit=284,
            tag=f"hero.c2_detail{i}")
    d.line([1072, 358, 1356, 358], fill=hx(s["grid"]), width=2)
    put(d, (1072, 384), h["c2_foot1"], 13.5, "mono", s["faint"], limit=284,
        tag="hero.c2_foot1")
    put(d, (1072, 406), h["c2_foot2"], 13.5, "cjk",
        s["faint"], limit=284, tag="hero.c2_foot2")

    # ------------------------------------------------------- export strip
    img = card(img, (700, 444, 1380, 528), s, radius=18)
    d = ImageDraw.Draw(img)
    put(d, (724, 470), h["strip_label"], 15, "mono_bold", s["accent"],
        limit=170, tag="hero.strip_label")
    put(d, (902, 470), h["strip_mid"], 13.5, "mono", s["sub"], limit=320,
        tag="hero.strip_mid")
    put(d, (1356, 470), h["strip_sha"], 13, "mono", s["faint"], anchor="rs",
        limit=140, tag="hero.strip_sha")
    put(d, (724, 494), h["strip_dir"], 14, "mono", s["sub"], limit=330,
        tag="hero.strip_dir")
    put(d, (1044, 494), h["strip_file"], 14, "mono", s["sub"], limit=210,
        tag="hero.strip_file")
    put(d, (724, 518), h["strip_note"], 13, "cjk", s["faint"], limit=320,
        tag="hero.strip_note")
    put(d, (1356, 518), h["strip_right"], 13, "cjk", s["faint"],
        anchor="rs", limit=200, tag="hero.strip_right")

    path = os.path.join(OUT, f"dsh-progress-payment-hero-{lang}-"
                             f"{skin_name}.webp")
    img.save(path, "WEBP", quality=92)
    print(f"wrote {os.path.basename(path)}")


# ------------------------------------------------------------- flow diagram
FLOW = {
    "light": dict(
        bg_from="#f9f6fd", bg_to="#e4eaf8", card="#ffffff",
        edge="#e4e1ee", zone="#f5f2fb", zone_edge="#e3def1",
        text="#141419", sub="#4d5261", faint="#8f94a4",
        accent="#4B67B4", warn="#b0470f", good="#15803d",
        pill="#ece7f9", track="#eae6f3", grid="#e7e4f0", dot="#d9d3ea",
        shadow="#1b1735", shadow_op="0.10",
    ),
    "dark": dict(
        bg_from="#131a2a", bg_to="#0c1016", card="#1b2231",
        edge="#2e374b", zone="#171e2d", zone_edge="#2b3448",
        text="#f0f3f9", sub="#a8b1c4", faint="#737b8d",
        accent="#8496f5", warn="#d9a03c", good="#3fb950",
        pill="#242d42", track="#243049", grid="#1e2636", dot="#26314a",
        shadow="#000000", shadow_op="0.55",
    ),
}

MONO = "Consolas,'Microsoft YaHei',ui-monospace,monospace"
SANS = "'Microsoft YaHei','Segoe UI',sans-serif"

# rows 1-6 are the six bill items of the fixture; row 7 is the duplicate row.
MATRIX = [
    (1, "010101001", "pass", "–", "1,050.00", "75.00%"),
    (2, "010101003", "dup", "×2", "3,360.00", "61.18%"),
    (3, "010401001", "pass", "–", "12,441.60", "92.50%"),
    (4, "010402001", "over", "–", "7,320.00", "106.84%"),
    (5, "010515001", "pass", "–", "21,840.00", "78.00%"),
    (6, "011702001", "price", "–", "4,752.00", "95.56%"),
]


def svg_w(text: str, size: float, mono: bool = True) -> float:
    """Conservative width: ASCII measured with the real font, non-ASCII as 0.6em."""
    ascii_part = "".join(ch if ord(ch) < 128 else "" for ch in text)
    wide = len(text) - len(ascii_part)
    kind = "mono" if mono else "cjk"
    return text_w(ascii_part, size, kind) + wide * size * 0.62


def svg_text(x: float, y: float, text: str, size: float, fill: str, *,
             mono: bool = True, bold: bool = False,
             anchor: str | None = None, opacity: float | None = None,
             limit: float | None = None, tag: str = "") -> str:
    if limit is not None and svg_w(text, size, mono) > limit:
        raise SystemExit(
            f"FATAL: svg overflow in {tag or 'text'}: {text!r} is "
            f"{svg_w(text, size, mono):.0f}px > {limit:.0f}px at {size}px")
    attrs = [
        f'x="{x:g}"', f'y="{y:g}"', f'fill="{fill}"',
        f'font-family="{MONO if mono else SANS}"', f'font-size="{size:g}"',
    ]
    if bold:
        attrs.append('font-weight="700"')
    if anchor:
        attrs.append(f'text-anchor="{anchor}"')
    if opacity is not None:
        attrs.append(f'opacity="{opacity:g}"')
    return f'<text {" ".join(attrs)}>{escape(text)}</text>'


def flow_svg(skin_name: str) -> None:
    f = FLOW[skin_name]
    p: list[str] = []

    p.append(f'''<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="660" viewBox="0 0 1100 660" role="img" aria-label="dsh-progress-payment: a declaration CSV plus an optional contract baseline CSV go through progress_ingest into one batch; progress_audit checks every item on three axes (over quantity, price difference, duplicate code), computes period amounts and cumulative ratios in integer cents, and the summary reports needs_review; progress_export writes an 8-row UTF-8 BOM worksheet into DSH_HOME exports">
<title>dsh-progress-payment: two source CSVs, a per-item check matrix, one worksheet</title>
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
    <stop offset="0" stop-color="{f['bg_from']}"/>
    <stop offset="1" stop-color="{f['bg_to']}"/>
  </linearGradient>
  <filter id="soft" x="-30%" y="-30%" width="160%" height="180%">
    <feDropShadow dx="0" dy="8" stdDeviation="11" flood-color="{f['shadow']}" flood-opacity="{f['shadow_op']}"/>
  </filter>
  <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
    <circle cx="1.4" cy="1.4" r="1.4" fill="{f['dot']}"/>
  </pattern>
</defs>
<rect width="1100" height="660" fill="url(#bg)"/>
<rect width="1100" height="660" fill="url(#dots)" opacity=".4"/>''')

    # header ---------------------------------------------------------------
    p.append(svg_text(44, 62, "dsh-progress-payment", 31, f["text"],
                      bold=True, limit=460, tag="title"))
    p.append(svg_text(44, 88,
                      "declaration vs contract baseline · integer cents · local CSV only",
                      15, f["sub"], mono=False, limit=620, tag="subtitle"))
    p.append(f'<rect x="726" y="38" width="330" height="34" rx="17" fill="{f["pill"]}"/>')
    p.append(svg_text(891, 60, "quickstart · 7 rows / 6 items · CNY", 14,
                      f["accent"], anchor="middle", limit=306, tag="pill"))
    p.append(f'<line x1="44" y1="102" x2="1056" y2="102" stroke="{f["grid"]}" stroke-width="1.5"/>')

    # input cards ----------------------------------------------------------
    p.append(f'<g filter="url(#soft)"><rect x="40" y="112" width="500" height="120" rx="20" fill="{f["card"]}" stroke="{f["edge"]}" stroke-width="1.5"/></g>')
    p.append(svg_text(60, 140, "INPUT A · declaration_csv", 14, f["accent"],
                      bold=True, limit=250, tag="A.label"))
    p.append(svg_text(520, 140, "7 rows · 6 items", 14, f["sub"],
                      anchor="end", limit=140, tag="A.badge"))
    p.append(f'<line x1="60" y1="152" x2="520" y2="152" stroke="{f["grid"]}" stroke-width="1.3"/>')
    p.append(svg_text(60, 178, "item_code · item_name · unit · contract_qty",
                      14, f["sub"], limit=460, tag="A.cols1"))
    p.append(svg_text(60, 200, "contract_unit_price · period_qty · cumulative_qty",
                      14, f["sub"], limit=460, tag="A.cols2"))
    p.append(svg_text(60, 222, "UTF-8 / BOM ok · extra columns ignored", 14,
                      f["faint"], limit=320, tag="A.note"))
    p.append(svg_text(520, 222, "sha256 b74c6875…", 14, f["faint"],
                      anchor="end", limit=150, tag="A.sha"))

    p.append(f'<g filter="url(#soft)"><rect x="560" y="112" width="500" height="120" rx="20" fill="{f["card"]}" stroke="{f["edge"]}" stroke-width="1.5"/></g>')
    p.append(svg_text(580, 140, "INPUT B · contract_csv", 14, f["accent"],
                      bold=True, limit=210, tag="B.label"))
    p.append(svg_text(1040, 140, "optional · 6 items", 14, f["sub"],
                      anchor="end", limit=160, tag="B.badge"))
    p.append(f'<line x1="580" y1="152" x2="1040" y2="152" stroke="{f["grid"]}" stroke-width="1.3"/>')
    p.append(svg_text(580, 178, "item_code · contract_qty · contract_unit_price",
                      14, f["sub"], limit=460, tag="B.cols"))
    p.append(svg_text(580, 200, "baseline wins", 14, f["accent"], bold=True,
                      limit=460, tag="B.wins"))
    _bw = svg_w("baseline wins", 14)
    p.append(svg_text(580 + _bw + 12, 200,
                      "· declared qty/price only compared", 14, f["sub"],
                      limit=460 - _bw - 12, tag="B.wins2"))
    p.append(svg_text(580, 222, "absent → declared + E_PROGRESS_CONTRACT_MISSING",
                      14, f["faint"], limit=460, tag="B.note"))

    # arrows into the ingest bar
    for ax in (290, 810):
        p.append(f'<line x1="{ax}" y1="234" x2="{ax}" y2="243" stroke="{f["accent"]}" stroke-width="2" opacity=".55"/>')
        p.append(f'<path d="M{ax - 5} 242 L{ax + 5} 242 L{ax} 249 Z" fill="{f["accent"]}" opacity=".7"/>')

    # ingest bar -----------------------------------------------------------
    p.append(f'<rect x="40" y="252" width="1020" height="36" rx="18" fill="{f["zone"]}" stroke="{f["accent"]}" stroke-width="1.4" opacity=".98"/>')
    p.append(svg_text(60, 275, "progress_ingest · R0", 17, f["accent"],
                      bold=True, limit=230, tag="ingest.name"))
    p.append(svg_text(300, 275, "batch_id pg_ea0edb1548cb530b", 14, f["sub"],
                      limit=270, tag="ingest.batch"))
    p.append(svg_text(1040, 275,
                      "7 rows · 6 items · declaration sha256 b74c6875…",
                      14, f["faint"], anchor="end", limit=420,
                      tag="ingest.facts"))
    p.append(f'<line x1="370" y1="290" x2="370" y2="299" stroke="{f["accent"]}" stroke-width="2" opacity=".55"/>')
    p.append(f'<path d="M365 298 L375 298 L370 305 Z" fill="{f["accent"]}" opacity=".7"/>')

    # ---------------------------------------------------------- matrix card
    p.append(f'<g filter="url(#soft)"><rect x="40" y="308" width="600" height="220" rx="20" fill="{f["card"]}" stroke="{f["edge"]}" stroke-width="1.5"/></g>')
    p.append(svg_text(60, 332, "progress_audit · R0", 17, f["accent"],
                      bold=True, limit=200, tag="audit.name"))
    p.append(svg_text(620, 332, "6 items × 3 axes · integer cents", 14,
                      f["faint"], anchor="end", limit=300, tag="audit.meta"))
    p.append(f'<line x1="60" y1="344" x2="620" y2="344" stroke="{f["grid"]}" stroke-width="1.3"/>')
    p.append(f'<line x1="430" y1="358" x2="430" y2="492" stroke="{f["grid"]}" stroke-width="1.2" opacity=".8"/>')
    p.append(svg_text(60, 364, "item_code", 14, f["faint"], limit=100,
                      tag="h.code"))
    p.append(svg_text(190, 364, "over_qty", 14, f["faint"], anchor="middle",
                      limit=80, tag="h.over"))
    p.append(svg_text(300, 364, "price", 14, f["faint"], anchor="middle",
                      limit=70, tag="h.price"))
    p.append(svg_text(400, 364, "dup", 14, f["faint"], anchor="middle",
                      limit=60, tag="h.dup"))
    p.append(svg_text(520, 364, "period ¥", 14, f["faint"], anchor="end",
                      limit=110, tag="h.amount"))
    p.append(svg_text(620, 364, "cum ratio", 14, f["faint"], anchor="end",
                      limit=110, tag="h.ratio"))

    for i, (row, code, kind, dup_mark, amount, ratio) in enumerate(MATRIX):
        y = 386 + i * 20
        hit = kind in ("over", "price")
        if hit:
            p.append(f'<rect x="50" y="{y - 17}" width="570" height="23" rx="8" fill="{f["warn"]}" opacity=".09"/>')
        p.append(svg_text(60, y, code, 17, f["text"], limit=110,
                          tag=f"m.code{i}"))
        for cx, key in ((190, "over"), (300, "price")):
            if kind == key:
                p.append(f'<circle cx="{cx}" cy="{y - 5}" r="5.2" fill="{f["warn"]}"/>')
            else:
                p.append(f'<line x1="{cx - 5}" y1="{y - 5}" x2="{cx + 5}" y2="{y - 5}" stroke="{f["faint"]}" stroke-width="2" opacity=".65"/>')
        if dup_mark == "×2":
            p.append(svg_text(400, y, "×2", 16, f["warn"], bold=True,
                              anchor="middle", limit=50, tag=f"m.dup{i}"))
        else:
            p.append(f'<line x1="395" y1="{y - 5}" x2="405" y2="{y - 5}" stroke="{f["faint"]}" stroke-width="2" opacity=".65"/>')
        p.append(svg_text(520, y, amount, 17,
                          f["warn"] if hit else f["text"], anchor="end",
                          limit=120, tag=f"m.amount{i}"))
        p.append(svg_text(620, y, ratio, 17,
                          f["warn"] if hit else f["sub"], anchor="end",
                          limit=80, tag=f"m.ratio{i}"))

    p.append(f'<line x1="60" y1="496" x2="620" y2="496" stroke="{f["grid"]}" stroke-width="1.3"/>')
    p.append(f'<circle cx="66" cy="510" r="4.4" fill="{f["warn"]}"/>')
    p.append(svg_text(78, 514,
                      "hit · ×2 code twice · row 7 excluded · sorted by row",
                      14, f["faint"], limit=540, tag="m.foot"))

    # --------------------------------------------------------- summary card
    p.append(f'<g filter="url(#soft)"><rect x="656" y="308" width="404" height="220" rx="20" fill="{f["card"]}" stroke="{f["edge"]}" stroke-width="1.5"/></g>')
    p.append(svg_text(676, 332, "summary · needs_review", 16, f["text"],
                      bold=True, limit=240, tag="sum.name"))
    p.append(svg_text(1040, 334, "3 blocking", 14, f["warn"], bold=True,
                      anchor="end", limit=110, tag="sum.blocking"))
    p.append(f'<line x1="676" y1="344" x2="1040" y2="344" stroke="{f["grid"]}" stroke-width="1.3"/>')
    p.append(svg_text(676, 364, "period_amount ¥", 14, f["faint"], limit=160,
                      tag="sum.plabel"))
    p.append(svg_text(1040, 364, "5,076,360 cents", 14, f["faint"],
                      anchor="end", limit=160, tag="sum.pcents"))
    p.append(svg_text(676, 396, PERIOD, 30, f["text"], bold=True, limit=200,
                      tag="sum.period"))
    p.append(svg_text(676, 418, "declared 51,627.60 · price_adj −864.00", 14,
                      f["sub"], limit=364, tag="sum.declared"))
    p.append(f'<line x1="676" y1="430" x2="1040" y2="430" stroke="{f["grid"]}" stroke-width="1.3"/>')
    p.append(svg_text(676, 452, "cumulative 614,145.00", 14, f["sub"],
                      limit=190, tag="sum.cum"))
    p.append(svg_text(1040, 452, "contract 725,750.00", 14, f["sub"],
                      anchor="end", limit=190, tag="sum.contract"))
    p.append(svg_text(676, 472, "cum_ratio", 14, f["faint"], limit=90,
                      tag="sum.rlabel"))
    p.append(svg_text(1040, 474, RATIO_TXT, 20, f["accent"], bold=True,
                      anchor="end", limit=100, tag="sum.ratio"))
    p.append(f'<rect x="676" y="480" width="364" height="12" rx="6" fill="{f["track"]}"/>')
    p.append(f'<rect x="676" y="480" width="{round(364 * RATIO)}" height="12" rx="6" fill="{f["accent"]}"/>')
    p.append(f'<line x1="1040" y1="476" x2="1040" y2="496" stroke="{f["faint"]}" stroke-width="2"/>')
    p.append(svg_text(676, 510, "status needs_review · dup rows 1 · issues 3", 14,
                      f["faint"], limit=364, tag="sum.foot"))

    # chevron: matrix -> summary
    p.append(f'<path d="M642 394 L652 400 L642 406" fill="none" stroke="{f["accent"]}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>')

    # ------------------------------------------------------- export rail
    for ax in (340, 858):
        p.append(f'<line x1="{ax}" y1="530" x2="{ax}" y2="536" stroke="{f["accent"]}" stroke-width="2" opacity=".55"/>')
        p.append(f'<path d="M{ax - 5} 535 L{ax + 5} 535 L{ax} 541 Z" fill="{f["accent"]}" opacity=".7"/>')
    p.append(f'<g filter="url(#soft)"><rect x="40" y="542" width="1020" height="88" rx="18" fill="{f["card"]}" stroke="{f["edge"]}" stroke-width="1.5"/></g>')
    p.append(svg_text(60, 570, "progress_export · R1", 17, f["accent"],
                      bold=True, limit=210, tag="export.name"))
    p.append(svg_text(280, 570,
                      "worksheet CSV · 8 rows (header + 7) · 1,291 B · UTF-8 BOM",
                      14, f["text"], limit=500, tag="export.facts"))
    p.append(svg_text(1040, 570, "sha256 24cca857…", 14, f["faint"],
                      anchor="end", limit=140, tag="export.sha"))
    p.append(svg_text(60, 596,
                      "$DSH_HOME/dsh-progress-payment/exports/progress-audit-2026-10.csv",
                      14, f["sub"], limit=560, tag="export.path"))
    p.append(svg_text(1040, 596, "source CSV never modified", 14, f["faint"],
                      anchor="end", limit=230, tag="export.note"))
    p.append(svg_text(60, 618,
                      "issues · E_PROGRESS_OVER_QTY row 4 · E_PROGRESS_PRICE_MISMATCH row 6 · E_PROGRESS_DUP_ITEM row 7",
                      14, f["sub"], limit=840, tag="export.issues"))

    # ------------------------------------------------------------- footer
    p.append(svg_text(44, 648,
                      "period = qty × baseline price, half-up to cents · ratio = cumulative ÷ contract × 100 · duplicate row → counted=no",
                      14, f["faint"], limit=1000, tag="footer"))
    p.append("</svg>")

    path = os.path.join(OUT, f"dsh-progress-payment-flow-v5-{skin_name}.svg")
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(p) + "\n")
    print(f"wrote {os.path.basename(path)}")


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for skin_name in ("light", "dark"):
        for lang in ("zh", "en"):
            hero(lang, skin_name)
        flow_svg(skin_name)
    if WARNINGS:
        print(f"{len(WARNINGS)} layout warning(s)")
    print(f"{PERIOD_CENTS} cents = {PERIOD} CNY · ratio {RATIO_TXT}")


if __name__ == "__main__":
    main()
