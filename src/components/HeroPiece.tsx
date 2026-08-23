import { useMemo } from "react";
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
        transmission={stone === "natural" || stone === "lab" ? 0.22 : 0.5}
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
 * The Solstice pendant: a 28 mm open disc, 13 mm pear-cut centre stone and a
 * 9 mm bail. It is intentionally presentation-only; mount it in turntable.tsx
 * and bake it before exposing it on the landing page.
 */
export function HeroPiece({ metal = "white", stone = "natural" }: HeroPieceProps) {
  const gemGeometry = useMemo(createPearGemGeometry, []);
  const prongGeometry = useMemo(() => new THREE.CapsuleGeometry(0.00062, 0.0042, 6, 10), []);

  const prongs = useMemo(
    () => [
      { position: [-0.0045, 0.0022, 0.0015] as Vec3, rotation: [0, 0.28, -0.58] as Vec3 },
      { position: [0.0045, 0.0022, 0.0015] as Vec3, rotation: [0, -0.28, 0.58] as Vec3 },
      { position: [-0.0035, -0.0047, 0.0015] as Vec3, rotation: [0.15, 0.12, -1.3] as Vec3 },
      { position: [0.0035, -0.0047, 0.0015] as Vec3, rotation: [-0.15, -0.12, 1.3] as Vec3 },
    ],
    [],
  );

  return (
    <group name="solstice-hero-pendant" rotation={[0.12, -0.48, 0.08]}>
      {/* 28 mm outer diameter; the open silhouette keeps the stone as the focal point. */}
      <mesh position={[0, 0, -0.0018]} castShadow>
        <torusGeometry args={[0.0125, 0.00125, 12, 72]} />
        <Metal metal={metal} />
      </mesh>

      {/* The 9 mm bail is separate from the disc so a future chain can attach cleanly. */}
      <mesh position={[0, 0.0173, -0.0018]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.0041, 0.0009, 10, 36]} />
        <Metal metal={metal} />
      </mesh>

      <group position={[0, -0.0006, 0.001]}>
        <Gem stone={stone} geometry={gemGeometry} />
        {prongs.map((prong, index) => (
          <mesh
            key={index}
            geometry={prongGeometry}
            position={prong.position}
            rotation={prong.rotation}
            castShadow
          >
            <Metal metal={metal} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
