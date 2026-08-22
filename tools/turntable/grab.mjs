// Frame grabber for /turntable.html, driven by the browser-automation runner:
//
//   node <skill>/browser.mjs "http://localhost:5174/turntable.html#az=0" --script ./grab.mjs
//
// Steps azimuth via location.hash rather than reloading. A reload would rebuild the PMREM
// probe from the 1.6 MB HDRI on every frame and dominate the run; the hash listener in
// turntable.tsx keeps one warm context for the whole sweep.
//
// Everything here runs in Playwright's isolated world, so page globals are invisible.
// document.body.dataset is the shared channel - it is DOM, so both worlds see it.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const FRAMES = Number(process.env.FRAMES || 36);
const METAL = process.env.METAL || 'white';
const STONE = process.env.STONE || 'natural';
const SIZE = process.env.SIZE || '16';
const ELEVATION = process.env.ELEVATION || '8';
const OUT = process.env.OUT || './frames';
// The capture square. turntable.tsx renders at twice this and the screenshot downsamples,
// so the edges are supersampled rather than merely resized.
const SIDE = Number(process.env.SIDE || 1024);

export default async function run(page) {
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: SIDE, height: SIDE });

  const canvas = page.locator('canvas');
  await canvas.waitFor({ state: 'attached', timeout: 60000 });

  const captured = [];
  for (let i = 0; i < FRAMES; i += 1) {
    const az = (360 / FRAMES) * i;
    await page.evaluate(
      ([metal, stone, size, elevation, azimuth]) => {
        document.body.dataset.ready = '0';
        window.location.hash =
          `metal=${metal}&stone=${stone}&size=${size}&el=${elevation}&az=${azimuth}`;
      },
      [METAL, STONE, SIZE, ELEVATION, String(az)],
    );

    // Wait for the scene to declare itself settled rather than sleeping a guessed
    // interval: too early and the transmission materials render the stone black.
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });

    const file = join(OUT, `frame_${String(i).padStart(2, '0')}.png`);
    await canvas.screenshot({ path: file, omitBackground: true });
    captured.push({ i, az: Number(az.toFixed(2)) });
  }

  const box = await canvas.boundingBox();
  return { frames: captured.length, canvas: box, first: captured[0], last: captured.at(-1) };
}
