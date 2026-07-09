import type { EventRecord, LineStatus, RiskLevel } from "./types";

/**
 * Port-domain acoustic-emission (AE) reading for a mooring line — the v2
 * per-event schema (ae-feature-event.v2): amplitudeDbAe, snrDb, hitCount,
 * durationMs, freq band, signalType + environment covariates.
 *
 * Live lines carry a real ML event (via ``lastEventId``); ``fromEvent`` maps
 * that event's features/context onto this shape. Demo lines have no event, so
 * ``syntheticReading`` produces a deterministic seed-stable reading biased by
 * the line's severity.
 */
export interface AeReading {
  amplitudeDbAe: number;
  snrDb: number;
  hitCount: number;
  durationMs: number;
  freqLowKhz: number;
  freqHighKhz: number;
  signalType: string;
  ambientNoiseDb: number;
  rainMmh: number;
  windMps: number;
  craneActive: boolean;
  /** true = 실제 ML 이벤트 특징량, false = 데모 합성값 */
  live: boolean;
}

export const SIGNAL_TYPES = [
  "Low amplitude",
  "Low to high frequency",
  "Medium amplitude",
  "High amplitude",
] as const;

export const SIGNAL_LABEL: Record<string, string> = {
  "Low amplitude": "저진폭 (Low)",
  "Low to high frequency": "저-고주파 (LHF)",
  "Medium amplitude": "중진폭 (Medium)",
  "High amplitude": "고진폭 (High)",
};

/** Signal type → risk colour class (High = 파단 임박). */
export const SIGNAL_RISK: Record<string, RiskLevel> = {
  "Low amplitude": "NORMAL",
  "Low to high frequency": "CAUTION",
  "Medium amplitude": "CAUTION",
  "High amplitude": "DANGER",
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, d = 0) => {
  const p = 10 ** d;
  return Math.round(v * p) / p;
};
const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function effLevel(line: LineStatus): RiskLevel {
  return line.vesselId ? line.riskLevel : "NORMAL";
}

/** Map a real ML event's features/context onto the AE reading shape. */
export function fromEvent(event: EventRecord): AeReading {
  const f = event.features as Record<string, unknown>;
  const c = event.context as Record<string, unknown>;
  const signal = typeof f.signalType === "string" ? f.signalType : "Low amplitude";
  return {
    amplitudeDbAe: round(num(f.amplitudeDbAe), 1),
    snrDb: round(num(f.snrDb), 1),
    hitCount: Math.round(num(f.hitCount)),
    durationMs: round(num(f.durationMs), 2),
    freqLowKhz: round(num(f.freqLowKhz), 1),
    freqHighKhz: round(num(f.freqHighKhz), 1),
    signalType: signal,
    ambientNoiseDb: round(num(c.ambientNoiseDb), 1),
    rainMmh: round(num(c.rainMmh), 1),
    windMps: round(num(c.windMps), 1),
    craneActive: num(c.craneActive) >= 1,
    live: true,
  };
}

/** Deterministic demo reading (no backend event). Scales with line severity. */
export function syntheticReading(line: LineStatus): AeReading {
  const rand = mulberry32(hashStr(line.lineId));
  const level = effLevel(line);
  const base = level === "DANGER" ? 0.85 : level === "CAUTION" ? 0.55 : 0.15;
  const sev = clamp(base * 0.6 + (line.vesselId ? line.riskScore : 0) * 0.4 + (rand() - 0.5) * 0.08, 0, 1);
  const signalType =
    level === "DANGER" ? "High amplitude" : level === "CAUTION" ? "Medium amplitude" : "Low amplitude";
  return {
    amplitudeDbAe: round(clamp(50 + sev * 46 + (rand() - 0.5) * 4, 40, 100), 1),
    snrDb: round(clamp(10 + sev * 36 + (rand() - 0.5) * 4, 6, 50), 1),
    hitCount: Math.round(clamp(1 + sev * 34 + (rand() - 0.5) * 4, 1, 51)),
    durationMs: round(clamp(0.6 + sev * 4.5 + (rand() - 0.5) * 0.4, 0.3, 6), 2),
    freqLowKhz: 20,
    freqHighKhz: round(clamp(40 + sev * 150 + (rand() - 0.5) * 20, 30, 200), 1),
    signalType,
    ambientNoiseDb: round(clamp(32 + rand() * 18, 28, 64), 1),
    rainMmh: rand() < 0.7 ? 0 : round(rand() * 12, 1),
    windMps: round(2 + rand() * 8, 1),
    craneActive: rand() < 0.35,
    live: false,
  };
}
