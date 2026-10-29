#!/usr/bin/env python3
"""Generate Android launcher icons from assets/icon-512.png.

Android 8+ expects an *adaptive* icon: a background layer plus a foreground
layer, where only the middle 66% of the foreground is guaranteed visible (the
launcher may crop it to a circle, squircle or teardrop). Shipping a flat square
PNG means the logo gets clipped or floats in a white box on most modern phones.

So this produces:
  mipmap-*/ic_launcher.png          legacy square (pre-Android 8)
  mipmap-*/ic_launcher_round.png    legacy round
  mipmap-*/ic_launcher_foreground.png   transparent W, inside the safe zone
  values/ic_launcher_background.xml     the background colour

Usage: python3 scripts/gen-android-icons.py <res-dir> [source.png]
"""
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit('ERROR: Pillow is required (pip install pillow)')

# Android density buckets: name -> scale of 1dp
DENSITIES = {
    'mdpi': 1.0,
    'hdpi': 1.5,
    'xhdpi': 2.0,
    'xxhdpi': 3.0,
    'xxxhdpi': 4.0,
}

LEGACY_DP = 48          # legacy launcher icon size
FOREGROUND_DP = 108     # adaptive icon canvas
SAFE_ZONE = 0.66        # fraction of the canvas the launcher guarantees


def key_out_background(img):
    """Return the neon artwork on a transparent background.

    The source is bright strokes on a dark grid. A luminance ramp makes the
    anti-aliased edges survive instead of leaving a hard jagged cut-out.
    """
    img = img.convert('RGBA')
    px = img.load()
    w, h = img.size
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    op = out.load()

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            lum = max(r, g, b)
            # background is roughly 6..40; strokes are 150+.
            if lum <= 46:
                continue
            alpha = int(min(1.0, (lum - 46) / 110.0) * 255)
            if alpha <= 2:
                continue
            op[x, y] = (r, g, b, alpha)
    return out


def fit_into(art, canvas_px, coverage):
    """Scale `art` so its longest side is `coverage` of the canvas, centred."""
    target = int(canvas_px * coverage)
    w, h = art.size
    scale = target / max(w, h)
    resized = art.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    canvas = Image.new('RGBA', (canvas_px, canvas_px), (0, 0, 0, 0))
    canvas.paste(resized, ((canvas_px - resized.width) // 2,
                           (canvas_px - resized.height) // 2), resized)
    return canvas


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    res = sys.argv[1]
    src = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'assets', 'icon-512.png')

    if not os.path.isfile(src):
        sys.exit('ERROR: source icon not found: %s' % src)

    base = Image.open(src).convert('RGBA')
    artwork = key_out_background(base)

    # background tint taken from the icon's own corner, so the adaptive icon
    # matches the artwork instead of guessing a colour
    corner = base.getpixel((4, 4))
    bg_hex = '#%02x%02x%02x' % (corner[0], corner[1], corner[2])

    written = 0
    for name, scale in DENSITIES.items():
        d = os.path.join(res, 'mipmap-' + name)
        os.makedirs(d, exist_ok=True)

        legacy_px = int(round(LEGACY_DP * scale))
        base.convert('RGB').resize((legacy_px, legacy_px), Image.LANCZOS) \
            .save(os.path.join(d, 'ic_launcher.png'), optimize=True)

        # round variant: square artwork clipped to a circle
        circle = Image.new('RGBA', (legacy_px, legacy_px), (0, 0, 0, 0))
        circle.paste(base.convert('RGB').resize((legacy_px, legacy_px), Image.LANCZOS), (0, 0))
        mask = Image.new('L', (legacy_px, legacy_px), 0)
        mpx = mask.load()
        r = legacy_px / 2.0
        for yy in range(legacy_px):
            for xx in range(legacy_px):
                if (xx - r) ** 2 + (yy - r) ** 2 <= r * r:
                    mpx[xx, yy] = 255
        circle.putalpha(mask)
        circle.save(os.path.join(d, 'ic_launcher_round.png'), optimize=True)

        # adaptive foreground: artwork only, inside the guaranteed safe zone
        fg_px = int(round(FOREGROUND_DP * scale))
        fit_into(artwork, fg_px, SAFE_ZONE) \
            .save(os.path.join(d, 'ic_launcher_foreground.png'), optimize=True)
        written += 3

    values = os.path.join(res, 'values')
    os.makedirs(values, exist_ok=True)
    with open(os.path.join(values, 'ic_launcher_background.xml'), 'w') as fh:
        fh.write('<?xml version="1.0" encoding="utf-8"?>\n'
                 '<resources>\n'
                 '    <color name="ic_launcher_background">%s</color>\n'
                 '</resources>\n' % bg_hex)

    print('wrote %d icon files into %s (background %s)' % (written, res, bg_hex))


if __name__ == '__main__':
    main()
