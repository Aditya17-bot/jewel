// Switchable lighting environments.
//
// Metal and gemstones are almost pure reflection - what you see is the surrounding
// environment, not a surface colour. So the lighting preset is not a filter over the
// render, it is the thing being rendered. Each preset paints one small equirectangular
// panorama on a canvas, which becomes the scene's light probe; swapping it changes the
// material completely.
//
// These are procedural stand-ins. Real captured HDRIs (Poly Haven, CC0, vendored under
// public/) will look better and drop straight into ENVIRONMENTS.

import { CanvasTexture, EquirectangularReflectionMapping, SRGBColorSpace } from 'three';

/**
 * Each preset paints one equirectangular panorama: a vertical sky-to-ground gradient
 * plus any bright spots that should show up as highlights in polished metal.
 * `blobs` are [u, v, radius, colour, strength] in 0..1 panorama coordinates.
 */
export const ENVIRONMENTS = {
  daylight: {
    label: 'Daylight',
    sky: '#8fbaff',
    horizon: '#e8f0ff',
    ground: '#6b6255',
    exposure: 1.15,
    key: { colour: 0xfff4e0, intensity: 3.0, position: [5, 7, 4] },
    blobs: [[0.62, 0.18, 0.07, '#fffdf5', 6]],
  },
  indoor: {
    label: 'Indoors',
    sky: '#3a3128',
    horizon: '#8a7358',
    ground: '#2b241d',
    exposure: 1.0,
    key: { colour: 0xffd9a0, intensity: 1.4, position: [3, 5, 2] },
    blobs: [
      [0.25, 0.3, 0.11, '#ffe3b0', 2],
      [0.78, 0.34, 0.09, '#ffd08a', 2],
    ],
  },
  dim: {
    label: 'Dim / evening',
    sky: '#0b0d14',
    horizon: '#1b2030',
    ground: '#07080c',
    exposure: 1.35,
    key: { colour: 0x9fb4ff, intensity: 0.5, position: [-2, 4, 3] },
    blobs: [[0.4, 0.28, 0.05, '#cfd8ff', 1]],
  },
  store: {
    label: 'Jewellery store',
    sky: '#111014',
    horizon: '#26222a',
    ground: '#0a090c',
    exposure: 1.25,
    key: { colour: 0xffffff, intensity: 2.4, position: [2, 6, 3] },
    blobs: [
      [0.18, 0.16, 0.045, '#ffffff', 9],
      [0.5, 0.12, 0.045, '#ffffff', 9],
      [0.82, 0.16, 0.045, '#ffffff', 9],
    ],
  },
};

/** Paints one preset into a canvas and returns it as an equirectangular texture. */
export function paintEnvironment(preset) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, preset.sky);
  gradient.addColorStop(0.5, preset.horizon);
  gradient.addColorStop(1, preset.ground);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Additive, so a bright blob genuinely blows out rather than tinting the sky.
  ctx.globalCompositeOperation = 'lighter';
  for (const [u, v, radius, colour, strength] of preset.blobs ?? []) {
    const x = u * canvas.width;
    const y = v * canvas.height;
    const r = radius * canvas.width;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, colour);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    // Repeated passes stand in for the HDR values an 8-bit canvas cannot hold.
    for (let i = 0; i < strength; i += 1) ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';

  const texture = new CanvasTexture(canvas);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
