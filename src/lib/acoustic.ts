import type { LineStatus, RiskLevel } from "./types";

/**
 * Synthetic acoustic-emission (AE) reading for a mooring line.
 *
 * The live sensor/ML pipeline (AE-Damage-Detection) is not yet wired end to
 * end, so for the PoC we surface a *deterministic* reading per line whose
 * feature schema mirrors the training dataset (AE-Damage-Detection-Dataset).
 * Values are seeded by lineId — stable across renders — and biased by the
 * line's effective risk so a DANGER line reads as a genuine damage event.
 *
 * Dataset columns → fields:
 *   Peak_Amplitude_dB, Energy_Release_J, Signal_Duration_ms, Rise_Time_ms,
 *   Frequency_Spectrum_Hz, Impact_Energy_J, Temperature_C, Humidity_%,
 *   Fiber_Type, Resin_Type, Thickness_mm, Damage_Type (0..3).
 */
export interface AcousticReading {
  peakAmplitudeDb: number;
  energyReleaseJ: number;
  signalDurationMs: number;
  riseTimeMs: number;
  frequencyHz: number;
  impactEnergyJ: number;
  temperatureC: number;
  humidityPct: number;
  fiberType: "Carbon" | "Glass";
  resinType: "Epoxy" | "Polyester";
  thicknessMm: number;
  damageType: 0 | 1 | 2 | 3;
  /** 0..1 model-style confidence for the damage classification. */
  confidence: number;
}

/** Damage_Type label (dataset class → Korean / English). */
export const DAMAGE_LABEL: Record<number, string> = {
  0: "정상 (No Damage)",
  1: "매트릭스 균열 (Matrix Cracking)",
  2: "섬유 파단 (Fiber Breakage)",
  3: "층간 분리 (Delamination)",
};

/** Damage_Type → risk colour class (reuse the NORMAL/CAUTION/DANGER palette). */
export const DAMAGE_RISK: Record<number, RiskLevel> = {
  0: "NORMAL",
  1: "CAUTION",
  2: "DANGER",
  3: "DANGER",
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, d = 0) => {
  const p = 10 ** d;
  return Math.round(v * p) / p;
};

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small deterministic PRNG (mulberry32) so readings are stable per seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Effective risk of a line: an unmoored line (no vessel) is always NORMAL. */
function effLevel(line: LineStatus): RiskLevel {
  return line.vesselId ? line.riskLevel : "NORMAL";
}

/**
 * Deterministic AE reading for a line. Environmental fields (temp/humidity)
 * and material fields (fiber/resin/thickness) are seed-stable; the acoustic
 * fields and damage class scale with the line's severity.
 */
export function acousticReading(line: LineStatus): AcousticReading {
  const rand = mulberry32(hashStr(line.lineId));
  const level = effLevel(line);
  const base = level === "DANGER" ? 0.82 : level === "CAUTION" ? 0.5 : 0.16;
  // Blend the level floor with the live risk score, plus a little seed jitter.
  const sev = clamp(base * 0.62 + (line.vesselId ? line.riskScore : 0) * 0.38 + (rand() - 0.5) * 0.08, 0, 1);

  const damageType: 0 | 1 | 2 | 3 =
    level === "NORMAL" ? 0 : level === "CAUTION" ? 1 : rand() < 0.5 ? 2 : 3;

  return {
    peakAmplitudeDb: round(clamp(44 + sev * 44 + (rand() - 0.5) * 5, 40, 92), 1),
    energyReleaseJ: round(clamp(0.2 + sev * 9.2 + (rand() - 0.5) * 0.6, 0.05, 10), 2),
    signalDurationMs: round(clamp(0.6 + sev * 4 + (rand() - 0.5) * 0.4, 0.4, 5), 2),
    riseTimeMs: round(clamp(0.2 + sev * 1.6 + (rand() - 0.5) * 0.2, 0.1, 2), 2),
    frequencyHz: round(clamp(150 + sev * 300 + (rand() - 0.5) * 60, 90, 520)),
    impactEnergyJ: round(clamp(6 + sev * 40 + (rand() - 0.5) * 6, 4, 50), 1),
    temperatureC: round(15 + rand() * 23, 1),
    humidityPct: round(25 + rand() * 53),
    fiberType: rand() < 0.6 ? "Carbon" : "Glass",
    resinType: rand() < 0.6 ? "Epoxy" : "Polyester",
    thicknessMm: round(3 + rand() * 6, 1),
    damageType,
    confidence: round(clamp(0.72 + sev * 0.24 + (rand() - 0.5) * 0.06, 0.5, 0.99), 2),
  };
}
