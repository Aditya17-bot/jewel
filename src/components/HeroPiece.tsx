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
        /* The turntable mounts this metre-authored piece at HERO_TO_ROUTE = 150.
           MeshPhysicalMaterial evaluates these paths in route/world units, so these
           values are expressed at that 150x display scale (not in metres). */
        thickness={0.9}
        ior={palette.ior}
        attenuationColor={palette.attenuation}
        attenuationDistance={4.5}
        envMapIntensity={1.75}
        clearcoat={0.8}
        clearcoatRoughness={0.025}
      />
    </mesh>
  );
}

function tube(points: Vec3[], radius: number) {
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)), true, "centripetal"),
    48,
    radius,
    8,
    true,
  );
}

/** A 1.25 mm round-brilliant stand-in for the shoulder pavé, never a scaled pear. */
function createAccentGeometry() {
  return new THREE.OctahedronGeometry(0.00122, 1);
}

/**
 * The Solstice ring: an 18.2 mm inside diameter on a 2.1 mm shank, carrying a 13 mm
 * pear-cut centre stone in four prongs, with a row of eleven accents over the shoulders.
 *
 * A real finger size, not an oversized prop. Once a piece sits on a hand a ring secretly
 * ten times too big is much harder to notice than to prevent.
 */
function SolsticeRing({ metal, stone, gemGeometry }: Required<Pick<HeroPieceProps, "metal" | "stone">> & { gemGeometry: THREE.BufferGeometry }) {
  const stoneScale = 0.58;
  const gallery = useMemo(() => {
    const outline: Vec3[] = Array.from({ length: 16 }, (_, index) => {
      const angle = (index / 16) * Math.PI * 2;
      const taper = 1 - Math.max(0, Math.sin(angle)) * 0.38;
      return [Math.cos(angle) * 0.0049 * taper, Math.sin(angle) * 0.0062 + 0.0012, 0] as Vec3;
    });
    return tube(outline, 0.00034);
  }, []);
  const ribs = useMemo(() => [
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.0044, 0.0025, 0), new THREE.Vector3(-0.0035, -0.0002, -0.0022), new THREE.Vector3(0, -0.0009, -0.0034)]), 18, 0.00028, 7, false),
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.0044, 0.0025, 0), new THREE.Vector3(0.0035, -0.0002, -0.0022), new THREE.Vector3(0, -0.0009, -0.0034)]), 18, 0.00028, 7, false),
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.005, 0), new THREE.Vector3(0, -0.0034, -0.002), new THREE.Vector3(0, -0.0009, -0.0034)]), 18, 0.00028, 7, false),
  ], []);
  const prongs = useMemo(() => [
    [[-0.0043, 0.0029, -0.0002], [-0.0041, 0.0028, 0.0019], [-0.0035, 0.0021, 0.0026]],
    [[0.0043, 0.0029, -0.0002], [0.0041, 0.0028, 0.0019], [0.0035, 0.0021, 0.0026]],
    [[-0.0024, -0.0045, -0.0002], [-0.0022, -0.0044, 0.0018], [-0.0017, -0.0037, 0.0025]],
    [[0.0024, -0.0045, -0.0002], [0.0022, -0.0044, 0.0018], [0.0017, -0.0037, 0.0025]],
  ].map((points) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point as Vec3))), 16, 0.00034, 7, false)), []);
  const accentGeometry = useMemo(createAccentGeometry, []);
  const accents = useMemo(
    () => Array.from({ length: 11 }, (_, index) => {
      const angle = THREE.MathUtils.lerp(-1.12, 1.12, index / 10);
      // On the shank's own circle. Centred 4.2 mm above it, the accents left the metal
      // entirely and hung in the air beside the stone.
      return [Math.sin(angle) * 0.0108, Math.cos(angle) * 0.0108, 0.001] as Vec3;
    }),
    [],
  );
  return <group name="solstice-hand-ring" rotation={[0.2, -0.5, 0]}>
    {/* 18.2 mm inside diameter, 2.1 mm shank: a wearable finger ring, not an oversized prop. */}
    {/* No rotation. TorusGeometry already lies in the XY plane, which is a ring standing
        up as you would look at it - a finger goes through it along Z. Rotated a quarter
        turn about X it lies flat like a hoop on a table, and the head, positioned for the
        upright band, then hovers a centimetre above nothing. That one line was most of why
        this did not read as a ring. */}
    <mesh castShadow><torusGeometry args={[0.01015, 0.00105, 14, 80]} /><Metal metal={metal} /></mesh>
    <group position={[0, 0.011, 0.0028]} scale={stoneScale}>
      {/* An open pear gallery: girdle rim and tapering ribs leave the pavilion visible. */}
      <mesh geometry={gallery}><Metal metal={metal} /></mesh>
      {ribs.map((geometry, index) => <mesh key={index} geometry={geometry}><Metal metal={metal} /></mesh>)}
      <Gem stone={stone} geometry={gemGeometry} />
      {prongs.map((geometry, index) => <mesh key={index} geometry={geometry}><Metal metal={metal} /></mesh>)}
    </group>
    {accents.map((position, index) => <group key={index} position={position}><Gem stone="natural" geometry={accentGeometry} /></group>)}
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
        <SolsticeRing metal={metal} stone={stone} gemGeometry={gemGeometry} />
      )}
    </>
  );
}
