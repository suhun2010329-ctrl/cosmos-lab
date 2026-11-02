// 우주 지도의 네 번째 축 w. 지도 위의 모든 점은 (x, y, z, w)이고, w는 그 천체에서 지금 우리 눈에 닿은 빛이
// 출발한 때 × 빛의 속도 (과거 광원뿔 위의 자리, 단위 pc)다. 행성계 장면에서는 w = 시간 × k (세계선).
// 회전은 4차원 관측실의 여섯 평면 회전(rotate4)을 그대로 쓴다. 각이 모두 0이면 보통의 3차원 지도와 같다.
import { rotate4, type Vec4 } from "../fourd/geometry";

/** 여섯 평면 중 w가 들어간 세 평면의 번호 (PLANES 순서: XY, XZ, XW, YZ, YW, ZW) */
export const XW = 2, YW = 4, ZW = 5;
/** 1년 동안 빛이 가는 거리 [pc] */
export const LY_PC = 0.306601;

/** 여섯 평면 회전각 → 4×4 행렬 (행 우선, 열 j = rotate4(e_j)) */
export function matrix4(angles: readonly number[], out: number[] = new Array(16).fill(0)): number[] {
  for (let j = 0; j < 4; j++) {
    const e: Vec4 = [0, 0, 0, 0];
    e[j] = 1;
    const c = rotate4(e, angles as number[]);
    for (let r = 0; r < 4; r++) out[4 * r + j] = c[r];
  }
  return out;
}

/** w가 화면에 섞이는가 (w가 들어간 평면의 각 중 하나라도 0이 아님) */
export function wMixed(angles: readonly number[]): boolean {
  return Math.abs(angles[XW]) > 1e-4 || Math.abs(angles[YW]) > 1e-4 || Math.abs(angles[ZW]) > 1e-4;
}

/**
 * 셰이더 to4()와 같은 변환: v = M·(x, y, z, w). persp > 0이면 w 방향 원근 k = 1/max(0.2, 1 − persp·v.w/L)
 * (관측자 쪽 w, 즉 더 최근의 빛이 크게 보임). 결과는 화면에 그릴 3차원 좌표.
 */
export function project4(M: readonly number[], x: number, y: number, z: number, w: number, persp = 0, L = 1): [number, number, number] {
  const vx = M[0] * x + M[1] * y + M[2] * z + M[3] * w;
  const vy = M[4] * x + M[5] * y + M[6] * z + M[7] * w;
  const vz = M[8] * x + M[9] * y + M[10] * z + M[11] * w;
  const vw = M[12] * x + M[13] * y + M[14] * z + M[15] * w;
  const k = 1 / Math.max(0.2, 1 - persp * vw / L);
  return [vx * k, vy * k, vz * k];
}

/** 미리 정한 시점 (도) */
export const PRESETS4: Record<string, { XW: number; YW: number; ZW: number; label: string; text: string }> = {
  "3d": { XW: 0, YW: 0, ZW: 0, label: "3차원 단면", text: "w 축이 화면에 수직이라 보이지 않습니다. 보통의 3차원 지도와 같습니다." },
  cone: { XW: 0, YW: 0, ZW: -90, label: "과거 광원뿔", text: "세로축이 공간의 z 대신 w(빛이 떠난 때)가 됩니다. 멀리 있는 천체일수록 아래(더 먼 과거)에 놓여, 우리가 보는 우주가 원뿔 모양의 ‘과거’라는 것이 드러납니다." },
  tilt: { XW: 0, YW: 0, ZW: -45, label: "시공간 45°", text: "z와 w를 반씩 섞었습니다. 공간 구조와 빛의 나이가 함께 보입니다." },
  side: { XW: -60, YW: 0, ZW: -30, label: "옆에서 본 4차원", text: "x와 z가 모두 w와 섞여, 3차원 단면이 4차원 안에서 비스듬히 놓인 모습입니다." },
};

// ---------- 시공간 조건: 팽창 · 공간 = 시간 ----------
/**
 * 관측자(태양)의 과거 광원뿔. 관측 시각 t_obs에서 거꾸로 빛을 따라가며
 *   공동 거리 χ(t_e) = ∫_{t_e}^{t_obs} c dt / a(t)   (a는 오늘 = 1, χ는 지도에 저장된 오늘 기준 거리 [pc])
 * 를 적분한다. 그러면 오늘 기준 거리 χ인 천체에 대해
 *   w = −c (t_obs − t_e)            그 빛이 떠난 때 × c (공간 = 시간)
 *   a(t_e)/a(t_obs)                 빛이 떠날 때 그 천체가 지금보다 얼마나 가까웠나 (팽창)
 *   χ > 입자 지평선이면 아직 빛이 오지 않아 보이지 않음.
 * 팽창이 없으면(expand = false) χ = c·Δt, 배율 1, 지평선 = c × 우주 나이.
 */
export interface LightCone {
  /** 관측 시각: 빅뱅 뒤 [년] */
  age: number;
  expand: boolean;
  /** 입자 지평선 (오늘 기준 거리) [pc] */
  horizon: number;
  /** 오름차순 χ [pc], 그때까지 거슬러 간 시간 × c [pc], log10 (a_e / a_obs) */
  chi: Float64Array; look: Float64Array; lr: Float64Array;
}

export function buildLightCone(laAtDt: (dtYears: number) => number, t0Years: number, obsDt: number, expand: boolean): LightCone {
  const age = Math.max(t0Years + obsDt, 1e-9);
  if (!expand) {
    const chi = new Float64Array([0, age * LY_PC]);
    return { age, expand, horizon: age * LY_PC, chi, look: chi.slice(), lr: new Float64Array(2) };
  }
  // 거슬러 간 시간 L: 작은 쪽(가까운 은하)과 빅뱅 쪽을 모두 촘촘히 (두 로그 격자를 합침)
  const tMin = Math.min(1, age * 1e-6), Ls: number[] = [0];
  const NL = 320;
  for (let i = 0; i < NL; i++) {
    Ls.push(Math.pow(10, Math.log10(Math.max(age * 1e-9, 1e-6)) + (Math.log10(age - tMin) - Math.log10(Math.max(age * 1e-9, 1e-6))) * i / (NL - 1)));
    Ls.push(age - Math.pow(10, Math.log10(tMin) + (Math.log10(age * 0.5) - Math.log10(tMin)) * i / (NL - 1)));
  }
  Ls.sort((a, b) => a - b);
  const L: number[] = [];
  for (const x of Ls) if (x >= 0 && x <= age - tMin && (!L.length || x > L[L.length - 1] * (1 + 1e-12))) L.push(x);
  const n = L.length, laObs = laAtDt(obsDt);
  const chi = new Float64Array(n + 1), look = new Float64Array(n + 1), lr = new Float64Array(n + 1);
  let prevF = Math.pow(10, -laObs), s = 0;
  lr[0] = 0;
  for (let i = 1; i < n; i++) {
    const la = laAtDt(obsDt - L[i]), f = Math.pow(10, -la);
    s += 0.5 * (prevF + f) * (L[i] - L[i - 1]) * LY_PC;
    chi[i] = s; look[i] = L[i] * LY_PC; lr[i] = la - laObs;
    prevF = f;
  }
  // 빅뱅 직후 [0, tMin]: 복사 시대 a ∝ t^½ → ∫dt/a = 2 t / a(t)
  const laMin = laAtDt(obsDt - L[n - 1]);
  s += 2 * (age - L[n - 1]) * Math.pow(10, -laMin) * LY_PC;
  chi[n] = s; look[n] = age * LY_PC; lr[n] = -40;
  return { age, expand, horizon: s, chi, look, lr };
}

/** 오늘 기준 거리 χ [pc]인 천체: w [pc, 음수], a_e/a_obs, 보이는가 */
export function coneAt(c: LightCone, chi: number): { w: number; ratio: number; ok: boolean } {
  if (chi <= 0) return { w: 0, ratio: 1, ok: true };
  if (chi >= c.horizon) return { w: -c.look[c.look.length - 1], ratio: 0, ok: false };
  const a = c.chi;
  let lo = 0, hi = a.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a[m] <= chi) lo = m; else hi = m; }
  const f = (chi - a[lo]) / (a[hi] - a[lo] || 1);
  return { w: -(c.look[lo] + (c.look[hi] - c.look[lo]) * f), ratio: Math.pow(10, c.lr[lo] + (c.lr[hi] - c.lr[lo]) * f), ok: true };
}
