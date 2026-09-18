#!/usr/bin/env python3
"""Builds the app icons from the concept art in evidence/gpt.

The plain icons come from the cat face on a transparent ground; the maskable and Apple
touch icons come from the framed version on the dark green ground, which already leaves
the safe-area margin those formats want. Run from the repository root:

    python3 scripts/make-icons.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FACE = ROOT / 'evidence/gpt/iconnobg.png'
FRAMED = ROOT / 'evidence/gpt/web icon.png'
OUT = ROOT / 'public'


def square(image: Image.Image, pad: float) -> Image.Image:
    """Trims to the drawn pixels, then pads to a square with the given margin ratio."""
    box = image.getbbox()
    cropped = image.crop(box)
    side = int(max(cropped.size) * (1 + pad))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(cropped, ((side - cropped.width) // 2, (side - cropped.height) // 2), cropped)
    return canvas


def main() -> None:
    face = square(Image.open(FACE).convert('RGBA'), 0.12)
    face.resize((512, 512), Image.LANCZOS).save(OUT / 'icon-512.png', optimize=True)
    face.resize((192, 192), Image.LANCZOS).save(OUT / 'icon-192.png', optimize=True)
    framed = Image.open(FRAMED).convert('RGB')
    side = min(framed.size)
    framed = framed.crop(((framed.width - side) // 2, (framed.height - side) // 2, (framed.width + side) // 2, (framed.height + side) // 2))
    framed.resize((512, 512), Image.LANCZOS).save(OUT / 'icon-maskable-512.png', optimize=True)
    framed.resize((180, 180), Image.LANCZOS).save(OUT / 'apple-touch-icon.png', optimize=True)
    for name in ['icon-512.png', 'icon-192.png', 'icon-maskable-512.png', 'apple-touch-icon.png']:
        print(name, Image.open(OUT / name).size, (OUT / name).stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
