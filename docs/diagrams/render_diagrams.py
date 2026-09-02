#!/usr/bin/env python3
"""Render the engineering diagrams embedded in Finite's public documentation."""

from pathlib import Path
from textwrap import wrap

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "media"
OUT.mkdir(parents=True, exist_ok=True)

PAPER = "#f4efe7"
WHITE = "#fffdf8"
INK = "#102a24"
GREEN = "#174b3f"
GREEN_2 = "#2d6658"
MINT = "#d9f45f"
CORAL = "#ef5538"
TEAL = "#2c9aa0"
MUTED = "#728980"
LINE = "#8aa198"

def first_font(*paths: str) -> str:
    for path in paths:
        if Path(path).exists():
            return path
    raise FileNotFoundError(f"No supported documentation font found: {paths}")


REGULAR = first_font(
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
)
BOLD = first_font(
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
)
MONO = first_font(
    "/System/Library/Fonts/SFNSMono.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
)


def font(size: int, bold: bool = False, mono: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(MONO if mono else BOLD if bold else REGULAR, size)


def canvas(width: int, height: int, eyebrow: str, title: str, subtitle: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGB", (width, height), PAPER)
    draw = ImageDraw.Draw(image)
    draw.text((72, 50), eyebrow.upper(), font=font(22, mono=True), fill=CORAL)
    draw.text((72, 92), title, font=font(44, bold=True), fill=INK)
    draw.text((74, 152), subtitle, font=font(24), fill=GREEN_2)
    return image, draw


def box(draw: ImageDraw.ImageDraw, xy: tuple[int, int, int, int], title: str, body: str = "", *, fill: str = WHITE, outline: str = GREEN, accent: str = MINT, title_size: int = 26, body_size: int = 19) -> None:
    x0, y0, x1, y1 = xy
    draw.rounded_rectangle(xy, radius=20, fill=fill, outline=outline, width=3)
    draw.rounded_rectangle((x0 + 20, y0 + 20, x0 + 34, y1 - 20), radius=7, fill=accent)
    draw.text((x0 + 56, y0 + 28), title, font=font(title_size, bold=True), fill=INK)
    if body:
        lines = []
        width = max(18, int((x1 - x0 - 85) / (body_size * 0.55)))
        for paragraph in body.split("\n"):
            lines.extend(wrap(paragraph, width=width) or [""])
        draw.multiline_text((x0 + 56, y0 + 74), "\n".join(lines), font=font(body_size), fill=GREEN_2, spacing=7)


def arrow(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int], *, colour: str = GREEN_2, width: int = 5, label: str = "") -> None:
    draw.line((*start, *end), fill=colour, width=width)
    x1, y1 = end
    x0, y0 = start
    if abs(x1 - x0) >= abs(y1 - y0):
        direction = 1 if x1 > x0 else -1
        points = [(x1, y1), (x1 - direction * 18, y1 - 11), (x1 - direction * 18, y1 + 11)]
    else:
        direction = 1 if y1 > y0 else -1
        points = [(x1, y1), (x1 - 11, y1 - direction * 18), (x1 + 11, y1 - direction * 18)]
    draw.polygon(points, fill=colour)
    if label:
        bbox = draw.textbbox((0, 0), label, font=font(17, mono=True))
        tx = (x0 + x1 - (bbox[2] - bbox[0])) / 2
        ty = (y0 + y1) / 2 - 30
        draw.rounded_rectangle((tx - 10, ty - 5, tx + bbox[2] - bbox[0] + 10, ty + 27), radius=8, fill=PAPER)
        draw.text((tx, ty), label, font=font(17, mono=True), fill=colour)


def footer(draw: ImageDraw.ImageDraw, width: int, height: int, text: str) -> None:
    draw.line((72, height - 72, width - 72, height - 72), fill=LINE, width=2)
    draw.text((72, height - 52), text, font=font(17, mono=True), fill=MUTED)


def decision_transaction() -> None:
    image, draw = canvas(1800, 760, "Versioned decision transaction", "Reality can change without silently changing the plan.", "Codex does the work. The person creates consequential authority.")
    labels = [
        ("ACCEPTED V1", "Canonical plan\nrevision 1", GREEN),
        ("NEW PRESSURE", "Change recorded\ntruth unchanged", CORAL),
        ("BOUNDED SEARCH", "26 tested\n18 fit · 8 fail", TEAL),
        ("CLEAR CHOICES", "3 distinct routes\ntrade-offs visible", GREEN_2),
        ("HUMAN AUTHORITY", "Exact option\nexact revision", MINT),
        ("ACCEPTED V2", "Apply once\nreceipt + replay", GREEN),
    ]
    x_positions = [70, 365, 660, 955, 1250, 1515]
    widths = [240, 240, 240, 240, 240, 215]
    y0, y1 = 285, 540
    for index, ((title, body, accent), x0, w) in enumerate(zip(labels, x_positions, widths)):
        box(draw, (x0, y0, x0 + w, y1), title, body, accent=accent, title_size=20, body_size=18)
        if index < len(labels) - 1:
            arrow(draw, (x0 + w + 8, 412), (x_positions[index + 1] - 10, 412), colour=GREEN_2)
    draw.rounded_rectangle((1240, 582, 1740, 646), radius=16, fill=INK)
    draw.text((1292, 602), "No human approval tool exists", font=font(21, bold=True), fill=MINT)
    footer(draw, 1800, 760, "REVISION-BOUND · AUTHORITY-BOUND · IDEMPOTENT")
    image.save(OUT / "diagram-decision-transaction.png", optimize=True)


def system_architecture() -> None:
    image, draw = canvas(1800, 900, "System architecture", "One visible plan for people and Codex.", "Finite owns deterministic state and persistence. Codex remains the operator.")

    lanes = [
        (60, 250, 430, 765, "HUMAN BOUNDARY", "#e7f1bd"),
        (485, 250, 1245, 765, "BROWSER DOCUMENT", "#dce9e4"),
        (1300, 250, 1740, 765, "DURABLE LAYER", "#f8ded7"),
    ]
    for x0, y0, x1, y1, label, fill_colour in lanes:
        draw.rounded_rectangle((x0, y0, x1, y1), radius=26, fill=fill_colour, outline=GREEN, width=2)
        draw.text((x0 + 28, y0 + 24), label, font=font(18, mono=True), fill=GREEN)

    box(draw, (95, 335, 395, 475), "PERSON", "Outcome · edits\nchoice · confirmation", accent=MINT, title_size=24, body_size=17)
    box(draw, (95, 550, 395, 685), "CODEX", "External operator\ntyped page tools", accent=CORAL, title_size=24, body_size=17)

    box(draw, (530, 325, 835, 470), "VISIBLE UI", "Adaptive human\nplanning surface", accent=MINT, title_size=22, body_size=17)
    box(draw, (885, 325, 1200, 470), "WEBMCP", "Stable dispatcher\nbounded manifests", accent=CORAL, title_size=22, body_size=17)
    box(draw, (705, 550, 1025, 695), "FINITE KERNEL", "Validation · search\nrevision · receipts", accent=TEAL, title_size=22, body_size=17)

    box(draw, (1340, 335, 1700, 480), "CLOUDFLARE WORKER", "Authenticated APIs\nretry-safe coordination", accent=CORAL, title_size=21, body_size=17)
    box(draw, (1340, 555, 1500, 690), "D1", "Accepted\ntruth", accent=GREEN, title_size=24, body_size=17)
    box(draw, (1540, 555, 1700, 690), "R2", "Files and\nevidence", accent=TEAL, title_size=24, body_size=17)

    arrow(draw, (395, 405), (530, 405), label="VISIBLE")
    arrow(draw, (395, 617), (885, 417), label="TYPED TOOLS")
    arrow(draw, (682, 470), (790, 550))
    arrow(draw, (1042, 470), (940, 550))
    arrow(draw, (1025, 622), (1340, 420), label="VERSIONED")
    arrow(draw, (1520, 480), (1420, 555))
    arrow(draw, (1560, 480), (1620, 555))
    footer(draw, 1800, 900, "NO BACKEND LANGUAGE MODEL · NO APPLICATION-OWNED AGENT")
    image.save(OUT / "diagram-system-architecture.png", optimize=True)


def webmcp_surface() -> None:
    image, draw = canvas(1800, 720, "WebMCP operating surface", "Stable discovery. Bounded action manifests.", "Exact semantic paths replace copied context and pixel guessing.")
    nodes = [
        ("STATUS", "Bootstrap readiness"),
        ("ENTER", "Canonical state\n+ next action"),
        ("OPEN", "One bounded\ntoolset"),
        ("INVOKE", "Revalidate +\nexecute"),
        ("READ", "Exact omitted\nfields"),
        ("RECEIPT", "Effort + accepted\nmutations"),
    ]
    for i, (title, body) in enumerate(nodes):
        x = 65 + i * 290
        box(draw, (x, 280, x + 235, 505), title, body, accent=[TEAL, MINT, GREEN_2, CORAL, TEAL, GREEN][i], title_size=22, body_size=17)
        if i < len(nodes) - 1:
            arrow(draw, (x + 243, 392), (65 + (i + 1) * 290 - 10, 392))
    draw.rounded_rectangle((535, 555, 1265, 620), radius=16, fill=INK)
    draw.text((682, 575), "HUMAN AUTHORITY IS NOT A PAGE TOOL", font=font(21, bold=True), fill=MINT)
    footer(draw, 1800, 720, "DOCUMENT-SCOPED · TYPED · CONTENT-ADDRESSED")
    image.save(OUT / "diagram-webmcp-surface.png", optimize=True)


def planning_layers() -> None:
    image, draw = canvas(1800, 680, "Planning layers", "Useful work is not automatically accepted truth.", "Each layer has a different authority and persistence contract.")
    nodes = [
        ("OUTCOME", "Human intent"),
        ("INTAKE", "Append-only input"),
        ("DRAFT", "Provisional work"),
        ("OPTIONS", "Validated routes"),
        ("CHOICE", "Human selection"),
        ("ACCEPTED", "Immutable revision"),
        ("RECEIPT", "Durable lineage"),
    ]
    for i, (title, body) in enumerate(nodes):
        x = 55 + i * 250
        accent = CORAL if title == "CHOICE" else MINT if title == "ACCEPTED" else TEAL
        box(draw, (x, 285, x + 205, 480), title, body, accent=accent, title_size=19, body_size=16)
        if i < len(nodes) - 1:
            arrow(draw, (x + 212, 382), (55 + (i + 1) * 250 - 8, 382))
    draw.text((650, 535), "REALITY CHANGES", font=font(19, mono=True), fill=CORAL)
    arrow(draw, (1055, 520), (800, 480), colour=CORAL, label="REPLAN")
    footer(draw, 1800, 680, "PROPOSED ≠ CHOSEN ≠ ACCEPTED")
    image.save(OUT / "diagram-planning-layers.png", optimize=True)


def adaptive_compiler() -> None:
    image, draw = canvas(1800, 800, "Adaptive product compiler", "The planning contract changes the product shape.", "A closed component grammar keeps the system bounded and inspectable.")
    box(draw, (70, 320, 355, 555), "PLANNING CONTRACT", "Time · measures\nentities · actions\ndecision surfaces", accent=CORAL, title_size=21, body_size=18)
    box(draw, (555, 300, 900, 575), "FINITE COMPILER", "Validates one bounded\ncontract and projects\nthe fitting workspace", accent=MINT, title_size=25, body_size=19)
    arrow(draw, (365, 435), (545, 435), label="COMPILE")

    outputs = [
        ("TRAVEL", "Calendar · places · transport", CORAL),
        ("RENOVATION", "Phases · dependencies · handover", GREEN_2),
        ("EVENT", "Run of show · capacity · commitments", TEAL),
        ("GENERAL", "Outcome-specific workspace", GREEN),
    ]
    for i, (title, body, accent) in enumerate(outputs):
        y = 235 + i * 125
        box(draw, (1120, y, 1710, y + 110), title, body, accent=accent, title_size=20, body_size=16)
        arrow(draw, (910, 435), (1110, y + 50), colour=accent)
    footer(draw, 1800, 800, "ONE GRAMMAR · GENUINELY DIFFERENT WORKSPACES")
    image.save(OUT / "diagram-adaptive-compiler.png", optimize=True)


if __name__ == "__main__":
    decision_transaction()
    system_architecture()
    webmcp_surface()
    planning_layers()
    adaptive_compiler()
    print(OUT)
