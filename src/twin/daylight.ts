import { Color } from "three";

/* Time-of-day environment for the digital twin. Everything keys off one
 * daylight factor (0 = 밤, 1 = 낮) derived from the local clock, so the whole
 * scene — sky, sea, fog, lights, night dressing — blends coherently through
 * dawn (05:30–07:30) and dusk (18:30–20:30). */

export function hourOf(d: Date): number {
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 0 = 밤, 1 = 낮. 새벽/해질녘 2시간 동안 부드럽게 전환. */
export function daylightFactor(hour: number): number {
  return smooth(5.5, 7.5, hour) * (1 - smooth(18.5, 20.5, hour));
}

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** sRGB hex 쌍 보간 → JSX `color` prop 용 THREE.Color. */
export function mixHex(nightHex: string, dayHex: string, t: number): Color {
  return new Color(nightHex).lerp(new Color(dayHex), t);
}

type Raw = [number, number, number];

/** raw(무변환) RGB 트리플 보간 — 커스텀 셰이더 uniform 전용. */
export function mixRaw(n: Raw, d: Raw, t: number): Color {
  return new Color(mix(n[0], d[0], t), mix(n[1], d[1], t), mix(n[2], d[2], t));
}

/* 커스텀 셰이더(하늘·바다)의 밤/낮 원시값 — 밤 값은 기존 야경 튜닝 그대로. */
export const SKY_RAW = {
  horizon: { n: [0.1, 0.17, 0.26] as Raw, d: [0.62, 0.74, 0.85] as Raw },
  zenith: { n: [0.015, 0.032, 0.058] as Raw, d: [0.2, 0.42, 0.66] as Raw },
};
export const SEA_RAW = {
  deep: { n: [0.03, 0.085, 0.135] as Raw, d: [0.13, 0.33, 0.45] as Raw },
  crest: { n: [0.075, 0.16, 0.22] as Raw, d: [0.26, 0.5, 0.6] as Raw },
  fade: { n: [0.051, 0.094, 0.149] as Raw, d: [0.5, 0.62, 0.72] as Raw },
};

export interface EnvTheme {
  day: number;
  night: number;
  fog: Color;
  fogNear: number;
  fogFar: number;
  ambient: number;
  hemiSky: Color;
  hemiGround: Color;
  hemi: number;
  sunColor: Color;
  sun: number;
  sunPos: [number, number, number];
}

export function envTheme(day: number): EnvTheme {
  return {
    day,
    night: 1 - day,
    fog: mixHex("#0d1826", "#b7cddf", day),
    fogNear: mix(600, 900, day),
    fogFar: mix(3600, 5600, day),
    ambient: mix(0.55, 1.0, day),
    hemiSky: mixHex("#2e4a66", "#cfe3f5", day),
    hemiGround: mixHex("#141a22", "#7c8a94", day),
    hemi: mix(0.9, 1.2, day),
    sunColor: mixHex("#b7cbe4", "#fff1d6", day),
    sun: mix(1.45, 2.3, day),
    // 달빛(남서 저각) → 햇빛(남동 고각)으로 위치도 보간
    sunPos: [mix(-500, 350, day), mix(600, 900, day), mix(700, 450, day)],
  };
}
