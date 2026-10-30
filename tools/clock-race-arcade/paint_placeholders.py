"""Paints the TEMPORARY placeholder layers for the Clock Race arcade look.

These are not hand-painted art. They are procedural stand-ins in the right sizes, palette and
spirit (flat gouache fills, wobbly ink, slight ink/paint misregistration, fine cel grain) so the
game can be played and judged while real illustrations are made. Replace any file in
frontend/public/clock-race/arcade/ with a real painting of the same name and size.

Run:  python3 tools/clock-race-arcade/paint_placeholders.py
"""
import math
import os

import cv2
import numpy as np

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'public', 'clock-race', 'arcade')
RNG = np.random.default_rng(1992)

# Palette (sRGB). Primary: faded turquoise, dusty pink, powder blue, warm ivory, soft lavender.
# Secondary: muted coral, pale yellow, pistachio, desaturated navy.
C = {
    'turq': (126, 196, 190), 'turq_d': (92, 160, 158), 'turq_l': (170, 220, 212),
    'pink': (232, 168, 182), 'pink_d': (200, 132, 152), 'pink_l': (246, 204, 212),
    'blue': (172, 202, 226), 'blue_d': (132, 166, 200), 'blue_l': (206, 224, 240),
    'ivory': (246, 236, 214), 'ivory_d': (226, 210, 182), 'cream': (238, 224, 196),
    'lav': (196, 184, 224), 'lav_d': (160, 146, 196),
    'coral': (234, 146, 124), 'yellow': (246, 226, 150), 'pist': (182, 210, 150), 'navy': (70, 84, 116),
    'ink': (58, 52, 70),
}


def bgr(c):
    return (c[2], c[1], c[0])


def lowfreq(h, w, scale, amp):
    """Smooth paint-density noise in [-amp, amp]."""
    small = RNG.normal(0, 1, (max(2, h // scale), max(2, w // scale))).astype(np.float32)
    big = cv2.resize(small, (w, h), interpolation=cv2.INTER_CUBIC)
    big = cv2.GaussianBlur(big, (0, 0), scale / 3)
    return big / (np.abs(big).max() + 1e-6) * amp


class Canvas:
    """Paints at 2x and downsamples, so edges get a slight photographic softness."""

    def __init__(self, w, h, ss=2, alpha=False):
        self.w, self.h, self.ss = w, h, ss
        self.img = np.zeros((h * ss, w * ss, 3), np.float32)
        self.a = np.zeros((h * ss, w * ss), np.float32) if alpha else None

    def P(self, pts, dx=0, dy=0):
        return np.array([[(x + dx) * self.ss, (y + dy) * self.ss] for x, y in pts], np.int32)

    def fill(self, pts, color, density=0.05, scale=60, mis=(0, 0)):
        """Flat gouache fill with uneven density; `mis` shifts the paint against the ink line."""
        mask = np.zeros(self.img.shape[:2], np.uint8)
        cv2.fillPoly(mask, [self.P(wobble(pts, 1.2), *mis)], 255, cv2.LINE_AA)
        x0, y0, bw, bh = cv2.boundingRect(mask)
        if bw == 0 or bh == 0:
            return
        m = mask[y0:y0 + bh, x0:x0 + bw].astype(np.float32)[..., None] / 255
        tone = 1 + lowfreq(bh, bw, max(8, scale * self.ss), density)[..., None]
        col = np.array(bgr(color), np.float32)[None, None, :] * tone
        region = self.img[y0:y0 + bh, x0:x0 + bw]
        region[:] = region * (1 - m) + col * m
        if self.a is not None:
            self.a[y0:y0 + bh, x0:x0 + bw] = np.maximum(self.a[y0:y0 + bh, x0:x0 + bw], m[..., 0])

    def rect(self, x0, y0, x1, y1, color, **kw):
        self.fill([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], color, **kw)

    def line(self, pts, width=3.0, color=C['ink'], closed=False, alpha=0.9):
        """Hand-inked line: wobbling path, thickness that swells and thins along the stroke."""
        pts = list(pts) + ([pts[0]] if closed else [])
        dense = []
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            n = max(2, int(math.hypot(x1 - x0, y1 - y0) / 6))
            for i in range(n):
                t = i / n
                dense.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
        dense.append(pts[-1])
        dense = wobble(dense, 0.9, smooth=7)
        layer = np.zeros(self.img.shape[:2], np.float32)
        phase = RNG.uniform(0, 6)
        for i, ((x0, y0), (x1, y1)) in enumerate(zip(dense, dense[1:])):
            wv = width * (0.78 + 0.34 * (0.5 + 0.5 * math.sin(i / 9 + phase))) * self.ss
            cv2.line(layer, (int(x0 * self.ss), int(y0 * self.ss)), (int(x1 * self.ss), int(y1 * self.ss)), 1.0, max(1, int(round(wv))), cv2.LINE_AA)
        m = (np.clip(layer, 0, 1) * alpha)[..., None]
        self.img = self.img * (1 - m) + np.array(bgr(color), np.float32)[None, None, :] * m
        if self.a is not None:
            self.a = np.maximum(self.a, m[..., 0])

    def glow(self, cx, cy, rx, ry, color, strength=0.35):
        """Soft painted light pool (no neon): a wide, low-contrast airbrush."""
        yy, xx = np.mgrid[0:self.img.shape[0], 0:self.img.shape[1]].astype(np.float32)
        d = ((xx / self.ss - cx) / rx) ** 2 + ((yy / self.ss - cy) / ry) ** 2
        m = (np.exp(-d * 2.2) * strength)[..., None]
        self.img = self.img * (1 - m) + np.array(bgr(color), np.float32)[None, None, :] * m

    def finish(self, grain=2.2, soften=0.55, age=True):
        img = cv2.resize(self.img, (self.w, self.h), interpolation=cv2.INTER_AREA)
        if soften:
            img = cv2.GaussianBlur(img, (0, 0), soften)
        if age:  # slightly aged reproduction: a touch less saturation, a warm cast in the shadows
            g = img.mean(axis=2, keepdims=True)
            img = img * 0.9 + g * 0.1
            img = img * np.array([0.975, 0.99, 1.0], np.float32) + np.array([2, 3, 6], np.float32)
        img = img + RNG.normal(0, grain, img.shape[:2])[..., None].astype(np.float32)  # fine cel grain
        out = np.clip(img, 0, 255).astype(np.uint8)
        if self.a is not None:
            a = cv2.resize(self.a, (self.w, self.h), interpolation=cv2.INTER_AREA)
            out = np.dstack([out, np.clip(a * 255, 0, 255).astype(np.uint8)])
        return out


def wobble(pts, amp, smooth=3):
    """Small, smooth hand tremor along a path."""
    pts = np.array(pts, np.float32)
    if len(pts) < 3:
        return [tuple(p) for p in pts]
    n = RNG.normal(0, amp, pts.shape).astype(np.float32)
    k = np.ones(smooth) / smooth
    n[:, 0] = np.convolve(n[:, 0], k, mode='same')
    n[:, 1] = np.convolve(n[:, 1], k, mode='same')
    return [tuple(p) for p in pts + n]


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


# ------------------------------------------------------------------ A. the room (portrait 1080 x 2340)

def paint_room():
    W, H = 1080, 2340
    cv = Canvas(W, H)
    VP = (540, 1010)                        # vanishing point
    bx0, by0, bx1, by1 = 330, 820, 750, 1230  # back wall
    ceil_y = 0
    floor_y = H

    def to_vp(p, t):
        return lerp(p, VP, t)

    # ceiling: powder-blue panels in perspective
    cv.fill([(0, 0), (W, 0), (bx1, by0), (bx0, by0)], C['blue'], density=0.04, scale=90)
    # side walls: faded turquoise
    cv.fill([(0, 0), (bx0, by0), (bx0, by1), (0, H * 0.78)], C['turq'], density=0.05, scale=80)
    cv.fill([(W, 0), (bx1, by0), (bx1, by1), (W, H * 0.78)], C['turq'], density=0.05, scale=80, mis=(1, -1))
    # floor
    cv.fill([(0, H * 0.78), (bx0, by1), (bx1, by1), (W, H * 0.78), (W, H), (0, H)], C['turq_l'], density=0.05, scale=70)
    # back wall: warm ivory with a lavender band and simple geometric decorations
    cv.rect(bx0, by0, bx1, by1, C['ivory'], density=0.04, scale=50)
    cv.rect(bx0, by0 + 60, bx1, by0 + 120, C['lav'], density=0.05, scale=30, mis=(1, 1))
    for i, col in enumerate([C['coral'], C['yellow'], C['pist'], C['pink'], C['blue_d']]):
        cx = bx0 + 50 + i * 80
        cv.fill([(cx + 22 * math.cos(a), by0 + 168 + 22 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 28, endpoint=False)], col, density=0.06, scale=12)
        cv.line([(cx + 22 * math.cos(a), by0 + 168 + 22 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 28, endpoint=False)], 2.0, closed=True)
    cv.line([(bx0, by0 + 60), (bx1, by0 + 60)], 2.2)
    cv.line([(bx0, by0 + 120), (bx1, by0 + 120)], 2.2)
    # a far doorway glimpse of the pink-purple evening outside (reference 1), small and soft
    # ceiling panel seams + warm fluorescent tubes
    for x in np.linspace(0, W, 9):
        cv.line([(x, 0), to_vp((x, 0), 0.82)], 1.6, color=C['blue_d'], alpha=0.8)
    for t in (0.18, 0.4, 0.58, 0.72):
        y = 0 + (by0 - 0) * t
        xa, xb = lerp((0, 0), (bx0, by0), t)[0], lerp((W, 0), (bx1, by0), t)[0]
        cv.line([(xa, y), (xb, y)], 1.6, color=C['blue_d'], alpha=0.8)
    for t in (0.1, 0.3, 0.5, 0.65):
        y = by0 * t
        half = (1 - t) * 300 + 40
        thick = (1 - t) * 26 + 6
        cv.rect(540 - half, y - thick / 2, 540 + half, y + thick / 2, (252, 246, 226), density=0.02, scale=10)
        cv.line([(540 - half, y - thick / 2), (540 + half, y - thick / 2), (540 + half, y + thick / 2), (540 - half, y + thick / 2)], 1.4, closed=True, alpha=0.6)
    cv.glow(540, 380, 620, 420, (255, 244, 222), 0.22)

    # floor tiles in perspective (turquoise checks)
    rows = 11
    floor_top = by1
    for r in range(rows):
        t0 = (r / rows) ** 1.9
        t1 = ((r + 1) / rows) ** 1.9
        y0 = floor_top + (H - floor_top) * t0
        y1 = floor_top + (H - floor_top) * t1
        for c in range(-6, 7):
            def at(y, c):
                s = (y - VP[1]) / (H - VP[1])
                return VP[0] + c * 210 * s
            quad = [(at(y0, c), y0), (at(y0, c + 1), y0), (at(y1, c + 1), y1), (at(y1, c), y1)]
            if (r + c) % 2 == 0:
                cv.fill(quad, C['turq'], density=0.05, scale=30)
    for c in range(-6, 8):
        s = 1
        cv.line([VP_floor(c, floor_top, VP, H), (VP[0] + c * 210, H)], 1.3, color=C['turq_d'], alpha=0.55)

    # wall skirting
    cv.line([(0, H * 0.78), (bx0, by1), (bx1, by1), (W, H * 0.78)], 3.0)
    cv.line([(0, 0), (bx0, by0), (bx1, by0), (W, 0)], 2.6)
    cv.line([(bx0, by0), (bx0, by1)], 2.6)
    cv.line([(bx1, by0), (bx1, by1)], 2.6)

    # a tidy row of small cabinets against the back wall
    for i in range(4):
        x0 = bx0 + 22 + i * 100
        shell = [C['pink'], C['ivory'], C['lav'], C['pink']][i]
        front_cabinet(cv, x0, by1 + 6, 84, 200, shell, i)
    # cabinets lining both side walls, in one-point perspective
    wall = dict(bx0=bx0, by0=by0, by1=by1, H=H, floor0=H * 0.78)
    # painted stripe bands along both side walls (dusty pink over pale yellow), like 90s game-centre walls
    for side in (-1, 1):
        mx = (lambda x: x) if side < 0 else (lambda x: W - x)
        for h0, h1, col in ((0.74, 0.79, C['pink']), (0.79, 0.815, C['yellow'])):
            band = [(mx(0), wall_y(0, h0, wall)), (mx(bx0), wall_y(bx0, h0, wall)), (mx(bx0), wall_y(bx0, h1, wall)), (mx(0), wall_y(0, h1, wall))]
            cv.fill(band, col, density=0.05, scale=30)
            cv.line(band[:2], 1.8, alpha=0.8)
    for side in (-1, 1):
        for k, (xa, xb) in enumerate(((70, 196), (214, 268), (279, 306))):
            wall_cabinet(cv, side, xa, xb, wall, W, k)

    # slim cream columns at the front edges (they frame the scene)
    for side in (-1, 1):
        x0, x1 = (0, 64) if side < 0 else (W - 64, W)
        cv.rect(x0, 0, x1, H, C['cream'], density=0.05, scale=70, mis=(side, 0))
        edge = x1 if side < 0 else x0
        cv.rect(edge - 12 if side < 0 else edge, 0, edge if side < 0 else edge + 12, H, C['ivory_d'], density=0.05, scale=40)
        cv.line([(edge, 0), (edge, H)], 3.0)
    return cv.finish(grain=2.0, soften=0.6)


def VP_floor(c, floor_top, VP, H):
    s = (floor_top - VP[1]) / (H - VP[1])
    return (VP[0] + c * 210 * s, floor_top)


def wall_y(x, h, w):
    """Left wall: screen y of a point at screen x, at height fraction h (0 floor, 1 ceiling)."""
    f = x / w['bx0']
    yf = w['floor0'] + (w['by1'] - w['floor0']) * f
    yc = w['by0'] * f
    return yf - h * (yf - yc)


def wall_cabinet(cv, side, xa, xb, w, W, k):
    """An upright cabinet against a side wall, facing the aisle (front face recedes to the vanishing point)."""
    mx = (lambda x: x) if side < 0 else (lambda x: W - x)
    s = (xb - xa) * 0.22                         # how far it stands out from the wall, at its near edge
    shell = [C['pink'], C['ivory'], C['pink']][k]
    shell_d = C['pink_d'] if shell == C['pink'] else C['ivory_d']

    def F(x, h):  # a point on the cabinet front, x along the wall (xa..xb)
        t = (x - xa) / (xb - xa)
        return (mx(x + s * (1 - 0.45 * t)), wall_y(x, h, w))

    def quad(x0, x1, h0, h1):
        return [F(x0, h0), F(x1, h0), F(x1, h1), F(x0, h1)]

    top = 0.6
    # near side face (frontal, toward the viewer)
    side_face = [(mx(xa), wall_y(xa, 0, w)), (mx(xa + s), wall_y(xa, 0, w)), (mx(xa + s), wall_y(xa, top, w)), (mx(xa), wall_y(xa, top - 0.02, w))]
    cv.fill(side_face, shell_d, density=0.05, scale=16)
    body = quad(xa, xb, 0, top)
    cv.fill(body, shell, density=0.05, scale=22, mis=(1.2 * -side, -1))
    marquee = quad(xa + (xb - xa) * 0.08, xb - (xb - xa) * 0.08, top - 0.07, top - 0.015)
    cv.fill(marquee, C['yellow'] if k != 1 else C['blue_l'], density=0.06, scale=8)
    screen = quad(xa + (xb - xa) * 0.14, xb - (xb - xa) * 0.14, 0.33, 0.49)
    cv.fill(screen, C['navy'], density=0.08, scale=8)
    inner = quad(xa + (xb - xa) * 0.2, xb - (xb - xa) * 0.2, 0.345, 0.475)
    cv.fill(inner, C['lav'] if k != 1 else C['blue'], density=0.1, scale=6)
    panel = quad(xa - (xb - xa) * 0.02, xb, 0.27, 0.305)
    cv.fill(panel, C['ivory'], density=0.04, scale=8)
    door = quad(xa + (xb - xa) * 0.38, xb - (xb - xa) * 0.38, 0.07, 0.15)
    cv.fill(door, shell_d, density=0.05, scale=6)
    lw = max(1.3, (xb - xa) / 46)
    for q in (body, screen, panel, side_face):
        cv.line(q, lw, closed=True)
    cv.line(marquee, lw * 0.7, closed=True)


def front_cabinet(cv, x0, base, w, h, shell, k):
    """A small cabinet seen straight on, standing against the back wall."""
    shell_d = {C['pink']: C['pink_d'], C['ivory']: C['ivory_d'], C['lav']: C['lav_d']}[shell]
    top = base - h
    cv.rect(x0, top, x0 + w, base, shell, density=0.05, scale=12, mis=(1, -1))
    cv.rect(x0 + 8, top + 8, x0 + w - 8, top + 34, C['yellow'] if k % 2 else C['blue_l'], density=0.05, scale=6)
    scr = rounded(x0 + 12, top + 46, x0 + w - 12, top + 110, 9)
    cv.fill(scr, C['navy'], density=0.08, scale=6)
    cv.fill(rounded(x0 + 17, top + 51, x0 + w - 17, top + 105, 7), C['blue'] if k % 2 else C['lav'], density=0.1, scale=5)
    cv.rect(x0 - 4, top + 124, x0 + w + 4, top + 140, C['ivory'], density=0.04, scale=5)
    cv.rect(x0 + w * 0.36, top + 160, x0 + w * 0.64, top + 190, shell_d, density=0.05, scale=4)
    cv.line([(x0, top), (x0 + w, top), (x0 + w, base), (x0, base)], 1.8, closed=True)
    cv.line(scr, 1.4, closed=True)
    cv.line([(x0 - 4, top + 124), (x0 + w + 4, top + 124), (x0 + w + 4, top + 140), (x0 - 4, top + 140)], 1.2, closed=True)


def rounded(x0, y0, x1, y1, r, n=6):
    pts = []
    for cx, cy, a0 in ((x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


# ------------------------------------------------------------------ B. cabinet shell (9-slice, 360 x 360, slice 72)

def paint_cabinet():
    S, K = 360, 72
    cv = Canvas(S, S, alpha=True)
    cv.fill(rounded(4, 4, S - 4, S - 4, 34), C['pink'], density=0.06, scale=30, mis=(1.5, -1))
    # inner ivory bezel lip
    cv.fill(rounded(K - 22, K - 22, S - K + 22, S - K + 22, 26), C['ivory'], density=0.05, scale=20)
    cv.fill(rounded(K - 4, K - 4, S - K + 4, S - K + 4, 18), C['navy'], density=0.04, scale=20)   # dark seat the CRT sits in
    # cut the window (transparent): the screen sits there
    cv.line(rounded(4, 4, S - 4, S - 4, 34), 3.4, closed=True)
    cv.line(rounded(K - 22, K - 22, S - K + 22, S - K + 22, 26), 2.6, closed=True)
    out = cv.finish(grain=1.6, soften=0.4, age=True)
    # punch the centre out so the CSS screen shows through
    yy, xx = np.mgrid[0:S, 0:S]
    hole = (xx >= K) & (xx < S - K) & (yy >= K) & (yy < S - K)   # exactly the 9-slice centre
    out[hole, 3] = 0
    return out


# ------------------------------------------------------------------ C. CRT glass (transparent overlay, 800 x 800, stretched)

def paint_glass():
    S = 800
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32) / S - 0.5
    r = np.sqrt((xx * 1.05) ** 2 + (yy * 1.05) ** 2)
    vignette = np.clip((r - 0.46) / 0.26, 0, 1) ** 1.8 * 0.16           # soft darker corners (navy, not black)
    # one faint, clean highlight along the upper curve of the tube (white, never grey)
    band = np.exp(-(((yy + 0.42 + 0.18 * xx ** 2) / 0.035) ** 2)) * np.clip(1 - np.abs(xx) / 0.42, 0, 1) * 0.12
    rgba = np.zeros((S, S, 4), np.float32)
    a, w = vignette, band
    total = np.maximum(a + w, 1e-6)[..., None]
    rgba[..., :3] = (np.array(bgr(C['navy']), np.float32) * a[..., None] + 255 * w[..., None]) / total
    rgba[..., 3] = np.clip((a + w) * 255, 0, 255)
    return rgba.astype(np.uint8)


# ------------------------------------------------------------------ D. ink frame (9-slice, 120 x 120, slice 18) and paint texture

def paint_ink_frame():
    S = 120
    cv = Canvas(S, S, ss=4, alpha=True)
    cv.line(rounded(5, 5, S - 5, S - 5, 9, n=5), 3.0, closed=True, alpha=1.0)
    return cv.finish(grain=0, soften=0.25, age=False)


def paint_texture():
    """Tileable gouache density (grey, used with multiply at low opacity)."""
    S = 256
    base = np.zeros((S, S), np.float32)
    for scale, amp in ((64, 7), (16, 4), (4, 2.5)):
        n = RNG.normal(0, 1, (S // scale, S // scale)).astype(np.float32)
        n = cv2.resize(np.tile(n, (3, 3)), (S * 3, S * 3), interpolation=cv2.INTER_CUBIC)[S:2 * S, S:2 * S]
        base += n / (np.abs(n).max() + 1e-6) * amp
    base += RNG.normal(0, 1.6, (S, S))
    g = np.clip(238 + base, 0, 255).astype(np.uint8)
    return cv2.cvtColor(g, cv2.COLOR_GRAY2BGR)


def transparent(w, h):
    return np.zeros((h, w, 4), np.uint8)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    cv2.imwrite(os.path.join(OUT, 'a-room.jpg'), paint_room(), [cv2.IMWRITE_JPEG_QUALITY, 84])
    cv2.imwrite(os.path.join(OUT, 'b-cabinet-shell.png'), paint_cabinet())
    cv2.imwrite(os.path.join(OUT, 'c-crt-glass.png'), paint_glass())
    cv2.imwrite(os.path.join(OUT, 'd-ink-frame.png'), paint_ink_frame())
    cv2.imwrite(os.path.join(OUT, 'd-paint-texture.png'), paint_texture())
    cv2.imwrite(os.path.join(OUT, 'f-foreground-top.png'), transparent(1080, 240))
    cv2.imwrite(os.path.join(OUT, 'f-foreground-bottom.png'), transparent(1080, 240))
    for f in sorted(os.listdir(OUT)):
        print(f, os.path.getsize(os.path.join(OUT, f)))
