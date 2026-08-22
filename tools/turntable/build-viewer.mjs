// Builds the self-contained turntable page from baked frames.
//
//   node build-real.mjs <frames-web-dir> <out.html>
//
// Every frame is inlined, so the page is one file that works with no server, no WebGL and
// no network - which is the point: the machine this is for renders no 3D at all.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const [dir, out] = process.argv.slice(2);
if (!dir || !out) {
  console.error('usage: node build-real.mjs <frames-dir> <out.html>');
  process.exit(1);
}

const files = readdirSync(dir).filter((f) => f.endsWith('.webp')).sort();
if (!files.length) throw new Error(`no .webp frames in ${dir}`);

const frames = files.map(
  (f) => `data:image/webp;base64,${readFileSync(join(dir, f)).toString('base64')}`,
);
const step = 360 / frames.length;

const html = `<title>R-1028 Turntable</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap">
<style>
  /* One committed visual world: a dark viewing bench under a lamp. The page paints its
     own ground in either host theme rather than following the viewer's, because the
     specimen is white metal and it needs a dark surround to read at all. */
  :root {
    --ink: #0b0d10;
    --raise: #171b21;
    --line: #272c35;
    --text: #e2e6ec;
    --muted: #7b8593;
    --brass: #c2954e;
    --pad: clamp(1.25rem, 3vw, 2.5rem);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--ink);
    color: var(--text);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .page {
    max-width: 1120px;
    margin: 0 auto;
    padding: var(--pad);
    display: flex;
    flex-direction: column;
    gap: var(--pad);
  }
  header { display: flex; flex-direction: column; gap: 0.4rem; }
  h1 {
    font-family: 'Instrument Serif', Georgia, serif;
    font-weight: 400;
    font-size: clamp(2.1rem, 5vw, 3.2rem);
    line-height: 1.04;
    margin: 0;
    text-wrap: balance;
  }
  h1 em { font-style: italic; color: var(--brass); }
  .sub { color: var(--muted); max-width: 64ch; margin: 0; line-height: 1.6; }

  .bench { display: grid; grid-template-columns: minmax(0, 1fr) 200px; gap: var(--pad); align-items: start; }
  @media (max-width: 780px) { .bench { grid-template-columns: minmax(0, 1fr); } }

  .stage {
    position: relative;
    aspect-ratio: 1;
    background: radial-gradient(circle at 50% 44%, #20252c 0%, #12151a 60%, #0b0d10 100%);
    border: 1px solid var(--line);
    overflow: hidden;
    cursor: grab;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
  }
  .stage.is-dragging { cursor: grabbing; }
  .stage:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
  .stage img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    opacity: 0;
    pointer-events: none;
  }
  .stage img.is-shown { opacity: 1; }

  .angle {
    position: absolute;
    left: 0.85rem;
    bottom: 0.85rem;
    font-family: 'IBM Plex Mono', ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
    font-size: 0.78rem;
    letter-spacing: 0.05em;
    color: var(--muted);
    background: rgba(11, 13, 16, 0.7);
    border: 1px solid var(--line);
    padding: 0.28rem 0.55rem;
  }
  .angle b { color: var(--text); font-weight: 500; }

  aside { display: flex; flex-direction: column; gap: 1.2rem; }
  .dial { width: 100%; height: auto; display: block; }
  .readout {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.32rem 0.9rem;
    font-family: 'IBM Plex Mono', ui-monospace, monospace;
    font-size: 0.76rem;
    font-variant-numeric: tabular-nums;
  }
  .readout dt { color: var(--muted); }
  .readout dd { margin: 0; }

  button {
    font: inherit;
    font-size: 0.8rem;
    color: var(--text);
    background: var(--raise);
    border: 1px solid var(--line);
    padding: 0.5rem 0.7rem;
    text-align: left;
    cursor: pointer;
  }
  button:hover { border-color: var(--brass); }
  button:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
  button[aria-pressed='true'] { color: var(--ink); background: var(--brass); border-color: var(--brass); }

  footer { color: var(--muted); font-size: 0.82rem; line-height: 1.65; max-width: 72ch; }
  footer strong { color: var(--text); font-weight: 500; }
  footer p { margin: 0 0 0.7rem; }
  footer p:last-child { margin-bottom: 0; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>

<div class="page">
  <header>
    <h1>R-1028, <em>all the way round</em></h1>
    <p class="sub">
      Thirty-six frames at ten degrees, rendered from the ring's own geometry &mdash; the
      same mesh, materials and studio HDRI the live 3D viewer uses. Drag to turn it.
      Nothing here is generated or guessed.
    </p>
  </header>

  <div class="bench">
    <div class="stage" id="stage" tabindex="0" role="img"
         aria-label="The R-1028 halo ring in white gold. Drag horizontally, or use the left and right arrow keys, to rotate it.">
      <div class="angle">azimuth <b id="azOut">000&deg;</b> &middot; frame <b id="frOut">01</b>/${frames.length}</div>
    </div>

    <aside>
      <svg class="dial" viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r="76" fill="none" stroke="#272c35" stroke-width="1"></circle>
        <g id="ticks"></g>
        <line id="needle" x1="100" y1="100" x2="100" y2="30" stroke="#c2954e" stroke-width="2"></line>
        <circle cx="100" cy="100" r="3" fill="#c2954e"></circle>
      </svg>

      <dl class="readout">
        <dt>frames</dt><dd>${frames.length}</dd>
        <dt>step</dt><dd>${step}&deg;</dd>
        <dt>metal</dt><dd>18K white</dd>
        <dt>stone</dt><dd>natural</dd>
        <dt>size</dt><dd>India 16</dd>
      </dl>

      <button id="spin" aria-pressed="false">Spin automatically</button>
    </aside>
  </div>

  <footer>
    <p>
      <strong>Why this is not AI.</strong> A generative multi-view model was tried on the
      product photograph first. It lost the centre stone by 150&deg; &mdash; the halo came
      back as a hollow metal cylinder &mdash; because a face-on ring photo carries no cue
      for the ring's depth, and its 320&nbsp;pixel output cannot hold pav&eacute; anyway.
    </p>
    <p>
      <strong>What it costs.</strong> Nothing at runtime. Every frame is baked once and
      served as an image, so this page needs no GPU, no WebGL and no API &mdash; it renders
      identically on a machine that cannot run 3D at all. Re-baking for another metal,
      stone or size is the same command with different arguments.
    </p>
  </footer>
</div>

<script>
  const FRAMES = ${JSON.stringify(frames)};
  const STEP = ${step};
  const stage = document.getElementById('stage');
  const azOut = document.getElementById('azOut');
  const frOut = document.getElementById('frOut');
  const needle = document.getElementById('needle');
  const spinBtn = document.getElementById('spin');

  // Stacked images rather than one swapped src: a data-URI swap forces a fresh decode on
  // every frame and the spin stutters. Stacked, the browser decodes once and the only
  // per-frame work is a compositor opacity flip.
  const layers = FRAMES.map((src, i) => {
    const img = new Image();
    img.src = src;
    img.alt = '';
    img.decoding = 'sync';
    if (i === 0) img.className = 'is-shown';
    stage.insertBefore(img, stage.firstChild);
    return img;
  });

  const ticks = document.getElementById('ticks');
  for (let deg = 0; deg < 360; deg += 30) {
    const a = ((deg - 90) * Math.PI) / 180;
    const major = deg % 90 === 0;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', (100 + Math.cos(a) * (major ? 64 : 70)).toFixed(2));
    line.setAttribute('y1', (100 + Math.sin(a) * (major ? 64 : 70)).toFixed(2));
    line.setAttribute('x2', (100 + Math.cos(a) * 80).toFixed(2));
    line.setAttribute('y2', (100 + Math.sin(a) * 80).toFixed(2));
    line.setAttribute('stroke', major ? '#6c7684' : '#3b424d');
    line.setAttribute('stroke-width', major ? '2' : '1.5');
    ticks.appendChild(line);
  }

  let azimuth = 0;
  let shown = 0;
  let velocity = 0;
  let dragging = false;
  let spinning = false;
  let lastX = 0;

  function render() {
    const wrapped = ((azimuth % 360) + 360) % 360;
    const index = Math.round(wrapped / STEP) % FRAMES.length;
    if (index !== shown) {
      layers[shown].classList.remove('is-shown');
      layers[index].classList.add('is-shown');
      shown = index;
    }
    azOut.textContent = String(Math.round(wrapped)).padStart(3, '0') + '\\u00b0';
    frOut.textContent = String(index + 1).padStart(2, '0');
    const a = ((wrapped - 90) * Math.PI) / 180;
    needle.setAttribute('x2', (100 + Math.cos(a) * 70).toFixed(2));
    needle.setAttribute('y2', (100 + Math.sin(a) * 70).toFixed(2));
  }

  stage.addEventListener('pointerdown', (e) => {
    dragging = true;
    spinning = false;
    spinBtn.setAttribute('aria-pressed', 'false');
    lastX = e.clientX;
    stage.classList.add('is-dragging');
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    // One full turn per roughly 420 px of travel, which lands close to the wrist movement
    // people already expect from a product spinner.
    velocity = -dx * (360 / 420);
    azimuth += velocity;
    render();
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove('is-dragging');
    if (e.pointerId !== undefined && stage.hasPointerCapture(e.pointerId)) {
      stage.releasePointerCapture(e.pointerId);
    }
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  stage.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    azimuth += e.key === 'ArrowRight' ? STEP : -STEP;
    velocity = 0;
    render();
    e.preventDefault();
  });

  spinBtn.addEventListener('click', () => {
    spinning = !spinning;
    spinBtn.setAttribute('aria-pressed', String(spinning));
  });

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function tick() {
    if (spinning) {
      azimuth += 0.6;
      render();
    } else if (!dragging && Math.abs(velocity) > 0.06 && !reduced) {
      velocity *= 0.93;
      azimuth += velocity;
      render();
    }
    requestAnimationFrame(tick);
  }

  render();
  requestAnimationFrame(tick);
</script>
`;

writeFileSync(out, html);
console.log(`wrote ${out}  ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB  ${frames.length} frames`);
