import { CatmullRomCurve3, Vector3 } from "three";
import type { Bollard, LineStatus, SensorMode, Vessel } from "../lib/types";

/* World scale: 1 unit = 1 metre. Waterline at y=0. The quay runs along the
 * X axis with its edge at z=0; the sea occupies z>0, the yard/city z<0. */
export const QUAY_TOP = 3; // quay deck height above the waterline
export const QUAY_DEPTH = 260; // quay apron depth (edge → yard)
// Wide enough that each ship's bollard cluster spans its hull — keeps the
// anti-overlap pass from dragging hulls away from their own bollards.
export const BOLLARD_SPACING = 60; // metres between adjacent quay posts
export const BOLLARD_Z = -2; // bollard row, 2 m in from the quay edge
const FENDER_GAP = 2.5; // hull stand-off from the quay wall
const QUAY_MARGIN = 140; // quay extends past the outermost ship

export type ShipKind = "container" | "bulk" | "tanker" | "generic";

export interface ShipDims {
  length: number;
  beam: number;
  deckY: number; // main-deck height above waterline
  kind: ShipKind;
}

export interface BollardSpot {
  id: string;
  x: number;
  label: string;
  bollardId: string | null; // real managed bollard id (null for derived fallback)
  sensorMode: SensorMode | null; // null for derived fallback posts
}

export interface ShipPlacement extends ShipDims {
  vessel: Vessel;
  x: number; // hull centre
  z: number;
}

export interface MooringPlacement {
  lineId: string;
  vesselId: string;
  fairlead: [number, number, number];
  bollard: BollardSpot;
}

export interface ApproachPlan extends ShipDims {
  vessel: Vessel;
  curve: CatmullRomCurve3;
  pathLen: number;
  speed: number; // m/s
  route: [number, number, number][]; // sampled polyline for the route guide
  holdX: number;
  holdZ: number;
}

export interface TwinLayout {
  quayXMin: number;
  quayXMax: number;
  bollards: BollardSpot[];
  ships: ShipPlacement[];
  moorings: MooringPlacement[];
  approaches: ApproachPlan[];
  /** lineId → bollard id, for HUD "계류삭 ↔ 볼라드" mapping labels. */
  bollardByLine: Record<string, string>;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function shipKind(vesselType?: string | null): ShipKind {
  const t = (vesselType ?? "").toLowerCase();
  if (/container|컨테이너/.test(t)) return "container";
  if (/bulk|벌크|광석|곡물|시멘트/.test(t)) return "bulk";
  if (/tank|유조|lng|lpg|케미컬|chemical/.test(t)) return "tanker";
  return "generic";
}

export function shipDims(v: Vessel): ShipDims {
  const length = clamp(v.lengthOverallM ?? 170, 60, 360);
  const beam = clamp(length * 0.16, 11, 48);
  const deckY = clamp(length * 0.055, 6, 16);
  return { length, beam, deckY, kind: shipKind(v.vesselType) };
}

/** Deterministic full-port layout: berth slots, the bollard grid, each
 *  mooring line's fairlead→bollard mapping and approach routes. Pure —
 *  geometry only; live risk is looked up per lineId at render time. */
export function computeTwinLayout(
  vessels: Vessel[],
  lines: LineStatus[],
  realBollards: Bollard[] = [],
): TwinLayout {
  const berthed = vessels
    .filter((v) => v.status === "BERTHED")
    .sort((a, b) =>
      `${a.berthId}|${a.name}|${a.vesselId}`.localeCompare(`${b.berthId}|${b.name}|${b.vesselId}`),
    );
  const approaching = vessels
    .filter((v) => v.status === "APPROACHING")
    .sort((a, b) => a.vesselId.localeCompare(b.vesselId));

  // ── quay posts = the real bollards. A bollard with ``twinSlot`` is pinned
  //    to that post number (1-based); the rest fill the remaining slots in
  //    (berth, quay-position) order. ──────────────────────────────────────
  const sortedBollards = [...realBollards].sort(
    (a, b) =>
      a.berthId.localeCompare(b.berthId) ||
      a.positionM - b.positionM ||
      a.bollardId.localeCompare(b.bollardId),
  );
  let bollards: BollardSpot[];
  if (sortedBollards.length > 0) {
    const pinned = new Map<number, Bollard>(); // slot index (0-based) → bollard
    const rest: Bollard[] = [];
    for (const b of sortedBollards) {
      const slot = b.twinSlot != null && b.twinSlot >= 1 ? b.twinSlot - 1 : null;
      if (slot != null && !pinned.has(slot)) pinned.set(slot, b);
      else rest.push(b);
    }
    const totalSlots = Math.max(
      sortedBollards.length,
      ...[...pinned.keys()].map((s) => s + 1),
    );
    const slotted: (Bollard | undefined)[] = Array.from({ length: totalSlots });
    for (const [slot, b] of pinned) slotted[slot] = b;
    let cursor = 0;
    for (const b of rest) {
      while (slotted[cursor] !== undefined) cursor++;
      slotted[cursor] = b;
    }
    bollards = slotted.flatMap((b, i) =>
      b
        ? [
            {
              id: b.bollardId,
              x: (i - (totalSlots - 1) / 2) * BOLLARD_SPACING,
              label: b.label || b.bollardId,
              bollardId: b.bollardId,
              sensorMode: b.sensorMode,
            },
          ]
        : [],
    );
  } else {
    bollards = Array.from({ length: 16 }, (_, i) => ({
      id: `B-${String(i + 1).padStart(2, "0")}`,
      x: (i - 7.5) * BOLLARD_SPACING,
      label: `B-${String(i + 1).padStart(2, "0")}`,
      bollardId: null as string | null,
      sensorMode: null as SensorMode | null,
    }));
  }
  const postByBollardId = new Map<string, BollardSpot>();
  for (const p of bollards) if (p.bollardId) postByBollardId.set(p.bollardId, p);

  // moored lines grouped per vessel
  const linesByVessel = new Map<string, LineStatus[]>();
  for (const l of lines) {
    if (!l.vesselId) continue;
    const arr = linesByVessel.get(l.vesselId) ?? [];
    arr.push(l);
    linesByVessel.set(l.vesselId, arr);
  }

  // ── each berthed ship sits in front of the bollards its lines map to ────
  const ships: ShipPlacement[] = [];
  let fallbackSlot = 0;
  for (const v of berthed) {
    const d = shipDims(v);
    const vlines = linesByVessel.get(v.vesselId) ?? [];
    const xs = vlines
      .map((l) => (l.bollardId ? postByBollardId.get(l.bollardId)?.x : undefined))
      .filter((x): x is number => x != null);
    const x = xs.length ? xs.reduce((s, a) => s + a, 0) / xs.length : (fallbackSlot++ - 0.5) * 180;
    ships.push({ vessel: v, ...d, x, z: FENDER_GAP + d.beam / 2 });
  }

  // ── keep hulls from overlapping: 1D separation pass along the quay ──────
  //    Ships are placed in front of their bollards, but two vessels whose
  //    bollard clusters are close can have intersecting hulls. Push adjacent
  //    hulls apart to a clear gap, then recentre so the fleet keeps sitting
  //    over its bollards instead of drifting down-quay.
  const HULL_GAP = 26; // clear water between neighbouring hulls (m)
  if (ships.length > 1) {
    ships.sort((a, b) => a.x - b.x);
    const meanBefore = ships.reduce((s, sh) => s + sh.x, 0) / ships.length;
    for (let i = 1; i < ships.length; i++) {
      const prev = ships[i - 1];
      const cur = ships[i];
      const minGap = prev.length / 2 + cur.length / 2 + HULL_GAP;
      if (cur.x - prev.x < minGap) cur.x = prev.x + minGap;
    }
    const meanAfter = ships.reduce((s, sh) => s + sh.x, 0) / ships.length;
    const shift = meanBefore - meanAfter;
    for (const sh of ships) sh.x += shift;
  }

  // ── mooring ropes: fan along the hull to each line's bollard post ───────
  // HUD/scene labels prefer the post label (B-01) over the raw bollard id.
  const moorings: MooringPlacement[] = [];
  const bollardByLine: Record<string, string> = {};
  for (const l of lines) {
    if (!l.bollardId) continue;
    bollardByLine[l.lineId] = postByBollardId.get(l.bollardId)?.label ?? l.bollardId;
  }
  for (const ship of ships) {
    // Order fairleads by each line's bollard position so ropes never cross.
    const postX = (l: LineStatus) =>
      (l.bollardId ? postByBollardId.get(l.bollardId)?.x : undefined) ?? 0;
    const vlines = (linesByVessel.get(ship.vessel.vesselId) ?? []).sort(
      (a, b) => postX(a) - postX(b) || a.lineId.localeCompare(b.lineId),
    );
    const n = vlines.length;
    vlines.forEach((line, i) => {
      const post = line.bollardId ? postByBollardId.get(line.bollardId) : undefined;
      if (!post) return; // line's bollard not on the quay → no rope drawn
      const f = n === 1 ? 0.5 : i / (n - 1); // fan fraction stern→bow
      const fx = ship.x + (f - 0.5) * ship.length * 0.92;
      moorings.push({
        lineId: line.lineId,
        vesselId: ship.vessel.vesselId,
        fairlead: [fx, ship.deckY + 1, ship.z - ship.beam / 2 + 0.4],
        bollard: post,
      });
    });
  }

  // ── quay slab spans all posts and hulls ─────────────────────────────────
  const spanX = [
    ...bollards.map((b) => b.x),
    ...ships.flatMap((s) => [s.x - s.length / 2, s.x + s.length / 2]),
    -210,
    210,
  ];
  const quayXMin = Math.floor((Math.min(...spanX) - QUAY_MARGIN) / BOLLARD_SPACING) * BOLLARD_SPACING;
  const quayXMax = Math.ceil((Math.max(...spanX) + QUAY_MARGIN) / BOLLARD_SPACING) * BOLLARD_SPACING;

  // ── approach routes for inbound vessels ─────────────────────────────────
  const approaches: ApproachPlan[] = approaching.map((v, i) => {
    const d = shipDims(v);
    const holdX = (i - (approaching.length - 1) / 2) * 280;
    const holdZ = 320 + i * 110;
    const side = i % 2 === 0 ? 1 : -1;
    const spawn = new Vector3(holdX + side * 1700, 0, 1250 + i * 180);
    const mid1 = new Vector3(holdX + side * 950, 0, 940 + i * 120);
    const mid2 = new Vector3(holdX + side * 260, 0, 560 + i * 60);
    const hold = new Vector3(holdX, 0, holdZ);
    const curve = new CatmullRomCurve3([spawn, mid1, mid2, hold], false, "catmullrom", 0.4);
    const pathLen = curve.getLength();
    const route = curve.getPoints(90).map((p) => [p.x, 0.8, p.z] as [number, number, number]);
    return { vessel: v, ...d, curve, pathLen, speed: 9, route, holdX, holdZ };
  });

  return { quayXMin, quayXMax, bollards, ships, moorings, approaches, bollardByLine };
}

export interface ApproachState {
  x: number;
  z: number;
  rotY: number;
  arrived: boolean;
  etaSec: number;
  distM: number;
}

/** Position/heading of an approaching vessel `tSec` seconds after mount.
 *  Pure function of time so the 3D scene and the HUD (ETA) stay in sync. */
export function approachState(plan: ApproachPlan, tSec: number): ApproachState {
  const s = tSec * plan.speed;
  if (s >= plan.pathLen) {
    // arrived: gentle loiter around the holding point
    const a = (tSec - plan.pathLen / plan.speed) * 0.045;
    const tan = plan.curve.getTangentAt(1);
    return {
      x: plan.holdX + Math.cos(a) * 10,
      z: plan.holdZ + Math.sin(a * 0.8) * 7,
      rotY: Math.atan2(-tan.z, tan.x) + Math.sin(a) * 0.12,
      arrived: true,
      etaSec: 0,
      distM: 0,
    };
  }
  const u = clamp(s / plan.pathLen, 0, 1);
  const p = plan.curve.getPointAt(u);
  const tan = plan.curve.getTangentAt(u);
  return {
    x: p.x,
    z: p.z,
    rotY: Math.atan2(-tan.z, tan.x),
    arrived: false,
    etaSec: (plan.pathLen - s) / plan.speed,
    distM: plan.pathLen - s,
  };
}
