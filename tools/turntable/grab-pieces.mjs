// Bakes every piece in the catalogue, across every metal and stone, in one browser session.
//
//   PIECES=necklace,earring OUT=./frames-pieces \
//     node <browser-automation>/browser.mjs http://localhost:5174/turntable.html \
//       --script tools/turntable/grab-pieces.mjs
//
// One session for the whole run on purpose: relaunching per configuration costs 30-60s of
// startup and HDRI decode, which would dominate a job whose real work is about a second a
// frame.
//
// Writes <out>/<piece>/<metal>-<stone>/frame_<elIndex>_<azIndex>.png plus a manifest.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PIECES = (process.env.PIECES || 'necklace,earring').split(',');
const METALS = (process.env.METALS || 'white,yellow,rose').split(',');
const STONES = (process.env.STONES || 'natural,ruby,emerald').split(',');
const AZIMUTHS = Number(process.env.AZIMUTHS || 24);
// One tier for the hanging pieces: a necklace and a pair of studs read as themselves from
// a level orbit, and a second elevation doubles the bake for very little.
const ELEVATIONS = (process.env.ELEVATIONS || '6').split(',').map(Number);
const OUT = process.env.OUT || './frames-pieces';
const SIDE = Number(process.env.SIDE || 1024);

export default async function run(page) {
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: SIDE, height: SIDE });

  const canvas = page.locator('canvas');
  await canvas.waitFor({ state: 'attached', timeout: 60000 });

  const done = [];
  const started = Date.now();

  for (const piece of PIECES) {
    for (const metal of METALS) {
      for (const stone of STONES) {
        const dir = join(OUT, piece, `${metal}-${stone}`);
        mkdirSync(dir, { recursive: true });

        for (let e = 0; e < ELEVATIONS.length; e += 1) {
          for (let a = 0; a < AZIMUTHS; a += 1) {
            const az = (360 / AZIMUTHS) * a;
            await page.evaluate(
              ([p, m, s, el, azi]) => {
                document.body.dataset.ready = '0';
                window.location.hash = `piece=${p}&metal=${m}&stone=${s}&el=${el}&az=${azi}`;
              },
              [piece, metal, stone, String(ELEVATIONS[e]), String(az)],
            );
            await page.waitForFunction(() => document.body.dataset.ready === '1', null, {
              timeout: 40000,
            });
            await canvas.screenshot({
              path: join(dir, `frame_${e}_${String(a).padStart(2, '0')}.png`),
              omitBackground: true,
            });
          }
        }
        done.push(`${piece}/${metal}-${stone}`);
      }
    }
  }

  writeFileSync(
    join(OUT, 'manifest.json'),
    `${JSON.stringify(
      {
        azimuths: AZIMUTHS,
        step: 360 / AZIMUTHS,
        elevations: ELEVATIONS,
        pieces: PIECES,
        configurations: done,
      },
      null,
      2,
    )}\n`,
  );

  return {
    configurations: done.length,
    frames: done.length * AZIMUTHS * ELEVATIONS.length,
    minutes: Number(((Date.now() - started) / 60000).toFixed(1)),
  };
}
