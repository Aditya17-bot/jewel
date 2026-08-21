import {
  ArrowCounterClockwise,
  ArrowsClockwise,
  CornersOut,
  Cube,
  MagnifyingGlassPlus,
} from "@phosphor-icons/react";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { getRingSizeSpec } from "../data/demoData";
import type { MetalId, RingSize, StoneId } from "../types";
import { RingModel } from "./RingModel";

interface DigitalTwinViewerProps {
  metal: MetalId;
  stone: StoneId;
  size: RingSize;
}

type ViewerCommand = { action: "rotate" | "zoom" | "reset"; id: number } | null;

function SceneControls({
  command,
  onInteraction,
  size,
}: {
  command: ViewerCommand;
  onInteraction: (active: boolean) => void;
  size: RingSize;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const initializedRef = useRef(false);
  const previousFitRef = useRef(getRingSizeSpec(size).cameraDistance);
  const handledCommandRef = useRef<number | null>(null);
  const { camera } = useThree();
  const sizeSpec = getRingSizeSpec(size);
  const sizeScale = sizeSpec.majorRadius / getRingSizeSpec(16).majorRadius;

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (!initializedRef.current) {
      camera.position.set(0, 0.2, sizeSpec.cameraDistance);
      controls.target.set(0, 0.05, 0);
      initializedRef.current = true;
    } else {
      const offset = camera.position.clone().sub(controls.target);
      offset.multiplyScalar(sizeSpec.cameraDistance / previousFitRef.current);
      camera.position.copy(controls.target.clone().add(offset));
    }
    previousFitRef.current = sizeSpec.cameraDistance;
    controls.update();
  }, [camera, sizeSpec.cameraDistance]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || !command || handledCommandRef.current === command.id) return;
    handledCommandRef.current = command.id;

    if (command.action === "rotate") {
      controls.setAzimuthalAngle(controls.getAzimuthalAngle() + Math.PI / 8);
    } else if (command.action === "zoom") {
      const target = controls.target.clone();
      const offset = camera.position.clone().sub(target);
      offset.setLength(Math.max(4.5 * sizeScale, offset.length() * 0.82));
      camera.position.copy(target.add(offset));
      controls.update();
    } else {
      camera.position.set(0, 0.2, sizeSpec.cameraDistance);
      controls.target.set(0, 0.05, 0);
      controls.update();
    }
  }, [camera, command, sizeScale, sizeSpec.cameraDistance]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.075}
      minDistance={4.5 * sizeScale}
      maxDistance={10 * sizeScale}
      minPolarAngle={Math.PI * 0.18}
      maxPolarAngle={Math.PI * 0.82}
      onStart={() => onInteraction(true)}
      onEnd={() => onInteraction(false)}
    />
  );
}

export function DigitalTwinViewer({ metal, stone, size }: DigitalTwinViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [ready, setReady] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [command, setCommand] = useState<ViewerCommand>(null);
  const [webGlAvailable] = useState(() => {
    try {
      const canvas = document.createElement("canvas");
      return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    } catch {
      return false;
    }
  });
  const sizeSpec = getRingSizeSpec(size);

  useEffect(() => {
    const syncFullscreen = () => {
      if (!document.fullscreenElement) setExpanded(false);
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  const issueCommand = (action: NonNullable<ViewerCommand>["action"]) => {
    setCommand({ action, id: Date.now() });
  };

  const enterFullscreen = async () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement || expanded) {
      if (document.fullscreenElement) await document.exitFullscreen();
      setExpanded(false);
      return;
    }
    try {
      await containerRef.current.requestFullscreen();
      setExpanded(true);
    } catch {
      setExpanded(true);
    }
  };

  return (
    <div className={expanded ? "viewer-shell is-expanded" : "viewer-shell"} ref={containerRef}>
      <div className="viewer-tools" aria-label="Viewer tools">
        <button onClick={() => issueCommand("rotate")} aria-label="Rotate product">
          <ArrowsClockwise size={22} />
          <span>Rotate</span>
        </button>
        <button onClick={() => issueCommand("zoom")} aria-label="Zoom product">
          <MagnifyingGlassPlus size={22} />
          <span>Zoom</span>
        </button>
        <button onClick={() => issueCommand("reset")} aria-label="Reset viewer">
          <ArrowCounterClockwise size={22} />
          <span>Reset</span>
        </button>
        <button
          onClick={enterFullscreen}
          aria-label={expanded ? "Exit fullscreen" : "Enter fullscreen"}
          aria-pressed={expanded}
        >
          <CornersOut size={22} />
          <span>{expanded ? "Exit" : "Fullscreen"}</span>
        </button>
      </div>

      <div
        className={interacting ? "product-stage three-stage is-dragging" : "product-stage three-stage"}
        role="img"
        aria-label={`Interactive 3D model of the R-1028 halo ring in ${metal} gold with ${stone} center stone, India size ${size}`}
      >
        {!webGlAvailable ? (
          <div className="viewer-error">
            <Cube size={30} />
            <strong>3D preview unavailable</strong>
            <span>This browser does not provide WebGL.</span>
          </div>
        ) : (
          <>
            {!ready && <div className="viewer-loading"><span /> Building protected 3D twin…</div>}
            <Canvas
              className={ready ? "twin-canvas is-ready" : "twin-canvas"}
              dpr={[1, 1.75]}
              camera={{ position: [0, 0.2, sizeSpec.cameraDistance], fov: 32, near: 0.1, far: 100 }}
              gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
              shadows={{ type: THREE.PCFShadowMap }}
              onCreated={({ gl }) => {
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.02;
                gl.outputColorSpace = THREE.SRGBColorSpace;
                window.requestAnimationFrame(() => setReady(true));
              }}
            >
              <color attach="background" args={["#f7f8f6"]} />
              <ambientLight intensity={0.18} />
              <directionalLight position={[-4, 6, 8]} intensity={1.55} castShadow shadow-mapSize={[1024, 1024]} />
              <directionalLight position={[5, 2, 6]} intensity={0.7} />
              <Suspense fallback={null}>
                <RingModel metal={metal} stone={stone} size={size} />
              </Suspense>
              <SceneControls command={command} onInteraction={setInteracting} size={size} />
            </Canvas>
            <div className="live-3d-badge"><span /> Live mesh · 3D</div>
            <div className="viewer-size-readout">
              <strong>Ø {sizeSpec.innerDiameter} mm</strong>
              <span>India size {size}</span>
            </div>
          </>
        )}
      </div>

      <div className="viewer-footnote">
        <span className="scale-mark">10 mm</span>
        <span>Drag to rotate&nbsp;&nbsp;·&nbsp;&nbsp;Scroll to zoom</span>
        <button onClick={() => issueCommand("reset")} aria-label="Reset product camera"><Cube size={20} /></button>
      </div>
    </div>
  );
}
