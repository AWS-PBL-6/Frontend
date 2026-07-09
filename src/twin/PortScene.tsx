import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { LineStatus, RiskLevel } from "../lib/types";
import { ACCENT, effectiveRisk, RISK_LABEL, SCENE_RISK, STATUS_LABEL, worstRisk } from "./palette";
import {
  daylightFactor,
  envTheme,
  hourOf,
  mix,
  mixHex,
  mixRaw,
  SEA_RAW,
  SKY_RAW,
} from "./daylight";
import {
  approachState,
  BOLLARD_Z,
  QUAY_DEPTH,
  QUAY_TOP,
  type ApproachPlan,
  type BollardSpot,
  type MooringPlacement,
  type ShipDims,
  type ShipPlacement,
  type TwinLayout,
} from "./layout";

/* ────────────────────────── shared helpers ─────────────────────────────── */

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Daylight factor shared by every environment component (0 = 밤, 1 = 낮). */
const DayCtx = createContext(0);

/** Deterministic PRNG — layout decoration must not shuffle between renders. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let glowTex: THREE.Texture | null = null;
function getGlowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.4)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

function Glow({
  position,
  color,
  scale = 12,
  opacity = 0.7,
}: {
  position: [number, number, number];
  color: string;
  scale?: number;
  opacity?: number;
}) {
  const map = useMemo(getGlowTexture, []);
  return (
    <sprite position={position} scale={[scale, scale, 1]}>
      <spriteMaterial
        map={map}
        color={color}
        transparent
        opacity={opacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        fog={false}
      />
    </sprite>
  );
}

/* ────────────────────────── environment ────────────────────────────────── */

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform float uGlow;
varying vec3 vDir;
void main() {
  float h = vDir.y;
  vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.45, h));
  // faint warm city glow low over the land side (-z) — night only
  float glow = smoothstep(0.14, 0.0, h) * smoothstep(0.0, -0.5, vDir.z);
  col += vec3(0.10, 0.06, 0.025) * glow * uGlow;
  gl_FragColor = vec4(col, 1.0);
}`;

function SkyDome() {
  const day = useContext(DayCtx);
  const uniforms = useMemo(
    () => ({
      uHorizon: { value: mixRaw(SKY_RAW.horizon.n, SKY_RAW.horizon.d, 0) },
      uZenith: { value: mixRaw(SKY_RAW.zenith.n, SKY_RAW.zenith.d, 0) },
      uGlow: { value: 1 },
    }),
    [],
  );
  useEffect(() => {
    uniforms.uHorizon.value.copy(mixRaw(SKY_RAW.horizon.n, SKY_RAW.horizon.d, day));
    uniforms.uZenith.value.copy(mixRaw(SKY_RAW.zenith.n, SKY_RAW.zenith.d, day));
    uniforms.uGlow.value = 1 - day;
  }, [day, uniforms]);
  return (
    <mesh>
      <sphereGeometry args={[4200, 24, 16]} />
      <shaderMaterial
        side={THREE.BackSide}
        uniforms={uniforms}
        vertexShader={SKY_VERT}
        fragmentShader={SKY_FRAG}
        depthWrite={false}
      />
    </mesh>
  );
}

const SEA_VERT = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vWave;
varying float vDist;
void main() {
  vUv = uv;
  vec3 p = position;
  float w = 0.0;
  w += sin(p.x * 0.020 + uTime * 0.9);
  w += sin(p.y * 0.028 - uTime * 0.7) * 0.8;
  w += sin((p.x + p.y) * 0.011 + uTime * 0.5) * 1.2;
  w += sin((p.x * 0.5 - p.y) * 0.03 + uTime * 1.3) * 0.4;
  vWave = w * 0.5;
  p.z += vWave * 0.9;
  vDist = length(p.xy);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const SEA_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uCrest;
uniform vec3 uFade;
uniform float uGlint;
varying vec2 vUv;
varying float vWave;
varying float vDist;
void main() {
  vec3 col = mix(uDeep, uCrest, smoothstep(-1.6, 1.8, vWave));
  // faint survey grid — the "digital twin" read
  vec2 g = abs(fract(vUv * 90.0) - 0.5);
  float grid = smoothstep(0.482, 0.5, max(g.x, g.y));
  col += vec3(0.05, 0.14, 0.18) * grid * 0.22;
  // sparse light sparkle on crests (달빛/햇빛 글리터)
  float sp = step(0.9975, fract(sin(dot(floor(vUv * 1400.0), vec2(12.9898, 78.233))) * 43758.5453));
  col += sp * uGlint * smoothstep(0.3, 1.4, vWave) * (0.6 + 0.4 * sin(uTime * 2.0 + vUv.x * 40.0));
  // fade to the scene fog colour at the horizon
  col = mix(col, uFade, smoothstep(1100.0, 3000.0, vDist));
  gl_FragColor = vec4(col, 1.0);
}`;

function Sea() {
  const day = useContext(DayCtx);
  const mat = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDeep: { value: mixRaw(SEA_RAW.deep.n, SEA_RAW.deep.d, 0) },
      uCrest: { value: mixRaw(SEA_RAW.crest.n, SEA_RAW.crest.d, 0) },
      uFade: { value: mixRaw(SEA_RAW.fade.n, SEA_RAW.fade.d, 0) },
      uGlint: { value: 0.16 },
    }),
    [],
  );
  useEffect(() => {
    uniforms.uDeep.value.copy(mixRaw(SEA_RAW.deep.n, SEA_RAW.deep.d, day));
    uniforms.uCrest.value.copy(mixRaw(SEA_RAW.crest.n, SEA_RAW.crest.d, day));
    uniforms.uFade.value.copy(mixRaw(SEA_RAW.fade.n, SEA_RAW.fade.d, day));
    uniforms.uGlint.value = mix(0.16, 0.38, day);
  }, [day, uniforms]);
  useFrame((state) => {
    if (mat.current) mat.current.uniforms.uTime.value = state.clock.elapsedTime;
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 1600]}>
      <planeGeometry args={[8000, 5600, 150, 110]} />
      <shaderMaterial ref={mat} uniforms={uniforms} vertexShader={SEA_VERT} fragmentShader={SEA_FRAG} />
    </mesh>
  );
}

function Moon() {
  const day = useContext(DayCtx);
  return (
    <group position={[1600, 760, -1300]} visible={day < 0.45}>
      <mesh>
        <circleGeometry args={[70, 32]} />
        <meshBasicMaterial color="#dfe9f4" fog={false} />
      </mesh>
      <Glow position={[0, 0, 0]} color="#b9cfe8" scale={420} opacity={0.5 * (1 - day)} />
    </group>
  );
}

function Sun() {
  const day = useContext(DayCtx);
  return (
    <group position={[1300, 2400, 1400]} visible={day > 0.45}>
      <Glow position={[0, 0, 0]} color="#fff6e0" scale={340} opacity={0.95 * day} />
      <Glow position={[0, 0, 0]} color="#ffe9b8" scale={1100} opacity={0.4 * day} />
    </group>
  );
}

/** Yard landmass, city-block silhouettes and mountain ridges behind the port. */
function Land() {
  const day = useContext(DayCtx);
  const cityRef = useRef<THREE.InstancedMesh>(null);
  const city = useMemo(() => {
    const r = rng(20260708);
    return range(46).map(() => ({
      x: (r() - 0.5) * 3400,
      z: -430 - r() * 380,
      w: 36 + r() * 70,
      d: 30 + r() * 50,
      h: 45 + r() * 150,
      tint: 0.7 + r() * 0.5,
    }));
  }, []);

  useLayoutEffect(() => {
    const mesh = cityRef.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const base = mixHex("#1b2836", "#93a3b2", day);
    const col = new THREE.Color();
    city.forEach((b, i) => {
      m.compose(
        new THREE.Vector3(b.x, 2.5 + b.h / 2, b.z),
        new THREE.Quaternion(),
        new THREE.Vector3(b.w, b.h, b.d),
      );
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, col.copy(base).multiplyScalar(b.tint));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [city, day]);

  const beacons = useMemo(
    () => city.filter((_, i) => i % 6 === 0).map((b) => [b.x, 2.5 + b.h + 4, b.z] as [number, number, number]),
    [city],
  );

  const mountains = useMemo(
    () => [
      { x: -1700, z: -1250, r: 720, h: 300 },
      { x: -700, z: -1400, r: 640, h: 380 },
      { x: 260, z: -1300, r: 560, h: 260 },
      { x: 1150, z: -1380, r: 700, h: 340 },
      { x: 2100, z: -1200, r: 620, h: 240 },
    ],
    [],
  );

  return (
    <group>
      {/* landmass slab behind the quay */}
      <mesh position={[0, 0, -950]}>
        <boxGeometry args={[8000, 5, 1900]} />
        <meshStandardMaterial color={mixHex("#121924", "#6d7883", day)} roughness={1} />
      </mesh>
      <instancedMesh ref={cityRef} args={[undefined, undefined, city.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.95} />
      </instancedMesh>
      {day < 0.8 &&
        beacons.map((p, i) => (
          <Glow key={i} position={p} color="#ffb36b" scale={16} opacity={0.55 * (1 - day)} />
        ))}
      {mountains.map((m, i) => (
        <mesh key={i} position={[m.x, 0, m.z]}>
          <coneGeometry args={[m.r, m.h, 7]} />
          <meshStandardMaterial color={mixHex("#131d2a", "#51636f", day)} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}

/** Busan Harbor Bridge silhouette crossing the fairway east of the berth. */
function HarborBridge() {
  const day = useContext(DayCtx);
  const night = 1 - day;
  const cableCurves = useMemo(() => {
    const mk = (pts: [number, number][]) =>
      new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(pts[0][0], pts[0][1], 0),
        new THREE.Vector3(pts[1][0], pts[1][1], 0),
        new THREE.Vector3(pts[2][0], pts[2][1], 0),
      );
    return [
      mk([[-2300, 48], [-1250, 62], [-300, 170]]),
      mk([[-300, 170], [0, -14], [300, 170]]),
      mk([[300, 170], [1250, 62], [2300, 48]]),
    ];
  }, []);
  const cableGeoms = useMemo(
    () => cableCurves.map((c) => new THREE.TubeGeometry(c, 40, 1.6, 6, false)),
    [cableCurves],
  );
  const hangers = useMemo(() => {
    const center = cableCurves[1];
    return range(9).map((i) => {
      const t = (i + 1) / 10;
      const p = center.getPoint(t);
      return { x: p.x, top: p.y };
    });
  }, [cableCurves]);

  const cableMat = (
    <meshStandardMaterial
      color={mixHex("#3a2b1c", "#8a8f96", day)}
      emissive="#e8964f"
      emissiveIntensity={mix(0.8, 0.06, day)}
      fog
    />
  );

  return (
    <group position={[2100, 0, 700]} rotation={[0, Math.PI / 2, 0]}>
      {/* deck */}
      <mesh position={[0, 58, 0]}>
        <boxGeometry args={[4600, 5, 22]} />
        <meshStandardMaterial
          color={mixHex("#131c26", "#7a848d", day)}
          emissive="#233246"
          emissiveIntensity={0.35 * night}
        />
      </mesh>
      {/* towers */}
      {[-300, 300].map((tx) =>
        [-9, 9].map((tz) => (
          <mesh key={`${tx}:${tz}`} position={[tx, 88, tz]}>
            <boxGeometry args={[10, 176, 8]} />
            <meshStandardMaterial
              color={mixHex("#16222f", "#8b959e", day)}
              emissive="#2a3b52"
              emissiveIntensity={0.3 * night}
            />
          </mesh>
        )),
      )}
      {[-300, 300].map((tx) => (
        <mesh key={tx} position={[tx, 168, 0]}>
          <boxGeometry args={[11, 9, 28]} />
          <meshStandardMaterial color="#16222f" emissive="#2a3b52" emissiveIntensity={0.3} />
        </mesh>
      ))}
      {/* main cables (two planes) */}
      {[-9, 9].map((cz) => (
        <group key={cz} position={[0, 0, cz]}>
          {cableGeoms.map((g, i) => (
            <mesh key={i} geometry={g}>{cableMat}</mesh>
          ))}
        </group>
      ))}
      {/* hangers on the centre span */}
      {hangers.map((h, i) => (
        <mesh key={i} position={[h.x, (h.top + 60) / 2, 0]}>
          <cylinderGeometry args={[0.5, 0.5, Math.max(2, h.top - 60), 4]} />
          <meshStandardMaterial
            color={mixHex("#2a2018", "#7d838a", day)}
            emissive="#c97f42"
            emissiveIntensity={0.45 * night}
          />
        </mesh>
      ))}
      {/* tower beacons + deck lights */}
      {night > 0.15 &&
        [-300, 300].map((tx) => (
          <Glow key={tx} position={[tx, 182, 0]} color="#ffc07a" scale={26} opacity={0.8 * night} />
        ))}
      {night > 0.15 &&
        range(11).map((i) => (
          <Glow key={i} position={[-2000 + i * 400, 66, 0]} color="#ffd9a0" scale={15} opacity={0.5 * night} />
        ))}
    </group>
  );
}

/* ────────────────────────── quay & yard ────────────────────────────────── */

function Crane({ x }: { x: number }) {
  const day = useContext(DayCtx);
  const night = 1 - day;
  const steel = (
    <meshStandardMaterial color={mixHex("#3a4c61", "#5e7188", day)} roughness={0.8} metalness={0.25} />
  );
  return (
    <group position={[x, QUAY_TOP, 0]}>
      {[-11, 11].map((lx) =>
        [-6, -36].map((lz) => (
          <mesh key={`${lx}:${lz}`} position={[lx, 23, lz]}>
            <boxGeometry args={[3.2, 46, 3.2]} />
            {steel}
          </mesh>
        )),
      )}
      {/* portal machinery house */}
      <mesh position={[0, 49, -21]}>
        <boxGeometry args={[27, 8, 34]} />
        {steel}
      </mesh>
      {/* boom over the berth */}
      <mesh position={[0, 55, 8]}>
        <boxGeometry args={[5, 3, 96]} />
        {steel}
      </mesh>
      {/* operator cab */}
      <mesh position={[0, 50.5, 6]}>
        <boxGeometry args={[4.5, 4, 5]} />
        <meshStandardMaterial color="#22303e" emissive="#ffd98a" emissiveIntensity={0.5 * night} />
      </mesh>
      {night > 0.15 && (
        <>
          <Glow position={[0, 58, 54]} color="#ffc07a" scale={12} opacity={0.7 * night} />
          <Glow position={[0, 60, -21]} color="#cfe3ff" scale={14} opacity={0.4 * night} />
        </>
      )}
    </group>
  );
}

function ContainerYard({ xMin, xMax }: { xMin: number; xMax: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const palette = useMemo(
    () => ["#3f5872", "#4f6172", "#3d6b6b", "#565d75", "#44586a", "#607086"],
    [],
  );
  const stacks = useMemo(() => {
    const r = rng(1897);
    const out: { x: number; z: number; tiers: number; color: string }[] = [];
    for (const z of [-56, -72, -88, -104]) {
      for (let x = xMin + 50; x <= xMax - 50; x += 15) {
        if (r() < 0.32) continue;
        out.push({ x, z, tiers: 1 + Math.floor(r() * 4), color: palette[Math.floor(r() * palette.length)] });
      }
    }
    return out;
  }, [xMin, xMax, palette]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    stacks.forEach((s, i) => {
      const h = s.tiers * 2.9;
      m.compose(
        new THREE.Vector3(s.x, QUAY_TOP + h / 2, s.z),
        new THREE.Quaternion(),
        new THREE.Vector3(12, h, 2.6),
      );
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, col.set(s.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [stacks]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, stacks.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#ffffff" roughness={0.9} />
    </instancedMesh>
  );
}

function Quay({ layout }: { layout: TwinLayout }) {
  const day = useContext(DayCtx);
  const night = 1 - day;
  const { quayXMin, quayXMax, bollards } = layout;
  const width = quayXMax - quayXMin + 160;
  const cx = (quayXMin + quayXMax) / 2;

  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const capRef = useRef<THREE.InstancedMesh>(null);
  const fenderRef = useRef<THREE.InstancedMesh>(null);

  const fenderXs = useMemo(() => {
    const xs: number[] = [];
    for (let x = quayXMin; x <= quayXMax; x += 30) xs.push(x);
    return xs;
  }, [quayXMin, quayXMax]);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const place = (mesh: THREE.InstancedMesh | null, pts: [number, number, number][]) => {
      if (!mesh) return;
      pts.forEach((p, i) => {
        m.makeTranslation(p[0], p[1], p[2]);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    place(bodyRef.current, bollards.map((b) => [b.x, QUAY_TOP + 0.75, BOLLARD_Z]));
    place(capRef.current, bollards.map((b) => [b.x, QUAY_TOP + 1.55, BOLLARD_Z]));
    place(fenderRef.current, fenderXs.map((x) => [x, 1.3, 0.4]));
  }, [bollards, fenderXs]);

  const craneXs = useMemo(() => {
    const n = Math.max(2, Math.min(5, Math.floor(width / 240)));
    return range(n).map((i) => quayXMin + 90 + ((width - 180) / Math.max(1, n - 1)) * i);
  }, [quayXMin, width]);

  const mastXs = useMemo(() => {
    const xs: number[] = [];
    for (let x = quayXMin + 60; x <= quayXMax - 20; x += 170) xs.push(x);
    return xs;
  }, [quayXMin, quayXMax]);

  return (
    <group>
      {/* quay apron */}
      <mesh position={[cx, 0, -QUAY_DEPTH / 2]}>
        <boxGeometry args={[width, 6, QUAY_DEPTH]} />
        <meshStandardMaterial color={mixHex("#363d47", "#69737f", day)} roughness={0.95} />
      </mesh>
      {/* edge stripe */}
      <mesh position={[cx, QUAY_TOP + 0.03, -0.9]}>
        <boxGeometry args={[width, 0.08, 1.3]} />
        <meshStandardMaterial color="#7d8ea0" emissive="#7d8ea0" emissiveIntensity={0.22} />
      </mesh>
      {/* fenders on the quay wall */}
      <instancedMesh ref={fenderRef} args={[undefined, undefined, fenderXs.length]}>
        <cylinderGeometry args={[1, 1, 2.6, 8]} />
        <meshStandardMaterial color="#0d0f12" roughness={1} />
      </instancedMesh>
      {/* bollards */}
      <instancedMesh ref={bodyRef} args={[undefined, undefined, bollards.length]}>
        <cylinderGeometry args={[0.55, 0.65, 1.5, 10]} />
        <meshStandardMaterial color="#171b20" metalness={0.55} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={capRef} args={[undefined, undefined, bollards.length]}>
        <cylinderGeometry args={[0.85, 0.7, 0.4, 10]} />
        <meshStandardMaterial color="#1c2126" metalness={0.55} roughness={0.5} />
      </instancedMesh>
      {/* container cranes + yard + light masts */}
      {craneXs.map((x) => (
        <Crane key={x} x={x} />
      ))}
      <ContainerYard xMin={quayXMin} xMax={quayXMax} />
      {mastXs.map((x) => (
        <group key={x} position={[x, QUAY_TOP, -130]}>
          <mesh position={[0, 15, 0]}>
            <cylinderGeometry args={[0.6, 0.9, 30, 6]} />
            <meshStandardMaterial color="#20262d" />
          </mesh>
          {night > 0.15 && (
            <Glow position={[0, 31, 0]} color="#cfe3ff" scale={24} opacity={0.5 * night} />
          )}
        </group>
      ))}
    </group>
  );
}

/* ────────────────────────── ships ──────────────────────────────────────── */

const HULL_COLORS = ["#33414f", "#3a4a5c", "#41525f", "#2f4050", "#4a5665"];

function useHullGeometry({ length, beam, deckY }: ShipDims) {
  const geom = useMemo(() => {
    const hl = length / 2;
    const hb = beam / 2;
    const s = new THREE.Shape();
    s.moveTo(-hl + 8, -hb);
    s.lineTo(hl * 0.3, -hb);
    s.quadraticCurveTo(hl * 0.78, -hb * 0.9, hl, 0);
    s.quadraticCurveTo(hl * 0.78, hb * 0.9, hl * 0.3, hb);
    s.lineTo(-hl + 8, hb);
    s.quadraticCurveTo(-hl, hb * 0.9, -hl, 0);
    s.quadraticCurveTo(-hl, -hb * 0.9, -hl + 8, -hb);
    const g = new THREE.ExtrudeGeometry(s, { depth: deckY + 3, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -3, 0); // 3 m of hull below the waterline
    return g;
  }, [length, beam, deckY]);
  useEffect(() => () => geom.dispose(), [geom]);
  return geom;
}

function DeckCargo({ dims, seed }: { dims: ShipDims; seed: number }) {
  const { length, beam, deckY, kind } = dims;
  const hl = length / 2;
  const r = useMemo(() => rng(seed), [seed]);

  if (kind === "container") {
    const boxes: { x: number; z: number; h: number; c: string }[] = [];
    const colors = ["#3f5872", "#4f6172", "#3d6b6b", "#565d75", "#44586a"];
    for (let x = -hl * 0.38; x <= hl * 0.7; x += 13) {
      for (const zf of [-0.52, 0, 0.52]) {
        if (r() < 0.18) continue;
        boxes.push({
          x,
          z: beam * 0.5 * zf * 0.9,
          h: (1 + Math.floor(r() * 3)) * 2.6,
          c: colors[Math.floor(r() * colors.length)],
        });
      }
    }
    return (
      <group>
        {boxes.map((b, i) => (
          <mesh key={i} position={[b.x, deckY + b.h / 2, b.z]}>
            <boxGeometry args={[11, b.h, beam * 0.26]} />
            <meshStandardMaterial color={b.c} roughness={0.85} />
          </mesh>
        ))}
      </group>
    );
  }
  if (kind === "bulk") {
    return (
      <group>
        {range(5).map((i) => (
          <mesh key={i} position={[-hl * 0.42 + i * hl * 0.26, deckY + 0.9, 0]}>
            <boxGeometry args={[length * 0.11, 1.8, beam * 0.6]} />
            <meshStandardMaterial color="#39434e" roughness={0.9} />
          </mesh>
        ))}
      </group>
    );
  }
  if (kind === "tanker") {
    return (
      <group>
        <mesh position={[0, deckY + 0.8, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.6, 0.6, length * 0.78, 6]} />
          <meshStandardMaterial color="#4a5563" roughness={0.7} />
        </mesh>
        {range(3).map((i) => (
          <mesh key={i} position={[-hl * 0.3 + i * hl * 0.32, deckY + beam * 0.05, 0]}>
            <sphereGeometry args={[beam * 0.14, 12, 8]} />
            <meshStandardMaterial color="#414c58" roughness={0.7} />
          </mesh>
        ))}
      </group>
    );
  }
  return (
    <group>
      {range(2).map((i) => (
        <mesh key={i} position={[-hl * 0.2 + i * hl * 0.45, deckY + 1, 0]}>
          <boxGeometry args={[length * 0.16, 2, beam * 0.55]} />
          <meshStandardMaterial color="#39434e" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[hl * 0.35, deckY + deckY * 0.45, 0]}>
        <cylinderGeometry args={[0.8, 1, deckY * 0.9, 6]} />
        <meshStandardMaterial color="#2c3742" />
      </mesh>
    </group>
  );
}

function ShipModel({ dims, seed }: { dims: ShipDims; seed: number }) {
  const day = useContext(DayCtx);
  const night = 1 - day;
  const { length, beam, deckY } = dims;
  const hl = length / 2;
  const hull = useHullGeometry(dims);
  const hullColor = useMemo(() => HULL_COLORS[seed % HULL_COLORS.length], [seed]);
  const houseH = deckY * 0.9;

  return (
    <group>
      <mesh geometry={hull}>
        {/* slight emissive lift so the dark hull reads against the night sea */}
        <meshStandardMaterial
          color={hullColor}
          roughness={0.75}
          metalness={0.15}
          emissive="#182430"
          emissiveIntensity={mix(0.55, 0.1, day)}
        />
      </mesh>
      {/* superstructure aft */}
      <mesh position={[-hl * 0.62, deckY + houseH / 2, 0]}>
        <boxGeometry args={[length * 0.13, houseH, beam * 0.72]} />
        <meshStandardMaterial color="#c9d2da" roughness={0.6} />
      </mesh>
      {/* bridge-deck window band */}
      <mesh position={[-hl * 0.62, deckY + houseH * 0.82, 0]}>
        <boxGeometry args={[length * 0.132, 1.1, beam * 0.725]} />
        <meshStandardMaterial
          color={mixHex("#7a6a43", "#5f6d7d", day)}
          emissive="#ffd98a"
          emissiveIntensity={mix(1.1, 0.1, day)}
        />
      </mesh>
      {/* funnel */}
      <mesh position={[-hl * 0.72, deckY + houseH + deckY * 0.2, 0]}>
        <cylinderGeometry args={[beam * 0.09, beam * 0.11, deckY * 0.5, 8]} />
        <meshStandardMaterial color="#32424f" />
      </mesh>
      {/* bow mast + steaming light */}
      <mesh position={[hl * 0.86, deckY + deckY * 0.4, 0]}>
        <cylinderGeometry args={[0.3, 0.4, deckY * 0.8, 5]} />
        <meshStandardMaterial color="#2c3742" />
      </mesh>
      {night > 0.15 && (
        <Glow
          position={[hl * 0.86, deckY + deckY * 0.85, 0]}
          color="#fff2cf"
          scale={7}
          opacity={0.8 * night}
        />
      )}
      <DeckCargo dims={dims} seed={seed} />
    </group>
  );
}

function SelectionRing({ radius }: { radius: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const pulse = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ref.current) {
      const m = ref.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.4 + Math.sin(t * 2.4) * 0.15;
    }
    if (pulse.current) {
      const k = (t % 2.4) / 2.4;
      pulse.current.scale.setScalar(1 + k * 0.35);
      (pulse.current.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - k);
    }
  });
  return (
    <group position={[0, 0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={ref}>
        <ringGeometry args={[radius - 2.2, radius, 64]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={pulse}>
        <ringGeometry args={[radius - 1.2, radius, 64]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

function ShipTag({
  y,
  name,
  sub,
  risk,
  selected,
}: {
  y: number;
  name: string;
  sub: string;
  risk: RiskLevel;
  selected: boolean;
}) {
  return (
    <Html position={[0, y, 0]} center zIndexRange={[6, 0]} style={{ pointerEvents: "none" }}>
      <div className={`twin-tag ${risk === "DANGER" ? "twin-tag--danger" : ""} ${selected ? "twin-tag--sel" : ""}`}>
        <i className={`twin-tag-dot twin-tag-dot--${risk}`} />
        <b>{name}</b>
        <span>{sub}</span>
      </div>
    </Html>
  );
}

function hoverCursor(on: boolean) {
  document.body.style.cursor = on ? "pointer" : "auto";
}

function BerthedShip({
  place,
  risk,
  selected,
  seed,
  onClick,
}: {
  place: ShipPlacement;
  risk: RiskLevel;
  selected: boolean;
  seed: number;
  onClick: () => void;
}) {
  const bob = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (bob.current) {
      bob.current.position.y = Math.sin(t * 0.5 + seed) * 0.18;
      bob.current.rotation.x = Math.sin(t * 0.4 + seed * 2) * 0.004;
    }
  });
  return (
    <group
      position={[place.x, 0, place.z]}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        hoverCursor(true);
      }}
      onPointerOut={() => hoverCursor(false)}
    >
      <group ref={bob}>
        <ShipModel dims={place} seed={seed} />
        <ShipTag
          y={place.deckY * 2.4 + 8}
          name={place.vessel.name}
          sub={STATUS_LABEL[place.vessel.status]}
          risk={risk}
          selected={selected}
        />
      </group>
      {selected && <SelectionRing radius={place.length * 0.62} />}
    </group>
  );
}

function ApproachingShip({
  plan,
  risk,
  selected,
  seed,
  nowSec,
  onClick,
}: {
  plan: ApproachPlan;
  risk: RiskLevel;
  selected: boolean;
  seed: number;
  nowSec: number;
  onClick: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const routeRef = useRef<any>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const s = approachState(plan, t);
    if (group.current) {
      group.current.position.set(s.x, Math.sin(t * 0.6 + seed) * 0.35, s.z);
      group.current.rotation.y = s.rotY;
      group.current.rotation.z = Math.sin(t * 0.5 + seed) * 0.006;
    }
    const mat = routeRef.current?.material;
    if (mat && "dashOffset" in mat) mat.dashOffset = -t * 14;
  });

  const st = approachState(plan, nowSec);
  const sub = st.arrived
    ? "접안 대기"
    : `${(st.distM / 1000).toFixed(1)} km · ETA ${Math.max(1, Math.ceil(st.etaSec / 60))}분`;

  return (
    <group>
      <Line
        ref={routeRef}
        points={plan.route}
        color={ACCENT}
        transparent
        opacity={0.38}
        dashed
        dashSize={16}
        gapSize={12}
        lineWidth={1.4}
      />
      <group
        ref={group}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          hoverCursor(true);
        }}
        onPointerOut={() => hoverCursor(false)}
      >
        <ShipModel dims={plan} seed={seed} />
        <ShipTag
          y={plan.deckY * 2.4 + 8}
          name={plan.vessel.name}
          sub={sub}
          risk={risk}
          selected={selected}
        />
        {selected && <SelectionRing radius={plan.length * 0.62} />}
      </group>
    </group>
  );
}

/* ────────────────────────── mooring lines & zones ──────────────────────── */

/** Snap-back danger radius drawn on the quay around the bollard. */
function DangerZone({ x, radius }: { x: number; radius: number }) {
  const ring = useRef<THREE.Mesh>(null);
  const wave = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const beacon = useRef<THREE.Mesh>(null);
  const r = Math.min(80, Math.max(10, radius));

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ring.current) {
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(t * 4) * 0.18;
    }
    if (wave.current) {
      const k = (t % 1.8) / 1.8;
      wave.current.scale.setScalar(0.25 + k * 0.75);
      (wave.current.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - k);
    }
    if (light.current) light.current.intensity = 14 + Math.max(0, Math.sin(t * 5)) * 30;
    if (beacon.current) {
      (beacon.current.material as THREE.MeshBasicMaterial).opacity =
        0.2 + Math.max(0, Math.sin(t * 5)) * 0.25;
    }
  });

  return (
    <group position={[x, QUAY_TOP + 0.07, BOLLARD_Z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r, 48]} />
        <meshBasicMaterial color="#ff3b2e" transparent opacity={0.13} depthWrite={false} />
      </mesh>
      {/* rings render through occluders (AR-style) so the radius always reads */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} renderOrder={50}>
        <ringGeometry args={[r - 1.4, r, 64]} />
        <meshBasicMaterial
          color="#ff4433"
          transparent
          opacity={0.45}
          depthWrite={false}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={wave} rotation={[-Math.PI / 2, 0, 0]} renderOrder={50}>
        <ringGeometry args={[r - 1.8, r, 64]} />
        <meshBasicMaterial
          color="#ff6a4d"
          transparent
          opacity={0.3}
          depthWrite={false}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* flashing beacon column over the bollard */}
      <mesh ref={beacon} position={[0, 14, 0]}>
        <cylinderGeometry args={[0.7, 1.6, 28, 8, 1, true]} />
        <meshBasicMaterial
          color="#ff4433"
          transparent
          opacity={0.3}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Glow position={[0, 28, 0]} color="#ff4433" scale={26} opacity={0.9} />
      <pointLight ref={light} position={[0, 10, 0]} color="#ff3b2e" intensity={20} distance={110} decay={2} />
    </group>
  );
}

function MooringLine({
  placement,
  status,
  bollardId,
  emphasized,
  onClick,
}: {
  placement: MooringPlacement;
  status: LineStatus;
  bollardId: string;
  emphasized: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const ghostMat = useRef<THREE.MeshBasicMaterial>(null);
  const risk = effectiveRisk(status);

  const curve = useMemo(() => {
    const [fx, fy, fz] = placement.fairlead;
    const to = new THREE.Vector3(placement.bollard.x, QUAY_TOP + 1.7, BOLLARD_Z);
    const from = new THREE.Vector3(fx, fy, fz);
    const dist = from.distanceTo(to);
    const sag = Math.min(3, Math.max(0.6, dist * 0.03));
    const mid = from.clone().add(to).multiplyScalar(0.5);
    mid.y = Math.max(QUAY_TOP + 0.7, mid.y - sag);
    return new THREE.QuadraticBezierCurve3(from, mid, to);
  }, [placement]);

  const tube = useMemo(() => new THREE.TubeGeometry(curve, 28, 0.5, 6, false), [curve]);
  const hit = useMemo(() => new THREE.TubeGeometry(curve, 12, 2.6, 5, false), [curve]);
  useEffect(
    () => () => {
      tube.dispose();
      hit.dispose();
    },
    [tube, hit],
  );

  useEffect(() => {
    if (mat.current) {
      mat.current.color.set(SCENE_RISK[risk].base);
      mat.current.emissive.set(SCENE_RISK[risk].emissive);
    }
    if (ghostMat.current) ghostMat.current.color.set(SCENE_RISK[risk].emissive);
  }, [risk]);

  useFrame((state) => {
    if (!mat.current) return;
    const t = state.clock.elapsedTime;
    if (risk === "DANGER") mat.current.emissiveIntensity = 1.3 + Math.sin(t * 6) * 0.7;
    else if (risk === "CAUTION") mat.current.emissiveIntensity = 1.1 + Math.sin(t * 2.2) * 0.25;
    else mat.current.emissiveIntensity = 0.55;
  });

  const mid = useMemo(() => curve.getPoint(0.5), [curve]);
  const showTag = hovered || emphasized || risk === "DANGER";

  return (
    <group>
      <mesh geometry={tube}>
        <meshStandardMaterial ref={mat} roughness={0.6} />
      </mesh>
      {/* AR ghost pass: hull-occluded stretches stay readable at low opacity
          (mooring state is the primary datum of this view) */}
      <mesh geometry={tube} renderOrder={40}>
        <meshBasicMaterial
          ref={ghostMat}
          transparent
          opacity={risk === "NORMAL" ? 0.16 : 0.42}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      {/* invisible fat tube = generous hit target */}
      <mesh
        geometry={hit}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          hoverCursor(true);
        }}
        onPointerOut={() => {
          setHovered(false);
          hoverCursor(false);
        }}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {showTag && (
        <Html position={[mid.x, mid.y + 4, mid.z]} center zIndexRange={[6, 0]} style={{ pointerEvents: "none" }}>
          <div className={`twin-tag twin-tag--line ${risk === "DANGER" ? "twin-tag--danger" : ""}`}>
            <i className={`twin-tag-dot twin-tag-dot--${risk}`} />
            <b>{placement.lineId}</b>
            <span>
              {bollardId} · {status.riskScore.toFixed(2)} {RISK_LABEL[risk]}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}

/** Interactive quay bollard: hover shows id + used/max, click opens detail.
 *  Ring colour = worst effective risk of the lines attached to this bollard. */
function BollardMarker({
  post,
  lines,
  selected,
  onSelect,
}: {
  post: BollardSpot;
  lines: LineStatus[];
  selected: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const risk = worstRisk(lines.map((l) => effectiveRisk(l)));
  const used = lines.length;
  const danger = lines.find((l) => effectiveRisk(l) === "DANGER");
  const clickable = !!post.bollardId;
  const pending = post.sensorMode === "PENDING";
  // 미연동(PENDING) 포스트는 어두운 링으로 구분 — 계류삭 연결 불가 상태.
  const ringColor = pending ? "#3d4854" : used > 0 ? SCENE_RISK[risk].emissive : "#5b6b7a";
  const modeLabel =
    post.sensorMode === "PENDING" ? "센서 미연동" : post.sensorMode === "VIRTUAL" ? "가상" : null;

  return (
    <group position={[post.x, 0, 0]}>
      {/* invisible hit target over the post — generous so operators can
          actually click a ~1 m post from a control-room camera distance */}
      <mesh
        position={[0, QUAY_TOP + 2.2, BOLLARD_Z]}
        onClick={(e) => {
          e.stopPropagation();
          if (clickable) onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          if (clickable) hoverCursor(true);
        }}
        onPointerOut={() => {
          setHovered(false);
          hoverCursor(false);
        }}
      >
        <cylinderGeometry args={[4.5, 4.5, 7, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* deck ring — grey when empty, risk-coloured when lines attached */}
      <mesh position={[0, QUAY_TOP + 0.06, BOLLARD_Z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.3, 2, 32]} />
        <meshBasicMaterial
          color={ringColor}
          transparent
          opacity={used > 0 ? 0.85 : 0.4}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {selected && (
        <mesh position={[0, QUAY_TOP + 0.05, BOLLARD_Z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[2.5, 3.2, 40]} />
          <meshBasicMaterial color={ACCENT} transparent opacity={0.85} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {used > 0 && risk !== "NORMAL" && (
        <Glow
          position={[0, QUAY_TOP + 2.4, BOLLARD_Z]}
          color={SCENE_RISK[risk].emissive}
          scale={risk === "DANGER" ? 14 : 9}
          opacity={0.7}
        />
      )}
      {(hovered || selected) && (
        <Html position={[0, QUAY_TOP + 7, BOLLARD_Z]} center zIndexRange={[6, 0]} style={{ pointerEvents: "none" }}>
          <div className={`twin-tag ${risk === "DANGER" ? "twin-tag--danger" : ""} ${selected ? "twin-tag--sel" : ""}`}>
            <i className={`twin-tag-dot twin-tag-dot--${risk}`} style={pending ? { background: "#5b6b7a" } : undefined} />
            <b>{post.label}</b>
            <span>
              연결 {used}/2{modeLabel ? ` · ${modeLabel}` : ""}
            </span>
          </div>
        </Html>
      )}
      {danger && <DangerZone x={0} radius={danger.snapbackZone?.radiusMeters ?? 30} />}
    </group>
  );
}

/* ────────────────────────── camera ─────────────────────────────────────── */

export interface FocusHandle {
  key: number;
  get: () => readonly [number, number, number];
}

function CameraRig({ focus }: { focus: FocusHandle | null }) {
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const startedAt = useRef(-1e9);
  const target = useMemo(() => new THREE.Vector3(), []);
  const desired = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    if (focus) startedAt.current = performance.now();
  }, [focus]);

  useEffect(() => {
    if (!controls) return;
    const cancel = () => {
      startedAt.current = -1e9;
    };
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, [controls]);

  useFrame((state, dt) => {
    if (!focus || !controls) return;
    const age = (performance.now() - startedAt.current) / 1000;
    if (age < 0 || age > 3) return;
    const [x, y, z] = focus.get();
    const k = 1 - Math.exp(-3.4 * Math.min(dt, 0.05) * 20);
    target.set(x, y, z);
    controls.target.lerp(target, k * 0.12);
    desired.set(x - 120, y + 90, z + 200);
    state.camera.position.lerp(desired, k * 0.12);
    controls.update();
  });
  return null;
}

/* ────────────────────────── scene root ─────────────────────────────────── */

export interface PortSceneProps {
  layout: TwinLayout;
  lines: LineStatus[];
  selectedVesselId: string | null;
  selectedBollardId: string | null;
  nowSec: number;
  focus: FocusHandle | null;
  /** 시연·테스트용 시각 고정 (0–24h). 미지정 시 현재 시각을 따라간다. */
  hourOverride?: number;
  onSelectVessel: (vesselId: string) => void;
  onSelectLine: (line: LineStatus) => void;
  onSelectBollard: (bollardId: string) => void;
  onClearSelection: () => void;
}

export function PortScene({
  layout,
  lines,
  selectedVesselId,
  selectedBollardId,
  nowSec,
  focus,
  hourOverride,
  onSelectVessel,
  onSelectLine,
  onSelectBollard,
  onClearSelection,
}: PortSceneProps) {
  // 현재 시각 → 일광 계수 (30초마다 갱신; 전환 구간에서도 스텝이 ~1% 미만)
  const [day, setDay] = useState(() => daylightFactor(hourOverride ?? hourOf(new Date())));
  useEffect(() => {
    const tick = () => setDay(daylightFactor(hourOverride ?? hourOf(new Date())));
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [hourOverride]);
  const env = useMemo(() => envTheme(day), [day]);

  const lineById = useMemo(() => new Map(lines.map((l) => [l.lineId, l])), [lines]);
  const linesByBollardId = useMemo(() => {
    const m = new Map<string, LineStatus[]>();
    for (const l of lines) {
      if (!l.bollardId) continue;
      const a = m.get(l.bollardId) ?? [];
      a.push(l);
      m.set(l.bollardId, a);
    }
    return m;
  }, [lines]);
  const vesselRisk = useMemo(() => {
    const m = new Map<string, RiskLevel>();
    for (const l of lines) {
      if (!l.vesselId) continue;
      m.set(l.vesselId, worstRisk([m.get(l.vesselId) ?? "NORMAL", l.riskLevel]));
    }
    return m;
  }, [lines]);

  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [-290, 170, 390], fov: 46, near: 1, far: 6500 }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1.45;
      }}
      onPointerMissed={onClearSelection}
    >
      <DayCtx.Provider value={day}>
      <color attach="background" args={[env.fog]} />
      <fog attach="fog" args={[env.fog, env.fogNear, env.fogFar]} />

      <ambientLight intensity={env.ambient} />
      <hemisphereLight color={env.hemiSky} groundColor={env.hemiGround} intensity={env.hemi} />
      <directionalLight position={env.sunPos} intensity={env.sun} color={env.sunColor} />

      <SkyDome />
      {day < 0.35 && (
        <Stars radius={2200} depth={300} count={2200} factor={7} saturation={0} fade speed={0.5} />
      )}
      <Moon />
      <Sun />
      <Sea />
      <Land />
      <HarborBridge />
      <Quay layout={layout} />

      {layout.ships.map((p, i) => (
        <BerthedShip
          key={p.vessel.vesselId}
          place={p}
          seed={i + 1}
          risk={vesselRisk.get(p.vessel.vesselId) ?? "NORMAL"}
          selected={selectedVesselId === p.vessel.vesselId}
          onClick={() => onSelectVessel(p.vessel.vesselId)}
        />
      ))}

      {layout.approaches.map((plan, i) => (
        <ApproachingShip
          key={plan.vessel.vesselId}
          plan={plan}
          seed={i + 11}
          nowSec={nowSec}
          risk={vesselRisk.get(plan.vessel.vesselId) ?? "NORMAL"}
          selected={selectedVesselId === plan.vessel.vesselId}
          onClick={() => onSelectVessel(plan.vessel.vesselId)}
        />
      ))}

      {layout.moorings.map((m) => {
        const status = lineById.get(m.lineId);
        if (!status) return null;
        return (
          <MooringLine
            key={m.lineId}
            placement={m}
            status={status}
            bollardId={m.bollard.label}
            emphasized={selectedVesselId === m.vesselId}
            onClick={() => onSelectLine(status)}
          />
        );
      })}

      {layout.bollards.map((post) => (
        <BollardMarker
          key={post.id}
          post={post}
          lines={post.bollardId ? linesByBollardId.get(post.bollardId) ?? [] : []}
          selected={!!post.bollardId && post.bollardId === selectedBollardId}
          onSelect={() => post.bollardId && onSelectBollard(post.bollardId)}
        />
      ))}

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        target={[-40, 16, -10]}
        minDistance={60}
        maxDistance={1600}
        maxPolarAngle={1.46}
        minPolarAngle={0.12}
      />
      <CameraRig focus={focus} />
      </DayCtx.Provider>
    </Canvas>
  );
}
