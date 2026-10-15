/**
 * NEMO FRNS FARM: the "tide is coming in" screen shown on rarefriends.com while the full game is
 * built. No server, no actions, nothing to buy: the player's Friend waits on the dock of a small
 * dusk island and the card says what is coming.
 */
import { connect, type Game } from "@rarefriends/friendsdk";
import { createScene, type Scene } from "./scene";
import "./styles.css";

const X_URL = "https://x.com/mutantonchain";

const root = document.getElementById("root") ?? document.body;
root.innerHTML = `
<div class="app">
  <canvas class="scene" aria-hidden="true"></canvas>
  <div class="shade" aria-hidden="true"></div>
  <main class="card">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>The tide is coming in</p>
    <h1 class="title">NEMO FRNS FARM</h1>
    <p class="lead" aria-live="polite">Checking the tide<span class="dots" aria-hidden="true"></span></p>
    <ul class="soon">
      <li><b>Island life</b><span>Farm, fish and make a home by the sea.</span></li>
      <li><b>Voyages into the deep</b><span>Sail past the reef and see what the dark water keeps.</span></li>
      <li><b>Weekly Moonwakes</b><span>One night each week the whole island gathers.</span></li>
    </ul>
    <button class="follow" type="button" disabled>Follow updates on X</button>
    <p class="fine">We are building the full island now. Thanks for waiting with us.</p>
  </main>
</div>`;

const app = root.querySelector<HTMLElement>(".app")!;
const canvasEl = root.querySelector<HTMLCanvasElement>(".scene")!;
const card = root.querySelector<HTMLElement>(".card")!;
const lead = root.querySelector<HTMLElement>(".lead")!;
const follow = root.querySelector<HTMLButtonElement>(".follow")!;

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
let game: Game | null = null;
let scene: Scene | null = null;
let paused = false;
let closed = false;
let raf = 0;
let last = -1;
let clock = 0;
let started = performance.now();

/** The part of the screen the card leaves open, in CSS px: above it on phones, beside it otherwise. */
function openArea() {
  const w = app.clientWidth, h = app.clientHeight, c = card.getBoundingClientRect(), a = app.getBoundingClientRect();
  const top = c.top - a.top, right = c.right - a.left;
  if (top > h * 0.25) return { x: 0, y: 0, w, h: Math.max(80, top - 8) };
  return { x: right + 8, y: 0, w: Math.max(80, w - right - 8), h };
}

const still = () => reduce.matches || paused || closed;

function draw() {
  if (!scene) return;
  scene.render(clock);
}

function frame(now: number) {
  raf = 0;
  if (still()) return;
  clock = (now - started) / 1000;
  // About 20 frames a second is plenty for pixel motion and kind to batteries.
  if (last < 0 || now - last >= 48) { last = now; draw(); }
  raf = requestAnimationFrame(frame);
}

/** Start or stop the loop to match the pause, session and reduced-motion state. */
function sync() {
  app.classList.toggle("is-still", still());
  if (still()) {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    draw();
  } else if (!raf) {
    started = performance.now() - clock * 1000;
    raf = requestAnimationFrame(frame);
  }
}

function relayout() {
  if (!scene) return;
  scene.layout(openArea());
  draw();
}

new ResizeObserver(relayout).observe(app);
window.addEventListener("resize", relayout);
reduce.addEventListener("change", sync);

createScene(canvasEl).then(s => {
  scene = s;
  if (game) s.setArt(game.art);
  relayout();
  sync();
  app.classList.add("is-ready");
}).catch(() => {
  // Without the art the card still works on the sea-coloured background.
  app.classList.add("is-ready");
});

connect().then(g => {
  game = g;
  lead.textContent = `Your Friend #${g.friend.id} is waiting on the dock. The island opens soon.`;
  follow.disabled = false;
  follow.addEventListener("click", () => g.openLink(X_URL));
  scene?.setArt(g.art);
  paused = g.paused;
  g.on("pause", p => { paused = p; sync(); });
  g.on("closed", () => {
    closed = true;
    follow.disabled = true;
    lead.textContent = "This session ended. Pick your Friend again to come back to the dock.";
    sync();
  });
  sync();
}).catch(() => {
  lead.textContent = "Open NEMO FRNS FARM from rarefriends.com to see your Friend on the dock.";
  follow.hidden = true;
});
