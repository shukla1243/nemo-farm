/**
 * The hero diorama: a small dusk island built from the full game's v2 isometric art, drawn on a
 * canvas at art resolution and blown up by a whole number of device pixels with nearest-neighbour
 * sampling. The player's Friend idles on the jetty beside the moored ship.
 */
import { drawFrame, spriteFrame, type FriendArt } from "@rarefriends/friendsdk";
import { SEA_DROP, TILE_H, TILE_W, cellVariant, depthKey, rng, skirtPixels, tileToScreen, foamOn } from "./iso";

type Light = { x: number; y: number; r: number; color: string };
type Meta = { w: number; h: number; origin: [number, number]; footprint: [number, number]; lights: Light[] };
type Asset = { img: HTMLImageElement; meta: Meta };

/** Land cells: s sand, g grass, p path. Rows are ty, columns tx. The path runs from the hut door to the jetty. */
const MAP = [
  "............",
  "..sssss.....",
  ".ssgggsss...",
  ".sgggggggs..",
  ".sggpppppp..",
  ".ssgggggss..",
  "..sssssss...",
  "............",
];
const KIND: Record<string, string> = { s: "sand", g: "grass", p: "path" };
const HUT = { tx: 2, ty: 1 };
const DOCK = { tx: 10, ty: 4 };
const SHIP = { tx: 10, ty: 2 };
const LAMP = { tx: 9, ty: 3 };
const PALMS = [
  { tx: 7, ty: 2, v: 1 },
  { tx: 1, ty: 4, v: 0 },
  { tx: 8, ty: 5, v: 0 },
  { tx: 3, ty: 6, v: 1 },
] as const;
/** Where the Friend stands: out on the jetty, by the ship. */
const FRIEND = { tx: 11.1, ty: 4.5 };

const SEA = "#2f5a62", RIPPLE = "#4f8a86", GLINT = "#93b6ea", SPARK = "#f6e6bd";
const BAND = "#223d30", FOAM = "#f6e6bd";
const DUSK = "#aab4da";
const SEA_W = 192, SEA_H = 96, SEA_FRAMES = 4, FOAM_FRAMES = 4;

const ASSETS = ["hut", "ship", "dock", "lamp", "palm-0", "palm-1", ...["grass", "sand", "path"].flatMap(k => [`ground-${k}-0`, `ground-${k}-1`])];

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

async function loadAsset(name: string): Promise<Asset> {
  const [meta, img] = await Promise.all([
    fetch(`v2/${name}.json`).then(r => { if (!r.ok) throw new Error(`Could not load ${name}.json`); return r.json() as Promise<Meta>; }),
    loadImage(`v2/${name}.png`),
  ]);
  return { img, meta };
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  return { c, g };
}

/** Calm open sea tile: drifting ripples and a few glints, one canvas per frame. */
function seaFrames() {
  return Array.from({ length: SEA_FRAMES }, (_, f) => {
    const { c, g } = canvas(SEA_W, SEA_H);
    g.fillStyle = SEA; g.fillRect(0, 0, SEA_W, SEA_H);
    const r = rng(7);
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(r() * SEA_W), y = Math.floor(r() * (SEA_H / 2)) * 2, len = 3 + Math.floor(r() * 5), phase = Math.floor(r() * 4);
      const sway = [0, 1, 1, 0][(f + phase) % 4];
      g.fillStyle = RIPPLE;
      for (const dx of [0, SEA_W]) g.fillRect(x + sway - dx, y, len, 1);
    }
    for (let i = 0; i < 24; i++) {
      const x = Math.floor(r() * SEA_W), y = Math.floor(r() * (SEA_H / 2)) * 2 + 1, on = Math.floor(r() * SEA_FRAMES);
      if (on !== f) continue;
      g.fillStyle = i % 3 === 0 ? SPARK : GLINT;
      for (const dx of [0, SEA_W]) g.fillRect(x - dx, y, 2, 1);
    }
    return c;
  });
}

type Placed = { asset: Asset; x: number; y: number; z: number; bob?: boolean };

export type Scene = {
  /** Draw the frame for time `t` (seconds) into the screen canvas. */
  render(t: number): void;
  /** Recompute the camera and backing store for the current size and the card's rectangle. */
  layout(open: { x: number; y: number; w: number; h: number }): void;
  setArt(art: FriendArt | null): void;
};

export async function createScene(screen: HTMLCanvasElement): Promise<Scene> {
  const list = await Promise.all(ASSETS.map(loadAsset));
  const A = Object.fromEntries(ASSETS.map((n, i) => [n, list[i]])) as Record<string, Asset>;
  const W = MAP[0].length, H = MAP.length;
  const land = (tx: number, ty: number) => ty >= 0 && ty < H && tx >= 0 && tx < W && MAP[ty][tx] !== ".";

  // Base layer in world space: the dark shore band, then the ground blocks back to front.
  const bx = -(H + 2) * (TILE_W / 2), by = -TILE_H;
  const bw = (W + H + 4) * (TILE_W / 2), bh = (W + H + 4) * (TILE_H / 2) + 64;
  const base = canvas(bw, bh);
  const skirt = skirtPixels(W, H, land);
  base.g.fillStyle = BAND;
  for (let i = 0; i < skirt.band.length; i += 2) base.g.fillRect(skirt.band[i] - bx, skirt.band[i + 1] - by, 1, 1);
  const cells: { tx: number; ty: number; kind: string }[] = [];
  MAP.forEach((row, ty) => [...row].forEach((ch, tx) => { if (KIND[ch]) cells.push({ tx, ty, kind: KIND[ch] }); }));
  cells.sort((a, b) => depthKey(a.tx, a.ty) - depthKey(b.tx, b.ty));
  for (const c of cells) {
    const a = A[`ground-${c.kind}-${cellVariant(c.tx, c.ty)}`];
    const p = tileToScreen(c.tx, c.ty);
    base.g.drawImage(a.img, p.x - a.meta.origin[0] - bx, p.y - a.meta.origin[1] - by);
  }
  const foam = Array.from({ length: FOAM_FRAMES }, (_, f) => {
    const layer = canvas(bw, bh);
    layer.g.fillStyle = FOAM;
    for (const p of skirt.foam) if (foamOn(p.x, p.y, p.d, f, FOAM_FRAMES)) layer.g.fillRect(p.x - bx, p.y - by, 1, 1);
    return layer.c;
  });
  const sea = seaFrames();

  // Props, sorted back to front by the front tile of their footprint.
  const place = (asset: Asset, tx: number, ty: number, z = depthKey(tx + asset.meta.footprint[0] - 1, ty + asset.meta.footprint[1] - 1, 1)): Placed => {
    const p = tileToScreen(tx, ty);
    return { asset, x: p.x - asset.meta.origin[0], y: p.y - asset.meta.origin[1], z };
  };
  const ship = place(A.ship, SHIP.tx, SHIP.ty, depthKey(SHIP.tx, SHIP.ty, 0));
  ship.y += SEA_DROP;
  ship.bob = true;
  const props: Placed[] = [
    // The hut's walls stop short of its footprint's front row; it sorts by the doorstep tile.
    place(A.hut, HUT.tx, HUT.ty, depthKey(HUT.tx + 1, HUT.ty + 2, 1)),
    ship,
    place(A.dock, DOCK.tx, DOCK.ty, ship.z + 1),
    place(A.lamp, LAMP.tx, LAMP.ty, ship.z + 0.5),
    ...PALMS.map(p => place(A[`palm-${p.v}`], p.tx, p.ty)),
  ].sort((a, b) => a.z - b.z);

  const lights = props.flatMap(p => p.asset.meta.lights.map(l => ({ x: p.x + l.x, y: p.y + l.y, r: l.r, color: l.color, bob: !!p.bob })));
  const feet = tileToScreen(FRIEND.tx, FRIEND.ty);
  const fx = Math.round(feet.x), fy = Math.round(feet.y);

  // Fireflies over the meadow, in world art px.
  const r = rng(41);
  const flies = Array.from({ length: 11 }, () => {
    const c = tileToScreen(2 + r() * 6.5, 2 + r() * 4);
    return { x: c.x, y: c.y - 10 - r() * 26, phase: r() * Math.PI * 2, speed: 0.4 + r() * 0.5, amp: 3 + r() * 5 };
  });

  // The framed hero: the hut's door side, the jetty, the ship and the Friend. The hut's far wall
  // may crop on narrow screens so the scale can stay a step larger.
  const hut = props.find(p => p.asset === A.hut)!;
  const xs = [hut.x + 48, ship.x + ship.asset.meta.w, fx - 20, fx + 20];
  const ys = [hut.y, ship.y + ship.asset.meta.h - 24, fy + 24];
  const frame = { x: Math.min(...xs) - 8, y: Math.min(...ys) - 8, w: Math.max(...xs) - Math.min(...xs) + 16, h: Math.max(...ys) - Math.min(...ys) + 16 };

  const art = canvas(1, 1);
  const sg = screen.getContext("2d")!;
  let k = 1, camX = 0, camY = 0, friendArt: FriendArt | null = null;

  const layout: Scene["layout"] = open => {
    const dpr = window.devicePixelRatio || 1;
    const rect = screen.getBoundingClientRect();
    const dw = Math.max(1, Math.round(rect.width * dpr)), dh = Math.max(1, Math.round(rect.height * dpr));
    if (screen.width !== dw || screen.height !== dh) { screen.width = dw; screen.height = dh; }
    const ow = Math.max(1, open.w * dpr), oh = Math.max(1, open.h * dpr);
    k = Math.max(1, Math.min(8, Math.floor(Math.min(ow / frame.w, oh / frame.h))));
    const aw = Math.ceil(dw / k), ah = Math.ceil(dh / k);
    if (art.c.width !== aw || art.c.height !== ah) { art.c.width = aw; art.c.height = ah; art.g.imageSmoothingEnabled = false; }
    // Centre the frame in the open area; when it does not fit, keep the Friend in view.
    const vw = ow / k, vh = oh / k;
    let cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2;
    const mx = Math.min(48, vw / 2 - 1), my = Math.min(40, vh / 2 - 1);
    cx = Math.min(Math.max(cx, fx - vw / 2 + mx), fx + vw / 2 - mx);
    cy = Math.min(Math.max(cy, fy - vh / 2 + my), fy - 32 + vh / 2 - my);
    camX = Math.round(cx - (open.x * dpr + ow / 2) / k);
    camY = Math.round(cy - (open.y * dpr + oh / 2) / k);
  };

  const render = (t: number) => {
    const g = art.g, aw = art.c.width, ah = art.c.height;
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    // Sea, fixed to the world and drifting a pixel at a time.
    const tile = sea[Math.floor(t / 0.42) % SEA_FRAMES];
    const drift = Math.floor(t / 0.9);
    const ox = -(((camX - drift) % SEA_W) + SEA_W) % SEA_W, oy = -((camY % SEA_H) + SEA_H) % SEA_H;
    for (let y = oy; y < ah; y += SEA_H) for (let x = ox; x < aw; x += SEA_W) g.drawImage(tile, x, y);
    g.drawImage(base.c, bx - camX, by - camY);
    g.drawImage(foam[Math.floor(t / 0.52) % FOAM_FRAMES], bx - camX, by - camY);
    const bob = Math.sin(t * 1.6) > 0.35 ? 1 : 0;
    for (const p of props) g.drawImage(p.asset.img, p.x - camX, p.y + (p.bob ? bob : 0) - camY);
    // The Friend's soft shadow on the planks.
    if (friendArt) {
      g.fillStyle = "rgba(20, 16, 30, 0.45)";
      for (let y = -2; y <= 2; y++) {
        const half = Math.round(9 * Math.sqrt(1 - (y / 3) ** 2));
        g.fillRect(fx - half - camX, fy + y - camY, half * 2 + 1, 1);
      }
    }
    // Dusk: cool the whole scene, then let the lamps, windows and lanterns glow.
    g.globalCompositeOperation = "multiply";
    g.fillStyle = DUSK;
    g.fillRect(0, 0, aw, ah);
    g.globalCompositeOperation = "lighter";
    for (const l of lights) {
      const x = l.x - camX, y = l.y + (l.bob ? bob : 0) - camY;
      const flicker = 0.32 + 0.04 * Math.sin(t * 3.1 + l.x);
      const grad = g.createRadialGradient(x, y, 0, x, y, l.r);
      grad.addColorStop(0, hexA(l.color, flicker));
      grad.addColorStop(1, hexA(l.color, 0));
      g.fillStyle = grad;
      g.fillRect(x - l.r, y - l.r, l.r * 2, l.r * 2);
    }
    g.globalCompositeOperation = "source-over";
    if (friendArt) drawFriend(g, friendArt, fx - camX, fy - camY, Math.floor(t * 2.5));
    // Fireflies blink in and out as they drift.
    for (const f of flies) {
      const a = Math.sin(t * f.speed * 2 + f.phase);
      if (a < 0.1) continue;
      const x = Math.round(f.x + Math.sin(t * f.speed + f.phase) * f.amp) - camX;
      const y = Math.round(f.y + Math.cos(t * f.speed * 0.7 + f.phase) * f.amp * 0.6) - camY;
      g.fillStyle = `rgba(255, 214, 107, ${(0.35 * a).toFixed(3)})`;
      g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3);
      g.fillStyle = `rgba(255, 246, 196, ${a.toFixed(3)})`;
      g.fillRect(x, y, 1, 1);
    }
    sg.imageSmoothingEnabled = false;
    sg.drawImage(art.c, 0, 0, aw * k, ah * k);
  };

  return { render, layout, setArt(a) { friendArt = a; } };
}

/** The Friend at 2 art px per sprite px: a warm 1 px rim around its near-black body, feet at (x, y). */
function drawFriend(g: CanvasRenderingContext2D, art: FriendArt, x: number, y: number, frame: number) {
  const rows = spriteFrame(art, "down", false, frame % 8, "left");
  const left = x - 16, top = y - 31;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) drawFrame(g, rows, left + dx, top + dy, 2, "#fff1d6");
  drawFrame(g, rows, left, top, 2, "#141018");
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a.toFixed(3)})`;
}

