import { useMemo } from "react";
import { Environment } from "@react-three/drei";
import * as THREE from "three";
import type { MetalId, StoneId } from "../types";

/**
 * A standalone hero piece for the offline turntable route.
 *
 * It deliberately owns its geometry: R-1028's centre stone, halo and pavé in
 * RingModel are approved production geometry and must not become an incidental
 * dependency of a landing-page experiment. Measurements below are metres.
 */
export interface HeroPieceProps {
  kind?: "ring" | "earring" | "necklace";
  metal?: MetalId;
  stone?: StoneId;
}

const metalColours: Record<MetalId, string> = {
  white: "#e7e9e8",
  yellow: "#c9962d",
  rose: "#bd756d",
};

const stoneColours: Record<StoneId, { colour: string; attenuation: string; ior: number }> = {
  natural: { colour: "#f7fbff", attenuation: "#d6e7f4", ior: 2.417 },
  lab: { colour: "#e9f8ff", attenuation: "#c6e9f6", ior: 2.417 },
  ruby: { colour: "#b40f32", attenuation: "#71031d", ior: 1.76 },
  emerald: { colour: "#057150", attenuation: "#03442f", ior: 1.58 },
};

type Vec3 = [number, number, number];

function addTriangle(target: number[], a: Vec3, b: Vec3, c: Vec3) {
  target.push(...a, ...b, ...c);
}

/** A small, independently modelled 16-facet pear stone (13 mm long). */
function createPearGemGeometry() {
  const vertices: number[] = [];
  const outline: Vec3[] = [];
  const segments = 16;

  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    // A pear is round at its shoulder and tapers to a soft point at the bail.
    const y = Math.sin(angle) * 0.0062 + 0.0012;
    const taper = 1 - Math.max(0, Math.sin(angle)) * 0.38;
    outline.push([Math.cos(angle) * 0.0049 * taper, y, 0]);
  }

  const table: Vec3 = [0, 0.0005, 0.0031];
  const crown: Vec3[] = outline.map(([x, y]) => [x * 0.72, y * 0.72, 0.0022]);
  const girdleBottom: Vec3[] = outline.map(([x, y]) => [x, y, -0.00045]);
  const culet: Vec3 = [0, -0.0009, -0.0042];

  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    addTriangle(vertices, table, crown[index], crown[next]);
    addTriangle(vertices, crown[index], outline[index], outline[next]);
    addTriangle(vertices, crown[index], outline[next], crown[next]);
    addTriangle(vertices, outline[index], girdleBottom[index], girdleBottom[next]);
    addTriangle(vertices, outline[index], girdleBottom[next], outline[next]);
    addTriangle(vertices, culet, girdleBottom[next], girdleBottom[index]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function Metal({ metal }: { metal: MetalId }) {
  return (
    <meshPhysicalMaterial
      color={metalColours[metal]}
      metalness={0.94}
      roughness={0.16}
      clearcoat={0.25}
      clearcoatRoughness={0.12}
      envMapIntensity={1.2}
    />
  );
}

function Gem({ stone, geometry }: { stone: StoneId; geometry: THREE.BufferGeometry }) {
  const palette = stoneColours[stone];
  return (
    <mesh geometry={geometry} castShadow>
      <meshPhysicalMaterial
        color={palette.colour}
        roughness={0.035}
        metalness={0}
        /* A diamond is almost pure transmission - it has essentially no diffuse colour of
           its own, and what you see in it is the room. At 0.22 it came out as milky white
           plastic. Coloured stones stay slightly under 1 so the attenuation colour has
           something to tint. */
        transmission={stone === "natural" || stone === "lab" ? 1 : 0.92}
        thickness={0.006}
        ior={palette.ior}
        attenuationColor={palette.attenuation}
        attenuationDistance={0.018}
        envMapIntensity={1.75}
        clearcoat={0.8}
        clearcoatRoughness={0.025}
      />
    </mesh>
  );
}

/**
 * The Solstice ring: an 18.2 mm inside diameter on a 2.1 mm shank, carrying a 13 mm
 * pear-cut centre stone in four prongs, with a row of eleven accents over the shoulders.
 *
 * A real finger size, not an oversized prop. Once a piece sits on a hand a ring secretly
 * ten times too big is much harder to notice than to prevent.
 */
function SolsticeRing({ metal, stone, gemGeometry, prongGeometry }: Required<Pick<HeroPieceProps, "metal" | "stone">> & { gemGeometry: THREE.BufferGeometry; prongGeometry: THREE.BufferGeometry }) {
  const accents = useMemo(
    () => Array.from({ length: 11 }, (_, index) => {
      const angle = THREE.MathUtils.lerp(-1.12, 1.12, index / 10);
      return [Math.sin(angle) * 0.0108, Math.cos(angle) * 0.0108 + 0.0042, 0.001] as Vec3;
    }),
    [],
  );
  return <group name="solstice-hand-ring" rotation={[0.2, -0.5, 0]}>
    {/* 18.2 mm inside diameter, 2.1 mm shank: a wearable finger ring, not an oversized prop. */}
    <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[0.01015, 0.00105, 14, 80]} /><Metal metal={metal} /></mesh>
    <mesh position={[0, 0.011, 0.001]}><cylinderGeometry args={[0.007, 0.006, 0.0022, 32]} /><Metal metal={metal} /></mesh>
    <group position={[0, 0.011, 0.0028]}><Gem stone={stone} geometry={gemGeometry} />
      {[[-0.0046, 0.002, 0.001] as Vec3, [0.0046, 0.002, 0.001] as Vec3, [-0.0033, -0.0045, 0.001] as Vec3, [0.0033, -0.0045, 0.001] as Vec3].map((position, index) =>
        <mesh key={index} geometry={prongGeometry} position={position} rotation={[0, index % 2 ? 0.35 : -0.35, index < 2 ? 0.55 : -0.55]}><Metal metal={metal} /></mesh>,
      )}
    </group>
    {accents.map((position, index) => <group key={index} position={position} scale={0.19}><Gem stone="natural" geometry={gemGeometry} /></group>)}
  </group>;
}

function SolsticeEarring({ metal, stone, gemGeometry }: Required<Pick<HeroPieceProps, "metal" | "stone">> & { gemGeometry: THREE.BufferGeometry }) {
  return <group name="solstice-earring" rotation={[0.05, -0.4, 0]}>
    {/* 22 mm hoop with a detachable 13 mm pear drop. */}
    <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[0.009, 0.0009, 12, 64, Math.PI * 1.68]} /><Metal metal={metal} /></mesh>
    <mesh position={[0, -0.0105, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[0.0034, 0.00072, 10, 30]} /><Metal metal={metal} /></mesh>
    <group position={[0, -0.017, 0.002]} rotation={[0, 0, Math.PI]}><Gem stone={stone} geometry={gemGeometry} /></group>
  </group>;
}

function SolsticeNecklace({ metal, stone, gemGeometry }: Required<Pick<HeroPieceProps, "metal" | "stone">> & { gemGeometry: THREE.BufferGeometry }) {
  const chain = useMemo(() => new THREE.TorusGeometry(0.024, 0.00038, 6, 80, Math.PI * 0.8), []);
  return <group name="solstice-necklace" rotation={[0.1, -0.42, 0]}>
    {/* 48 mm necklace arc, 28 mm pendant and 13 mm centre stone. */}
    <mesh geometry={chain} rotation={[0, 0, Math.PI * 0.1]}><Metal metal={metal} /></mesh>
    <mesh position={[0, -0.018, 0]} castShadow><torusGeometry args={[0.0125, 0.00125, 12, 72]} /><Metal metal={metal} /></mesh>
    <mesh position={[0, -0.0007, 0]} castShadow><torusGeometry args={[0.0041, 0.0009, 10, 36]} /><Metal metal={metal} /></mesh>
    <group position={[0, -0.0186, 0.002]}><Gem stone={stone} geometry={gemGeometry} /></group>
  </group>;
}

export function HeroPiece({ kind = "ring", metal = "yellow", stone = "emerald" }: HeroPieceProps) {
  const gemGeometry = useMemo(createPearGemGeometry, []);
  const prongGeometry = useMemo(() => new THREE.CapsuleGeometry(0.00062, 0.0042, 6, 10), []);
  return (
    <>
      {/*
        The piece brings its own room with it.

        Polished metal at metalness 0.94 has almost no colour of its own - what you see in
        it is the environment reflected. The turntable route lights the stage with an
        ambient and two directional lights and nothing else; RingModel mounts its own
        `<Environment>` and that is where R-1028's silver comes from. Without one this
        piece baked out matte black at a mean luminance of 24 against R-1028's 218 under
        identical settings, which reads as a broken material and is really a missing room.
      */}
      <Environment files="/assets/studio-small-09-1k.hdr" />
      {kind === "earring" ? (
        <SolsticeEarring metal={metal} stone={stone} gemGeometry={gemGeometry} />
      ) : kind === "necklace" ? (
        <SolsticeNecklace metal={metal} stone={stone} gemGeometry={gemGeometry} />
      ) : (
        <SolsticeRing metal={metal} stone={stone} gemGeometry={gemGeometry} prongGeometry={prongGeometry} />
      )}
    </>
  );
}
