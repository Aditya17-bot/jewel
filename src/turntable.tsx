// Offscreen render route for baking turntable frames from the real ring.
//
// Not part of the app - nothing links here and it is only ever loaded by
// tools/render-turntable.mjs. The point is that the frames come from RingModel itself, so
// a spinner can never drift from what the live 3D viewer shows: same geometry, same
// materials, same size table, same HDRI. Generative multi-view was tried first and lost
// the centre stone by 150 degrees; this cannot, because there is nothing to hallucinate.
//
// State comes from the URL hash so the harness can step frames without a reload - the
// HDRI and the PMREM probe are expensive and reloading per frame would dominate the run.
// document.body.dataset.ready is the handshake: cleared on every change, set again once
// the scene has settled, because a WebGL canvas grabbed too early is silently blank.

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { StrictMode, Suspense, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { EarringModel, NecklaceModel } from "./components/PieceModels";
import { RingModel } from "./components/RingModel";
import { getRingSizeSpec } from "./data/demoData";
import type { MetalId, RingSize, StoneId } from "./types";

type PieceKind = "ring" | "necklace" | "earring";

interface Shot {
  piece: PieceKind;
  metal: MetalId;
  stone: StoneId;
  size: RingSize;
  azimuth: number;
  elevation: number;
}

const DEFAULTS: Shot = {
  piece: "ring",
  metal: "white",
  stone: "natural",
  size: 16,
  azimuth: 0,
  elevation: 8,
};

function readHash(): Shot {
  const p = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const num = (key: string, fallback: number) => {
    const raw = p.get(key);
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    piece: (p.get("piece") as PieceKind) ?? DEFAULTS.piece,
    metal: (p.get("metal") as MetalId) ?? DEFAULTS.metal,
    stone: (p.get("stone") as StoneId) ?? DEFAULTS.stone,
    size: (num("size", DEFAULTS.size) as RingSize) ?? DEFAULTS.size,
    azimuth: num("az", DEFAULTS.azimuth),
    elevation: num("el", DEFAULTS.elevation),
  };
}

/**
 * Orbits the camera rather than spinning the ring. Both read as a turntable, but only
 * this one matches what a visitor sees when they drag the live viewer - the environment
 * stays put in world space and the highlights travel across the metal, which is most of
 * what sells a polished surface.
 */
function Rig({ shot, token }: { shot: Shot; token: string }) {
  const { camera, scene } = useThree();
  const fit = useRef<{ center: THREE.Vector3; radius: number } | null>(null);

  useEffect(() => {
    fit.current = null;
  }, [token]);

  useFrame(() => {
    // Orbit the ring's own centre, not the world origin. RingModel places the band at
    // z = -majorRadius, so the piece's mass sits about two units behind the origin; a
    // camera orbiting (0,0,0) keeps the head centred at the front and swings the band
    // out of frame by ninety degrees. Measuring beats hard-coding a pivot, which would
    // silently go stale the moment the size table or the shank curve changes.
    if (!fit.current) {
      const box = new THREE.Box3();
      const size = new THREE.Vector3();
      let found = false;
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        const bounds = new THREE.Box3().setFromObject(mesh);
        bounds.getSize(size);
        // ContactShadows is a 7.5-unit plane and would swallow the fit. No part of the
        // ring is anywhere near six units across, so the threshold is unambiguous.
        if (Math.max(size.x, size.y, size.z) > 6) return;
        box.union(bounds);
        found = true;
      });
      if (!found || box.isEmpty()) return;
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      fit.current = { center: sphere.center.clone(), radius: sphere.radius };
    }

    const { center, radius } = fit.current;
    const perspective = camera as THREE.PerspectiveCamera;
    const az = (shot.azimuth * Math.PI) / 180;
    const el = (shot.elevation * Math.PI) / 180;
    // A constant distance, so the piece does not breathe as it turns.
    //
    // The factor is how much of the exact bounding-sphere fit to use. A sphere is a
    // conservative bound for a compact piece like the ring, whose silhouette only
    // approaches it face-on, so 0.92 fills the frame there without clipping the shank. A
    // pair of earrings or a chain is wide and close to its own bound in every pose, and
    // the same factor cuts the ends off - so those get room instead.
    const fill = shot.piece === "ring" ? 0.92 : 1.12;
    const distance = (radius / Math.sin(((perspective.fov / 2) * Math.PI) / 180)) * fill;

    perspective.position.set(
      center.x + Math.sin(az) * Math.cos(el) * distance,
      center.y + Math.sin(el) * distance,
      center.z + Math.cos(az) * Math.cos(el) * distance,
    );
    perspective.lookAt(center);
    perspective.updateProjectionMatrix();
  });

  return null;
}

/**
 * Flags the frame as safe to capture. The environment probe and the transmission
 * materials both need several frames before they stop changing, and a screenshot taken
 * before that shows a black stone.
 */
function Settle({ token }: { token: string }) {
  const frames = useRef(0);

  useEffect(() => {
    frames.current = 0;
    document.body.dataset.ready = "0";
  }, [token]);

  // Level-triggered, not edge-triggered. The grabber clears the flag before every capture,
  // including when the requested pose happens to equal the current one and no React state
  // changes - an edge-triggered version deadlocks on exactly that frame.
  useFrame(() => {
    frames.current += 1;
    if (frames.current >= 12 && document.body.dataset.ready !== "1") {
      document.body.dataset.ready = "1";
    }
  });

  return null;
}

function Stage() {
  const [shot, setShot] = useState<Shot>(readHash);

  useEffect(() => {
    const sync = () => setShot(readHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const token = `${shot.piece}|${shot.metal}|${shot.stone}|${shot.size}|${shot.azimuth}|${shot.elevation}`;

  return (
    <Canvas
      dpr={1}
      camera={{ position: [0, 0.2, getRingSizeSpec(shot.size).cameraDistance], fov: 32, near: 0.1, far: 100 }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" }}
      shadows={{ type: THREE.PCFShadowMap }}
      onCreated={({ gl }) => {
        // Matched to DigitalTwinViewer so a baked frame and the live viewer agree.
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.02;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.setClearAlpha(0);
      }}
    >
      <ambientLight intensity={0.18} />
      <directionalLight position={[-4, 6, 8]} intensity={1.55} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[5, 2, 6]} intensity={0.7} />
      <Suspense fallback={null}>
        {shot.piece === "necklace" ? (
          <NecklaceModel metal={shot.metal} stone={shot.stone} />
        ) : shot.piece === "earring" ? (
          <EarringModel metal={shot.metal} stone={shot.stone} />
        ) : (
          <RingModel metal={shot.metal} stone={shot.stone} size={shot.size} />
        )}
      </Suspense>
      <Rig shot={shot} token={token} />
      <Settle token={token} />
    </Canvas>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Stage />
  </StrictMode>,
);
