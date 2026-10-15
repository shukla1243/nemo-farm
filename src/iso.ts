/**
 * Isometric helpers for the teaser diorama, ported from the full game's v2 renderer so the
 * Blender-rendered tiles line up exactly: 1 tile = 64 x 32 art px, tileToScreen(tx, ty) is the
 * tile's back corner, which is where a sprite's JSON `origin` sits. Pure functions only.
 */
export const TILE_W = 64;
export const TILE_H = 32;
/** Sea level is half a level below the ground block tops. Floating sprites drop by this. */
export const SEA_DROP = TILE_H / 2;

export function tileToScreen(tx: number, ty: number) {
  return { x: (tx - ty) * (TILE_W / 2), y: (tx + ty) * (TILE_H / 2) };
}

export function screenToTile(x: number, y: number) {
  const a = x / (TILE_W / 2), b = y / (TILE_H / 2);
  return { tx: (a + b) / 2, ty: (b - a) / 2 };
}

/** Painter's order: further back first; layer breaks ties (ground 0, props 1, actors 2). */
export const depthKey = (tx: number, ty: number, layer = 0) => (tx + ty) * 4 + layer;

/** Deterministic ground variant (0 or 1) for a cell, the same hash the full game uses. */
export function cellVariant(tx: number, ty: number) {
  let h = (Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
  return (h ^ (h >>> 15)) & 1;
}

export type Land = (tx: number, ty: number) => boolean;

const REACH = 0.6, SOLID = 0.32, LAP_MIN = 0.03, LAP_MAX = 0.11;

/** Distance (tiles) from the sea point under world pixel (wx, wy) to the nearest land cell, or 9. */
export function shoreDist(land: Land, wx: number, wy: number) {
  const t = screenToTile(wx + 0.5, wy + 0.5 - SEA_DROP);
  const cx = Math.floor(t.tx), cy = Math.floor(t.ty);
  let d = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    if (!land(cx + i, cy + j)) continue;
    const dx = Math.max(cx + i - t.tx, 0, t.tx - (cx + i + 1)), dy = Math.max(cy + j - t.ty, 0, t.ty - (cy + j + 1));
    d = Math.min(d, Math.hypot(dx, dy));
  }
  return d;
}

const lapAt = (f: number, frames: number) => (LAP_MIN + LAP_MAX) / 2 + ((LAP_MAX - LAP_MIN) / 2) * Math.sin((f / frames) * Math.PI * 2);

/** Whether foam pixel (x, y) at distance d shows on frame f of `frames`: it laps in and out. */
export function foamOn(x: number, y: number, d: number, f: number, frames: number) {
  return d > 0 && d < lapAt(f, frames) && ((x >> 2) + f) % 5 !== 0;
}

/**
 * The shore skirt of a w x h map in world art px: `band` holds (x, y) pairs of the dark band
 * under the blocks, `foam` the pixels that can turn to foam with their distance from the land.
 */
export function skirtPixels(w: number, h: number, land: Land) {
  const band: number[] = [], foam: { x: number; y: number; d: number }[] = [];
  const near = (cx: number, cy: number) => {
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (land(cx + i, cy + j)) return true;
    return false;
  };
  const covered = (x: number, y: number) => {
    for (let s = 0; s < SEA_DROP; s++) {
      const t = screenToTile(x + 0.5, y + 0.5 - s);
      if (land(Math.floor(t.tx), Math.floor(t.ty))) return true;
    }
    return false;
  };
  for (let cy = -1; cy <= h; cy++) for (let cx = -1; cx <= w; cx++) {
    if (land(cx, cy) || !near(cx, cy)) continue;
    const p = tileToScreen(cx, cy);
    for (let y = p.y + SEA_DROP; y < p.y + SEA_DROP + TILE_H; y++) for (let x = p.x - TILE_W / 2; x < p.x + TILE_W / 2; x++) {
      const t = screenToTile(x + 0.5, y + 0.5 - SEA_DROP);
      if (Math.floor(t.tx) !== cx || Math.floor(t.ty) !== cy) continue;
      const d = shoreDist(land, x, y);
      if (!(d > 0 && d <= REACH)) continue;
      if (d < SOLID || (x + y) % 2 === 0) band.push(x, y);
      if (d < LAP_MAX && !covered(x, y)) foam.push({ x, y, d });
    }
  }
  return { band, foam };
}

/** Small deterministic PRNG for cosmetic patterns, so every load looks the same. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
