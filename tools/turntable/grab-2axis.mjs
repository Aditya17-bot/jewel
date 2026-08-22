// Two-axis frame grabber: sweeps azimuth at each of several elevations, so the viewer can
// be dragged sideways to turn the ring and up/down to tilt it.
//
//   AZIMUTHS=24 ELEVATIONS=-12,8,32 OUT=./frames2 \
//     node <skill>/browser.mjs http://localhost:5174/turntable.html --script ./grab2.mjs
//
// Frames are named frame_<elIndex>_<azIndex>.png so the builder can rebuild the grid
// without a manifest.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const AZIMUTHS = Number(process.env.AZIMUTHS || 24);
const ELEVATIONS = (process.env.ELEVATIONS || '-12,8,32').split(',').map(Number);
const METAL = process.env.METAL || 'white';
const STONE = process.env.STONE || 'natural';
const SIZE = process.env.SIZE || '16';
const OUT = process.env.OUT || './frames2';

export default async function run(page) {
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1024, height: 1024 });

  const canvas = page.locator('canvas');
  await canvas.waitFor({ state: 'attached', timeout: 60000 });

  let count = 0;
  for (let e = 0; e < ELEVATIONS.length; e += 1) {
    for (let a = 0; a < AZIMUTHS; a += 1) {
      const az = (360 / AZIMUTHS) * a;
      await page.evaluate(
        ([metal, stone, size, elevation, azimuth]) => {
          document.body.dataset.ready = '0';
          window.location.hash =
            `metal=${metal}&stone=${stone}&size=${size}&el=${elevation}&az=${azimuth}`;
        },
        [METAL, STONE, SIZE, String(ELEVATIONS[e]), String(az)],
      );
      await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
      await canvas.screenshot({
        path: join(OUT, `frame_${e}_${String(a).padStart(2, '0')}.png`),
        omitBackground: true,
      });
      count += 1;
    }
  }

  return { frames: count, azimuths: AZIMUTHS, elevations: ELEVATIONS };
}
