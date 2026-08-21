// Parametric jewellery.
//
// A catalogue is a small closed set, and most jewellery is close to a primitive: a hoop
// and a band are tori, a stud is a sphere on a cone, a pendant is a shape hung from a
// bail. Generating them keeps the meshes clean, watertight and low-poly, which matters
// on a phone, and means no asset pipeline until there is something worth putting in it.
//
// Everything is modelled in metres at real-world size, so 0.012 is a 12 mm radius. That
// scale has to be honest now: once these sit on a face mesh, a hoop that is secretly
// 10x too big is much harder to notice than to prevent.

import {
  CatmullRomCurve3,
  ConeGeometry,
  ExtrudeGeometry,
  Shape,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
} from 'three';

const HOOP_RADIUS = 0.012; // 12 mm, a common small hoop
const RING_RADIUS = 0.0085; // 17 mm across the inside, an average finger
const PENDANT_BAIL_HEIGHT = 0.011; // where the chain passes through the pendant

export const METALS = {
  gold: { label: 'Yellow gold', colour: 0xffd76e, roughness: 0.16 },
  white: { label: 'White gold', colour: 0xe6e8ec, roughness: 0.12 },
  rose: { label: 'Rose gold', colour: 0xf2b7a0, roughness: 0.18 },
};

function metalMaterial(metalId) {
  const metal = METALS[metalId] ?? METALS.gold;
  return new MeshPhysicalMaterial({
    color: metal.colour,
    metalness: 1,
    roughness: metal.roughness,
    // Polished jewellery has a clear specular layer over the metal; without it, gold
    // reads as matte paint under the dimmer environments.
    clearcoat: 0.6,
    clearcoatRoughness: 0.08,
  });
}

/**
 * The stones you can set.
 *
 * `ior` is the one number that decides whether something reads as a gem or as coloured
 * glass: it is how sharply light bends on the way in, and it is why a diamond throws fire
 * and an emerald mostly glows. These are the real published values. `thickness` is how far
 * light travels inside the stone before it leaves - it does the darkening, so a deep stone
 * needs less colour saturation than you would expect.
 */
export const STONES = {
  diamond: { label: 'Diamond', colour: 0xffffff, ior: 2.42, thickness: 0.004, roughness: 0.02 },
  sapphire: { label: 'Sapphire', colour: 0x4f7ad6, ior: 1.77, thickness: 0.005, roughness: 0.03 },
  emerald: { label: 'Emerald', colour: 0x43b98a, ior: 1.58, thickness: 0.006, roughness: 0.05 },
  ruby: { label: 'Ruby', colour: 0xd6415e, ior: 1.77, thickness: 0.005, roughness: 0.03 },
  amethyst: { label: 'Amethyst', colour: 0xa579d8, ior: 1.54, thickness: 0.006, roughness: 0.04 },
  // Onyx is the odd one out and has to be: it is opaque, so it has no transmission at all
  // and gets its look from a polished surface rather than from anything happening inside.
  onyx: { label: 'Onyx', colour: 0x1a1d22, opaque: true, roughness: 0.06 },
};

function gemMaterial(stoneId) {
  const stone = STONES[stoneId] ?? STONES.diamond;
  return new MeshPhysicalMaterial({
    color: stone.colour,
    metalness: 0,
    roughness: stone.roughness,
    transmission: stone.opaque ? 0 : 1,
    thickness: stone.thickness ?? 0,
    ior: stone.ior ?? 1.6,
    specularIntensity: 1,
    clearcoat: stone.opaque ? 1 : 0,
    clearcoatRoughness: 0.03,
  });
}

function hoop(metalId) {
  const group = new Group();
  group.add(new Mesh(new TorusGeometry(HOOP_RADIUS, 0.0011, 24, 96), metalMaterial(metalId)));
  return group;
}

function stud(metalId, stoneId) {
  const group = new Group();

  const gem = new Mesh(new OctahedronGeometry(0.0035, 0), gemMaterial(stoneId));
  gem.scale.set(1, 0.85, 1);
  gem.position.y = 0.0015;
  group.add(gem);

  // The setting: a short cone under the stone, standing in for a claw mount.
  const setting = new Mesh(new ConeGeometry(0.0028, 0.004, 6), metalMaterial(metalId));
  setting.rotation.x = Math.PI;
  setting.position.y = -0.0015;
  group.add(setting);

  return group;
}

/** A plain band. A ring and a hoop are the same solid at different sizes. */
function band(metalId) {
  const group = new Group();
  group.add(new Mesh(new TorusGeometry(RING_RADIUS, 0.0011, 24, 96), metalMaterial(metalId)));
  return group;
}

/**
 * A piece measured from a photograph.
 *
 * `band` becomes a torus at the radius and thickness that were measured. `outline` takes
 * the silhouette the photo actually had and extrudes it, which is why an unfamiliar
 * pendant shape still comes out looking like itself. The bevel matters more than it
 * sounds: a flat-sided slab of gold catches no light along its edge and reads as cardboard.
 */
export function createMeasuredPiece(measured, metalId) {
  const group = new Group();
  const material = metalMaterial(metalId);
  if (measured.metal?.colour !== undefined) material.color.setHex(measured.metal.colour);

  if (measured.kind === 'band') {
    group.add(new Mesh(new TorusGeometry(measured.radius, measured.tube, 24, 96), material));
    return group;
  }

  const shape = new Shape();
  measured.points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();

  const bevel = Math.min(measured.depth * 0.3, measured.height * 0.02);
  const geometry = new ExtrudeGeometry(shape, {
    depth: measured.depth,
    bevelEnabled: bevel > 1e-5,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 2,
  });
  // Extruded from the origin along +Z; recentre so it hangs from the middle like the rest.
  geometry.center();
  group.add(new Mesh(geometry, material));

  // A bail, so it has something to hang from.
  const bail = new Mesh(new TorusGeometry(0.0035, 0.0008, 16, 48), material);
  bail.position.y = measured.height / 2 + 0.0025;
  group.add(bail);
  return group;
}

function pendant(metalId, stoneId) {
  const group = new Group();
  const material = metalMaterial(metalId);

  const bail = new Mesh(new TorusGeometry(0.0035, 0.0008, 16, 48), material);
  bail.position.y = PENDANT_BAIL_HEIGHT;
  group.add(bail);

  const drop = new Mesh(new SphereGeometry(0.006, 48, 32), material);
  drop.scale.set(1, 1.25, 0.7);
  group.add(drop);

  const accent = new Mesh(new OctahedronGeometry(0.0022, 0), gemMaterial(stoneId));
  accent.position.set(0, 0.002, 0.0042);
  group.add(accent);

  return group;
}

/**
 * A chain, as a smooth tube through the points it is draped over. Real links would be a
 * few hundred separate bodies for something that reads as a 1.4 mm line on screen; this
 * costs one mesh and, at this scale, looks the same.
 */
export function createChain(points, metalId) {
  const curve = new CatmullRomCurve3(points, false, 'catmullrom', 0.4);
  return new Mesh(new TubeGeometry(curve, 96, 0.0007, 6, false), metalMaterial(metalId));
}

export const JEWELS = {
  // `hang` is how far the piece's origin sits below the point it is attached to: a hoop
  // pivots on the piercing and swings its whole radius below it, a stud does not move.
  hoop: { label: 'Hoop earring', anchor: 'ear', hang: HOOP_RADIUS, build: hoop },
  band: { label: 'Ring / band', anchor: 'ear', hang: RING_RADIUS, build: band },
  stud: { label: 'Stud earring', anchor: 'ear', hang: 0, build: stud },
  pendant: { label: 'Pendant', anchor: 'neck', hang: 0, bail: PENDANT_BAIL_HEIGHT, build: pendant },
};

export function createJewel(jewelId, metalId, stoneId) {
  const jewel = JEWELS[jewelId] ?? JEWELS.hoop;
  const group = jewel.build(metalId, stoneId);
  group.name = `${jewelId}-${metalId}`;
  return group;
}
