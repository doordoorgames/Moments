// The Bicester Village overworld (Phaser 3). React owns the overlays; this file
// owns pixels, movement and camera. Server-authoritative: the navigator predicts
// its own steps, everyone else replays the server's accepted steps.
import { loadPhaser } from "./loadPhaser";
import { drawGround, drawShadows, drawSky, T } from "../art/tiles";
import { drawBuilding } from "../art/buildings";
import * as P from "../art/props";
import { CELL_H, CELL_W, emoteSheet, gulfWomanSheet, npcSheet, shougSheet } from "../art/characters";
import { glowCanvas, makeCanvas } from "../art/pixel";
import { t as tr } from "../i18n";
import { DIRS, freshCorrection, glideMs, makeBlockedGrid, targetInFront, walkableTile, walkerAt } from "./movement";

const DIR_BASE = { down: 0, up: 3, left: 6, right: 9 };
const TURN_MS = 70;
const DEPTH_GLOW = 1_000_000;

function feetY(tileY) {
    return (tileY + 1) * T + 1;
}

export function zoomFor(width, height) {
    return Math.max(2, Math.min(6, Math.floor(Math.min(width / 200, height / 250))));
}

export async function createVillageGame(parent, options) {
    const Phaser = await loadPhaser();
    const listeners = {};
    // Arabic-mode dusk experiment: every light source twice the size and more yellow.
    const DUSK = !!options.dusk;
    const AR = !!options.ar;
    if (AR && typeof document !== "undefined" && document.fonts?.load) {
        // Signs are drawn with Cairo; give it a moment to arrive so the first frame is right.
        await Promise.race([document.fonts.load("800 16px Cairo").catch(() => null), new Promise((r) => setTimeout(r, 1500))]);
    }
    const state = {
        navigator: !!options.navigator,
        lock: options.lock || null,
        gulf: options.gulf || { state: "waiting", stage: null },
        input: null,
        pending: [],
        pos: options.pos,
        stepMs: options.stepMs || 180,
        sceneKind: null,
        doorScene: null,
    };
    const emit = (name, payload) => (listeners[name] || []).forEach((cb) => cb(payload));
    let scene = null;

    class VillageScene extends Phaser.Scene {
        constructor() {
            super("village");
        }

        create() {
            scene = this;
            this.layout = options.layout;
            this.grid = makeBlockedGrid(this.layout);
            this.serverNow = options.serverNow || (() => Date.now());
            this.unblocked = new Set();
            this.buildTextures();
            this.buildWorld();
            this.buildCharacters();
            this.setupCamera();
            this.input.keyboard?.on("keydown", (e) => this.onKey(e, true));
            this.input.keyboard?.on("keyup", (e) => this.onKey(e, false));
            this.keys = new Set();
            this.scale.on("resize", () => this.fitCamera());
            this.game.events.on("blur", () => this.keys.clear());
            emit("ready", {});
        }

        // ------------------------------------------------------------ textures
        addCanvasTexture(key, canvas) {
            if (this.textures.exists(key)) this.textures.remove(key);
            return this.textures.addCanvas(key, canvas);
        }

        addSheet(key, canvas, fw, fh) {
            const tex = this.addCanvasTexture(key, canvas);
            const count = Math.floor(canvas.width / fw);
            for (let i = 0; i < count; i++) tex.add(i, 0, i * fw, 0, fw, fh);
            return tex;
        }

        buildTextures() {
            const L = this.layout;
            const ground = drawGround(L);
            drawShadows(ground.getContext("2d"), L);
            this.addCanvasTexture("ground", ground);
            this.skyH = (L.sky_rows || 9) * T;
            this.addCanvasTexture("sky", drawSky(L.w * T, this.skyH));
            this.addSheet("shoug", shougSheet(), CELL_W, CELL_H);
            const skins = new Set([...(L.walkers || []).map((w) => w.skin), ...(L.npcs || []).map((n) => n.skin), "son"]);
            for (const skin of skins) this.addSheet(`npc:${skin}`, npcSheet(skin), CELL_W, CELL_H);
            const woman = gulfWomanSheet();
            this.addSheet("gulf", woman.canvas, woman.w, woman.h);
            const emotes = emoteSheet();
            const etex = this.addCanvasTexture("emotes", emotes.canvas);
            for (const [name, [x, y, w, h]] of Object.entries(emotes.frames)) etex.add(name, 0, x, y, w, h);
            this.addCanvasTexture("glow", glowCanvas(32, DUSK ? "#ffe45c" : "#ffd98a"));
            this.addCanvasTexture("glow-rose", glowCanvas(32, "#ffb7a0"));
            this.addCanvasTexture("sparkle", P.sparkle());
            this.addCanvasTexture("dust", P.dust());
            const shadow = makeCanvas(14, 5);
            shadow.ctx.fillStyle = "rgba(64, 38, 104, .32)";
            shadow.ctx.beginPath();
            shadow.ctx.ellipse(7, 2.5, 6.5, 2.3, 0, 0, Math.PI * 2);
            shadow.ctx.fill();
            this.addCanvasTexture("foot-shadow", shadow.canvas);
        }

        propTexture(p) {
            const key = `prop:${p.kind}:${p.variant}:${p.kind === "tree" ? (p.x * 7 + p.y) % 3 : 0}${AR ? ":ar" : ""}`;
            if (!this.textures.exists(key)) {
                const make = {
                    tree: () => P.tree(p.variant, ((p.x * 7 + p.y) % 3) + 1), lamp: () => P.lamp(p.variant), bench: () => P.bench(p.variant),
                    planter: () => P.planter(p.variant), bush: () => P.bush(p.variant), fountain: P.fountain, clock_tower: P.clockTower,
                    gate: () => P.gate(AR), phonebox: P.phonebox, signpost: P.signpost, cafe_table: () => P.cafeTable(p.variant),
                }[p.kind];
                if (!make) return null;
                const art = make();
                this.addCanvasTexture(key, art.canvas);
                this.propMeta = this.propMeta || {};
                this.propMeta[key] = art;
            }
            return { key, art: this.propMeta[key] };
        }

        // ------------------------------------------------------------ world
        buildWorld() {
            const L = this.layout;
            this.add.image(0, -this.skyH, "sky").setOrigin(0, 0).setDepth(-3);
            this.add.image(0, 0, "ground").setOrigin(0, 0).setDepth(-2);
            this.glows = [];
            for (const b of L.buildings) {
                const art = drawBuilding(b, { textless: AR });
                this.addCanvasTexture(`b:${b.id}`, art.canvas);
                const left = b.x * T;
                const top = b.y * T - art.topMargin;
                this.add.image(left, top, `b:${b.id}`).setOrigin(0, 0).setDepth((b.y + b.h) * T);
                if (AR && art.sign) this.addSign(left + art.sign.x, top + art.sign.y, art.sign, (b.y + b.h) * T + 0.5);
                for (const g of art.glows) this.addGlow(left + g.x, top + g.y, g.r, g.a * 0.8, "glow");
                if (b.door.style === "gold_double" || b.door.style === "gold_single") this.addSparkles(left + art.door.x, top + art.door.y, art.door.w, art.door.h);
            }
            const anchorY = { fountain: 4, clock_tower: 5, gate: 5, phonebox: 2 };
            for (const p of L.props) {
                if (p.kind === "string_lights") { this.addStringLights(p); continue; }
                const tex = this.propTexture(p);
                if (!tex) continue;
                const baseY = (p.y + (anchorY[p.kind] || 1)) * T;
                const x = p.x * T - tex.art.ox;
                const y = baseY - tex.art.oy;
                this.add.image(x, y, tex.key).setOrigin(0, 0).setDepth(baseY - 1);
                if (AR && tex.art.label) this.addSign(x + tex.art.label.x, y + tex.art.label.y, tex.art.label, baseY - 0.5);
                for (const [lx, ly] of tex.art.lights || []) {
                    const glow = this.addGlow(x + lx, y + ly, p.kind === "lamp" ? 30 : 22, 0.72, "glow");
                    this.flicker(glow);
                }
            }
            // Fountain sparkles on the water.
            const f = L.props.find((p) => p.kind === "fountain");
            if (f) {
                for (let i = 0; i < 6; i++) {
                    const s = this.add.image(f.x * T + 10 + ((i * 37) % 44), f.y * T + 8 + ((i * 23) % 44), "sparkle").setDepth(DEPTH_GLOW).setAlpha(0);
                    this.tweens.add({ targets: s, alpha: { from: 0, to: 0.9 }, duration: 600, yoyo: true, repeat: -1, delay: i * 420, hold: 120 });
                }
            }
            // Dusk experiment: a 25% purple wash over the whole map, under the lights.
            if (DUSK) this.add.rectangle(0, -this.skyH, L.w * T, L.h * T + this.skyH, 0x6e32a0, 0.25).setOrigin(0, 0).setDepth(DEPTH_GLOW - 2);
            // Drifting golden motes in the low sun.
            this.motes = [];
            for (let i = 0; i < 26; i++) {
                const m = this.add.image(((i * 97) % L.w) * T, ((i * 61) % L.h) * T, "glow-rose").setDepth(DEPTH_GLOW + 1)
                    .setScale(0.07).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD);
                m.drift = { vx: 4 + (i % 5), vy: -2 - (i % 3), phase: i };
                this.motes.push(m);
            }
        }

        // Crisp Arabic shop sign laid over a pixel fascia, shrunk to fit its width.
        addSign(x, y, sign, depth) {
            const res = Math.min(18, Math.ceil(6 * (window.devicePixelRatio || 1))); // max camera zoom x screen density
            const label = this.add.text(x + sign.w / 2, y + sign.h / 2, tr(sign.text, "ar"), {
                fontFamily: "Cairo, system-ui, sans-serif", fontStyle: "800", fontSize: `${Math.max(6, sign.h - 1)}px`, color: sign.color,
                stroke: "rgba(0,0,0,.55)", strokeThickness: 0.6, padding: { x: 1, y: 2 }, rtl: true,
            }).setOrigin(0.5, 0.55).setResolution(res).setDepth(depth);
            const fit = (sign.w - 3) / Math.max(1, label.width);
            if (fit < 1) label.setScale(fit);
            return label;
        }

        addGlow(x, y, r, alpha, key) {
            const size = DUSK && key === "glow" ? r * 2 : r;
            const g = this.add.image(x, y, key).setDepth(DEPTH_GLOW).setAlpha(alpha).setScale((size * 2) / 64)
                .setBlendMode(Phaser.BlendModes.ADD);
            this.glows.push(g);
            return g;
        }

        flicker(g) {
            const base = g.alpha;
            this.tweens.add({ targets: g, alpha: { from: base * 0.82, to: base }, duration: 900 + Math.random() * 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
        }

        addSparkles(x, y, w, h) {
            for (let i = 0; i < 3; i++) {
                const s = this.add.image(x + 3 + ((i * 11) % Math.max(4, w - 4)), y + 3 + ((i * 7) % Math.max(4, h - 6)), "sparkle").setDepth(DEPTH_GLOW).setAlpha(0);
                this.tweens.add({ targets: s, alpha: { from: 0, to: 1 }, scale: { from: 0.4, to: 1 }, duration: 380, yoyo: true, repeat: -1, delay: 700 + i * 1300, repeatDelay: 2600 });
            }
        }

        addStringLights(p) {
            const x0 = p.x * T + 2;
            const x1 = (p.to_x + 1) * T - 2;
            const y0 = p.y * T - 18;
            const gfx = this.add.graphics().setDepth(DEPTH_GLOW - 1);
            gfx.lineStyle(1, 0x2a1f33, 0.8);
            const pts = [];
            for (let i = 0; i <= 24; i++) {
                const t = i / 24;
                pts.push([x0 + (x1 - x0) * t, y0 + Math.sin(t * Math.PI) * 9]);
            }
            gfx.beginPath();
            gfx.moveTo(pts[0][0], pts[0][1]);
            for (const [x, y] of pts) gfx.lineTo(x, y);
            gfx.strokePath();
            pts.forEach(([x, y], i) => {
                if (i % 2) return;
                gfx.fillStyle([0xfff1c4, 0xffc0cf, 0xc9f0d0][i % 3], 1);
                gfx.fillRect(Math.round(x) - 1, Math.round(y), 2, 2);
                const g = this.addGlow(x, y + 1, 7, 0.55, "glow");
                this.flicker(g);
            });
        }

        // ------------------------------------------------------------ characters
        buildCharacters() {
            const L = this.layout;
            const pos = state.pos || L.spawn;
            this.me = {
                x: pos.x, y: pos.y, dir: pos.dir || "up", moving: null, seq: pos.seq || 0, turnedAt: 0, parity: 0,
                queue: [], lastSeq: pos.seq || 0, hidden: false, snapSeq: pos.seq || 0,
            };
            this.shougShadow = this.add.image(0, 0, "foot-shadow").setDepth(0);
            this.shoug = this.add.sprite(0, 0, "shoug", DIR_BASE[this.me.dir]).setOrigin(0.5, 1);
            this.placeShoug(pos.x, pos.y);
            this.walkers = (L.walkers || []).map((w) => {
                const shadow = this.add.image(0, 0, "foot-shadow").setDepth(0);
                const sprite = this.add.sprite(0, 0, `npc:${w.skin}`, 0).setOrigin(0.5, 1);
                return { data: w, sprite, shadow, vt: this.serverNow(), tile: null };
            });
            this.npcSprites = (L.npcs || []).map((n) => {
                this.add.image(n.x * T + 9, feetY(n.y) - 1, "foot-shadow").setDepth(feetY(n.y) - 2);
                const s = this.add.sprite(n.x * T + 8, feetY(n.y), `npc:${n.skin}`, DIR_BASE[n.dir] || 0).setOrigin(0.5, 1).setDepth(feetY(n.y));
                if (n.id === "busker") {
                    const note = this.add.image(n.x * T + 14, feetY(n.y) - 28, "emotes", "note").setDepth(DEPTH_GLOW);
                    this.tweens.add({ targets: note, y: note.y - 6, alpha: { from: 1, to: 0 }, duration: 1400, repeat: -1 });
                }
                return s;
            });
            const g = L.gulf;
            this.gulfSon = this.add.sprite(g.son.x * T + 8, feetY(g.son.y), "npc:son", DIR_BASE.down).setOrigin(0.5, 1).setDepth(feetY(g.son.y));
            this.gulfWoman = this.add.sprite(g.woman.x * T + 8, feetY(g.woman.y) + 1, "gulf", 0).setOrigin(0.5, 1).setDepth(feetY(g.woman.y));
            this.gulfShadow = this.add.image(g.woman.x * T + 9, feetY(g.woman.y) - 1, "foot-shadow").setScale(1.6, 1.4).setDepth(feetY(g.woman.y) - 2);
            this.gulfEmote = this.add.image(g.woman.x * T + 12, feetY(g.woman.y) - 30, "emotes", "bang").setDepth(DEPTH_GLOW).setVisible(false);
            this.steamTimer = 0;
            this.applyGulf(true);
        }

        placeShoug(x, y) {
            this.shoug.setPosition(x * T + 8, feetY(y));
            this.shoug.setDepth(feetY(y));
            this.shougShadow.setPosition(x * T + 9, feetY(y) - 2).setDepth(feetY(y) - 2);
            emit("tile", { x, y });
        }

        setupCamera() {
            const L = this.layout;
            const cam = this.cameras.main;
            cam.setBounds(0, -this.skyH, L.w * T, L.h * T + this.skyH);
            cam.setRoundPixels(true);
            // Locked follow (lerp 1): an eased camera rounded to whole pixels made Shoug
            // stutter and trail when she set off up the main street.
            cam.startFollow(this.shoug, true, 1, 1, 0, 12);
            this.fitCamera();
            cam.centerOn(this.shoug.x, this.shoug.y);
        }

        fitCamera() {
            const cam = this.cameras.main;
            cam.setZoom(zoomFor(this.scale.width, this.scale.height));
        }

        onKey(e, down) {
            const map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right" };
            const dir = map[e.key];
            if (dir) {
                if (down) this.keys.add(dir);
                else this.keys.delete(dir);
                e.preventDefault?.();
            }
            if (down && (e.key === " " || e.key === "Enter" || e.key === "z" || e.key === "Z")) emit("interact", this.frontTarget());
        }

        // ------------------------------------------------------------ helpers
        walkable(x, y) {
            if (!walkableTile(this.layout, this.grid, x, y, null, this.unblocked)) return false;
            for (const w of this.walkers) {
                if (!w.tile) continue;
                if ((w.tile[0] === x && w.tile[1] === y) || (w.nextTile && w.nextTile[0] === x && w.nextTile[1] === y)) return false;
            }
            return true;
        }

        frontTarget() {
            return targetInFront(this.layout, this.me.x, this.me.y, this.me.dir);
        }

        currentInput() {
            const keys = [...this.keys];
            return state.input || keys[keys.length - 1] || null;
        }

        // ------------------------------------------------------------ server sync
        applyServerPos(pos, teleport) {
            const me = this.me;
            if (!pos) return;
            if (state.navigator && !teleport) {
                if (pos.seq > me.seq) {
                    // A newer authoritative position (e.g. after a navigator change).
                    this.snap(pos);
                }
                return;
            }
            if (teleport || pos.seq < me.lastSeq - 500) {
                this.snap(pos);
                return;
            }
            if (pos.seq <= me.lastSeq) return;
            me.lastSeq = pos.seq;
            const tail = me.queue.length ? me.queue[me.queue.length - 1] : me.moving ? { x: me.moving.toX, y: me.moving.toY } : { x: me.x, y: me.y };
            const dist = Math.abs(pos.x - tail.x) + Math.abs(pos.y - tail.y);
            if (dist > 1) {
                this.snap(pos);
                return;
            }
            me.queue.push({ x: pos.x, y: pos.y, dir: pos.dir, seq: pos.seq });
        }

        applyCorrection(pos, info) {
            if (!state.navigator || !pos) return;
            // A movement lock (call, scene...) is the usual reason: stop walking right away
            // instead of firing more steps that would each bounce back.
            // Short hold only: the real lock arrives with the next state update.
            if (info && info.lock) this.me.holdUntil = this.time.now + 1200;
            // Steps that were already in flight when we last snapped bounce too; ignore them.
            if (!freshCorrection(info, this.me.snapSeq)) return;
            const me = this.me;
            const at = me.moving ? { x: me.moving.toX, y: me.moving.toY } : { x: me.x, y: me.y };
            if (at.x === pos.x && at.y === pos.y) {
                // Already there: just finish the current step, no jump.
                me.snapSeq = me.seq;
                return;
            }
            this.snap(pos, true);
            me.blockUntil = this.time.now + 120;
        }

        snap(pos, glide = false) {
            const me = this.me;
            const fromX = me.moving ? me.moving.fromX + (me.moving.toX - me.moving.fromX) * Math.min(1, (this.time.now - me.moving.t0) / me.moving.dur) : me.x;
            const fromY = me.moving ? me.moving.fromY + (me.moving.toY - me.moving.fromY) * Math.min(1, (this.time.now - me.moving.t0) / me.moving.dur) : me.y;
            const dur = glide ? glideMs({ x: fromX, y: fromY }, pos, state.stepMs) : 0;
            me.moving = null;
            me.queue = [];
            me.x = pos.x;
            me.y = pos.y;
            me.dir = pos.dir || me.dir;
            me.seq = Math.max(me.seq, pos.seq || 0);
            me.lastSeq = Math.max(me.lastSeq, pos.seq || 0);
            me.snapSeq = me.seq;
            if (dur > 0) {
                // Slide back from where she is drawn now, so a correction never looks like a teleport.
                me.moving = { fromX, fromY, toX: pos.x, toY: pos.y, t0: this.time.now, dur, glide: true };
                return;
            }
            this.placeShoug(me.x, me.y);
            this.shoug.setFrame(DIR_BASE[me.dir]);
        }

        setNavigator(on, pos) {
            const was = state.navigator;
            state.navigator = on;
            if (on && !was) {
                // Take over from whatever is currently on screen, then align with the server.
                if (pos) this.snap(pos);
                this.me.seq = Math.max(this.me.seq, pos ? pos.seq : 0);
            }
            if (!on && was) {
                this.me.queue = [];
                this.me.lastSeq = this.me.seq;
            }
        }

        // ------------------------------------------------------------ frame loop
        update(time, delta) {
            this.updateShoug(time);
            this.updateWalkers(delta);
            this.updateGulf(delta);
            this.updateMotes(delta);
            const t = this.frontTarget();
            const label = t ? `${t.kind}:${t.kind === "door" ? t.building.id : t.npc.id}` : "";
            if (label !== this.lastHint) {
                this.lastHint = label;
                emit("hint", t);
            }
        }

        updateShoug(time) {
            const me = this.me;
            const stepMs = state.stepMs;
            if (me.moving) {
                const p = Math.min(1, (time - me.moving.t0) / me.moving.dur);
                const x = me.moving.fromX + (me.moving.toX - me.moving.fromX) * p;
                const y = me.moving.fromY + (me.moving.toY - me.moving.fromY) * p;
                this.shoug.setPosition(Math.round(x * T + 8), Math.round(feetY(y)));
                this.shoug.setDepth(feetY(Math.max(me.moving.fromY, me.moving.toY)));
                this.shougShadow.setPosition(Math.round(x * T + 9), Math.round(feetY(y) - 2)).setDepth(this.shoug.depth - 2);
                const stepFrame = me.moving.glide ? 0 : p < 0.55 ? (me.parity ? 1 : 2) : 0;
                this.shoug.setFrame(DIR_BASE[me.dir] + stepFrame);
                if (p >= 1) {
                    me.x = me.moving.toX;
                    me.y = me.moving.toY;
                    me.moving = null;
                    me.parity ^= 1;
                    this.placeShoug(me.x, me.y);
                }
            }
            if (me.moving) return;
            if (state.navigator) {
                const dir = this.currentInput();
                if (!dir || state.lock || (me.blockUntil && time < me.blockUntil) || (me.holdUntil && time < me.holdUntil)) {
                    this.shoug.setFrame(DIR_BASE[me.dir]);
                    return;
                }
                if (dir !== me.dir) {
                    me.dir = dir;
                    me.seq += 1;
                    me.turnedAt = time;
                    this.shoug.setFrame(DIR_BASE[dir]);
                    emit("face", { seq: me.seq, dir });
                    return;
                }
                if (time - me.turnedAt < TURN_MS) return;
                const [dx, dy] = DIRS[dir];
                const nx = me.x + dx;
                const ny = me.y + dy;
                if (!this.walkable(nx, ny)) {
                    this.shoug.setFrame(DIR_BASE[dir]);
                    return;
                }
                me.seq += 1;
                me.moving = { fromX: me.x, fromY: me.y, toX: nx, toY: ny, t0: time, dur: stepMs };
                emit("step", { seq: me.seq, x: nx, y: ny, dir });
            } else if (me.queue.length) {
                const next = me.queue.shift();
                me.dir = next.dir || me.dir;
                if (next.x === me.x && next.y === me.y) {
                    this.shoug.setFrame(DIR_BASE[me.dir]);
                    return;
                }
                const hurry = me.queue.length > 1 ? 1.7 : 1;
                me.moving = { fromX: me.x, fromY: me.y, toX: next.x, toY: next.y, t0: time, dur: stepMs / hurry };
            } else {
                this.shoug.setFrame(DIR_BASE[me.dir]);
            }
        }

        updateWalkers(delta) {
            const now = this.serverNow();
            const me = this.me;
            const shougTiles = [[me.x, me.y]];
            if (me.moving) shougTiles.push([me.moving.toX, me.moving.toY]);
            for (const w of this.walkers) {
                const target = walkerAt(w.data, w.vt);
                const blocked = shougTiles.some(([x, y]) => (x === target.next[0] && y === target.next[1]) || (x === target.tile[0] && y === target.tile[1] && target.frac > 0.05));
                let rate = 1;
                if (blocked) rate = 0;
                else if (w.vt < now - 30) rate = 2;
                w.vt = Math.min(now, w.vt + delta * rate);
                if (now - w.vt > 20_000) w.vt = now; // tab was asleep: just resync
                const at = walkerAt(w.data, w.vt);
                w.tile = at.tile;
                w.nextTile = at.frac > 0 ? at.next : null;
                const step = Math.floor(w.vt / w.data.step_ms);
                const frame = DIR_BASE[at.dir] + (rate === 0 ? 0 : at.frac < 0.5 ? (step % 2 ? 1 : 2) : 0);
                w.sprite.setFrame(frame);
                w.sprite.setPosition(Math.round(at.x * T + 8), Math.round(feetY(at.y)));
                w.sprite.setDepth(feetY(Math.max(at.tile[1], at.next[1])));
                w.shadow.setPosition(Math.round(at.x * T + 9), Math.round(feetY(at.y) - 2)).setDepth(w.sprite.depth - 2);
            }
        }

        updateMotes(delta) {
            const L = this.layout;
            const s = delta / 1000;
            for (const m of this.motes) {
                m.x += m.drift.vx * s;
                m.y += m.drift.vy * s + Math.sin((this.time.now / 1000) + m.drift.phase) * 0.05;
                if (m.x > L.w * T) m.x = 0;
                if (m.y < 0) m.y = L.h * T;
            }
        }

        // ------------------------------------------------------------ the Gulf encounter
        applyGulf(initial = false) {
            const g = state.gulf || {};
            const L = this.layout;
            const gone = g.state === "gone";
            const tiles = [[L.gulf.woman.x, L.gulf.woman.y], [L.gulf.son.x, L.gulf.son.y]];
            if (gone) tiles.forEach(([x, y]) => this.unblocked.add(`${x},${y}`));
            else tiles.forEach(([x, y]) => this.unblocked.delete(`${x},${y}`));
            const stage = g.stage;
            if (stage === "leave" && !this.leaving && !initial) {
                this.leaving = true;
                this.gulfWoman.setFrame(3);
                const path = L.gulf.exit;
                const steps = [];
                let last = [L.gulf.woman.x, L.gulf.woman.y];
                for (const [x, y] of path) {
                    steps.push({ dx: (x - last[0]) * T, dy: (y - last[1]) * T, dist: Math.abs(x - last[0]) + Math.abs(y - last[1]) });
                    last = [x, y];
                }
                const total = steps.reduce((a, s) => a + s.dist, 0) || 1;
                const dur = (g.leaveMs || 2600) * 0.85;
                const chain = steps.map((s) => ({ x: `+=${s.dx}`, y: `+=${s.dy}`, duration: (dur * s.dist) / total, ease: "Linear" }));
                this.gulfSon.setFrame(DIR_BASE.up);
                this.tweens.chain({ targets: [this.gulfWoman, this.gulfSon, this.gulfShadow], tweens: chain });
                this.tweens.add({ targets: [this.gulfWoman, this.gulfSon, this.gulfShadow], alpha: 0, delay: dur, duration: 300 });
                this.dustPuffs = 10;
            }
            if (gone && initial) {
                this.gulfWoman.setVisible(false);
                this.gulfSon.setVisible(false);
                this.gulfShadow.setVisible(false);
            }
            if (gone) this.gulfEmote.setVisible(false);
            this.gulfEmote.setVisible(stage === "greet");
            if (stage === "greet") this.tweens.add({ targets: this.gulfWoman, y: this.gulfWoman.y - 3, duration: 120, yoyo: true, repeat: 1 });
            if (stage === "inspect") this.gulfWoman.setFrame(1);
            if (stage === "wrong") {
                this.gulfWoman.setFrame(0);
                this.tweens.add({ targets: this.gulfWoman, x: this.gulfWoman.x + 2, duration: 60, yoyo: true, repeat: 3 });
            }
            if (stage === "react") {
                this.gulfWoman.setFrame(2);
                this.time.delayedCall(450, () => this.gulfWoman.setFrame(3));
                this.tweens.add({ targets: this.gulfWoman, y: this.gulfWoman.y - 6, duration: 140, yoyo: true, repeat: 2, ease: "Quad.easeOut" });
            }
            if (!stage && !gone) this.gulfWoman.setFrame(0);
        }

        updateGulf(delta) {
            const stage = (state.gulf || {}).stage;
            if (stage === "react" || stage === "leave") {
                this.steamTimer -= delta;
                if (this.steamTimer <= 0 && this.gulfWoman.visible && this.gulfWoman.alpha > 0.2) {
                    this.steamTimer = 170;
                    const puff = this.add.image(this.gulfWoman.x - 6 + Math.random() * 12, this.gulfWoman.y - 26, "emotes", "steam")
                        .setDepth(DEPTH_GLOW).setScale(0.5).setAlpha(0.95);
                    this.tweens.add({ targets: puff, y: puff.y - 18, x: puff.x + (Math.random() * 10 - 5), scale: 1, alpha: 0, duration: 900, onComplete: () => puff.destroy() });
                }
            }
            if (this.dustPuffs > 0 && this.gulfWoman.alpha > 0.2) {
                this.dustTimer = (this.dustTimer || 0) - delta;
                if (this.dustTimer <= 0) {
                    this.dustTimer = 90;
                    this.dustPuffs -= 1;
                    const d = this.add.image(this.gulfWoman.x, this.gulfWoman.y - 2, "dust").setDepth(this.gulfWoman.depth + 1);
                    this.tweens.add({ targets: d, alpha: 0, scale: 1.8, duration: 500, onComplete: () => d.destroy() });
                }
            }
        }

        // ------------------------------------------------------------ cutscenes
        enterShop() {
            const me = this.me;
            this.tweens.add({ targets: [this.shoug, this.shougShadow], y: `-=${T}`, alpha: 0, duration: 650, ease: "Quad.easeIn" });
            me.hidden = true;
        }

        emoteOnShoug(kind = "bang") {
            const e = this.add.image(this.shoug.x + 4, this.shoug.y - 28, "emotes", kind).setDepth(DEPTH_GLOW);
            this.tweens.add({ targets: e, y: e.y - 4, duration: 160, yoyo: true, repeat: 1, onComplete: () => this.time.delayedCall(700, () => e.destroy()) });
        }
    }

    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
    const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent,
        width,
        height,
        backgroundColor: "#2a1f33",
        pixelArt: true,
        roundPixels: true,
        antialias: false,
        banner: false,
        disableContextMenu: true,
        audio: { noAudio: true },
        input: { keyboard: true, touch: false, mouse: false, gamepad: false },
        render: { pixelArt: true, antialias: false, powerPreference: "high-performance" },
        scale: { mode: Phaser.Scale.RESIZE, width, height },
        scene: [VillageScene],
    });

    const ready = new Promise((resolve) => {
        listeners.ready = [...(listeners.ready || []), resolve];
    });

    const controller = {
        game,
        ready,
        on(name, cb) {
            listeners[name] = [...(listeners[name] || []), cb];
            return () => { listeners[name] = (listeners[name] || []).filter((x) => x !== cb); };
        },
        setInput(dir) { state.input = dir; },
        setNavigator(on, pos) { state.navigator = on; if (scene) scene.setNavigator(on, pos); },
        setLock(lock) { state.lock = lock || null; },
        setStepMs(ms) { if (ms) state.stepMs = ms; },
        applyServerPos(pos, teleport = false) { if (scene) scene.applyServerPos(pos, teleport); else state.pos = pos; },
        applyCorrection(pos, info) { if (scene) scene.applyCorrection(pos, info); },
        setGulf(gulf) {
            const prev = state.gulf || {};
            state.gulf = gulf;
            if (scene && (prev.stage !== gulf.stage || prev.state !== gulf.state)) scene.applyGulf(false);
        },
        enterShop() { scene?.enterShop(); },
        emote(kind) { scene?.emoteOnShoug(kind); },
        frontTarget() { return scene ? scene.frontTarget() : null; },
        position() { return scene ? { x: scene.me.x, y: scene.me.y, dir: scene.me.dir, seq: scene.me.seq } : null; },
        // True while Shoug is mid-step, so A waits for her to arrive before asking what is in front.
        isMoving() { return !!(scene && scene.me.moving); },
        resize() { if (scene) scene.scale.resize(parent.clientWidth, parent.clientHeight); },
        destroy() {
            try { game.destroy(true); } catch (_) { /* already gone */ }
            scene = null;
        },
    };
    return controller;
}
