import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  CatmullRomCurve3,
  Group,
  Object3D,
  TubeGeometry,
  Vector3,
} from "three";
import type { RiskLevel } from "../lib/types";

interface Cfg {
  fiber: string;
  amp: number;
  broken: boolean;
  twists: number;
  frays: number;
  glow: string;
  glowIntensity: number;
}

// Per-risk look: intact & calm -> frizzing & trembling -> cleanly snapped in two.
// DANGER is deliberately CALM (a settled, static split) so the break reads
// clearly instead of thrashing about; the fracture itself is highlighted.
const CFG: Record<RiskLevel, Cfg> = {
  NORMAL: { fiber: "#b8a77f", amp: 0.008, broken: false, twists: 3.4, frays: 3, glow: "#6f8476", glowIntensity: 0.25 },
  CAUTION: { fiber: "#c29a58", amp: 0.05, broken: false, twists: 3.0, frays: 14, glow: "#b0894f", glowIntensity: 0.5 },
  DANGER: { fiber: "#b5524a", amp: 0.015, broken: true, twists: 2.6, frays: 22, glow: "#d24a3a", glowIntensity: 1.5 },
};

const STRANDS = 7;
const ROPE_R = 0.14;
const STRAND_R = 0.052;
const LENGTH = 3.0;
// Fixed gap between the two halves once snapped (no jitter -> calm, legible).
const BROKEN_GAP = 0.3;
// The two fracture faces sit at the inner ends of each half, ± this y.
const FACE_Y = 0.12 + BROKEN_GAP;

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Small deterministic PRNG so fraying looks the same each render. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function helix(tStart: number, tEnd: number, phase: number, twists: number, seg = 64): CatmullRomCurve3 {
  const pts: Vector3[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = tStart + (tEnd - tStart) * (i / seg);
    const a = t * twists * Math.PI * 2 + phase;
    pts.push(new Vector3(Math.cos(a) * ROPE_R, (t - 0.5) * LENGTH, Math.sin(a) * ROPE_R));
  }
  return new CatmullRomCurve3(pts);
}

function TubeStrand({ curve, color }: { curve: CatmullRomCurve3; color: string }) {
  const geom = useMemo(() => new TubeGeometry(curve, 90, STRAND_R, 8, false), [curve]);
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <mesh geometry={geom}>
      <meshStandardMaterial color={color} roughness={0.85} metalness={0.05} />
    </mesh>
  );
}

function Frays({ count, color, amp, broken }: { count: number; color: string; amp: number; broken: boolean }) {
  const ref = useRef<Group>(null);
  const items = useMemo(() => {
    const r = rng(count * 131 + (broken ? 7 : 1));
    return range(count).map(() => {
      // Fraying concentrates near the break (y≈0) when broken, else spreads out.
      const y = broken ? (r() - 0.5) * 0.5 : (r() - 0.5) * LENGTH * 0.92;
      const ang = r() * Math.PI * 2;
      const len = 0.14 + r() * 0.3;
      return {
        pos: [Math.cos(ang) * ROPE_R, y, Math.sin(ang) * ROPE_R] as [number, number, number],
        rot: [r() * Math.PI, r() * Math.PI, r() * Math.PI] as [number, number, number],
        len,
      };
    });
  }, [count, broken]);

  useFrame((s) => {
    const g = ref.current;
    if (!g) return;
    const t = s.clock.elapsedTime;
    g.children.forEach((c: Object3D, i: number) => {
      c.rotation.z += Math.sin(t * 8 + i) * amp * 0.2;
    });
  });

  return (
    <group ref={ref}>
      {items.map((f, i) => (
        <mesh key={i} position={f.pos} rotation={f.rot}>
          <cylinderGeometry args={[0.014, 0.003, f.len, 5]} />
          <meshStandardMaterial color={color} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

/** Torn, splayed red fibre ends at one fracture face — the crack indicator. */
function FractureFace({ y, sign, seed }: { y: number; sign: number; seed: number }) {
  const tips = useMemo(() => {
    const r = rng(seed);
    return range(STRANDS * 2).map((i) => {
      const ang = (i / (STRANDS * 2)) * Math.PI * 2 + r() * 0.4;
      const rad = ROPE_R * (0.35 + r() * 0.8);
      const len = 0.14 + r() * 0.18;
      const tilt = 0.4 + r() * 0.6;
      return { ang, rad, len, tilt };
    });
  }, [seed]);

  return (
    <group position={[0, y, 0]}>
      {/* glowing core at the break to draw the eye to the fracture */}
      <mesh>
        <icosahedronGeometry args={[0.07, 0]} />
        <meshStandardMaterial color="#ff5a3c" emissive="#ff3a1e" emissiveIntensity={1.4} roughness={0.4} />
      </mesh>
      {tips.map((t, i) => (
        <mesh
          key={i}
          position={[Math.cos(t.ang) * t.rad, -sign * t.len * 0.5, Math.sin(t.ang) * t.rad]}
          rotation={[Math.cos(t.ang) * t.tilt, 0, -Math.sin(t.ang) * t.tilt]}
        >
          <cylinderGeometry args={[0.005, 0.02, t.len, 5]} />
          <meshStandardMaterial color="#cf5346" emissive="#e5381f" emissiveIntensity={0.6} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

function Rope({ cfg }: { cfg: Cfg }) {
  const whole = useRef<Group>(null);

  // Upper half stays up, lower half stays down, separated by a fixed gap.
  const upperCurves = useMemo(
    () => range(STRANDS).map((i) => helix(cfg.broken ? 0.54 : 0, 1, (i / STRANDS) * Math.PI * 2, cfg.twists)),
    [cfg.broken, cfg.twists],
  );
  const lowerCurves = useMemo(
    () =>
      cfg.broken
        ? range(STRANDS).map((i) => helix(0, 0.46, (i / STRANDS) * Math.PI * 2, cfg.twists))
        : [],
    [cfg.broken, cfg.twists],
  );

  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (whole.current) {
      // Gentle overall sway only — no violent recoil, even when broken.
      whole.current.position.x = Math.sin(t * 1.4) * cfg.amp * 0.5;
      whole.current.rotation.z = 0.08 + Math.sin(t * 1.1) * cfg.amp * 0.15;
    }
  });

  return (
    <group ref={whole} rotation={[0, 0, 0.08]}>
      <group position={[0, cfg.broken ? BROKEN_GAP : 0, 0]}>
        {upperCurves.map((c, i) => (
          <TubeStrand key={i} curve={c} color={cfg.fiber} />
        ))}
      </group>
      {cfg.broken && (
        <group position={[0, -BROKEN_GAP, 0]}>
          {lowerCurves.map((c, i) => (
            <TubeStrand key={i} curve={c} color={cfg.fiber} />
          ))}
        </group>
      )}
      {cfg.broken && (
        <>
          <FractureFace y={FACE_Y} sign={1} seed={11} />
          <FractureFace y={-FACE_Y} sign={-1} seed={29} />
        </>
      )}
      <Frays count={cfg.frays} color={cfg.fiber} amp={cfg.amp} broken={cfg.broken} />
    </group>
  );
}

/** 3D mooring-rope: intact when NORMAL, frizzing at CAUTION, a calm clean
 *  break with a highlighted fracture at DANGER. */
export default function RopeScene({ risk }: { risk: RiskLevel }) {
  const cfg = CFG[risk];
  return (
    <Canvas camera={{ position: [0, 0, 4.6], fov: 42 }} dpr={[1, 1.6]}>
      <color attach="background" args={["#202022"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 5, 6]} intensity={1.15} />
      <pointLight position={[0, 0, 2.2]} color={cfg.glow} intensity={cfg.glowIntensity} distance={8} />
      {cfg.broken && <pointLight position={[0, 0, 0]} color="#ff4326" intensity={2.2} distance={3} />}
      <Rope cfg={cfg} />
      <OrbitControls enablePan={false} enableZoom autoRotate autoRotateSpeed={0.6} minDistance={3} maxDistance={7} />
    </Canvas>
  );
}
