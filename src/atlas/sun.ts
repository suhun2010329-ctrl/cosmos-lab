// 태양의 미래 진화와 그에 따른 지구·달의 변화.
// 주계열 광도: Gough (1981) L(τ) = [1 + 0.4(1 − τ/τ☉)]⁻¹ (τ☉ = 4.57 Gyr)
// 적색거성 이후 이정표: Schröder & Smith (2008) — 적색거성 끝 7.59 Gyr 뒤 L = 2,730 L☉, R = 256 R☉, M = 0.668 M☉,
// 백색왜성 0.54 M☉. 달의 후퇴: 레이저 거리 측정 3.82 cm/년 (Williams & Boggs 2016), 조석 이론 da/dt ∝ a^(−11/2).
import { NOW_YEAR } from "./time";

export const SUN_AGE = 4.57; // Gyr

export interface SunState {
  phase: "주계열" | "준거성" | "적색거성" | "헬륨 연소 (수평 가지)" | "점근 거성 가지" | "행성상 성운" | "백색왜성" | "원시별 이전";
  /** 광도 [L☉], 반지름 [R☉], 질량 [M☉], 표면 온도 [K] */
  L: number; R: number; M: number; T: number;
}

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const loglerp = (a: number, b: number, u: number) => Math.exp(lerp(Math.log(a), Math.log(b), u));

/** Δ: 지금부터 [Gyr] (음수는 과거) */
export function sunAt(dGyr: number): SunState {
  const tau = SUN_AGE + dGyr;
  const T = (L: number, R: number) => 5772 * Math.pow(L / (R * R), 0.25);
  if (tau < 0) return { phase: "원시별 이전", L: 0, R: 0, M: 1, T: 0 };
  if (dGyr < 5.4) {
    // 반지름: 탄생 때 약 0.89 R☉에서 지금 1, 주계열 끝 약 1.6 R☉ (표준 태양 모형의 흐름을 단순화)
    const L = 1 / (1 + 0.4 * (1 - tau / SUN_AGE)), R = dGyr < 0 ? 1 + 0.025 * dGyr : 1 + 0.045 * dGyr + 0.012 * dGyr * dGyr;
    return { phase: "주계열", L, R, M: 1, T: T(L, R) };
  }
  if (dGyr < 6.6) {
    const u = (dGyr - 5.4) / 1.2, L = loglerp(1.9, 2.7, u), R = loglerp(1.73, 2.4, u);
    return { phase: "준거성", L, R, M: 1, T: T(L, R) };
  }
  if (dGyr < 7.59) {
    // 적색거성 가지: 끝으로 갈수록 급격히 밝아짐 (log L ∝ u³), 질량은 바람으로 0.668 M☉까지 줄어듦
    const u = (dGyr - 6.6) / 0.99, w = u * u * u, L = loglerp(2.7, 2730, w), R = loglerp(2.4, 256, w);
    return { phase: "적색거성", L, R, M: 1 - 0.332 * Math.pow(u, 4), T: T(L, R) };
  }
  if (dGyr < 7.70) {
    const u = (dGyr - 7.59) / 0.11;
    return { phase: "헬륨 연소 (수평 가지)", L: loglerp(44, 50, u), R: 10, M: 0.66, T: T(44, 10) };
  }
  if (dGyr < 7.735) {
    const u = (dGyr - 7.70) / 0.035, w = u * u, L = loglerp(50, 3000, w), R = loglerp(10, 150, w);
    return { phase: "점근 거성 가지", L, R, M: lerp(0.66, 0.56, u), T: T(L, R) };
  }
  if (dGyr < 7.7352) {
    return { phase: "행성상 성운", L: 3000, R: 0.05, M: 0.54, T: T(3000, 0.05) };
  }
  // 백색왜성 냉각: L ≈ 10⁻³ (t / 1 Gyr)^(−1.2), 반지름 지구 크기 정도
  const tc = Math.max(dGyr - 7.7352, 1e-4), L = Math.min(100, 1e-3 * Math.pow(tc, -1.2)), R = 0.0125;
  return { phase: "백색왜성", L, R, M: 0.54, T: T(L, R) };
}

// ---------- 지구 ----------
export interface EarthState {
  /** 궤도 긴반지름 [AU] (태양 질량 손실로 a ∝ 1/M), 받는 복사 [지구 = 1], 평형 온도 [K] */
  a: number; S: number; Teq: number;
  status: string;
  engulfed: boolean;
}

export function earthAt(dGyr: number): EarthState {
  const s = sunAt(dGyr), a = 1 / s.M, S = s.L / (a * a);
  const Teq = 255 * Math.pow(Math.max(S, 1e-12), 0.25);
  const rAU = s.R * 0.00465;
  if (dGyr < -4.54) return { a, S, Teq, status: "지구가 생기기 전", engulfed: false };
  let status = "생명이 사는 행성";
  if (rAU > a * 0.8 && s.phase === "적색거성") status = "적색거성 태양의 바깥 대기에 닿음 — 조석 끌림으로 삼켜질 가능성이 높음 (Schröder & Smith 2008)";
  else if (S > 1.4) status = "바다가 모두 증발한 금성 같은 행성 (폭주 온실)";
  else if (S > 1.1) status = "습윤 온실: 성층권으로 올라간 수증기가 우주로 빠져나가며 바다가 사라지는 중 (Kasting 1988)";
  else if (S > 1.06) status = "온도가 크게 올라 복잡한 생명이 살기 어려워짐";
  if (s.phase === "백색왜성") status = "식은 백색왜성 곁의 얼어붙은 암석 (살아남았다면)";
  // Schröder & Smith (2008): 적색거성 끝 무렵 조석 끌림과 대기 마찰로 지구 궤도가 줄어 삼켜짐
  const engulfed = dGyr >= 7.585;
  if (engulfed) status = "적색거성 태양에 삼켜져 사라짐 (Schröder & Smith 2008의 결론)";
  return { a, S, Teq, status, engulfed };
}

// ---------- 달 ----------
const A_MOON0 = 384400, RATE0 = 3.82e-5; // km, km/년
const C_EARTH = 8.034e37, OMEGA0 = 7.2921159e-5, M_E = 5.972e24, M_M = 7.342e22, G = 6.674e-11;

/** 달 거리 [km]: a(t) = a₀ (1 + 6.5 (ȧ/a)₀ t)^(2/13). 과거로는 약 15억 년 전에 발산하므로(게르스텐코른 문제) 그 앞은 계산하지 않음 */
export function moonDistance(years: number): number {
  const k = 6.5 * RATE0 / A_MOON0 * years;
  return A_MOON0 * Math.pow(Math.max(1 + k, 0.05), 2 / 13);
}

/** 하루 길이 [시간]: 지구 자전 + 달 공전 각운동량 보존 */
export function dayLength(years: number): number {
  const L = (a: number) => (M_E * M_M / (M_E + M_M)) * Math.sqrt(G * (M_E + M_M) * a * 1000);
  const J = C_EARTH * OMEGA0 + L(A_MOON0);
  const w = (J - L(moonDistance(years))) / C_EARTH;
  return w > 0 ? 23.934 * OMEGA0 / w * (24 / 23.934) : Infinity;
}

/** 개기일식이 가능한가: 근지점 달의 겉보기 지름 ≥ 원일점 태양의 겉보기 지름 */
export function totalEclipsePossible(years: number): { possible: boolean; ratio: number } {
  const aM = moonDistance(years), s = sunAt(years / 1e9), e = earthAt(years / 1e9);
  const moon = 2 * 1737.4 / (aM * (1 - 0.0549)), sun = 2 * 695700 * s.R / (e.a * 1.496e8 * 1.0167);
  return { possible: moon >= sun, ratio: moon / sun };
}

/** 개기일식이 끝나는 시점 [년] (이분법) */
export function eclipseEndYears(): number {
  let lo = 0, hi = 3e9;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (totalEclipsePossible(m).possible) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

export interface TimedEvent { years: number; label: string; detail: string; scale: "solar" | "earth" | "moon" | "galaxy" | "cosmic" | "star"; /** 픽셀 충돌 장면 */ impact?: string }

/** 태양계에서 예측된 사건 (날짜는 궤도 계산·문헌값) */
export function solarSystemEvents(): TimedEvent[] {
  const now = NOW_YEAR;
  const y = (yr: number) => yr - now;
  return [
    { years: y(2029.28), label: "소행성 아포피스가 지구 3만 2천 km까지 접근", detail: "2029년 4월 13일. 정지 위성보다 가까이 지나가 맨눈으로 보입니다 (NASA JPL).", scale: "solar" },
    { years: y(2032.87), label: "수성의 태양면 통과", detail: "2032년 11월 13일.", scale: "solar" },
    { years: y(2035.67), label: "한반도 개기일식", detail: "2035년 9월 2일. 평양 등 한반도 북부에서 개기일식이 보입니다.", scale: "solar" },
    { years: y(2061.57), label: "핼리 혜성 근일점", detail: "2061년 7월 말. 76년 주기로 돌아옵니다.", scale: "solar" },
    { years: y(2117.94), label: "금성의 태양면 통과", detail: "2117년 12월 11일. 그다음은 2125년.", scale: "solar" },
    { years: 13000, label: "직녀성이 북극성 자리에", detail: "지구 자전축의 세차 운동(주기 약 2만 6천 년)으로 천구 북극이 직녀성 근처로 옮겨 갑니다.", scale: "earth" },
    { years: 3.0e7, label: "포보스가 부서져 화성 고리가 됨", detail: "조석으로 화성에 다가가는 포보스는 약 3천만~5천만 년 뒤 로슈 한계 안에서 부서집니다 (Black & Mittal 2015).", scale: "moon" },
    { years: 1.0e8, label: "토성 고리가 사라지기 시작", detail: "고리 물질이 ‘고리 비’로 토성에 떨어져 1억~3억 년 안에 대부분 사라질 수 있습니다 (O’Donoghue 외 2018).", scale: "moon" },
    { years: 3.6e9, label: "트리톤이 해왕성에 부서짐", detail: "역행하는 트리톤은 조석으로 가까워져 약 36억 년 뒤 로슈 한계에 닿습니다 (Chyba 외 1989).", scale: "moon" },
  ];
}
