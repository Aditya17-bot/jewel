// The person, as a lit surface rather than a photograph the jewellery is pasted onto.
//
// The mesh carries the photo as its albedo but is shaded by whichever environment is
// selected, so switching the light changes the skin and the metal together. That is the
// whole point: a jewel rendered under studio light over a photo shot in a kitchen never
// looks worn.

import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';

/**
 * Fades the face mesh's normals to face straight forward at its own edge.
 *
 * Relighting a cut-out of a flat photo outlines the cut-out: the mesh's forehead tilts
 * into the key light and picks up a highlight the photo around it cannot, so a hard line
 * appears along the hairline. Matching the flat card's normal at the silhouette removes
 * the step exactly, and the ramp inward keeps the real shading where it is not next to
 * anything to disagree with.
 */
function softenEdgeNormals(geometry, rings = 5) {
  const index = geometry.index.array;
  const normal = geometry.attributes.normal;
  const count = normal.count;

  // An edge belonging to one triangle only is on the silhouette.
  const edgeUses = new Map();
  const neighbours = Array.from({ length: count }, () => []);
  for (let i = 0; i < index.length; i += 3) {
    const tri = [index[i], index[i + 1], index[i + 2]];
    for (let e = 0; e < 3; e += 1) {
      const a = tri[e];
      const b = tri[(e + 1) % 3];
      neighbours[a].push(b);
      neighbours[b].push(a);
      const key = a < b ? a * count + b : b * count + a;
      edgeUses.set(key, (edgeUses.get(key) ?? 0) + 1);
    }
  }

  // Breadth-first from the silhouette, so every vertex knows how far inside it lies.
  const depth = new Int32Array(count).fill(-1);
  const queue = [];
  for (const [key, uses] of edgeUses) {
    if (uses !== 1) continue;
    for (const vertex of [Math.floor(key / count), key % count]) {
      if (depth[vertex] === -1) {
        depth[vertex] = 0;
        queue.push(vertex);
      }
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const vertex = queue[head];
    if (depth[vertex] >= rings) continue;
    for (const next of neighbours[vertex]) {
      if (depth[next] === -1) {
        depth[next] = depth[vertex] + 1;
        queue.push(next);
      }
    }
  }

  const blended = new Vector3();
  for (let i = 0; i < count; i += 1) {
    const inward = depth[i] === -1 ? 1 : Math.min(1, depth[i] / rings);
    if (inward === 1) continue;
    blended.fromBufferAttribute(normal, i).multiplyScalar(inward);
    blended.z += 1 - inward; // the flat card's normal
    blended.normalize();
    normal.setXYZ(i, blended.x, blended.y, blended.z);
  }
  normal.needsUpdate = true;
}

/**
 * The face, as a lit surface rather than a photo the jewellery is pasted onto.
 *
 * It carries the photo as its albedo but is shaded by whichever environment is selected,
 * so switching the light changes the skin and the metal together. That is the whole point:
 * a jewel rendered under studio light over a photo shot in a kitchen never looks worn.
 *
 * Behind it sits the rest of the photo on a flat card, at the depth of the middle of the
 * head, so the mesh lands exactly on top of the face it came from. The card never writes
 * depth, so it cannot swallow an earring hanging at the same distance from the camera.
 */
export function buildFace(face) {
  const texture = new CanvasTexture(face.canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(face.positions, 3));
  geometry.setAttribute('uv', new BufferAttribute(face.uvs, 2));
  geometry.setIndex(face.indices);
  geometry.computeVertexNormals();

  // The tesselation's winding is whatever it is, and the y flip out of image space may
  // have reversed it. The nose points at the camera; if its normal does not, flip.
  if (geometry.attributes.normal.getZ(face.noseTip) < 0) {
    const index = geometry.index.array;
    for (let i = 0; i < index.length; i += 3) {
      const swap = index[i];
      index[i] = index[i + 2];
      index[i + 2] = swap;
    }
    geometry.index.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  softenEdgeNormals(geometry);

  // One material for both, deliberately. Give the mesh and the card even slightly
  // different roughness and the environment's highlight lands on them at different
  // strengths, which draws a hard outline of the mesh across the middle of the forehead.
  // Sharing it leaves only the difference the normals make, which reads as the face
  // having depth rather than as a seam.
  const material = new MeshStandardMaterial({ map: texture, roughness: 0.85, metalness: 0 });
  const skin = new Mesh(geometry, material);

  const backdrop = new Mesh(new PlaneGeometry(face.imageWidth, face.imageHeight), material.clone());
  backdrop.material.depthWrite = false;
  backdrop.material.depthTest = false;
  backdrop.renderOrder = -1;

  const group = new Group();
  group.name = 'face';
  group.add(backdrop, skin);
  return group;
}
