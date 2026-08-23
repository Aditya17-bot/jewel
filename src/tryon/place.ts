// Hanging a piece on a face.
//
// Two frames meet here and neither one alone is right. Where a piece attaches is decided
// by the head - the lobe moves when you tilt your head. Which way it then hangs is decided
// by gravity - a hoop and a chain stay vertical no matter what the head is doing. Mixing
// the two up is what makes try-on renders look like stickers.
//
// A placement can also be adjusted after the fact - resized, or nudged off the anchor -
// because a catalogue size is a starting point, not an answer. The adjustment is applied
// by moving the pieces that already exist rather than by rebuilding them, so it can run
// every frame while a hand is moving without churning geometry.

import { Group, Matrix4, Vector3 } from 'three';
import { JEWELS, createChain, createJewel } from './jewels';

const WORLD_DOWN = new Vector3(0, -1, 0);

// A face mesh is the front of a face and nothing more: no ear, no cheek edge, no back of a
// head. So an earring on an ear that has turned away does not go behind anything - it
// floats over the jaw, which is the single thing that most gives a try-on render away.
// Past this much turn it is hidden instead.
//
// The cosine between the ear's outward direction and the line of sight. It is a blunt
// instrument, because the landmarks' depth is compressed and a head turned thirty degrees
// reads as rather less than that - so in practice this fires somewhere near a profile,
// which is where the piece stops being worth looking at anyway.
const EAR_FACING_AWAY = -0.3;
const NO_ADJUST = { scale: 1, offset: { x: 0, y: 0 } };

/** Orients an object from three orthonormal axes. `x` must be `y` cross `z`. */
function orient(object, x, y, z) {
  object.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
}

/**
 * Straight down, flattened into the plane the piece swings in. A head tipped fully onto
 * its side leaves nothing to flatten, so the head's own down is the fallback.
 */
function hangDirection(axis, fallback) {
  const down = WORLD_DOWN.clone().addScaledVector(axis, -WORLD_DOWN.dot(axis));
  return down.lengthSq() < 1e-6 ? fallback.clone().negate() : down.normalize();
}

/**
 * A hoop pivots on the piercing, so its plane contains the vertical and its hole points
 * out of the ear. TorusGeometry is built in XY with its hole along Z, so Z is the outward
 * direction and Y is up within the swing plane. Resizing swings the piece further down,
 * because a bigger hoop still hangs from the same hole.
 */
function placeHoop(piece, anchor, out, faceUp, hang, scale) {
  const down = hangDirection(out, faceUp);
  const y = down.clone().negate();
  const x = new Vector3().crossVectors(y, out);
  orient(piece, x, y, out);
  piece.scale.setScalar(scale);
  piece.position.copy(anchor).addScaledVector(down, hang * scale);
}

/**
 * A stud does not swing: it sits through the lobe pointing straight out of the head, so
 * it is oriented entirely by the head's frame. The pieces are built with the stone on +Y.
 */
function placeStud(piece, anchor, out, faceUp, scale) {
  const x = new Vector3().crossVectors(faceUp, out);
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
  x.normalize();
  const z = new Vector3().crossVectors(x, out);
  orient(piece, x, out, z);
  piece.scale.setScalar(scale);
  // Off the surface of the lobe by a couple of millimetres, so the setting is not buried.
  piece.position.copy(anchor).addScaledVector(out, 0.002 * scale);
}

/** A pendant hangs plumb and faces the same way the person does. */
function placePendant(piece, face, bailHeight, scale) {
  const y = new Vector3(0, 1, 0);
  const z = face.basis.forward.clone().addScaledVector(y, -face.basis.forward.dot(y));
  if (z.lengthSq() < 1e-6) z.set(0, 0, 1);
  z.normalize();
  const x = new Vector3().crossVectors(y, z);
  orient(piece, x, y, z);
  piece.scale.setScalar(scale);
  // Held at the bail rather than at its middle, so resizing does not pull the piece off
  // the chain that is threaded through it.
  const bail = face.anchors.neck.clone().addScaledVector(y, bailHeight);
  piece.position.copy(bail).addScaledVector(y, -bailHeight * scale);
}

/**
 * The path a chain takes: down the front of the neck, dipping to the pendant's bail.
 *
 * A subject that knows its own surface supplies the points it should be laid along -
 * the scanned bust probes its actual neck for them. Otherwise they are worked out from a
 * neck radius, which is all a face mesh can offer, since it has no neck at all.
 */
function chainPath(face, bailHeight) {
  const { neckCentre, neckSides, neckRadius, neck, chainSides } = face.anchors;
  const { right, forward } = face.basis;
  const bail = neck.clone().addScaledVector(new Vector3(0, 1, 0), bailHeight);

  if (chainSides?.length === 4) {
    return [chainSides[0], chainSides[1], bail, chainSides[2], chainSides[3]];
  }

  // Two points halfway round the front of the neck, dropped a little so the chain sags
  // rather than running as a straight line from the shoulder to the pendant.
  const quarter = (side) =>
    neckCentre
      .clone()
      .addScaledVector(right, side * neckRadius * 0.71)
      .addScaledVector(forward, neckRadius * 0.71)
      .addScaledVector(new Vector3(0, 1, 0), -0.022);

  return [neckSides[0], quarter(-1), bail, quarter(1), neckSides[1]];
}

/**
 * Builds the chosen piece - both earrings, or a pendant on its chain - already positioned
 * in world space on the given face. The group is returned unframed: the camera is set up
 * for the face, not for the jewellery.
 *
 * `group.userData.adjust(next)` re-applies a size and offset to what is already there.
 */
export function placeOnFace(jewelId, metalId, face, adjust = NO_ADJUST, stoneId) {
  const spec = JEWELS[jewelId] ?? JEWELS.hoop;
  const group = new Group();
  group.name = `${jewelId}-${metalId}-on-face`;

  // Offsets arrive as fractions of the head's width, so the same gesture moves a piece the
  // same visible amount whichever subject it is being worn on.
  const reach = face.headWidth;

  // A face has no finger. A ring on a photographed hand is drawn by handphoto.ts, which
  // has its own landmarks and its own renderer; there is nothing for this function to
  // hang it from, and returning an empty group is more honest than putting it on an ear.
  if (spec.anchor === 'finger') return group;

  if (spec.anchor === 'ear') {
    const pieces = face.anchors.ears.map((anchor, index) => {
      const side = index === 0 ? -1 : 1; // ears[0] is the -right side of the head
      const out = face.basis.right.clone().multiplyScalar(side);
      return { piece: createJewel(jewelId, metalId, stoneId), anchor, out };
    });
    for (const { piece } of pieces) group.add(piece);

    // The scanned bust is solid and occludes its own far ear, so it needs none of this.
    if (face.canvas) {
      const toCamera = new Vector3();
      group.userData.beforeFrame = (camera) => {
        for (const { piece, anchor, out } of pieces) {
          toCamera.subVectors(camera.position, anchor).normalize();
          piece.visible = out.dot(toCamera) > EAR_FACING_AWAY;
        }
      };
    }

    group.userData.adjust = ({ scale = 1, offset = NO_ADJUST.offset }) => {
      for (const { piece, anchor, out } of pieces) {
        // Sideways moves both earrings outward or inward together rather than sliding
        // them both the same way across the head, which would bury one in the cheek.
        const shifted = anchor
          .clone()
          .addScaledVector(out, offset.x * reach)
          .addScaledVector(face.basis.up, offset.y * reach);
        if (spec.hang > 0) placeHoop(piece, shifted, out, face.basis.up, spec.hang, scale);
        else placeStud(piece, shifted, out, face.basis.up, scale);
      }
    };
    group.userData.adjust(adjust);
    return group;
  }

  const piece = createJewel(jewelId, metalId, stoneId);
  const chain = createChain(chainPath(face, spec.bail ?? 0), metalId);
  group.add(piece, chain);

  group.userData.adjust = ({ scale = 1, offset = NO_ADJUST.offset }) => {
    placePendant(piece, face, spec.bail ?? 0, scale);
    // The chain is a swept tube, so it is carried by moving the whole group rather than
    // rebuilt on every frame of a gesture.
    group.position
      .copy(face.basis.right)
      .multiplyScalar(offset.x * reach)
      .addScaledVector(face.basis.up, offset.y * reach);
  };
  group.userData.adjust(adjust);
  return group;
}
