import type { RiskLevel } from "./types";

const DEFAULT_SLACK_HZ = 8;
const DEFAULT_CRIT_HZ = 32;
const NORMAL_MAX_RATIO = 0.33;
const CAUTION_MAX_RATIO = 0.66;

function envNum(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function round(value: number, digits = 1): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export const PIEZO_FREQ_SLACK_HZ = envNum(import.meta.env.VITE_PIEZO_FREQ_SLACK_HZ, DEFAULT_SLACK_HZ);
export const PIEZO_FREQ_CRIT_HZ = envNum(import.meta.env.VITE_PIEZO_FREQ_CRIT_HZ, DEFAULT_CRIT_HZ);

function freqAtLoadRatio(ratio: number): number {
  const lo2 = PIEZO_FREQ_SLACK_HZ ** 2;
  const hi2 = PIEZO_FREQ_CRIT_HZ ** 2;
  if (hi2 <= lo2) return PIEZO_FREQ_SLACK_HZ;
  return Math.sqrt(lo2 + ratio * (hi2 - lo2));
}

export function piezoLoadRatio(freqHz: number): number {
  const lo2 = PIEZO_FREQ_SLACK_HZ ** 2;
  const hi2 = PIEZO_FREQ_CRIT_HZ ** 2;
  if (hi2 <= lo2) return 0;
  const value = (freqHz ** 2 - lo2) / (hi2 - lo2);
  return Math.min(1, Math.max(0, value));
}

export function piezoGuideBands(): {
  slackHz: number;
  cautionStartHz: number;
  dangerStartHz: number;
  criticalHz: number;
} {
  return {
    slackHz: round(PIEZO_FREQ_SLACK_HZ),
    cautionStartHz: round(freqAtLoadRatio(NORMAL_MAX_RATIO)),
    dangerStartHz: round(freqAtLoadRatio(CAUTION_MAX_RATIO)),
    criticalHz: round(PIEZO_FREQ_CRIT_HZ),
  };
}

export function piezoBand(freqHz: number): RiskLevel {
  const ratio = piezoLoadRatio(freqHz);
  if (ratio >= CAUTION_MAX_RATIO) return "DANGER";
  if (ratio >= NORMAL_MAX_RATIO) return "CAUTION";
  return "NORMAL";
}

/** AE feature proxies derived from the measured frequency (T ∝ f²). */
export interface PiezoAeEstimate {
  amplitudeDbAe: number;
  snrDb: number;
  hitCount: number;
  durationMs: number;
  freqLowKhz: number;
  freqHighKhz: number;
  signalType: string;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Estimate the AE feature vector directly from a live piezo frequency, on the
 * client. Mirrors the backend adapter's monotonic load-ratio mapping
 * (``services/piezo_adapter.to_feature_event``) so the panel updates with
 * every realtime reading instead of waiting for the stored ML event.
 */
export function piezoAeEstimate(freqHz: number): PiezoAeEstimate {
  const rho = piezoLoadRatio(freqHz);
  return {
    amplitudeDbAe: round(lerp(45, 96, rho), 2),
    snrDb: round(lerp(6, 62, rho), 2),
    hitCount: Math.round(lerp(2, 28, rho)),
    durationMs: round(lerp(0.6, 3.8, rho), 2),
    freqLowKhz: round(lerp(18, 26, rho), 2),
    freqHighKhz: round(lerp(120, 205, rho), 2),
    signalType: rho >= CAUTION_MAX_RATIO
      ? "High amplitude"
      : rho >= NORMAL_MAX_RATIO
        ? "Medium amplitude"
        : "Low amplitude",
  };
}
