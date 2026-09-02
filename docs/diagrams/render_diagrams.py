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
    image, draw = canvas(1800, 800, "A real Finite change", "One request becomes a plan that still works.", "Dates, bookings, budget and priorities are checked together.")
    labels = [
        ("CURRENT PLAN", "18 days\nFlights fixed\nA$500 kept spare", GREEN),
        ("YOUR CHANGE", "3 more Paris nights\nKeep the rest working", CORAL),
        ("PLAN CHECK", "26 possibilities\n18 fit · 8 ruled out", TEAL),
        ("WAYS FORWARD", "5 distinct routes\nfor this change", GREEN_2),
        ("YOUR DIRECTION", "Protect breathing room", MINT),
        ("UPDATED PLAN", "21 days\nFlights fixed\nA$910 spare", GREEN),
    ]
    x_positions = [70, 365, 660, 955, 1250, 1515]
    widths = [240, 240, 240, 240, 240, 215]
    y0, y1 = 285, 555
    for index, ((title, body, accent), x0, w) in enumerate(zip(labels, x_positions, widths)):
        box(draw, (x0, y0, x0 + w, y1), title, body, accent=accent, title_size=19, body_size=16)
        if index < len(labels) - 1:
            arrow(draw, (x0 + w + 8, 420), (x_positions[index + 1] - 10, 420), colour=GREEN_2)
    draw.rounded_rectangle((270, 625, 1530, 698), radius=18, fill=INK)
    draw.text((370, 648), "COMPARE, QUESTION AND REFINE THE DIRECTIONS WITH CODEX", font=font(21, bold=True), fill=MINT)
    draw.text((420, 738), "One direction if one works. Five here because five work.", font=font(20), fill=GREEN_2)
    image.save(OUT / "diagram-change-to-plan.png", optimize=True)


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


def dark_mode_wordmark() -> None:
    source = Image.open(ROOT / "public" / "finite-wordmark.png").convert("RGBA")
    pixels = source.load()
    for y in range(source.height):
        for x in range(source.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue
            if red > 180 and green < 130:
                pixels[x, y] = (red, green, blue, alpha)
            else:
                pixels[x, y] = (255, 253, 248, alpha)
    source.save(OUT / "finite-wordmark-dark.png", optimize=True)


def github_hero() -> None:
    image = Image.new("RGB", (1800, 1060), GREEN)
    draw = ImageDraw.Draw(image)

    draw.text((94, 82), "TRIPS · RENOVATIONS · EVENTS · WORK · CUSTOM PLANS", font=font(19, mono=True), fill=CORAL)
    draw.text((90, 140), "ONE CHANGE.", font=font(56, bold=True), fill=WHITE)
    draw.text((90, 212), "THE WHOLE PLAN CHECKED.", font=font(48, bold=True), fill=MINT)
    draw.multiline_text(
        (94, 342),
        "Ask for a change in plain English. Finite checks\nevery affected date, cost and commitment, then\nbrings back the distinct ways forward that work.",
        font=font(26), fill=WHITE, spacing=12,
    )

    draw.rounded_rectangle((90, 625, 770, 920), radius=30, fill=INK, outline=GREEN_2, width=2)
    draw.text((132, 670), "WHY USE IT?", font=font(20, mono=True), fill=CORAL)
    benefits = [
        "Stop rebuilding the plan",
        "See what else has to move",
        "Keep shaping it with Codex",
    ]
    for index, benefit in enumerate(benefits):
        y = 738 + index * 62
        draw.ellipse((134, y + 5, 150, y + 21), fill=MINT)
        draw.text((172, y), benefit, font=font(25, bold=True), fill=WHITE)

    panel = (855, 60, 1710, 970)
    draw.rounded_rectangle(panel, radius=38, fill=PAPER, outline=LINE, width=3)
    draw.text((915, 112), "A REAL EXAMPLE", font=font(20, mono=True), fill=CORAL)

    draw.text((915, 170), "Your trip is already planned.", font=font(34, bold=True), fill=INK)
    facts = ["18 days", "Flights cannot move", "Keep at least A$500 spare"]
    for index, fact in enumerate(facts):
        x = 915 + (index % 2) * 350
        y = 235 + (index // 2) * 64
        draw.rounded_rectangle((x, y, x + (315 if index < 2 else 665), y + 46), radius=13, fill="#e1e9e5")
        draw.text((x + 18, y + 11), fact, font=font(19, bold=True), fill=GREEN)

    draw.text((915, 373), "Then you ask:", font=font(21, mono=True), fill=GREEN_2)
    draw.rounded_rectangle((915, 418, 1650, 540), radius=24, fill=WHITE, outline=CORAL, width=3)
    draw.multiline_text((950, 450), '"Add three nights in Paris.\nKeep everything else working."', font=font(29, bold=True), fill=INK, spacing=10)

    draw.text((915, 590), "FINITE CHECKS", font=font(19, mono=True), fill=CORAL)
    draw.text((915, 628), "Dates · stays · transport · budget", font=font(24, bold=True), fill=INK)
    draw.line((915, 682, 1650, 682), fill=LINE, width=2)

    draw.text((915, 724), "YOU GET", font=font(19, mono=True), fill=CORAL)
    draw.text((915, 762), "The ways forward that work.", font=font(32, bold=True), fill=INK)
    draw.text((915, 814), "Compare them. Refine them. Keep planning.", font=font(24), fill=GREEN_2)
    draw.rounded_rectangle((915, 875, 1650, 925), radius=14, fill=INK)
    draw.text((1040, 889), "WORK FROM ONE LIVE PLAN WITH CODEX", font=font(18, bold=True), fill=MINT)

    draw.text((90, 990), "ONE PLANNING PARTNER FOR ALL THE CONNECTED PARTS", font=font(20, mono=True), fill="#bcd0c8")
    image.save(OUT / "finite-overview.png", optimize=True)


def restaurant_model() -> None:
    image, draw = canvas(
        1800,
        800,
        "The restaurant model",
        "You shape the outcome. Codex works through it. Finite keeps it together.",
        "WebMCP connects the planning conversation to the same live plan you see.",
    )

    roles = [
        (80, 280, 540, 610, "YOU", "Describe the outcome\nExplain what matters\nKeep refining the plan", CORAL, "DINER"),
        (670, 280, 1130, 610, "CODEX", "Ask questions\nResearch and compare\nWork through changes", TEAL, "CHEF"),
        (1260, 280, 1720, 610, "FINITE", "Hold the live plan\nCheck connected parts\nRecord each revision", MINT, "KITCHEN"),
    ]
    for x0, y0, x1, y1, title, body, accent, role in roles:
        draw.rounded_rectangle((x0, y0, x1, y1), radius=24, fill=WHITE, outline=GREEN, width=3)
        draw.rounded_rectangle((x0 + 24, y0 + 24, x0 + 40, y1 - 24), radius=8, fill=accent)
        draw.text((x0 + 70, y0 + 36), role, font=font(18, mono=True), fill=CORAL)
        draw.text((x0 + 70, y0 + 78), title, font=font(36, bold=True), fill=INK)
        draw.multiline_text((x0 + 70, y0 + 150), body, font=font(23), fill=GREEN_2, spacing=18)

    def double_arrow(x0: int, x1: int, y: int, label: str) -> None:
        draw.line((x0, y, x1, y), fill=GREEN_2, width=5)
        draw.polygon([(x0, y), (x0 + 18, y - 11), (x0 + 18, y + 11)], fill=GREEN_2)
        draw.polygon([(x1, y), (x1 - 18, y - 11), (x1 - 18, y + 11)], fill=GREEN_2)
        bbox = draw.textbbox((0, 0), label, font=font(16, mono=True))
        text_width = bbox[2] - bbox[0]
        tx = (x0 + x1 - text_width) / 2
        draw.rounded_rectangle((tx - 10, y - 46, tx + text_width + 10, y - 16), radius=8, fill=PAPER)
        draw.text((tx, y - 43), label, font=font(16, mono=True), fill=GREEN_2)

    double_arrow(548, 662, 445, "CONVERSATION")
    double_arrow(1138, 1252, 445, "WEBMCP")

    draw.rounded_rectangle((330, 675, 1470, 742), radius=18, fill=INK)
    draw.text((414, 696), "YOU KEEP SHAPING IT · CODEX KEEPS WORKING · FINITE KEEPS IT TOGETHER", font=font(20, bold=True), fill=MINT)
    image.save(OUT / "diagram-restaurant-model.png", optimize=True)


def adaptive_plan_shapes() -> None:
    image = Image.new("RGB", (1800, 1060), PAPER)
    draw = ImageDraw.Draw(image)
    draw.text((72, 50), "ADAPTIVE PLAN SHAPES", font=font(22, mono=True), fill=CORAL)
    draw.text((72, 94), "One system. Each plan takes the shape of the work.", font=font(44, bold=True), fill=INK)
    draw.text((74, 158), "Five examples of different facts, sequences and decisions.", font=font(24), fill=GREEN_2)

    def card(x0: int, y0: int, x1: int, y1: int, label: str, title: str, accent: str) -> None:
        draw.rounded_rectangle((x0, y0, x1, y1), radius=22, fill=WHITE, outline=GREEN, width=3)
        draw.rounded_rectangle((x0 + 22, y0 + 22, x0 + 36, y1 - 22), radius=7, fill=accent)
        draw.text((x0 + 58, y0 + 28), label, font=font(17, mono=True), fill=CORAL)
        draw.text((x0 + 58, y0 + 67), title, font=font(24, bold=True), fill=INK)

    card(70, 245, 570, 555, "TRAVEL", "Route, dates and bookings", CORAL)
    draw.line((138, 405, 500, 405), fill=GREEN_2, width=5)
    for x, place, colour in [(145, "LON", GREEN), (260, "PAR", CORAL), (380, "AMS", GREEN), (495, "BCN", GREEN)]:
        draw.ellipse((x - 9, 396, x + 9, 414), fill=colour)
        draw.text((x - 17, 430), place, font=font(14, mono=True), fill=MUTED)
    draw.text((138, 482), "Flights fixed · 21 days · A$910 spare", font=font(18), fill=GREEN_2)

    card(650, 245, 1150, 555, "RENOVATION", "Phases, dependencies and handover", TEAL)
    phase_rows = [("STRIP-OUT", "DONE", GREEN_2), ("CABINETRY", "FIXED", GREEN_2), ("SURFACES", "REPLAN", CORAL), ("HANDOVER", "PROTECTED", GREEN_2)]
    for index, (phase, state, colour) in enumerate(phase_rows):
        y = 350 + index * 43
        draw.text((718, y), phase, font=font(15, mono=True), fill=GREEN_2)
        draw.text((1040, y), state, font=font(15, mono=True), fill=colour)
        draw.line((718, y + 28, 1082, y + 28), fill="#d8dfda", width=2)

    card(1230, 245, 1730, 555, "EVENT", "Schedule, capacity and commitments", MINT)
    event_rows = [("15:00", "LOAD-IN"), ("18:30", "DOORS"), ("19:30", "PROGRAMME"), ("22:45", "CLOSE")]
    for index, (time, activity) in enumerate(event_rows):
        y = 350 + index * 43
        draw.text((1298, y), time, font=font(15, mono=True), fill=TEAL)
        draw.text((1395, y), activity, font=font(16, mono=True), fill=GREEN_2)
    draw.text((1298, 505), "115 / 120 guests", font=font(18, bold=True), fill=INK)

    card(210, 620, 860, 955, "INTERVIEW", "Role evidence, questions and rehearsal", TEAL)
    draw.text((278, 730), "ROLE NEEDS", font=font(15, mono=True), fill=MUTED)
    draw.text((565, 730), "YOUR EVIDENCE", font=font(15, mono=True), fill=MUTED)
    interview_rows = [("Lead change", "Launch result"), ("Build trust", "Team example"), ("Make decisions", "Trade-off story")]
    for index, (need, evidence) in enumerate(interview_rows):
        y = 774 + index * 46
        draw.text((278, y), need, font=font(18), fill=GREEN_2)
        draw.text((565, y), evidence, font=font(18), fill=GREEN_2)
    draw.rounded_rectangle((278, 902, 790, 932), radius=10, fill="#e6eee9")
    draw.text((440, 908), "REHEARSAL READY", font=font(14, bold=True), fill=GREEN)

    card(940, 620, 1590, 955, "DINNER", "Guests, dietary needs, courses and timing", CORAL)
    dinner_pills = [(1008, 730, 1180, "8 GUESTS"), (1200, 730, 1515, "2 DIETARY NEEDS")]
    for x0, y0, x1, label in dinner_pills:
        draw.rounded_rectangle((x0, y0, x1, y0 + 42), radius=14, fill="#e6eee9")
        draw.text((x0 + 18, y0 + 12), label, font=font(14, bold=True), fill=GREEN)
    dinner_rows = [("18:00", "PREP"), ("19:15", "STARTER"), ("19:45", "MAIN"), ("20:45", "DESSERT")]
    for index, (time, course) in enumerate(dinner_rows):
        y = 805 + index * 35
        draw.text((1008, y), time, font=font(15, mono=True), fill=CORAL)
        draw.text((1110, y), course, font=font(16, mono=True), fill=GREEN_2)

    draw.text((72, 1010), "SAME PLANNING MODEL · DIFFERENT WORKING SHAPE", font=font(18, mono=True), fill=MUTED)
    image.save(OUT / "02-adaptive-system.png", optimize=True)


def webmcp_value() -> None:
    image = Image.new("RGB", (1800, 980), GREEN)
    draw = ImageDraw.Draw(image)
    draw.text((76, 52), "WHY WEBMCP MATTERS", font=font(22, mono=True), fill=CORAL)
    draw.text((76, 96), "The conversation can work on the real plan.", font=font(46, bold=True), fill=WHITE)
    draw.text((78, 160), "Codex can read, compare and continue through Finite instead of stopping at advice.", font=font(24), fill="#d9e5df")

    def panel(x0: int, x1: int, label: str, title: str, accent: str) -> None:
        draw.rounded_rectangle((x0, 245, x1, 820), radius=26, fill=WHITE, outline=GREEN_2, width=3)
        draw.rounded_rectangle((x0 + 24, 270, x0 + 40, 795), radius=8, fill=accent)
        draw.text((x0 + 68, 278), label, font=font(18, mono=True), fill=CORAL)
        draw.text((x0 + 68, 320), title, font=font(28, bold=True), fill=INK)

    panel(70, 525, "YOU + CODEX", "One planning request", CORAL)
    draw.rounded_rectangle((138, 410, 470, 555), radius=18, fill=PAPER, outline=CORAL, width=3)
    draw.multiline_text((164, 430), '"Add three nights in Paris.\nKeep the flights fixed.\nKeep A$500 spare."', font=font(19, bold=True), fill=INK, spacing=9)
    draw.text((138, 625), "Keep questioning, comparing", font=font(20), fill=GREEN_2)
    draw.text((138, 660), "and refining in conversation.", font=font(20), fill=GREEN_2)

    panel(675, 1125, "WEBMCP", "Direct plan actions", TEAL)
    steps = [
        "Read the current plan",
        "Record what changed",
        "Test connected consequences",
        "Return each distinct direction",
        "Continue from the chosen revision",
    ]
    for index, step in enumerate(steps, start=1):
        y = 405 + (index - 1) * 68
        draw.ellipse((742, y, 778, y + 36), fill=TEAL)
        draw.text((754, y + 7), str(index), font=font(15, bold=True), fill=WHITE)
        draw.text((800, y + 5), step, font=font(19), fill=GREEN_2)

    panel(1275, 1730, "FINITE", "A live result", MINT)
    draw.text((1343, 402), "THIS PARIS CHANGE", font=font(16, mono=True), fill=MUTED)
    metrics = [("26", "possibilities tested"), ("18", "fit the plan"), ("8", "ruled out"), ("5", "distinct directions")]
    for index, (number, label) in enumerate(metrics):
        y = 447 + index * 62
        draw.text((1343, y), number, font=font(27, bold=True), fill=INK)
        draw.text((1407, y + 5), label, font=font(18), fill=GREEN_2)
    draw.line((1343, 708, 1660, 708), fill=LINE, width=2)
    draw.text((1343, 740), "21 days · flights fixed · A$910 spare", font=font(18, bold=True), fill=GREEN)

    double_y = 520
    draw.line((535, double_y, 665, double_y), fill=MINT, width=5)
    draw.polygon([(535, double_y), (553, double_y - 11), (553, double_y + 11)], fill=MINT)
    draw.polygon([(665, double_y), (647, double_y - 11), (647, double_y + 11)], fill=MINT)
    draw.line((1135, double_y, 1265, double_y), fill=MINT, width=5)
    draw.polygon([(1135, double_y), (1153, double_y - 11), (1153, double_y + 11)], fill=MINT)
    draw.polygon([(1265, double_y), (1247, double_y - 11), (1247, double_y + 11)], fill=MINT)

    draw.rounded_rectangle((250, 875, 1550, 940), radius=18, fill=INK)
    draw.text((405, 896), "EACH RESULT BECOMES THE NEXT STARTING POINT", font=font(21, bold=True), fill=MINT)
    image.save(OUT / "03-webmcp-operating-seam.png", optimize=True)


if __name__ == "__main__":
    dark_mode_wordmark()
    github_hero()
    restaurant_model()
    adaptive_plan_shapes()
    webmcp_value()
    decision_transaction()
    system_architecture()
    webmcp_surface()
    planning_layers()
    adaptive_compiler()
    print(OUT)
