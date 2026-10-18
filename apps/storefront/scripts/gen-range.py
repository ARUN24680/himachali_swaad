"""Generate the path data for the /coming-soon mountain illustration.

    python3 apps/storefront/scripts/gen-range.py apps/storefront/src/modules/teaser/components/range-paths.ts

One calm composition in a 1440 x 480 box: a far ridge that fades into mist, one main massif with a
hero peak (x 650) and two lower peaks (x 330, x 1060), a modest snow cap on the two tallest, and a
near foothill with a soft, irregular deodar treeline. Silhouettes are authored by hand (a few
kinks so they don't look ruled); only the trees are generated, from a fixed seed, so the output is
deterministic. Regenerate rather than hand-editing range-paths.ts.

DIV_* (v8) is the valleys divider in a 1440 x 300 box: a full-width smooth Bézier snow range (a
five-summit centre group and one main summit on each side, with irregular snow caps, streaks and a shaded east face) over low rolling foothills, from its own seeded RNG (the hero paths above are unchanged).
"""

import math
import random
import sys

rng = random.Random(11)

# --- Authored silhouettes ------------------------------------------------------------------------

FAR_RIDGE = (
    'M0 300 L120 270 L210 282 L300 238 L380 256 L470 228 L560 250 L650 232 L760 210 L860 236 '
    'L960 222 L1060 246 L1160 216 L1270 240 L1360 228 L1440 244'
)
FAR = FAR_RIDGE + ' V480 H0 Z'

MAIN_RIDGE = (
    'M0 336 L80 304 L170 266 L250 226 L304 204 L330 190 L352 198 L400 224 L450 254 L490 270 '
    'L540 240 L580 192 L612 132 L636 94 L650 72 L668 86 L700 110 L726 130 L760 162 L800 198 '
    'L842 234 L880 262 L930 238 L980 206 L1020 178 L1060 160 L1092 172 L1140 198 L1200 228 '
    'L1280 256 L1360 278 L1440 292'
)
MAIN = MAIN_RIDGE + ' V480 H0 Z'

# Soft shade on the right-hand faces (painted with a vertical fade, so no hard facet edge shows).
MAIN_SHADE = (
    'M650 72 L668 86 L700 110 L726 130 L760 162 L800 198 L842 234 L880 262 L830 330 L730 320 L672 190 Z '
    'M330 190 L352 198 L400 224 L450 254 L490 270 L440 320 L370 300 L338 230 Z '
    'M1060 160 L1092 172 L1140 198 L1200 228 L1280 256 L1200 320 L1110 300 L1068 210 Z'
)

# Modest caps with lobed, irregular lower edges; painted with a downward fade.
SNOW = (
    'M650 72 L636 94 L622 118 L613 136 L624 133 L633 143 L645 137 L657 147 L670 140 L683 149 L697 141 '
    'L710 146 L726 130 L700 110 L668 86 Z '
    'M1060 160 L1048 170 L1040 180 L1050 178 L1060 185 L1071 179 L1082 185 L1092 172 Z'
)

NEAR_RIDGE = (
    'M0 404 L120 388 L240 396 L360 376 L480 390 L600 382 L720 398 L840 384 L960 392 L1080 372 '
    'L1200 386 L1320 378 L1440 390'
)
NEAR = NEAR_RIDGE + ' V480 H0 Z'


def near_y(x):
    pts = [(0, 404), (120, 388), (240, 396), (360, 376), (480, 390), (600, 382), (720, 398), (840, 384),
           (960, 392), (1080, 372), (1200, 386), (1320, 378), (1440, 390)]
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        if x1 <= x <= x2:
            return y1 + (y2 - y1) * (x - x1) / (x2 - x1)
    return pts[-1][1]


# --- Deodar treeline: clusters of varied size and spacing, with gaps ------------------------------

def deodar(x, base, h):
    """Tiered conifer with slightly drooping branch tips."""
    w = h * rng.uniform(0.34, 0.42)
    tiers = 4 if h > 30 else 3
    left, right = [], []
    for i in range(tiers):
        t = (i + 1) / tiers
        y = base - h + h * t
        half = w / 2 * (0.35 + 0.65 * t)
        right += [(x + half, y + h * 0.03), (x + half * 0.35, y - h * 0.06)]
        left += [(x - half * 0.35, y - h * 0.06), (x - half, y + h * 0.03)]
    right[-1] = (x + w * 0.08, base)  # trunk
    left[0] = (x - w * 0.08, base)
    pts = [(x, base - h)] + right + list(reversed(left))
    return 'M' + ' L'.join(f'{px:.0f} {py:.0f}' for px, py in pts) + ' Z'


CLUSTERS = [(10, 150), (300, 470), (640, 760), (930, 1130), (1260, 1440)]
trees = []
for start, end in CLUSTERS:
    x = start + rng.uniform(0, 10)
    while x < end:
        mid = (start + end) / 2
        swell = 1 - abs(x - mid) / ((end - start) / 2)  # taller towards the middle of a cluster
        h = rng.uniform(14, 22) + swell * rng.uniform(10, 26)
        trees.append(deodar(x, near_y(x) + 4, h))
        x += rng.uniform(6, 16) * (1.4 - swell * 0.6)
FOREST = ' '.join(trees)


# --- Valleys divider (v7/v8): a calm Dhauladhar silhouette in a 1440 x 300 box ---------------------
# Two smooth layers drawn with cubic Béziers (Catmull-Rom through densely sampled points), never
# straight segments: a far snow range that echoes the hero photo (a tall cluster of summits right of
# centre, a lone peak left) and a low, rolling near ridge. Its own seeded RNG, so the hero output
# above stays byte-identical.

drng = random.Random(7)


def value_noise(n, step, amp):
    """Smooth 1-D noise: random knots every `step` samples, cosine-interpolated."""
    knots = [drng.uniform(-1, 1) for _ in range(n // step + 2)]
    out = []
    for i in range(n):
        k, t = divmod(i, step)
        t /= step
        w = (1 - math.cos(t * math.pi)) / 2
        out.append(amp * (knots[k] * (1 - w) + knots[k + 1] * w))
    return out


def ridge(base, peaks, noise, dx=8, rough=0.0, massifs=()):
    """Max of pointed bumps (a soft cusp at each summit, long concave flanks) over a baseline.
    Two octaves of smooth noise, plus `rough` extra noise that grows with altitude (high ridges are
    craggy, foothills are smooth). Returns [(x, y, lift)]."""
    xs = list(range(-24, 1440 + 25, dx))
    n1 = value_noise(len(xs), 7, noise)
    n2 = value_noise(len(xs), 2, noise * 0.4)
    n3 = value_noise(len(xs), 1, 1.0)
    pts = []
    for i, x in enumerate(xs):
        # broad massifs (high saddles between summits), then summit cusps on top of them
        env = sum(h * math.exp(-(((x - px) / w) ** 2)) for px, h, w in massifs)
        lift = env
        for px, h, w in peaks:
            d = abs(x - px) / w
            lift = max(lift, env + h / (1 + d) ** 1.6 - h * 0.18)
        y = base - lift + n1[i] + n2[i] + n3[i] * rough * lift / 100
        pts.append((x, y, lift))
    return pts


def bezier(pts, closed_to=None):
    """Catmull-Rom spline through pts as cubic Béziers; optionally closed down to y=closed_to."""
    pts = [(p[0], p[1]) for p in pts]
    d = [f'M{pts[0][0]:.0f} {pts[0][1]:.1f}']
    for i in range(len(pts) - 1):
        p0 = pts[max(i - 1, 0)]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[min(i + 2, len(pts) - 1)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d.append(f'C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.0f} {p2[1]:.1f}')
    if closed_to is not None:
        d.append(f'V{closed_to} H{pts[0][0]} Z')
    return ' '.join(d)


def lerp_y(pts, x):
    for (x1, y1, *_), (x2, y2, *_) in zip(pts, pts[1:]):
        if x1 <= x <= x2:
            return y1 + (y2 - y1) * (x - x1) / (x2 - x1)
    return pts[-1][1]


def snowfield(pts, line_y, lo, hi, dx=2):
    """Snow caps on the summits, sampled densely (every `dx`) so small gullies and ribs read.
    The snowline wanders (two octaves of smooth noise) and reaches further down under each summit.
    Along it, snow runs down into gullies (narrow V tongues) and sits higher on rock ribs (short
    inverted teeth), so the caps never read as flat slabs. The top edge is drawn just above the
    ridge and the caps are clipped to the ridge in the component, so the summit edge stays crisp.
    Returns (caps, gullies, snowline)."""
    xs = list(range(lo, hi + 1, dx))
    ridge_y = [lerp_y(pts, x) for x in xs]
    wander = [a + b for a, b in zip(value_noise(len(xs), 6, 4), value_noise(len(xs), 20, 7))]
    gullies, ribs = [], []
    x = lo + drng.uniform(6, 18)
    while x < hi:
        if drng.random() < 0.6:
            gullies.append((x, drng.uniform(6, 22), drng.uniform(2.5, 5.5)))
        else:
            ribs.append((x, drng.uniform(4, 10), drng.uniform(3, 6)))
        x += drng.uniform(8, 18)
    span = 64 // dx
    line = []
    for i, x in enumerate(xs):
        y = ridge_y[i]
        prev_y, next_y = ridge_y[max(i - span, 0)], ridge_y[min(i + span, len(xs) - 1)]
        convex = max(0.0, (prev_y + next_y) / 2 - y)  # >0 under a summit
        sl = line_y + wander[i] + convex * 0.5
        for gx, depth, w in gullies:
            sl += depth * max(0.0, 1 - abs(x - gx) / w)
        for rx, depth, w in ribs:
            sl -= depth * max(0.0, 1 - abs(x - rx) / w)
        line.append((x, max(sl, y)))
    caps, cur = [], []
    for i, (x, sl) in enumerate(line + [(9999, 0)]):
        if i < len(line) and sl - ridge_y[i] > 1.0:
            cur.append((x, ridge_y[i], sl))
        elif cur:
            if len(cur) > 3:
                top = f'M{cur[0][0]:.0f} {cur[0][1]:.1f} ' + ' '.join(f'L{cx:.0f} {cy - 6:.1f}' for cx, cy, _ in cur[1:-1])
                top += f' L{cur[-1][0]:.0f} {cur[-1][1]:.1f}'
                bottom = ' '.join(f'L{cx:.0f} {csl:.1f}' for cx, _, csl in reversed(cur))
                caps.append(f'{top} {bottom} Z')
            cur = []
    return ' '.join(caps), gullies, [(x, y) for x, y in line]


def streaks(pts, gullies, line, summits):
    """Thin snow streaks that grow out of the deeper gullies and run down the face, leaning away
    from the nearest summit (along the fall line), tapering to nothing."""
    out = []
    for gx, depth, _ in gullies:
        if depth < 16:
            continue
        top = lerp_y(line, gx)
        if top - lerp_y(pts, gx) < 4:  # gully not under a cap
            continue
        near = min(summits, key=lambda s: abs(s - gx))
        lean = (1 if gx > near else -1) * drng.uniform(6, 14)
        length, w = drng.uniform(20, 40), drng.uniform(1.0, 1.8)
        top -= 6  # start inside the cap so the streak grows out of it
        out.append(
            f'M{gx - w:.1f} {top:.1f} Q{gx + lean * 0.4 - w * 0.5:.1f} {top + length * 0.55:.1f} '
            f'{gx + lean:.1f} {top + length:.1f} Q{gx + lean * 0.45 + w * 0.5:.1f} {top + length * 0.5:.1f} '
            f'{gx + w:.1f} {top:.1f} Z'
        )
    return ' '.join(out)


def shade(pts, summits):
    """The shaded (east/right) face of each main summit: the ridge from the summit down its right
    flank, closed by a curved line back to a point well below the summit. Painted with a fade."""
    out = []
    for px, w in summits:
        flank = [(x, y) for x, y, _ in pts if px - 2 <= x <= px + w]
        sx, sy = flank[0]
        ex, ey = flank[-1]
        out.append(
            bezier(flank)
            + f' Q{ex - w * 0.3:.1f} {ey + 40:.1f} {sx + w * 0.2:.1f} {sy + 80:.1f}'
            + f' Q{sx + 2:.1f} {sy + 34:.1f} {sx:.1f} {sy:.1f} Z'
        )
    return ' '.join(out)


# Far range in a 1440 x 300 box: broad massifs (x, height, width) carry summit cusps (x, height,
# half-width). Five main summits cluster at 600-1000, where a 375 px phone looks (centre crop).
DIV_MASSIFS = [(770, 138, 290), (240, 104, 200), (1210, 98, 210)]
DIV_PEAKS = [
    (230, 62, 46), (345, 36, 40), (470, 22, 56), (595, 48, 46), (690, 72, 44), (775, 52, 38),
    (870, 64, 46), (985, 40, 50), (1210, 58, 46), (1320, 34, 40),
]
div_far = ridge(262, DIV_PEAKS, 3, rough=4, massifs=DIV_MASSIFS)
DIV_FAR = bezier(div_far, 300)
DIV_FAR_RIDGE = bezier(div_far)
DIV_SNOW, _gullies, _line = snowfield(div_far, 128, 120, 1360)
DIV_STREAKS = streaks(div_far, _gullies, _line, [230, 345, 595, 690, 775, 870, 985, 1210, 1320])
DIV_SHADE = shade(div_far, [(230, 64), (595, 60), (690, 70), (775, 56), (870, 70), (985, 60), (1210, 64)])

# Near ridge: long, low, rolling foothills well below the snow line.
div_near = ridge(292, [(40, 34, 200), (480, 44, 230), (920, 22, 190), (1390, 40, 210)], 3.5, dx=24)
DIV_NEAR = bezier(div_near, 300)
DIV_NEAR_RIDGE = bezier(div_near)

with open(sys.argv[1], 'w') as f:
    f.write('/* Generated by apps/storefront/scripts/gen-range.py — do not edit by hand. Hero: viewBox 0 0 1440 480; DIV_*: 0 0 1440 300. */\n\n')
    for name, val in [('FAR', FAR), ('FAR_RIDGE', FAR_RIDGE), ('NEAR_RIDGE', NEAR_RIDGE), ('MAIN', MAIN), ('MAIN_SHADE', MAIN_SHADE), ('SNOW', SNOW), ('NEAR', NEAR),
                      ('FOREST', FOREST), ('DIV_FAR', DIV_FAR), ('DIV_FAR_RIDGE', DIV_FAR_RIDGE), ('DIV_SNOW', DIV_SNOW), ('DIV_STREAKS', DIV_STREAKS), ('DIV_SHADE', DIV_SHADE),
                      ('DIV_NEAR', DIV_NEAR), ('DIV_NEAR_RIDGE', DIV_NEAR_RIDGE)]:
        f.write(f"export const {name} =\n  '{val}';\n\n")
print('trees', len(trees))
