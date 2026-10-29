#!/usr/bin/env python3
"""Generate Android launcher icons from assets/icon-512.png.

Android 8+ expects an *adaptive* icon: a background layer plus a foreground
layer, where only the middle 66% of the foreground is guaranteed visible (the
launcher may crop it to a circle, squircle or teardrop). Shipping a flat square
PNG means the logo gets clipped or floats in a white box on most modern phones.

So this produces:
  mipmap-*/ic_launcher.png              legacy square (pre-Android 8)
  mipmap-*/ic_launcher_round.png        legacy round
  mipmap-*/ic_launcher_foreground.png   transparent W, inside the safe zone
  values/ic_launcher_background.xml     the background colour

Deliberately dependency-free: the CI runner has no Pillow, and a build step that
needs `pip install` is a build step that breaks. Only zlib/struct are used, and
the PNG reader covers what an icon file can realistically be (8-bit grey, RGB,
RGBA, or palette).

Usage: python3 scripts/gen-android-icons.py <res-dir> [source.png]
"""
import os
import struct
import sys
import zlib

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
DARK_CUTOFF = 46        # source luminance at or below this is "background"
RAMP = 110.0            # luminance span of the alpha ramp


# --------------------------------------------------------------------------
# minimal PNG I/O
# --------------------------------------------------------------------------
def read_png(path):
    """Return (width, height, rgba bytes) for an 8-bit non-interlaced PNG."""
    data = open(path, 'rb').read()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('not a PNG: %s' % path)
    pos = 8
    idat = []
    palette = b''
    width = height = depth = ctype = 0
    while pos < len(data):
        (length,) = struct.unpack('>I', data[pos:pos + 4])
        kind = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if kind == b'IHDR':
            width, height, depth, ctype, _comp, _filt, interlace = \
                struct.unpack('>IIBBBBB', body)
            if depth != 8:
                raise ValueError('only 8-bit PNGs supported (got %d)' % depth)
            if interlace:
                raise ValueError('interlaced PNGs are not supported')
        elif kind == b'PLTE':
            palette = body
        elif kind == b'IDAT':
            idat.append(body)
        elif kind == b'IEND':
            break

    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}.get(ctype)
    if channels is None:
        raise ValueError('unsupported PNG colour type %d' % ctype)

    raw = zlib.decompress(b''.join(idat))
    stride = width * channels
    out = bytearray(width * height * 4)
    prev = bytearray(stride)
    pos = 0
    for y in range(height):
        ftype = raw[pos]
        pos += 1
        line = bytearray(raw[pos:pos + stride])
        pos += stride
        # undo the per-scanline filter
        if ftype == 1:
            for i in range(channels, stride):
                line[i] = (line[i] + line[i - channels]) & 0xFF
        elif ftype == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif ftype == 3:
            for i in range(stride):
                left = line[i - channels] if i >= channels else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif ftype == 4:
            for i in range(stride):
                a = line[i - channels] if i >= channels else 0
                b = prev[i]
                c = prev[i - channels] if i >= channels else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 0xFF
        elif ftype != 0:
            raise ValueError('bad PNG filter %d' % ftype)
        prev = line

        row = y * width * 4
        for x in range(width):
            i = x * channels
            if ctype == 6:
                r, g, b, a = line[i], line[i + 1], line[i + 2], line[i + 3]
            elif ctype == 2:
                r, g, b = line[i], line[i + 1], line[i + 2]
                a = 255
            elif ctype == 0:
                r = g = b = line[i]
                a = 255
            elif ctype == 4:
                r = g = b = line[i]
                a = line[i + 1]
            else:  # palette
                pi = line[i] * 3
                r, g, b = palette[pi], palette[pi + 1], palette[pi + 2]
                a = 255
            o = row + x * 4
            out[o] = r
            out[o + 1] = g
            out[o + 2] = b
            out[o + 3] = a
    return width, height, bytes(out)


def write_png(path, width, height, rgba):
    """Write 8-bit RGBA, no filtering, maximum compression."""
    stride = width * 4
    raw = bytearray()
    for y in range(height):
        raw.append(0)                       # filter type 0 (None)
        raw += rgba[y * stride:(y + 1) * stride]

    def chunk(kind, body):
        return (struct.pack('>I', len(body)) + kind + body
                + struct.pack('>I', zlib.crc32(kind + body) & 0xFFFFFFFF))

    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as fh:
        fh.write(png)


def resize(src_w, src_h, src, dst_w, dst_h):
    """Box-average downscale to (dst_w, dst_h); area sampling keeps the neon
    strokes from aliasing into dots at 48px."""
    dst = bytearray(dst_w * dst_h * 4)
    for dy in range(dst_h):
        y0 = dy * src_h / dst_h
        y1 = (dy + 1) * src_h / dst_h
        for dx in range(dst_w):
            x0 = dx * src_w / dst_w
            x1 = (dx + 1) * src_w / dst_w
            r = g = b = a = n = 0
            for sy in range(int(y0), max(int(y0) + 1, int(y1 + 0.999))):
                if sy >= src_h:
                    break
                base = sy * src_w * 4
                for sx in range(int(x0), max(int(x0) + 1, int(x1 + 0.999))):
                    if sx >= src_w:
                        break
                    o = base + sx * 4
                    pa = src[o + 3]
                    # premultiply so transparent pixels do not darken the edge
                    r += src[o] * pa
                    g += src[o + 1] * pa
                    b += src[o + 2] * pa
                    a += pa
                    n += 1
            o = (dy * dst_w + dx) * 4
            if a:
                dst[o] = min(255, r // a)
                dst[o + 1] = min(255, g // a)
                dst[o + 2] = min(255, b // a)
                dst[o + 3] = a // max(1, n)
            # else leave fully transparent
    return bytes(dst)


# --------------------------------------------------------------------------
# icon layers
# --------------------------------------------------------------------------
def key_out_background(width, height, rgba):
    """Return the neon artwork on a transparent background.

    The source is bright strokes on a dark grid. A luminance ramp keeps the
    anti-aliased edges instead of leaving a hard jagged cut-out.
    """
    out = bytearray(width * height * 4)
    for i in range(0, len(rgba), 4):
        r, g, b, a = rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]
        lum = max(r, g, b)
        if lum <= DARK_CUTOFF:
            continue
        alpha = min(255, int((lum - DARK_CUTOFF) / RAMP * 255))
        if alpha <= 2:
            continue
        out[i] = r
        out[i + 1] = g
        out[i + 2] = b
        out[i + 3] = min(a, alpha)
    return bytes(out)


def fit_into(src_w, src_h, src, canvas_px, coverage):
    """Scale `src` so its longest side is `coverage` of the canvas, centred."""
    target = max(1, int(round(canvas_px * coverage)))
    scale = target / float(max(src_w, src_h))
    w = max(1, int(round(src_w * scale)))
    h = max(1, int(round(src_h * scale)))
    small = resize(src_w, src_h, src, w, h)
    canvas = bytearray(canvas_px * canvas_px * 4)
    ox = (canvas_px - w) // 2
    oy = (canvas_px - h) // 2
    for y in range(h):
        dst = ((oy + y) * canvas_px + ox) * 4
        src_row = y * w * 4
        canvas[dst:dst + w * 4] = small[src_row:src_row + w * 4]
    return bytes(canvas)


def circle_mask(width, height, rgba):
    out = bytearray(rgba)
    r = width / 2.0
    cx = cy = r
    for y in range(height):
        for x in range(width):
            if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r:
                out[(y * width + x) * 4 + 3] = 0
    return bytes(out)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    res = sys.argv[1]
    src = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'assets', 'icon-512.png')

    if not os.path.isfile(src):
        sys.exit('ERROR: source icon not found: %s' % src)

    sw, sh, base = read_png(src)
    artwork = key_out_background(sw, sh, base)

    # background tint taken from the icon's own corner, so the adaptive icon
    # matches the artwork instead of guessing a colour
    c = base[(4 * sw + 4) * 4:(4 * sw + 4) * 4 + 3]
    bg_hex = '#%02x%02x%02x' % (c[0], c[1], c[2])

    written = 0
    for name, scale in DENSITIES.items():
        d = os.path.join(res, 'mipmap-' + name)
        os.makedirs(d, exist_ok=True)

        legacy = int(round(LEGACY_DP * scale))
        square = resize(sw, sh, base, legacy, legacy)
        write_png(os.path.join(d, 'ic_launcher.png'), legacy, legacy, square)
        write_png(os.path.join(d, 'ic_launcher_round.png'), legacy, legacy,
                  circle_mask(legacy, legacy, square))

        # adaptive foreground: artwork only, inside the guaranteed safe zone
        fg = int(round(FOREGROUND_DP * scale))
        write_png(os.path.join(d, 'ic_launcher_foreground.png'), fg, fg,
                  fit_into(sw, sh, artwork, fg, SAFE_ZONE))
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
