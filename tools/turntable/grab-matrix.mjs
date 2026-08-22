// Bakes every configuration in one browser session.
//
//   OUT=./frames-matrix node <browser-automation>/browser.mjs \
//     http://localhost:5174/turntable.html --script tools/turntable/grab-matrix.mjs
//
// One session for the whole matrix on purpose. Relaunching the browser per configuration
// costs 30-60s of startup and HDRI decode each time, which would dominate a run whose
// actual work is about a second a frame.
//
// Writes frames-matrix/<metal>-<stone>/frame_<elIndex>_<azIndex>.png plus a manifest the
// app reads to know which configurations exist.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const METALS = (process.env.METALS || 'white,yellow,rose').split(',');
const STONES = (process.env.STONES || 'natural,lab,ruby,emerald').split(',');
const AZIMUTHS = Number(process.env.AZIMUTHS || 24);
const ELEVATIONS = (process.env.ELEVATIONS || '6,28').split(',').map(Number);
const SIZE = process.env.SIZE || '16';
const OUT = process.env.OUT || './frames-matrix';

export default async function run(page) {
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1024, height: 1024 });

  const canvas = page.locator('canvas');
  await canvas.waitFor({ state: 'attached', timeout: 60000 });

  const done = [];
  const started = Date.now();

  for (const metal of METALS) {
    for (const stone of STONES) {
      const dir = join(OUT, `${metal}-${stone}`);
      mkdirSync(dir, { recursive: true });

      for (let e = 0; e < ELEVATIONS.length; e += 1) {
        for (let a = 0; a < AZIMUTHS; a += 1) {
          const az = (360 / AZIMUTHS) * a;
          await page.evaluate(
            ([m, s, sz, el, azi]) => {
              document.body.dataset.ready = '0';
              window.location.hash = `metal=${m}&stone=${s}&size=${sz}&el=${el}&az=${azi}`;
            },
            [metal, stone, SIZE, String(ELEVATIONS[e]), String(az)],
          );
          await page.waitForFunction(() => document.body.dataset.ready === '1', null, {
            timeout: 30000,
          });
          await canvas.screenshot({
            path: join(dir, `frame_${e}_${String(a).padStart(2, '0')}.png`),
            omitBackground: true,
          });
        }
      }
      done.push(`${metal}-${stone}`);
    }
  }

  const manifest = {
    azimuths: AZIMUTHS,
    step: 360 / AZIMUTHS,
    elevations: ELEVATIONS,
    size: Number(SIZE),
    configurations: done,
  };
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    configurations: done.length,
    frames: done.length * AZIMUTHS * ELEVATIONS.length,
    minutes: Number(((Date.now() - started) / 60000).toFixed(1)),
  };
}
