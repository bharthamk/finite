#!/usr/bin/env python3
"""Derive transparent production crops from Finite's accepted ImageGen concept."""

from pathlib import Path

from PIL import Image


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "finite-working-logo-source.png"
PUBLIC = HERE.parent.parent / "public"
PALETTE = (
    (14.0, 64.0, 54.0),   # deep forest
    (50.0, 191.0, 200.0), # cyan connector
    (224.0, 68.0, 33.0),  # coral change node
)


def extract(box: tuple[int, int, int, int], destination: str) -> None:
    source = Image.open(SOURCE).convert("RGB").crop(box)
    output = Image.new("RGBA", source.size)
    pixels = []

    for pixel in source.getdata():
        foreground = min(
            PALETTE,
            key=lambda color: sum((pixel[index] - color[index]) ** 2 for index in range(3)),
        )
        distance = sum((pixel[index] - foreground[index]) ** 2 for index in range(3)) ** 0.5
        opacity = round(max(0.0, min(1.0, (120.0 - distance) / 60.0)) * 255)
        pixels.append(tuple(round(value) for value in foreground) + (opacity,))

    output.putdata(pixels)
    alpha = output.getchannel("A")
    bounds = alpha.getbbox()
    if bounds is None:
        raise RuntimeError(f"No foreground found in {destination}")
    output.crop(bounds).save(PUBLIC / destination, optimize=True)


extract((600, 285, 1380, 550), "finite-wordmark.png")
extract((155, 190, 500, 790), "finite-mark.png")
