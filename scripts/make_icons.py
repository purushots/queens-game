#!/usr/bin/env python3
"""Generate Queens PWA icons — a gold crown on the brand-blue tile, stdlib only.

Renders a filled crown (supersampled polygon for anti-aliasing) on a rounded
blue square, and writes raw RGBA PNGs with zlib/struct (no imaging libraries).

Outputs (relative to repo root):
  icons/icon-192.png          192x192, rounded-square with transparent corners
  icons/icon-512.png          512x512, rounded-square with transparent corners
  icons/apple-touch-icon.png  180x180, full-bleed opaque (iOS applies its mask)
"""
import math
import os
import struct
import zlib

BLUE = (67, 97, 238)     # #4361EE brand
GOLD = (247, 220, 111)   # #F7DC6F crown

# Crown silhouette in normalised coords (x right, y down), clockwise.
CROWN = [
    (0.20, 0.74), (0.80, 0.74), (0.80, 0.40),
    (0.645, 0.55), (0.50, 0.33), (0.355, 0.55), (0.20, 0.40),
]
# Jewel dots along the base band.
JEWELS = [(0.32, 0.685), (0.50, 0.685), (0.68, 0.685)]


def sd_rounded_rect(x, y, c, half, r):
    dx = abs(x - c) - (half - r)
    dy = abs(y - c) - (half - r)
    return math.hypot(max(dx, 0.0), max(dy, 0.0)) + min(max(dx, dy), 0.0) - r


def coverage(d):
    return max(0.0, min(1.0, 0.5 - d))


def point_in_poly(px, py, poly):
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def crown_cov(x, y, S, poly_px, jewels_px, jr):
    """Supersampled coverage of the crown (minus jewel holes) at pixel (x,y)."""
    SS = 4
    hit = 0
    for sy in range(SS):
        for sx in range(SS):
            px = x + (sx + 0.5) / SS
            py = y + (sy + 0.5) / SS
            if not point_in_poly(px, py, poly_px):
                continue
            in_jewel = False
            for jx, jy in jewels_px:
                if math.hypot(px - jx, py - jy) < jr:
                    in_jewel = True
                    break
            if not in_jewel:
                hit += 1
    return hit / (SS * SS)


def render(size, rounded_bg):
    S = float(size)
    c = S / 2.0
    corner = 0.225 * S
    poly_px = [(x * S, y * S) for (x, y) in CROWN]
    jewels_px = [(x * S, y * S) for (x, y) in JEWELS]
    jr = 0.028 * S

    rows = []
    for j in range(size):
        y = float(j)
        row = bytearray()
        for i in range(size):
            x = float(i)
            a_bg = coverage(sd_rounded_rect(x + 0.5, y + 0.5, c, S / 2.0, corner)) if rounded_bg else 1.0
            cov = crown_cov(x, y, S, poly_px, jewels_px, jr)
            r = BLUE[0] * (1 - cov) + GOLD[0] * cov
            g = BLUE[1] * (1 - cov) + GOLD[1] * cov
            b = BLUE[2] * (1 - cov) + GOLD[2] * cov
            row += bytes((int(r + 0.5), int(g + 0.5), int(b + 0.5), int(a_bg * 255 + 0.5)))
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body))

    raw = b''.join(b'\x00' + r for r in rows)
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)


def main():
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
    os.makedirs(out, exist_ok=True)
    for name, size, rounded in (
        ('icon-192.png', 192, True),
        ('icon-512.png', 512, True),
        ('apple-touch-icon.png', 180, False),
    ):
        path = os.path.join(out, name)
        write_png(path, size, render(size, rounded))
        print('wrote', os.path.normpath(path))


if __name__ == '__main__':
    main()
