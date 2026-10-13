"""Baccarat Hunt adventure: deterministic Bicester Village layout.

The server builds the village once per run from (seed, variant). Clients only
render the public layout; collision, zones and the correct door stay here.

Coordinates are tiles (16 px). x grows east, y grows south. Every building
shows its south facade (GBA convention), so a door is entered from the tile
directly below it.
"""
from __future__ import annotations

import random
from collections import deque
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

W, H = 54, 91

# Ground codes shared with the client art kit (frontend .../art/tiles.js).
VOID, COBBLE, PLAZA, GRASS, PATH, FLOWERS, HEDGE, WATER = 0, 1, 2, 3, 4, 5, 6, 7
WALKABLE_GROUND = {COBBLE, PLAZA, GRASS, PATH}

VARIANTS = ("west", "north", "east")

# Visual vocabulary implemented by the client art kit.
BODY_STYLES = ["black", "stone", "cream", "pink", "mint", "blue", "butter", "sage", "brick", "white", "lilac", "terracotta"]
ROOF_STYLES = ["slate", "blue_slant", "mansard_black", "flat_parapet", "terracotta", "copper", "gable_dark"]
AWNINGS = ["cream_green", "pink_white", "black_white", "maroon_cream", "blue_white", "butter_white", "mint_white"]
PLAIN_DOORS = ["black", "white", "pink", "wood", "glass", "blue", "red", "sage"]
SHOP_NAMES = [
    "MAISON LUNE", "HARTWELL", "ROSIER", "ATELIER", "KENSAL", "VELOUR", "MARLOWE", "BELLAMY",
    "PETAL & CO", "TEA HOUSE", "CASHMERE", "LINEN", "CANDLE CO", "FROMAGE", "DOLCE", "TWEED",
    "SILK ROAD", "PEARL", "COCO", "ORCHARD", "SAVOY", "BLOOM", "NOVA", "LACE", "AMBER",
    "THE EDIT", "MERIDIAN", "OLIVE", "SORBET", "HALCYON", "ROW 9", "SATIN",
]


@dataclass
class Building:
    id: str
    x: int
    y: int
    w: int
    h: int
    door_dx: int
    door_w: int
    floors: int
    body: str = "cream"
    roof: str = "slate"
    awning: Optional[str] = None
    sign: str = ""
    door_style: str = "black"
    ornate: bool = False
    chimneys: int = 0
    flowers: bool = False
    sconces: bool = False
    role: str = "shop"  # shop | end_shop

    @property
    def door_tiles(self) -> List[Tuple[int, int]]:
        return [(self.x + self.door_dx + i, self.y + self.h - 1) for i in range(self.door_w)]

    @property
    def front_tiles(self) -> List[Tuple[int, int]]:
        return [(x, y + 1) for x, y in self.door_tiles]


@dataclass
class Layout:
    seed: int
    variant: str
    ground: List[List[int]] = field(default_factory=lambda: [[GRASS] * W for _ in range(H)])
    blocked: Set[Tuple[int, int]] = field(default_factory=set)
    buildings: List[Building] = field(default_factory=list)
    props: List[Dict] = field(default_factory=list)
    walkers: List[Dict] = field(default_factory=list)
    npcs: List[Dict] = field(default_factory=list)
    zones: Dict[str, Set[Tuple[int, int]]] = field(default_factory=dict)
    keep_clear: Set[Tuple[int, int]] = field(default_factory=set)
    spawn: Tuple[int, int, str] = (26, 86, "up")
    destination_id: str = ""
    gulf: Dict = field(default_factory=dict)
    door_index: Dict[str, Dict] = field(default_factory=dict)

    # ---------- queries ----------
    def in_bounds(self, x: int, y: int) -> bool:
        return 0 <= x < W and 0 <= y < H

    def walkable(self, x: int, y: int, extra_blocked: Optional[Set[Tuple[int, int]]] = None) -> bool:
        if not self.in_bounds(x, y) or (x, y) in self.blocked:
            return False
        if extra_blocked and (x, y) in extra_blocked:
            return False
        return self.ground[y][x] in WALKABLE_GROUND

    def door_at_front(self, x: int, y: int) -> Optional[Dict]:
        """The door entered by facing up from tile (x, y)."""
        for door in self.door_index.values():
            if (x, y) in door["front"]:
                return door
        return None

    def reachable_from_spawn(self, extra_blocked=None) -> Set[Tuple[int, int]]:
        sx, sy, _ = self.spawn
        seen = {(sx, sy)}
        queue = deque([(sx, sy)])
        while queue:
            x, y = queue.popleft()
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if (nx, ny) not in seen and self.walkable(nx, ny, extra_blocked):
                    seen.add((nx, ny))
                    queue.append((nx, ny))
        return seen

    # ---------- public projection ----------
    def public(self) -> Dict:
        """Everything a client needs to draw the village. No correct door, no zones."""
        return {
            "w": W, "h": H, "tile": 16, "seed": self.seed, "variant_key": _variant_fingerprint(self.seed, self.variant),
            "ground": ["".join(str(c) for c in row) for row in self.ground],
            "blocked": _encode_blocked(self.blocked),
            "buildings": [
                {
                    "id": b.id, "x": b.x, "y": b.y, "w": b.w, "h": b.h, "floors": b.floors,
                    "body": b.body, "roof": b.roof, "awning": b.awning, "sign": b.sign,
                    "door": {"dx": b.door_dx, "w": b.door_w, "style": b.door_style},
                    "ornate": b.ornate, "chimneys": b.chimneys, "flowers": b.flowers, "sconces": b.sconces,
                }
                for b in self.buildings
            ],
            "props": self.props,
            "walkers": self.walkers,
            "npcs": self.npcs,
            "spawn": {"x": self.spawn[0], "y": self.spawn[1], "dir": self.spawn[2]},
            "gulf": {k: v for k, v in self.gulf.items() if k in ("woman", "son", "exit")},
            "sky_rows": 9,
        }


def _variant_fingerprint(seed: int, variant: str) -> str:
    # Lets clients cache textures per layout without revealing the route variant.
    return f"{seed:x}-{(sum(map(ord, variant)) * 2654435761 + seed) % 99991:05d}"


def _encode_blocked(blocked: Set[Tuple[int, int]]) -> List[str]:
    rows = []
    for y in range(H):
        rows.append("".join("1" if (x, y) in blocked else "0" for x in range(W)))
    return rows


# ============================================================
# Generator
# ============================================================

def _fill(layout: Layout, x0: int, y0: int, x1: int, y1: int, code: int) -> None:
    for y in range(max(0, y0), min(H - 1, y1) + 1):
        for x in range(max(0, x0), min(W - 1, x1) + 1):
            layout.ground[y][x] = code


def _rect_tiles(x0, y0, x1, y1):
    return {(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)}


# Building slots: (id, x, y, w, h, door_dx, door_w, floors, role)
# Door tiles sit on the bottom row; the row below must be walkable.
SLOTS = [
    # --- north-west court (y 9..15) ---
    ("nw_l", 2, 3, 4, 6, 2, 1, 2, "shop"),
    ("nw_end", 6, 2, 8, 7, 3, 2, 3, "end_shop"),
    ("nw_r", 14, 3, 3, 6, 1, 1, 3, "shop"),
    # --- north court ---
    ("n_l", 19, 3, 4, 6, 1, 1, 2, "shop"),
    ("n_end", 23, 2, 8, 7, 3, 2, 3, "end_shop"),
    ("n_r", 31, 3, 4, 6, 2, 1, 2, "shop"),
    # --- north-east court ---
    ("ne_l", 37, 3, 3, 6, 1, 1, 3, "shop"),
    ("ne_end", 40, 2, 8, 7, 3, 2, 3, "end_shop"),
    ("ne_r", 48, 3, 4, 6, 1, 1, 2, "shop"),
    # --- west avenue, east side (avenue x 5..10) ---
    ("w1", 11, 16, 6, 6, 0, 1, 2, "shop"),
    ("w2", 11, 23, 6, 6, 1, 1, 2, "shop"),
    ("w3", 11, 30, 6, 6, 0, 1, 3, "shop"),
    ("w4", 11, 37, 6, 4, 1, 1, 1, "shop"),
    # --- east avenue, west side (avenue x 43..48) ---
    ("e1", 37, 16, 6, 6, 5, 1, 2, "shop"),
    ("e2", 37, 23, 6, 6, 4, 1, 2, "shop"),
    ("e3", 37, 30, 6, 6, 5, 1, 3, "shop"),
    ("e4", 37, 37, 6, 4, 4, 1, 1, "shop"),
    # --- north avenue (x 23..30) ---
    ("nl1", 19, 16, 4, 5, 3, 1, 2, "shop"),
    ("nr1", 31, 16, 4, 5, 0, 1, 2, "shop"),
    ("nl2", 18, 31, 5, 5, 3, 1, 2, "shop"),
    ("nr2", 31, 31, 5, 5, 1, 1, 2, "shop"),
    # --- main street west side (x 15..22) ---
    ("mw1", 15, 54, 8, 6, 6, 1, 2, "shop"),
    ("mw2", 15, 61, 8, 6, 5, 2, 3, "shop"),
    ("mw3", 15, 68, 8, 6, 6, 1, 2, "shop"),
    # --- main street east side (x 31..38) ---
    ("me1", 31, 54, 8, 6, 1, 1, 3, "shop"),
    ("me2", 31, 61, 8, 6, 1, 2, 2, "shop"),
    ("me3", 31, 68, 8, 6, 1, 1, 2, "shop"),
    # --- entrance plaza ---
    ("ent_l", 16, 76, 6, 5, 4, 1, 1, "shop"),
    ("ent_r", 32, 76, 6, 5, 1, 1, 1, "shop"),
]

# Which avenue leads to which court, for directions and decoys.
ROUTES = {
    "west": {"end": "nw_end", "band": (2, 16), "lane_shops": ["w2", "w3"], "gulf": (8, 19)},
    "north": {"end": "n_end", "band": (19, 34), "lane_shops": ["nl2", "nr1"], "gulf": (27, 18)},
    "east": {"end": "ne_end", "band": (37, 51), "lane_shops": ["e2", "e3"], "gulf": (45, 19)},
}


def _carve_network(layout: Layout) -> None:
    g = layout
    # Border hedge (trees are added as props on top).
    for y in range(H):
        for x in range(W):
            if x < 2 or x >= W - 2 or y < 2 or y >= H - 2:
                g.ground[y][x] = HEDGE
    # Courts
    _fill(g, 2, 9, 16, 15, COBBLE)
    _fill(g, 19, 9, 34, 15, COBBLE)
    _fill(g, 37, 9, 51, 15, COBBLE)
    # Avenues
    _fill(g, 5, 16, 10, 41, COBBLE)
    _fill(g, 43, 16, 48, 41, COBBLE)
    _fill(g, 23, 16, 30, 35, COBBLE)
    # Clock square
    _fill(g, 20, 22, 33, 30, PLAZA)
    # Lanes into the fountain plaza
    _fill(g, 5, 41, 18, 48, COBBLE)
    _fill(g, 35, 41, 48, 48, COBBLE)
    # Fountain plaza
    _fill(g, 18, 36, 35, 53, PLAZA)
    # Main street + entrance plaza
    _fill(g, 23, 54, 30, 75, COBBLE)
    _fill(g, 16, 76, 37, 88, PLAZA)
    # Pockets in front of avenue shops (dead ends, flowers at the back)
    for y in (22, 29, 36):
        _fill(g, 11, y, 13, y, COBBLE)
        _fill(g, 14, y, 16, y, FLOWERS)
        _fill(g, 40, y, 42, y, COBBLE)
        _fill(g, 37, y, 39, y, FLOWERS)
    # North avenue pockets
    _fill(g, 22, 21, 22, 21, COBBLE)
    _fill(g, 31, 21, 31, 21, COBBLE)
    # Main street pockets
    for y in (60, 67, 74):
        _fill(g, 19, y, 22, y, COBBLE)
        _fill(g, 15, y, 18, y, FLOWERS)
        _fill(g, 31, y, 34, y, COBBLE)
        _fill(g, 35, y, 38, y, FLOWERS)
    # Gardens with gravel paths (walkable dead-end strolls)
    _fill(g, 3, 50, 13, 50, PATH)
    _fill(g, 8, 49, 8, 72, PATH)
    _fill(g, 40, 50, 50, 50, PATH)
    _fill(g, 45, 49, 45, 72, PATH)
    # Flower beds in the gardens
    for (x0, y0, x1, y1) in ((3, 54, 6, 56), (10, 58, 13, 60), (3, 64, 6, 66), (10, 70, 13, 72),
                             (40, 54, 43, 56), (47, 58, 50, 60), (40, 64, 43, 66), (47, 70, 50, 72)):
        _fill(g, x0, y0, x1, y1, FLOWERS)
    # Fountain basin
    _fill(g, 25, 42, 28, 45, WATER)
    # Hedge walls separating the courts (keeps each far end a dead end)
    _fill(g, 17, 2, 18, 15, HEDGE)
    _fill(g, 35, 2, 36, 15, HEDGE)
    # Back gardens between the west/north and north/east blocks
    _fill(g, 17, 16, 17, 30, HEDGE)
    _fill(g, 36, 16, 36, 30, HEDGE)
    # Outer avenue strips
    _fill(g, 2, 16, 4, 40, GRASS)
    _fill(g, 49, 16, 51, 40, GRASS)

    # Primary walking corridors must never get decorative props.
    kc = layout.keep_clear
    kc |= _rect_tiles(6, 9, 9, 48)          # west avenue core
    kc |= _rect_tiles(44, 9, 47, 48)        # east avenue core
    kc |= _rect_tiles(24, 9, 29, 88)        # north avenue + main street core
    kc |= _rect_tiles(5, 43, 48, 46)        # lanes
    kc |= _rect_tiles(20, 37, 33, 52)       # plaza core
    kc |= _rect_tiles(3, 10, 50, 13)        # courts


def _place_buildings(layout: Layout, rng: random.Random) -> None:
    names = SHOP_NAMES[:]
    rng.shuffle(names)
    bodies = BODY_STYLES[:]
    for i, (bid, x, y, w, h, ddx, dw, floors, role) in enumerate(SLOTS):
        body = bodies[(i * 5 + rng.randrange(len(bodies))) % len(bodies)]
        roof = rng.choice(ROOF_STYLES)
        if body == "blue":
            roof = "blue_slant"
        if body == "black":
            roof = rng.choice(["mansard_black", "slate", "flat_parapet"])
        b = Building(
            id=bid, x=x, y=y, w=w, h=h, door_dx=ddx, door_w=dw, floors=floors, body=body, roof=roof,
            awning=rng.choice(AWNINGS + [None, None]) if w >= 5 else rng.choice([None, None, "pink_white"]),
            sign=names[i % len(names)], door_style=rng.choice(PLAIN_DOORS), ornate=rng.random() < 0.35,
            chimneys=rng.choice([0, 1, 1, 2]) if roof not in ("flat_parapet",) else 0,
            flowers=rng.random() < 0.55, sconces=rng.random() < 0.5, role=role,
        )
        layout.buildings.append(b)
        for ty in range(y, y + h):
            for tx in range(x, x + w):
                layout.blocked.add((tx, ty))
                layout.ground[ty][tx] = COBBLE


def _assign_route(layout: Layout, rng: random.Random) -> None:
    by_id = {b.id: b for b in layout.buildings}
    route = ROUTES[layout.variant]
    dest = by_id[route["end"]]
    layout.destination_id = dest.id
    others = [ROUTES[v]["end"] for v in VARIANTS if v != layout.variant]
    rng.shuffle(others)
    # The real shop: golden double doors at the far end of the instructed route.
    dest.door_style, dest.ornate, dest.sign, dest.body = "gold_double", True, "PARFUMERIE", "black"
    dest.roof, dest.awning, dest.sconces, dest.flowers = "mansard_black", "maroon_cream", True, True
    # Far-end decoys: other perfume shops with convincing entrances.
    silver = by_id[others[0]]
    silver.door_style, silver.ornate, silver.sign, silver.body = "silver_double", True, "FRAGRANCE", "stone"
    silver.sconces = True
    white = by_id[others[1]]
    white.door_style, white.ornate, white.sign = "white_double", True, "ESSENCE"
    # Along the correct avenue: a golden single door and green doors with gold handles.
    gold_single, green = (by_id[s] for s in route["lane_shops"])
    gold_single.door_style, gold_single.ornate, gold_single.sign = "gold_single", True, "MAISON DOREE"
    green.door_style, green.sign = "green_gold_handles", "VERDANT"
    # No other building may look like the destination.
    for b in layout.buildings:
        if b is not dest and b.door_style == "gold_double":
            b.door_style = "black"
        if b is not dest and b.door_w == 2 and b.door_style in ("gold_single",):
            b.door_style = "wood"
    # Double-door slots that are not decoys get plain doubles in non-gold colours.
    for b in layout.buildings:
        if b.door_w == 2 and b not in (dest, silver, white):
            b.door_style = rng.choice(["glass_double", "black_double", "pink_double"])
        elif b.door_w == 1 and b.door_style.endswith("_double"):
            b.door_style = "black"


def _index_doors(layout: Layout) -> None:
    for b in layout.buildings:
        layout.door_index[b.id] = {
            "id": b.id, "building": b.id, "tiles": b.door_tiles, "front": set(b.front_tiles),
            "style": b.door_style, "correct": b.id == layout.destination_id, "sign": b.sign,
        }


def _prop(layout: Layout, kind: str, x: int, y: int, block: List[Tuple[int, int]], variant: str = "", **extra) -> bool:
    if any((bx, by) in layout.keep_clear or not layout.walkable(bx, by) for bx, by in block):
        return False
    for bx, by in block:
        layout.blocked.add((bx, by))
    layout.props.append({"kind": kind, "x": x, "y": y, "variant": variant, **extra})
    return True


def _decor(layout: Layout, rng: random.Random) -> None:
    g = layout
    # Border trees (purely visual; hedge ground already blocks)
    for x in range(0, W, 2):
        g.props.append({"kind": "tree", "x": x, "y": 1, "variant": rng.choice(["round", "oak", "round"])})
        if not 22 <= x <= 31:
            g.props.append({"kind": "tree", "x": x, "y": H - 1, "variant": rng.choice(["round", "oak"])})
    for y in range(3, H - 1, 2):
        g.props.append({"kind": "tree", "x": 0, "y": y, "variant": rng.choice(["round", "oak", "blossom"])})
        g.props.append({"kind": "tree", "x": W - 2, "y": y, "variant": rng.choice(["round", "oak", "blossom"])})
    # Court separators
    for y in (4, 7, 10, 13):
        g.props.append({"kind": "tree", "x": 17, "y": y, "variant": "topiary"})
        g.props.append({"kind": "tree", "x": 35, "y": y, "variant": "topiary"})
    for y in range(17, 31, 3):
        g.props.append({"kind": "tree", "x": 17, "y": y, "variant": "topiary"})
        g.props.append({"kind": "tree", "x": 36, "y": y, "variant": "topiary"})

    # Fountain and clock tower (landmarks)
    g.props.append({"kind": "fountain", "x": 25, "y": 42, "variant": "grand"})
    # Landmark: deliberately inside the corridor, people walk around it.
    for tile in [(x, y) for x in range(25, 29) for y in range(26, 29)]:
        g.blocked.add(tile)
    g.props.append({"kind": "clock_tower", "x": 25, "y": 24, "variant": "classic"})
    # Entrance gate arch
    g.props.append({"kind": "gate", "x": 21, "y": 84, "variant": "bicester"})
    for (x, y) in ((21, 87), (21, 88), (32, 87), (32, 88)):
        g.blocked.add((x, y))

    # Street lamps along corridors (edges only, alternating sides)
    lamp_spots = []
    for y in range(18, 41, 6):
        lamp_spots += [(5, y), (10, y + 3), (43, y + 3), (48, y)]
    for y in range(17, 22, 4):
        lamp_spots += [(23, y), (30, y)]
    for y in range(56, 75, 6):
        lamp_spots += [(23, y), (30, y + 3)]
    lamp_spots += [(20, 37), (33, 37), (18, 51), (35, 51), (20, 22), (33, 22), (20, 30), (33, 30)]
    lamp_spots += [(16, 78), (37, 78), (19, 86), (34, 86), (2, 10), (16, 15), (19, 15), (34, 15), (37, 15), (51, 10)]
    lamp_spots += [(9, 41), (14, 48), (44, 41), (39, 48)]
    for (x, y) in lamp_spots:
        _prop(g, "lamp", x, y, [(x, y)], rng.choice(["classic", "classic", "double"]))

    # Trees in plaza corners, courts, gardens and avenue strips
    tree_spots = [(19, 38), (34, 38), (19, 52), (34, 52), (22, 49), (31, 49), (21, 25), (32, 25), (21, 28), (32, 28),
                  (3, 14), (15, 14), (20, 14), (33, 14), (38, 14), (50, 14), (17, 80), (36, 80), (18, 84), (35, 84)]
    for y in range(17, 40, 4):
        tree_spots += [(3, y), (50, y + 2)]
    for (x, y) in tree_spots:
        _prop(g, "tree", x, y, [(x, y)], rng.choice(["round", "blossom", "oak", "topiary"]))
    # Garden trees (gardens are walkable grass with gravel paths)
    for _ in range(26):
        x = rng.choice(list(range(3, 14)) + list(range(40, 51)))
        y = rng.randrange(51, 74)
        if g.ground[y][x] == GRASS and (x, y) not in g.blocked:
            _prop(g, "tree", x, y, [(x, y)], rng.choice(["round", "oak", "blossom"]))
    # Benches, planters, bushes, phone box, café tables
    for (x, y, v) in ((21, 40, "h"), (31, 40, "h"), (21, 47, "h"), (31, 47, "h"), (12, 47, "h"), (40, 47, "h"),
                      (20, 82, "h"), (32, 82, "h"), (3, 12, "h"), (49, 12, "h"), (2, 33, "v"), (51, 26, "v")):
        blocks = [(x, y), (x + 1, y)] if v == "h" else [(x, y), (x, y + 1)]
        _prop(g, "bench", x, y, blocks, v)
    for (x, y) in ((18, 77), (35, 77), (23, 76), (30, 76), (18, 88), (35, 88), (11, 9), (14, 9), (22, 9), (31, 9),
                   (39, 9), (42, 9), (20, 36), (33, 36), (5, 15), (48, 15), (10, 15), (43, 15)):
        _prop(g, "planter", x, y, [(x, y)], rng.choice(["pink", "red", "white", "lilac"]))
    for (x, y) in ((22, 31), (31, 32), (16, 41), (37, 41), (22, 75), (31, 75), (23, 53), (30, 53)):
        _prop(g, "bush", x, y, [(x, y)], rng.choice(["round", "cone"]))
    _prop(g, "phonebox", 36, 85, [(36, 85), (36, 86)], "red")
    # Courts: benches and planters along the edges, never in front of doors.
    for (x, y) in ((2, 15), (13, 15), (19, 14), (32, 14), (37, 14), (49, 15)):
        _prop(g, "planter", x, y, [(x, y)], rng.choice(["pink", "white", "lilac", "red"]))
    # Gardens: topiary rows along the gravel walks and benches to rest on.
    for y in range(52, 72, 4):
        for x in (7, 9, 44, 46):
            _prop(g, "tree", x, y, [(x, y)], "topiary")
    for (x, y, v) in ((4, 51, "h"), (10, 51, "h"), (41, 51, "h"), (47, 51, "h")):
        _prop(g, "bench", x, y, [(x, y), (x + 1, y)], v)
    for (x, y) in ((4, 79), (8, 83), (12, 78), (41, 79), (45, 83), (49, 78), (6, 75), (47, 75)):
        _prop(g, "tree", x, y, [(x, y)], rng.choice(["blossom", "round", "oak"]))
    _prop(g, "signpost", 22, 51, [(22, 51)], "village")
    _prop(g, "cafe_table", 21, 23, [(21, 23)], "green")
    _prop(g, "cafe_table", 32, 23, [(32, 23)], "pink")
    _prop(g, "cafe_table", 21, 29, [(21, 29)], "pink")
    _prop(g, "cafe_table", 32, 29, [(32, 29)], "green")
    # String lights over the main street and lanes (overlay only)
    for y in range(57, 74, 8):
        g.props.append({"kind": "string_lights", "x": 23, "y": y, "variant": "warm", "to_x": 30, "to_y": y + 1})
    for x in (8, 45):
        g.props.append({"kind": "string_lights", "x": x - 3, "y": 30, "variant": "warm", "to_x": x + 2, "to_y": 31})


def _walkers(layout: Layout, rng: random.Random) -> None:
    loops = [
        ("main", [(24, 57), (24, 72), (29, 72), (29, 57)]),
        ("plaza", [(21, 39), (32, 39), (32, 50), (21, 50)]),
        ("west_lane", [(7, 44), (16, 44), (16, 46), (7, 46)]),
        ("east_lane", [(37, 44), (47, 44), (47, 46), (37, 46)]),
        ("entrance", [(19, 79), (34, 79), (34, 83), (19, 83)]),
        ("north", [(24, 17), (24, 34), (29, 34), (29, 17)]),
        ("west_av", [(6, 24), (6, 39), (9, 39), (9, 24)]),
        ("east_av", [(44, 24), (44, 39), (47, 39), (47, 24)]),
    ]
    skins = ["trench", "navycoat", "hijab_cardigan", "flatcap", "pinkpuffer", "thobe", "trench", "hijab_cardigan"]
    rng.shuffle(skins)
    for i, (name, corners) in enumerate(loops):
        path = []
        for a, b in zip(corners, corners[1:] + corners[:1]):
            (x0, y0), (x1, y1) = a, b
            dx = (x1 > x0) - (x1 < x0)
            dy = (y1 > y0) - (y1 < y0)
            x, y = x0, y0
            while (x, y) != (x1, y1):
                path.append((x, y))
                x, y = x + dx, y + dy
        if all(layout.walkable(x, y) for x, y in path):
            layout.walkers.append({"id": f"walker_{i}", "skin": skins[i % len(skins)],
                                   "path": [list(p) for p in path], "step_ms": rng.choice([330, 360, 400, 430]),
                                   "offset": rng.randrange(len(path))})


def _stationary_npcs(layout: Layout) -> None:
    spots = [
        ("busker", "busker", 19, 50, "right"),
        ("shopkeeper", "shopkeeper", 22, 79, "down"),
        ("bench_sitter", "flatcap", 3, 31, "right"),
    ]
    for npc_id, skin, x, y, facing in spots:
        if layout.walkable(x, y) and (x, y) not in layout.keep_clear:
            layout.blocked.add((x, y))
            layout.npcs.append({"id": npc_id, "skin": skin, "x": x, "y": y, "dir": facing})


def _gulf_encounter(layout: Layout) -> None:
    route = ROUTES[layout.variant]
    wx, wy = route["gulf"]
    x0, x1 = route["band"]
    layout.gulf = {
        "woman": {"x": wx, "y": wy, "dir": "down"},
        "son": {"x": wx, "y": wy - 1, "dir": "down"},
        # Wheeled away north into the court, then aside, out of sight.
        "exit": [[wx, wy - 1], [wx, 12], [wx + (3 if wx < W // 2 else -3), 12]],
        "tiles": [(wx, wy), (wx, wy - 1)],
    }
    # Every walkable tile across the prong at these rows: impossible to sneak past.
    layout.zones["gulf"] = {(x, y) for y in range(wy + 1, wy + 4) for x in range(x0, x1 + 1)
                            if layout.walkable(x, y) or (x, y) in set(layout.gulf["tiles"])}
    # The pair also physically blocks the avenue until they leave.
    for t in layout.gulf["tiles"]:
        layout.blocked.add(t)


def _zones(layout: Layout) -> None:
    layout.zones["fountain"] = {(x, y) for y in range(36, 54) for x in range(18, 36) if layout.walkable(x, y)}
    layout.zones["left_entrance"] = _rect_tiles(16, 76, 37, 79)


def generate(seed: int, variant: str, validate: bool = True) -> Layout:
    if variant not in VARIANTS:
        raise ValueError(f"unknown variant {variant}")
    rng = random.Random(seed * 7919 + VARIANTS.index(variant))
    layout = Layout(seed=seed, variant=variant)
    _carve_network(layout)
    _place_buildings(layout, rng)
    _assign_route(layout, rng)
    _index_doors(layout)
    _gulf_encounter(layout)
    _zones(layout)
    _decor(layout, rng)
    _stationary_npcs(layout)
    _walkers(layout, rng)
    if validate:
        _validate(layout)
    return layout


def _validate(layout: Layout) -> None:
    """Every door front, zone and the route must be reachable from the spawn."""
    reach = layout.reachable_from_spawn(extra_blocked=None)
    missing = [d["id"] for d in layout.door_index.values() if not (d["front"] & reach)]
    if missing:
        raise AssertionError(f"unreachable doors: {missing}")
    if not (layout.zones["gulf"] & reach):
        raise AssertionError("gulf encounter zone unreachable")
    # With the Gulf pair in place, the destination must only be reachable through their zone.
    dest = layout.door_index[layout.destination_id]
    blocked_zone = layout.reachable_from_spawn(extra_blocked=layout.zones["gulf"])
    if dest["front"] & blocked_zone:
        raise AssertionError("the destination can be reached without meeting the Gulf woman")
    # After they leave, the destination must remain reachable.
    gulf_tiles = set(layout.gulf["tiles"])
    for t in gulf_tiles:
        layout.blocked.discard(t)
    after = layout.reachable_from_spawn()
    for t in gulf_tiles:
        layout.blocked.add(t)
    if not (dest["front"] & after):
        raise AssertionError("destination unreachable after the encounter")


_CACHE: Dict[Tuple[int, str], Layout] = {}


def get_layout(seed: int, variant: str) -> Layout:
    key = (seed, variant)
    if key not in _CACHE:
        if len(_CACHE) > 64:
            _CACHE.clear()
        _CACHE[key] = generate(seed, variant)
    return _CACHE[key]
