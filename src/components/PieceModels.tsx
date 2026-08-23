// The necklace and the earrings, built the way the ring is.
//
// Parametric three.js rather than imported assets, for the reason CLAUDE.md gives: most
// jewellery is close to primitive, and generating it keeps the meshes clean, watertight
// and low-poly. They cut their stones with the ring's own brilliant and emerald geometry,
// so a diamond is the same diamond across the whole catalogue.
//
// Nothing here renders on the product page. These exist to be photographed by
// tools/turntable, which bakes them into the frames the site actually serves.

import { Environment, MeshRefractionMaterial, MeshTransmissionMaterial, useEnvironment } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { MetalId, StoneId } from "../types";
import {
  createBrightGemEnvironment,
  createEmeraldCutGeometry,
  createRoundBrilliantGeometry,
  diamondLift,
  metalPalette,
  stonePalette,
} from "./RingModel";

type Point3 = [number, number, number];

interface PieceProps {
  metal: MetalId;
  stone: StoneId;
  /**
   * Render only the part that is actually worn: the drop without its chain, one stud
   * without the other.
   *
   * The catalogue twin is a product shot - a pendant on a length of chain, a pair of studs
   * turned differently so you can see both faces. What goes on a customer is one drop at
   * their collarbone, on a chain drawn to fit their neck, and one stud on each ear.
   *
   * This used to be done afterwards, by cutting the unwanted part out of the baked pixels.
   * That works on a single face-on frame and fails across a full turn, three ways: a
   * horizontal cut cannot separate a chain whose ends hang level with the drop; a stencil
   * taken from one frame cuts through a different part of the piece in the next; and an
   * opening by thickness eats a transparent stone as readily as a chain. Here the two
   * things are already separate objects, so there is nothing to separate.
   */
  worn?: boolean;
}

const HDRI = "/assets/studio-small-09-1k.hdr";

function Metal({ metal, roughness }: { metal: MetalId; roughness?: number }) {
  const palette = metalPalette[metal];
  return (
    <meshPhysicalMaterial
      color={palette.color}
      metalness={metal === "white" ? 0.88 : 0.93}
      roughness={roughness ?? palette.roughness}
      envMapIntensity={1.15}
    />
  );
}

/** One accent diamond, cut and lit as the ring's pavé is. */
function Accent({
  geometry,
  environment,
  position,
  angle,
}: {
  geometry: THREE.BufferGeometry;
  environment: THREE.Texture;
  position: Point3;
  angle: number;
}) {
  return (
    <mesh geometry={geometry} position={position} rotation={[0, 0, angle]} castShadow>
      <MeshRefractionMaterial
        envMap={environment}
        color={diamondLift}
        ior={2.417}
        bounces={3}
        aberrationStrength={0.004}
        fresnel={1}
        fastChroma
        toneMapped={false}
      />
    </mesh>
  );
}

/** The centre stone. A diamond refracts; a coloured stone transmits. */
function Centre({
  stone,
  round,
  emerald,
  environment,
}: {
  stone: StoneId;
  round: THREE.BufferGeometry;
  emerald: THREE.BufferGeometry;
  environment: THREE.Texture;
}) {
  const palette = stonePalette[stone];
  const isEmerald = stone === "emerald";

  if (stone === "natural" || stone === "lab") {
    return (
      <mesh geometry={round} castShadow>
        <MeshRefractionMaterial
          envMap={environment}
          color={diamondLift}
          ior={2.417}
          bounces={5}
          aberrationStrength={0.006}
          fresnel={1}
          toneMapped={false}
        />
      </mesh>
    );
  }

  return (
    <mesh geometry={isEmerald ? emerald : round} scale={isEmerald ? 0.62 : 1} castShadow>
      <MeshTransmissionMaterial
        color={palette.color}
        attenuationColor={palette.attenuation}
        attenuationDistance={2.6}
        transmission={0.86}
        thickness={0.6}
        backside
        backsideThickness={0.6}
        samples={6}
        resolution={512}
        ior={palette.ior}
        roughness={0.03}
        envMapIntensity={1.8}
        chromaticAberration={0.012}
        clearcoat={0.35}
        clearcoatRoughness={0.02}
      />
    </mesh>
  );
}

/**
 * A haloed setting: a bezel, a ring of accent stones, a centre stone and four prongs.
 * Shared, because the necklace drop and the earring face are the same jewel at two sizes.
 */
function HaloSetting({
  metal,
  stone,
  radius,
  environment,
}: {
  metal: MetalId;
  stone: StoneId;
  radius: number;
  environment: THREE.Texture;
}) {
  const centre = useMemo(() => createRoundBrilliantGeometry(radius * 0.64, true), [radius]);
  const emerald = useMemo(() => createEmeraldCutGeometry(), []);
  const accent = useMemo(() => createRoundBrilliantGeometry(radius * 0.105, true, 0.92), [radius]);
  const count = Math.round(radius * 30);
  const halo = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => {
        const angle = (index / count) * Math.PI * 2;
        return {
          angle,
          position: [Math.cos(angle) * radius * 0.87, Math.sin(angle) * radius * 0.87, radius * 0.34] as Point3,
        };
      }),
    [count, radius],
  );

  return (
    <group>
      <mesh position={[0, 0, radius * 0.28]} castShadow>
        <torusGeometry args={[radius, radius * 0.045, 18, 96]} />
        <Metal metal={metal} />
      </mesh>

      {halo.map((item, index) => (
        <Accent
          key={index}
          geometry={accent}
          environment={environment}
          position={item.position}
          angle={item.angle}
        />
      ))}

      <group position={[0, 0, radius * 0.46]}>
        <Centre stone={stone} round={centre} emerald={emerald} environment={environment} />
      </group>

      {[Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4].map((angle) => (
        <mesh
          key={angle}
          position={[Math.cos(angle) * radius * 0.63, Math.sin(angle) * radius * 0.63, radius * 0.52]}
          scale={[radius * 0.1, radius * 0.1, radius * 0.08]}
          castShadow
        >
          <sphereGeometry args={[1, 18, 14]} />
          <Metal metal={metal} roughness={0.12} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * A cable chain, laid along a catenary rather than an arc.
 *
 * A chain hangs under its own weight; an arc reads as a hoop. The links are real geometry
 * rather than a textured tube, which is what lets it survive being turned to profile.
 */
function Chain({ metal }: { metal: MetalId }) {
  const links = useMemo(() => {
    const out: { position: Point3; rotation: Point3 }[] = [];
    const count = 54;
    const halfWidth = 1.55;
    const a = 1.5;
    const drop = a * Math.cosh(halfWidth / a) - a;
    for (let i = 0; i <= count; i += 1) {
      const t = (i / count) * 2 - 1;
      const x = t * halfWidth;
      const y = -(a * Math.cosh(x / a) - a) + drop;
      const slope = Math.sinh(x / a);
      out.push({
        position: [x, y, 0],
        rotation: [i % 2 === 0 ? 0 : Math.PI / 2, 0, Math.atan(slope) + Math.PI / 2],
      });
    }
    return out;
  }, []);

  return (
    <group>
      {links.map((link, index) => (
        <mesh key={index} position={link.position} rotation={link.rotation} castShadow>
          <torusGeometry args={[0.055, 0.019, 10, 22]} />
          <Metal metal={metal} roughness={0.14} />
        </mesh>
      ))}
    </group>
  );
}

/** N-1032, the Solstice pendant: a haloed drop on a cable chain. */
export function NecklaceModel({ metal, stone, worn = false }: PieceProps) {
  const environment = useEnvironment({ files: HDRI });
  // MeshRefractionMaterial samples a cube map; handed the equirect HDRI it renders black.
  // The ring paints a small cube probe for exactly this, so the stones match across pieces.
  const gemProbe = useMemo(() => createBrightGemEnvironment(), []);

  return (
    <>
      <group position={[0, 1.35, 0]}>
        {!worn && <Chain metal={metal} />}

        <group position={[0, -0.16, 0]}>
          {/* The bail: the loop the chain passes through. */}
          <mesh position={[0, 0.82, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[0.14, 0.038, 14, 40]} />
            <Metal metal={metal} />
          </mesh>
          <group position={[0, -0.34, 0]}>
            <HaloSetting metal={metal} stone={stone} radius={0.95} environment={gemProbe} />
          </group>
        </group>
      </group>

      <Environment map={environment} environmentIntensity={1.1} environmentRotation={[0, 1.05, 0]} />
    </>
  );
}

/** E-2419, the halo studs. A pair, turned differently, so one view reads as two earrings. */
export function EarringModel({ metal, stone, worn = false }: PieceProps) {
  const environment = useEnvironment({ files: HDRI });
  const gemProbe = useMemo(() => createBrightGemEnvironment(), []);

  const pair: { position: Point3; rotation: Point3 }[] = [
    { position: [-1.05, 0.22, 0], rotation: [0, -0.34, 0] },
    { position: [1.05, -0.22, -0.25], rotation: [0, 0.4, 0] },
  ];
  // One stud, centred, when it is going on an ear. Only one is drawn per ear, and a pair
  // offset to either side would put the second one out on the cheek.
  const studs = worn ? [{ position: [0, 0, 0] as Point3, rotation: [0, 0, 0] as Point3 }] : pair;

  return (
    <>
      {studs.map((stud, index) => (
        <group key={index} position={stud.position} rotation={stud.rotation}>
          <HaloSetting metal={metal} stone={stone} radius={0.82} environment={gemProbe} />

          {/* The post and butterfly, behind the face. Seen only from profile, which is
              exactly where a stud otherwise looks like a flat disc. */}
          <mesh position={[0, 0, -0.36]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.033, 0.033, 0.66, 14]} />
            <Metal metal={metal} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0, -0.66]} scale={[0.16, 0.16, 0.085]} castShadow>
            <sphereGeometry args={[1, 18, 14]} />
            <Metal metal={metal} roughness={0.18} />
          </mesh>
        </group>
      ))}

      <Environment map={environment} environmentIntensity={1.1} environmentRotation={[0, 1.05, 0]} />
    </>
  );
}
