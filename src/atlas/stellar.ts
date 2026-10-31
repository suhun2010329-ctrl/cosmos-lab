// 별의 물리량과 미래: 색·밝기 → 온도·광도·반지름·질량, 주계열 수명, 최후(백색왜성·중성자별·블랙홀),
// 그리고 고유 운동 + 시선 속도로 계산한 태양 근접 통과.
import { bvToTemp } from "./data";

export const STRIDE = 9;
export const LUM_NAMES = ["광도 계급 모름", "초거성 (I)", "밝은 거성 (II)", "거성 (III)", "준거성 (IV)", "주계열성 (V)", "준왜성 (VI)", "백색왜성"];

/** 복사 보정 BC_V(T) (Reed 1998 근사, 3000–40000 K) */
export function bolometricCorrection(T: number): number {
  const x = Math.log10(Math.max(2500, Math.min(45000, T))) - 4;
  return -8.499 * x ** 4 + 13.421 * x ** 3 - 8.131 * x ** 2 - 3.901 * x - 0.438;
}

export interface StarPhys {
  T: number; L: number; R: number; M: number;
  lum: number;
  /** 주계열 수명 [년], 남은 수명의 위쪽 한계 [년] */
  tMS: number; tRemMax: number;
  fate: string;
  spectral: string;
}

export function spectralLetter(T: number): string {
  return T > 30000 ? "O" : T > 10000 ? "B" : T > 7500 ? "A" : T > 6000 ? "F" : T > 5200 ? "G" : T > 3700 ? "K" : "M";
}

/** 초기 질량 → 최후 (Heger 외 2003의 단일 별 결과를 단순화) */
export function stellarFate(M: number, lum: number): string {
  if (lum === 7) return "이미 백색왜성. 수천억~수조 년에 걸쳐 식어 ‘흑색왜성’이 됩니다";
  if (M < 0.5) return "적색왜성으로 수조 년 동안 탄 뒤, 적색거성을 거치지 않고 헬륨 백색왜성이 됩니다";
  if (M < 8) return "적색거성 → 행성상 성운 → 백색왜성 (질량 약 " + (0.08 * M + 0.49).toFixed(2) + " M☉)";
  if (M < 20) return "적색 초거성 → II형 초신성 → 중성자별 (또는 펄서)";
  if (M < 40) return "초신성 또는 직접 붕괴 → 블랙홀";
  return "강한 항성풍 · 볼프–레이에 별 → 블랙홀 (감마선 폭발 가능)";
}

export function starPhys(absMag: number, bv: number, lum: number): StarPhys {
  const T = lum === 7 ? Math.max(bvToTemp(bv), 6000) : bvToTemp(bv);
  const L = Math.pow(10, -0.4 * (absMag + bolometricCorrection(T) - 4.74));
  const R = Math.sqrt(L) * Math.pow(5772 / T, 2);
  let M: number;
  if (lum === 7) M = 0.6;
  else if (lum === 1) M = Math.max(8, 10 * Math.pow(L / 1e4, 0.5));
  else if (lum === 2) M = Math.max(4, 6 * Math.pow(L / 3e3, 0.4));
  else if (lum === 3) M = L < 300 ? 1.4 : 1.4 * Math.pow(L / 300, 0.3);
  else M = L < 0.034 ? Math.pow(L / 0.23, 1 / 2.3) : L < 16 ? Math.pow(L, 0.25) : Math.pow(L / 1.4, 1 / 3.5);
  M = Math.max(0.08, Math.min(M, 150));
  const tMS = 1e10 * Math.pow(M, -2.5);
  // 나이를 모르므로 주계열성은 ‘지금 주계열 어딘가’로 보고 남은 수명의 위쪽 한계를 주계열 수명으로, 거성·초거성은 그 약 10%로 잡음
  const tRemMax = lum === 7 ? Infinity : lum === 5 || lum === 6 || lum === 0 ? tMS : 0.1 * tMS;
  return { T, L, R, M, lum, tMS, tRemMax, fate: stellarFate(M, lum), spectral: spectralLetter(T) };
}

/** Δt 년 뒤에 아직 살아 있을 확률 (지금 나이가 남은 수명 범위에 고르게 퍼져 있다고 볼 때) */
export function aliveProbability(p: StarPhys, dtYears: number): number {
  if (dtYears <= 0 || !isFinite(p.tRemMax)) return 1;
  return Math.max(0, 1 - dtYears / p.tRemMax);
}

export interface Encounter { i: number; tMin: number; dMin: number; vRel: number }

/**
 * 태양 근접 통과 (직선 운동 근사): t_min = −(r·v)/|v|², d_min = |r + v t_min|.
 * 시선 속도가 있는 별만 쓴다. 약 1천만 년 너머는 은하 중력에 의한 궤도 휘어짐 때문에 직선 근사가 틀려진다.
 */
export function closeEncounters(buf: Float32Array, n: number, maxD = 2.5, maxT = 1e7): Encounter[] {
  const out: Encounter[] = [];
  for (let i = 0; i < n; i++) {
    const o = STRIDE * i;
    if (buf[o + 8] < 16) continue;
    const x = buf[o], y = buf[o + 1], z = buf[o + 2], vx = buf[o + 5], vy = buf[o + 6], vz = buf[o + 7];
    const v2 = vx * vx + vy * vy + vz * vz;
    if (v2 <= 0) continue;
    const t = -(x * vx + y * vy + z * vz) / v2;
    if (Math.abs(t) > maxT) continue;
    const d = Math.hypot(x + vx * t, y + vy * t, z + vz * t);
    if (d < maxD) out.push({ i, tMin: t, dMin: d, vRel: Math.sqrt(v2) * 977792 });
  }
  return out.sort((a, b) => a.dMin - b.dMin);
}

/** Δt 년 뒤 태양에서 가장 가까운 별 (후보: 지금 20 pc 안, 시선 속도 있음) */
export function nearestAt(buf: Float32Array, candidates: number[], dt: number): { i: number; d: number } {
  let best = -1, bd = Infinity;
  for (const i of candidates) {
    const o = STRIDE * i, d = Math.hypot(buf[o] + buf[o + 5] * dt, buf[o + 1] + buf[o + 6] * dt, buf[o + 2] + buf[o + 7] * dt);
    if (d < bd) { bd = d; best = i; }
  }
  return { i: best, d: bd };
}
