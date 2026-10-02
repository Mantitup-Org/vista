"""Repair hero bust PNGs: solid interiors + proper transparent cutouts."""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "public"


def flood_outside(w: int, h: int, is_bg) -> bytearray:
    outside = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def push(x: int, y: int) -> None:
        i = y * w + x
        if outside[i] or not is_bg(x, y):
            return
        outside[i] = 1
        q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                push(nx, ny)
    return outside


def sample_neighbors(px: bytearray, w: int, h: int, x: int, y: int, min_a: int = 250):
    """Average nearby solid pixels for a seamless patch."""
    rs = gs = bs = n = 0
    for r in range(1, 36):
        for dy in range(-r, r + 1):
            xs = (-r, r) if abs(dy) != r else range(-r, r + 1)
            for dx in xs:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    i = (ny * w + nx) * 4
                    if px[i + 3] >= min_a:
                        rs += px[i]
                        gs += px[i + 1]
                        bs += px[i + 2]
                        n += 1
        if n >= 8:
            break
    if n == 0:
        return 196, 196, 196
    return rs // n, gs // n, bs // n


def fill_internal_holes(img: Image.Image, alpha_cut: int = 250):
    """Fill cutout holes trapped inside the silhouette (not the outer bg)."""
    img = img.convert("RGBA")
    w, h = img.size
    px = bytearray(img.tobytes())

    def is_soft(x: int, y: int) -> bool:
        return px[(y * w + x) * 4 + 3] < alpha_cut

    outside = flood_outside(w, h, is_soft)
    filled = 0

    for y in range(h):
        for x in range(w):
            i = (y * w + x) * 4
            a = px[i + 3]
            idx = y * w + x

            if outside[idx]:
                # Keep true exterior cutout hard-transparent
                if a < alpha_cut:
                    px[i + 3] = 0
                continue

            if a >= 255:
                continue

            # Soft / clear pixel enclosed by marble → inpaint solid
            r, g, b = sample_neighbors(px, w, h, x, y)
            px[i] = r
            px[i + 1] = g
            px[i + 2] = b
            px[i + 3] = 255
            filled += 1

    return Image.frombytes("RGBA", (w, h), bytes(px)), filled


def remove_black_bg(img: Image.Image, thresh: int = 30):
    img = img.convert("RGBA")
    w, h = img.size
    px = bytearray(img.tobytes())

    def is_bg(x: int, y: int) -> bool:
        i = (y * w + x) * 4
        r, g, b = px[i], px[i + 1], px[i + 2]
        return r <= thresh and g <= thresh and b <= thresh and max(r, g, b) - min(r, g, b) <= 8

    outside = flood_outside(w, h, is_bg)
    removed = 0
    for y in range(h):
        for x in range(w):
            if outside[y * w + x]:
                px[(y * w + x) * 4 + 3] = 0
                removed += 1

    return Image.frombytes("RGBA", (w, h), bytes(px)), removed


def summarize(path: Path) -> None:
    im = Image.open(path).convert("RGBA")
    data = im.tobytes()
    tot = im.size[0] * im.size[1]
    opaque = sum(1 for i in range(3, len(data), 4) if data[i] >= 250)
    clear = sum(1 for i in range(3, len(data), 4) if data[i] == 0)
    soft = tot - opaque - clear
    print(f"{path.name}: opaque={opaque} clear={clear} soft={soft} size={im.size}")


def main() -> None:
    marble_path = ROOT / "greek-bust.png"
    skel_path = ROOT / "greek-bust-skeleton.png"

    if not marble_path.with_suffix(".png.bak").exists():
        marble_path.with_suffix(".png.bak").write_bytes(marble_path.read_bytes())
    if not skel_path.with_suffix(".png.bak").exists():
        skel_path.with_suffix(".png.bak").write_bytes(skel_path.read_bytes())

    marble = Image.open(marble_path)
    marble_fixed, n1 = fill_internal_holes(marble, alpha_cut=250)
    marble_fixed.save(marble_path, "PNG", optimize=True)
    print(f"marble filled={n1}")

    skel = Image.open(skel_path)
    skel_cut, removed = remove_black_bg(skel, thresh=30)
    skel_fixed, n2 = fill_internal_holes(skel_cut, alpha_cut=250)
    skel_fixed.save(skel_path, "PNG", optimize=True)
    print(f"skeleton removed_bg={removed} filled={n2}")

    debug = ROOT / "_bust-holes-debug.png"
    if debug.exists():
        debug.unlink()

    summarize(marble_path)
    summarize(skel_path)


if __name__ == "__main__":
    main()
