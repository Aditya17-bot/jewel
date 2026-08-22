import {
  ContactShadows,
  Environment,
  MeshRefractionMaterial,
  MeshTransmissionMaterial,
  useEnvironment,
} from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getRingSizeSpec } from "../data/demoData";
import type { MetalId, RingSize, StoneId } from "../types";

interface RingModelProps {
  metal: MetalId;
  stone: StoneId;
  size: RingSize;
}

type Point3 = [number, number, number];

export const metalPalette: Record<MetalId, { color: string; roughness: number }> = {
  white: { color: "#f7f8f8", roughness: 0.17 },
  yellow: { color: "#d7aa35", roughness: 0.16 },
  rose: { color: "#cf8b7d", roughness: 0.16 },
};

export const stonePalette: Record<StoneId, { color: string; attenuation: string; ior: number }> = {
  natural: { color: "#ffffff", attenuation: "#dce9ff", ior: 2.417 },
  lab: { color: "#f4fdff", attenuation: "#cbefff", ior: 2.417 },
  ruby: { color: "#c91443", attenuation: "#9a0c31", ior: 1.76 },
  emerald: { color: "#07845a", attenuation: "#075e41", ior: 1.58 },
};

export const diamondLift = new THREE.Color().setRGB(1.02, 1.04, 1.08);

export function createBrightGemEnvironment(highContrast = true) {
  const panels = [
    { axis: "x", dark: 0.18, cool: "#dbe8f1", warm: "#f2e4cf" },
    { axis: "y", dark: 0.72, cool: "#e8eef5", warm: "#ead7bd" },
    { axis: "x", dark: 0.68, cool: "#d5e4ef", warm: "#f5ead8" },
    { axis: "y", dark: 0.28, cool: "#e3edf6", warm: "#e8d0b0" },
    { axis: "x", dark: 0.42, cool: "#d6e7f2", warm: "#f6ead4" },
    { axis: "y", dark: 0.58, cool: "#e5eef7", warm: "#ead8c0" },
  ] as const;

  const faces = panels.map(({ axis, dark, cool, warm }, index) => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) return canvas;

    const base = context.createRadialGradient(128, 112, 16, 128, 128, 190);
    base.addColorStop(0, "#ffffff");
    base.addColorStop(0.52, "#e9edef");
    base.addColorStop(1, highContrast ? "#424b52" : "#a9b1b6");
    context.fillStyle = base;
    context.fillRect(0, 0, 256, 256);

    const softbox = context.createLinearGradient(0, 0, axis === "x" ? 256 : 0, axis === "y" ? 256 : 0);
    softbox.addColorStop(0, cool);
    softbox.addColorStop(0.42, "#ffffff");
    softbox.addColorStop(0.7, warm);
    softbox.addColorStop(1, "#f8f8f6");
    context.globalAlpha = highContrast ? 0.74 : 0.66;
    context.fillStyle = softbox;
    context.fillRect(18, 20, 220, 216);

    context.globalAlpha = highContrast ? (index % 2 === 0 ? 0.7 : 0.62) : (index % 2 === 0 ? 0.36 : 0.3);
    context.fillStyle = "#101820";
    const darkBand = highContrast ? 38 : 16;
    if (axis === "x") context.fillRect(dark * 256, 0, darkBand, 256);
    else context.fillRect(0, dark * 256, 256, darkBand);

    context.globalAlpha = 0.88;
    context.fillStyle = "#ffffff";
    if (axis === "x") context.fillRect((1 - dark) * 210, 34, 20, 188);
    else context.fillRect(34, (1 - dark) * 210, 188, 20);
    context.globalAlpha = 1;
    return canvas;
  });

  const texture = new THREE.CubeTexture(faces);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function pushTriangle(target: number[], a: Point3, b: Point3, c: Point3) {
  target.push(...a, ...b, ...c);
}

function pushQuad(target: number[], a: Point3, b: Point3, c: Point3, d: Point3) {
  pushTriangle(target, a, b, c);
  pushTriangle(target, a, c, d);
}

function polarRing(count: number, radius: number, z: number, offset = 0): Point3[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 + offset;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius, z];
  });
}

function connectMatchingRings(target: number[], upper: Point3[], lower: Point3[]) {
  for (let index = 0; index < upper.length; index += 1) {
    const next = (index + 1) % upper.length;
    pushQuad(target, upper[index], lower[index], lower[next], upper[next]);
  }
}

export function createRoundBrilliantGeometry(radius = 0.66, facetColor = false, toneScale = 1) {
  const vertices: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const sectors = 8;
  const table = polarRing(sectors, radius * 0.56, radius * 0.34);
  const stars = polarRing(sectors, radius * 0.78, radius * 0.18, Math.PI / sectors);
  const girdleTop = polarRing(sectors * 2, radius, radius * 0.03);
  const girdleBottom = polarRing(sectors * 2, radius, -radius * 0.03);
  const pavilionBreak = polarRing(sectors, radius * 0.72, -radius * 0.24, Math.PI / sectors);
  const culet: Point3 = [0, 0, -radius * 0.86];

  const addFacet = (points: Point3[], tone: number) => {
    const a = new THREE.Vector3(...points[0]);
    const b = new THREE.Vector3(...points[1]);
    const c = new THREE.Vector3(...points[2]);
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const centroid = points.reduce(
      (sum, point) => sum.add(new THREE.Vector3(...point)),
      new THREE.Vector3(),
    ).multiplyScalar(1 / points.length);
    const ordered = normal.dot(centroid) >= 0 ? points : [...points].reverse();
    if (normal.dot(centroid) < 0) normal.multiplyScalar(-1);

    for (let index = 1; index < ordered.length - 1; index += 1) {
      const triangle = [ordered[0], ordered[index], ordered[index + 1]];
      for (const point of triangle) {
        vertices.push(...point);
        normals.push(normal.x, normal.y, normal.z);
        uvs.push(point[0] / (radius * 2) + 0.5, point[1] / (radius * 2) + 0.5);
        if (facetColor) {
          const finalTone = THREE.MathUtils.clamp(tone * toneScale, 0.18, 1);
          colors.push(finalTone * 0.96, finalTone * 0.985, Math.min(1, finalTone * 1.025));
        }
      }
    }
  };

  addFacet(table, 0.82);

  // 8 star facets, 8 bezel facets and 16 upper-girdle facets.
  for (let index = 0; index < sectors; index += 1) {
    const next = (index + 1) % sectors;
    const previous = (index - 1 + sectors) % sectors;
    const outer = index * 2;
    const outerMid = outer + 1;
    const outerNext = (outer + 2) % girdleTop.length;

    addFacet([table[index], table[next], stars[index]], index % 2 ? 0.35 : 0.98);
    addFacet(
      [table[index], stars[previous], girdleTop[outer], stars[index]],
      index % 3 === 0 ? 0.24 : 0.88,
    );
    addFacet([stars[index], girdleTop[outer], girdleTop[outerMid]], index % 2 ? 0.42 : 0.97);
    addFacet([stars[index], girdleTop[outerMid], girdleTop[outerNext]], index % 2 ? 0.9 : 0.28);
  }

  for (let index = 0; index < girdleTop.length; index += 1) {
    const next = (index + 1) % girdleTop.length;
    addFacet(
      [girdleTop[index], girdleBottom[index], girdleBottom[next], girdleTop[next]],
      index % 2 ? 0.67 : 0.88,
    );
  }

  // 16 lower-girdle facets and 8 pavilion mains terminating at the culet.
  for (let index = 0; index < sectors; index += 1) {
    const previous = (index - 1 + sectors) % sectors;
    const outer = index * 2;
    const outerMid = outer + 1;
    const outerNext = (outer + 2) % girdleBottom.length;

    addFacet(
      [girdleBottom[outer], girdleBottom[outerMid], pavilionBreak[index]],
      index % 2 ? 0.32 : 0.92,
    );
    addFacet(
      [girdleBottom[outerMid], girdleBottom[outerNext], pavilionBreak[index]],
      index % 2 ? 0.84 : 0.22,
    );
    addFacet(
      [culet, pavilionBreak[index], girdleBottom[outer], pavilionBreak[previous]],
      index % 2 ? 0.25 : 0.9,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  if (facetColor) {
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  }
  // Keep facet vertices unique while presenting an indexed shell to the BVH
  // refraction shader; this preserves flat facets without conversion warnings.
  geometry.setIndex(Array.from({ length: vertices.length / 3 }, (_, index) => index));
  geometry.computeBoundingSphere();
  return geometry;
}

function octagonalRectangle(width: number, height: number, cut: number, z: number): Point3[] {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  return [
    [-halfWidth + cut, -halfHeight, z],
    [halfWidth - cut, -halfHeight, z],
    [halfWidth, -halfHeight + cut, z],
    [halfWidth, halfHeight - cut, z],
    [halfWidth - cut, halfHeight, z],
    [-halfWidth + cut, halfHeight, z],
    [-halfWidth, halfHeight - cut, z],
    [-halfWidth, -halfHeight + cut, z],
  ];
}

export function createEmeraldCutGeometry() {
  const vertices: number[] = [];
  const table = octagonalRectangle(0.62, 0.82, 0.11, 0.34);
  const crown = octagonalRectangle(0.84, 1.08, 0.14, 0.18);
  const girdleTop = octagonalRectangle(0.98, 1.24, 0.17, 0.045);
  const girdleBottom = octagonalRectangle(0.98, 1.24, 0.17, -0.045);
  const pavilion = octagonalRectangle(0.58, 0.75, 0.1, -0.32);
  const culet = octagonalRectangle(0.13, 0.2, 0.035, -0.52);
  const tableCenter: Point3 = [0, 0, 0.34];

  for (let index = 0; index < table.length; index += 1) {
    const next = (index + 1) % table.length;
    pushTriangle(vertices, tableCenter, table[index], table[next]);
  }
  connectMatchingRings(vertices, table, crown);
  connectMatchingRings(vertices, crown, girdleTop);
  connectMatchingRings(vertices, girdleTop, girdleBottom);
  connectMatchingRings(vertices, girdleBottom, pavilion);
  connectMatchingRings(vertices, pavilion, culet);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createRoundedShoulderGeometry(curve: THREE.CatmullRomCurve3) {
  const tubularSegments = 72;
  const radialSegments = 28;
  const vertices: number[] = [];
  const indices: number[] = [];
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const faceAxis = new THREE.Vector3();
  const depthAxis = new THREE.Vector3();
  const globalFaceAxis = new THREE.Vector3(0, 1, 0);

  for (let segment = 0; segment <= tubularSegments; segment += 1) {
    const t = segment / tubularSegments;
    const shoulderEnd = 0.64;
    const onPaveCarrier = t <= shoulderEnd;
    const localProgress = onPaveCarrier ? t / shoulderEnd : (t - shoulderEnd) / (1 - shoulderEnd);
    const eased = localProgress * localProgress * (3 - 2 * localProgress);
    const faceRadius = onPaveCarrier
      ? THREE.MathUtils.lerp(0.235, 0.095, eased)
      : THREE.MathUtils.lerp(0.095, 0.15, eased);
    const depthRadius = onPaveCarrier
      ? THREE.MathUtils.lerp(0.105, 0.095, eased)
      : THREE.MathUtils.lerp(0.095, 0.15, eased);
    curve.getPointAt(t, point);
    curve.getTangentAt(t, tangent).normalize();
    faceAxis.copy(globalFaceAxis).addScaledVector(tangent, -globalFaceAxis.dot(tangent)).normalize();
    depthAxis.crossVectors(tangent, faceAxis).normalize();

    for (let radial = 0; radial <= radialSegments; radial += 1) {
      const angle = (radial / radialSegments) * Math.PI * 2;
      const faceOffset = Math.cos(angle) * faceRadius;
      const depthOffset = Math.sin(angle) * depthRadius;
      vertices.push(
        point.x + faceAxis.x * faceOffset + depthAxis.x * depthOffset,
        point.y + faceAxis.y * faceOffset + depthAxis.y * depthOffset,
        point.z + faceAxis.z * faceOffset + depthAxis.z * depthOffset,
      );
    }
  }

  const ringSize = radialSegments + 1;
  for (let segment = 1; segment <= tubularSegments; segment += 1) {
    for (let radial = 1; radial <= radialSegments; radial += 1) {
      const a = ringSize * (segment - 1) + (radial - 1);
      const b = ringSize * segment + (radial - 1);
      const c = ringSize * segment + radial;
      const d = ringSize * (segment - 1) + radial;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createCathedralSupportGeometry(side: -1 | 1) {
  const curve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(side * 0.69, -0.23, -0.28),
      new THREE.Vector3(side * 0.73, -0.12, -0.19),
      new THREE.Vector3(side * 0.69, 0, -0.08),
    ],
    false,
    "catmullrom",
    0.5,
  );
  return new THREE.TubeGeometry(curve, 32, 0.026, 16, false);
}

function MetalMaterial({
  metal,
  roughness,
  metalness,
  envMapIntensity,
}: {
  metal: MetalId;
  roughness?: number;
  metalness?: number;
  envMapIntensity?: number;
}) {
  const palette = metalPalette[metal];
  return (
    <meshPhysicalMaterial
      color={palette.color}
      metalness={metalness ?? (metal === "white" ? 0.88 : 0.93)}
      roughness={roughness ?? palette.roughness}
      envMapIntensity={envMapIntensity ?? 1.15}
    />
  );
}

interface DiamondInstance {
  position: Point3;
  scale: number;
  rotation: Point3;
}

function InstancedDiamonds({
  geometry,
  instances,
  environment,
}: {
  geometry: THREE.BufferGeometry;
  instances: DiamondInstance[];
  environment: THREE.Texture;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!meshRef.current) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();

    instances.forEach((instance, index) => {
      position.set(...instance.position);
      euler.set(...instance.rotation);
      quaternion.setFromEuler(euler);
      scale.setScalar(instance.scale);
      matrix.compose(position, quaternion, scale);
      meshRef.current?.setMatrixAt(index, matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [instances]);

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, instances.length]} castShadow>
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
    </instancedMesh>
  );
}

function CenterStone({
  stone,
  roundGeometry,
  emeraldGeometry,
  environment,
}: {
  stone: StoneId;
  roundGeometry: THREE.BufferGeometry;
  emeraldGeometry: THREE.BufferGeometry;
  environment: THREE.Texture;
}) {
  const palette = stonePalette[stone];
  const isDiamond = stone === "natural" || stone === "lab";
  const isEmerald = stone === "emerald";
  const rotation: Point3 = [0, 0, isEmerald ? 0 : Math.PI / 32];

  if (isDiamond) {
    return (
      <group rotation={rotation}>
        <mesh geometry={roundGeometry} scale={0.995} castShadow>
          <MeshRefractionMaterial
            envMap={environment}
            color={diamondLift}
            ior={2.417}
            bounces={5}
            aberrationStrength={0.006}
            fresnel={1}
            fastChroma={false}
            toneMapped={false}
          />
        </mesh>
        <mesh geometry={roundGeometry} scale={1.002} renderOrder={3}>
          <meshBasicMaterial
            color="#dce7ef"
            vertexColors
            transparent
            opacity={0.34}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
    );
  }

  return (
    <mesh
      geometry={isEmerald ? emeraldGeometry : roundGeometry}
      rotation={rotation}
      scale={isEmerald ? [0.9, 0.9, 0.92] : [1, 1, 1]}
      castShadow
    >
      <MeshTransmissionMaterial
        color={palette.color}
        attenuationColor={palette.attenuation}
        attenuationDistance={isEmerald ? 2.4 : 2.8}
        transmission={0.86}
        thickness={isEmerald ? 0.58 : 0.64}
        backside
        backsideThickness={isEmerald ? 0.58 : 0.64}
        samples={6}
        resolution={512}
        ior={palette.ior}
        roughness={isEmerald ? 0.035 : 0.025}
        envMapIntensity={1.8}
        chromaticAberration={isEmerald ? 0.006 : 0.015}
        anisotropy={0.08}
        distortion={0.035}
        distortionScale={0.12}
        temporalDistortion={0}
        clearcoat={0.35}
        clearcoatRoughness={0.02}
        vertexColors={!isEmerald}
      />
    </mesh>
  );
}

function ClawProng({ angle, metal }: { angle: number; metal: MetalId }) {
  const { midpoint, quaternion, length, tip } = useMemo(() => {
    const start = new THREE.Vector3(Math.cos(angle) * 0.69, Math.sin(angle) * 0.69, -0.08);
    const end = new THREE.Vector3(Math.cos(angle) * 0.59, Math.sin(angle) * 0.59, 0.47);
    const direction = end.clone().sub(start);
    return {
      midpoint: start.clone().add(end).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.clone().normalize(),
      ),
      length: direction.length(),
      tip: end,
    };
  }, [angle]);

  return (
    <>
      <mesh position={midpoint} quaternion={quaternion} castShadow>
        <cylinderGeometry args={[0.034, 0.065, length, 24]} />
        <MetalMaterial metal={metal} roughness={0.18} />
      </mesh>
      <mesh position={tip} rotation={[0, 0, angle - Math.PI / 2]} scale={[0.084, 0.084, 0.064]} castShadow>
        <sphereGeometry args={[1, 24, 20]} />
        <MetalMaterial metal={metal} roughness={0.15} />
      </mesh>
    </>
  );
}

export function RingModel({ metal, stone, size }: RingModelProps) {
  const studioEnvironment = useEnvironment({ files: "/assets/studio-small-09-1k.hdr" });
  const gemEnvironment = useMemo(() => createBrightGemEnvironment(), []);
  const accentEnvironment = useMemo(() => createBrightGemEnvironment(false), []);
  const sizeSpec = getRingSizeSpec(size);
  const bandRadius = sizeSpec.majorRadius;
  const bandAngle = Math.PI * 0.43;
  const radiusDelta = bandRadius - 2.03;
  const bandCenterY = -0.43 - Math.cos(bandAngle) * radiusDelta;
  const bandCenterZ = -bandRadius;

  const centerDiamondGeometry = useMemo(() => createRoundBrilliantGeometry(0.62, true), []);
  const haloDiamondGeometry = useMemo(() => createRoundBrilliantGeometry(0.095, true, 0.92), []);
  const paveDiamondGeometry = useMemo(() => createRoundBrilliantGeometry(0.088, true, 0.88), []);
  const emeraldGeometry = useMemo(() => createEmeraldCutGeometry(), []);
  const haloStones = useMemo(() => Array.from({ length: 24 }, (_, index) => {
    const angle = (index / 24) * Math.PI * 2;
    return {
      angle,
      position: [Math.cos(angle) * 0.86, Math.sin(angle) * 0.86, 0.35] as Point3,
    };
  }), []);
  const haloBeads = useMemo(() => Array.from({ length: 24 }, (_, index) => {
    const angle = ((index + 0.5) / 24) * Math.PI * 2;
    return [Math.cos(angle) * 0.86, Math.sin(angle) * 0.86, 0.36] as Point3;
  }), []);

  const shoulderCurves = useMemo(() => [-1, 1].map((side) => {
    const joinAngle = 0.58;
    const endpoint = new THREE.Vector3(
      side * bandRadius * Math.cos(joinAngle),
      bandCenterY + bandRadius * Math.sin(joinAngle) * Math.cos(bandAngle),
      bandCenterZ + bandRadius * Math.sin(joinAngle) * Math.sin(bandAngle),
    );
    return new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(side * 0.62, 0, 0.04),
        new THREE.Vector3(side * 1.1, -0.005, 0.04),
        new THREE.Vector3(side * 1.7, -0.025, 0.04),
        new THREE.Vector3(side * 2.08, -0.055, 0.035),
        new THREE.Vector3(side * 2.14, -0.075, -0.08),
        new THREE.Vector3(side * 2.03, -0.12, -0.34),
        endpoint,
      ],
      false,
      "catmullrom",
      0.5,
    );
  }), [bandCenterY, bandCenterZ, bandRadius]);

  const shoulderGeometries = useMemo(
    () => shoulderCurves.map((curve) => createRoundedShoulderGeometry(curve)),
    [shoulderCurves],
  );
  const cathedralSupportGeometries = useMemo(
    () => [createCathedralSupportGeometry(-1), createCathedralSupportGeometry(1)],
    [],
  );
  const shoulderStones = useMemo(() => ([-1, 1] as const).flatMap((side, sideIndex) => {
    const rows = [
      { count: 10, y: 0.145, offset: 0 },
      { count: 11, y: 0, offset: -0.06 },
      { count: 10, y: -0.145, offset: 0 },
    ];
    return rows.flatMap((row, rowIndex) => Array.from({ length: row.count }, (_, index) => {
      const x = 0.76 + row.offset + index * 0.14;
      const progress = THREE.MathUtils.clamp((x - 0.72) / 1.42, 0, 1);
      const y = row.y * THREE.MathUtils.lerp(1, 0.48, progress) - progress * 0.025;
      return {
        sideIndex,
        rowIndex,
        index,
        scale: THREE.MathUtils.lerp(0.96, 0.62, progress),
        tilt: 0,
        position: [x * side, y, 0.205] as Point3,
      };
    }));
  }), []);
  const shoulderDiamondInstances = useMemo<DiamondInstance[]>(() => shoulderStones.map((item) => ({
    position: item.position,
    scale: item.scale,
    rotation: [item.tilt, 0, item.sideIndex === 0 ? -0.04 : 0.04],
  })), [shoulderStones]);
  const haloDiamondInstances = useMemo<DiamondInstance[]>(() => haloStones.map(({ angle, position }) => ({
    position,
    scale: 1,
    rotation: [0, 0, angle + Math.PI / 24],
  })), [haloStones]);

  return (
    <>
      <group rotation={[0.012, -0.055, -0.004]} position={[0, 0.02, 0]}>
        <mesh
          position={[0, bandCenterY, bandCenterZ]}
          rotation={[bandAngle, 0, 0]}
          castShadow
          receiveShadow
        >
          <torusGeometry args={[bandRadius, 0.15, 48, 224]} />
          <MetalMaterial metal={metal} />
        </mesh>

        {shoulderGeometries.map((geometry, index) => (
          <mesh key={`shoulder-${index}`} geometry={geometry} castShadow receiveShadow>
            <MetalMaterial metal={metal} />
          </mesh>
        ))}

        <InstancedDiamonds
          geometry={paveDiamondGeometry}
          instances={shoulderDiamondInstances}
          environment={accentEnvironment}
        />

        <group position={[0, 0.14, 0.3]} scale={[0.95, 0.95, 0.95]}>
          <mesh position={[0, 0, 0.295]} castShadow>
            <torusGeometry args={[0.985, 0.014, 20, 160]} />
            <MetalMaterial metal={metal} />
          </mesh>
          <mesh position={[0, 0, 0.295]} castShadow>
            <torusGeometry args={[0.75, 0.012, 20, 160]} />
            <MetalMaterial metal={metal} />
          </mesh>

          <InstancedDiamonds
            geometry={haloDiamondGeometry}
            instances={haloDiamondInstances}
            environment={accentEnvironment}
          />
          {haloBeads.map((position, index) => (
            <mesh key={`halo-bead-${index}`} position={position} castShadow>
              <sphereGeometry args={[0.018, 16, 16]} />
              <MetalMaterial metal={metal} roughness={0.07} />
            </mesh>
          ))}

          <group position={[0, 0, 0.355]}>
            <CenterStone
              stone={stone}
              roundGeometry={centerDiamondGeometry}
              emeraldGeometry={emeraldGeometry}
              environment={gemEnvironment}
            />
          </group>

          <mesh position={[0, 0, -0.08]} castShadow>
            <torusGeometry args={[0.69, 0.026, 20, 128]} />
            <MetalMaterial metal={metal} />
          </mesh>
          {cathedralSupportGeometries.map((geometry, index) => (
            <mesh key={`cathedral-support-${index}`} geometry={geometry} castShadow>
              <MetalMaterial metal={metal} />
            </mesh>
          ))}

          {[Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4].map((angle) => (
            <ClawProng key={`prong-${angle}`} angle={angle} metal={metal} />
          ))}
        </group>
      </group>

      <ContactShadows
        position={[0, -1.02, 0]}
        opacity={0.16}
        scale={7.5}
        blur={2.8}
        far={5}
        resolution={1024}
        color="#5c625d"
      />
      <Environment
        map={studioEnvironment}
        environmentIntensity={1.1}
        environmentRotation={[0, 1.05, 0]}
      />
    </>
  );
}
