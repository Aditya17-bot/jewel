// Builds a two-axis viewer from frames named frame_<elIndex>_<azIndex>.webp.
//
//   node build-2axis.mjs <frames-dir> <out.html> <el0,el1,...>
//
// Drag sideways to turn, drag up or down to tilt. Elevation snaps to the baked tiers -
// there is no in-between to show, and pretending otherwise by blending would only add
// ghosting.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const [dir, out, elArg] = process.argv.slice(2);
if (!dir || !out) {
  console.error('usage: node build-2axis.mjs <frames-dir> <out.html> <elevations>');
  process.exit(1);
}
const elevations = (elArg || '-14,6,28').split(',').map(Number);

const files = readdirSync(dir).filter((f) => /^frame_\d+_\d+\.webp$/.test(f)).sort();
if (!files.length) throw new Error(`no frames in ${dir}`);

const rows = [];
for (const f of files) {
  const [, e, a] = f.match(/^frame_(\d+)_(\d+)\.webp$/);
  const row = Number(e);
  rows[row] ??= [];
  rows[row][Number(a)] = `data:image/webp;base64,${readFileSync(join(dir, f)).toString('base64')}`;
}
const azCount = rows[0].length;
const step = 360 / azCount;
if (rows.length !== elevations.length) {
  throw new Error(`${rows.length} elevation rows but ${elevations.length} labels`);
}

const html = `<title>R-1028 Two-Axis Viewer</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap">
<style>
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
  .page { max-width: 1120px; margin: 0 auto; padding: var(--pad); display: flex; flex-direction: column; gap: var(--pad); }
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
  .hint {
    position: absolute;
    right: 0.85rem;
    bottom: 0.85rem;
    font-size: 0.72rem;
    color: var(--muted);
    background: rgba(11, 13, 16, 0.7);
    border: 1px solid var(--line);
    padding: 0.28rem 0.55rem;
  }

  aside { display: flex; flex-direction: column; gap: 1.1rem; }
  .dial { width: 100%; height: auto; display: block; }

  /* The elevation control is a real ladder, one rung per baked tier - the tiers are
     discrete and the control should say so rather than implying a continuous slider. */
  .tiers { display: flex; flex-direction: column-reverse; gap: 0.4rem; }
  .tiers button {
    display: flex;
    justify-content: space-between;
    gap: 0.6rem;
    font-family: 'IBM Plex Mono', ui-monospace, monospace;
    font-size: 0.74rem;
    font-variant-numeric: tabular-nums;
  }
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
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>

<div class="page">
  <header>
    <h1>R-1028, <em>turned and tilted</em></h1>
    <p class="sub">
      ${rows.length * azCount} frames &mdash; ${azCount} around at ${step}&deg; steps, on
      ${rows.length} elevations. Drag sideways to turn it, up and down to look over or
      under it. Rendered from the ring's own geometry, so every frame is exact.
    </p>
  </header>

  <div class="bench">
    <div class="stage" id="stage" tabindex="0" role="img"
         aria-label="The R-1028 halo ring. Drag sideways to rotate, up and down to change viewing height. Arrow keys work too.">
      <div class="angle">azimuth <b id="azOut">000&deg;</b> &middot; elevation <b id="elOut">+06&deg;</b></div>
      <div class="hint">drag &#8596; turn &nbsp;&#8597; tilt</div>
    </div>

    <aside>
      <svg class="dial" viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r="76" fill="none" stroke="#272c35" stroke-width="1"></circle>
        <g id="ticks"></g>
        <line id="needle" x1="100" y1="100" x2="100" y2="30" stroke="#c2954e" stroke-width="2"></line>
        <circle cx="100" cy="100" r="3" fill="#c2954e"></circle>
      </svg>

      <div class="tiers" id="tiers"></div>

      <dl class="readout">
        <dt>frames</dt><dd>${rows.length * azCount}</dd>
        <dt>step</dt><dd>${step}&deg;</dd>
        <dt>metal</dt><dd>18K white</dd>
        <dt>stone</dt><dd>natural</dd>
      </dl>

      <button id="spin" aria-pressed="false">Spin automatically</button>
    </aside>
  </div>

  <footer>
    <strong>Both axes are real here.</strong> Every frame is a render of the actual mesh at
    that camera position, so tilting shows the gallery and the underside of the setting as
    they are. A generated-view model cannot do this from a photograph &mdash; its poses are
    fixed by training, and elevation is not a knob it exposes.
  </footer>
</div>

<script>
  const ROWS = ${JSON.stringify(rows)};
  const ELS = ${JSON.stringify(elevations)};
  const STEP = ${step};
  const AZ_COUNT = ${azCount};

  const stage = document.getElementById('stage');
  const azOut = document.getElementById('azOut');
  const elOut = document.getElementById('elOut');
  const needle = document.getElementById('needle');
  const tiersEl = document.getElementById('tiers');
  const spinBtn = document.getElementById('spin');

  const layers = ROWS.map((row) =>
    row.map((src) => {
      const img = new Image();
      img.src = src;
      img.alt = '';
      stage.insertBefore(img, stage.firstChild);
      return img;
    }),
  );

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
  let tier = Math.min(1, ELS.length - 1);
  let shownAz = 0;
  let shownTier = tier;
  let velocity = 0;
  let dragging = false;
  let spinning = false;
  let lastX = 0;
  let lastY = 0;
  let tiltCarry = 0;

  const fmt = (n) => (n >= 0 ? '+' : '\\u2212') + String(Math.abs(n)).padStart(2, '0') + '\\u00b0';

  ELS.forEach((el, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = '<span>' + (i === ELS.length - 1 ? 'from above' : i === 0 ? 'from below' : 'level') +
      '</span><span>' + fmt(el) + '</span>';
    btn.addEventListener('click', () => { tier = i; render(); });
    tiersEl.appendChild(btn);
  });

  layers[shownTier][0].classList.add('is-shown');

  function render() {
    const wrapped = ((azimuth % 360) + 360) % 360;
    const index = Math.round(wrapped / STEP) % AZ_COUNT;
    if (index !== shownAz || tier !== shownTier) {
      layers[shownTier][shownAz].classList.remove('is-shown');
      layers[tier][index].classList.add('is-shown');
      shownAz = index;
      shownTier = tier;
    }
    azOut.textContent = String(Math.round(wrapped)).padStart(3, '0') + '\\u00b0';
    elOut.textContent = fmt(ELS[tier]);
    const a = ((wrapped - 90) * Math.PI) / 180;
    needle.setAttribute('x2', (100 + Math.cos(a) * 70).toFixed(2));
    needle.setAttribute('y2', (100 + Math.sin(a) * 70).toFixed(2));
    Array.from(tiersEl.children).forEach((el, i) => el.setAttribute('aria-pressed', String(i === tier)));
  }

  stage.addEventListener('pointerdown', (e) => {
    dragging = true;
    spinning = false;
    spinBtn.setAttribute('aria-pressed', 'false');
    lastX = e.clientX;
    lastY = e.clientY;
    tiltCarry = 0;
    stage.classList.add('is-dragging');
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    velocity = -dx * (360 / 420);
    azimuth += velocity;

    // Elevation is discrete, so accumulate vertical travel and step a tier once it passes
    // a threshold. Without the carry, a tier flips on the first stray pixel of vertical
    // wobble during a horizontal drag.
    tiltCarry += dy;
    while (Math.abs(tiltCarry) > 90) {
      const dir = tiltCarry > 0 ? -1 : 1;
      tier = Math.max(0, Math.min(ELS.length - 1, tier + dir));
      tiltCarry -= dir * -90;
    }
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
    if (e.key === 'ArrowRight') azimuth += STEP;
    else if (e.key === 'ArrowLeft') azimuth -= STEP;
    else if (e.key === 'ArrowUp') tier = Math.min(ELS.length - 1, tier + 1);
    else if (e.key === 'ArrowDown') tier = Math.max(0, tier - 1);
    else return;
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
console.log(
  `wrote ${out}  ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB  ` +
    `${rows.length} x ${azCount} frames`,
);
