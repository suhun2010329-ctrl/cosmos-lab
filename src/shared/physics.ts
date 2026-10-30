// 재결합·재이온화(빛의 안개), 빅뱅 핵합성(n/p), 별 형성 역사와 원소 생성 통로.
import type { Cosmology } from "./cosmology";
import { bisect, laZ } from "./math";
import { YEAR } from "./format";

const SIGT = 6.6524587e-29, CL = 2.99792458e8, KB = 1.380649e-23, HP = 6.62607015e-34, ME = 9.1093837e-31;
const EION = 13.605693 * 1.602176634e-19, MH = 1.6735575e-27, LYA = 1.21567e-7, L2S = 8.2246;

/** 광자 온도 kT[MeV]가 주어진 값이 되는 log10(a) */
export function laOfTemp(core: Cosmology, mev: number): number {
  return bisect((la) => core.TofA(Math.pow(10, la)) * core.KMEV - mev, core.LA_RH, 0.5);
}

// ---------- 재결합 · 재이온화 · 광학 깊이 ----------
export interface Ionization {
  /** 자유전자 비율 (수소 원자 수 대비) */
  xe(z: number): number;
  /** 톰슨 산란 평균 자유 경로 [m, 공동 좌표 a = 1 기준] */
  mfp(z: number): number;
  /** 광학 깊이 τ = 1인 마지막 산란면 */
  zStar: number;
  /** 수소 절반이 중성이 되는 적색편이 */
  zHalf: number;
  /** 재이온화 광학 깊이 */
  tauRe: number;
  nH0: number;
  fHe: number;
}

/** RECFAST식 피블스 방정식(유효 3준위 원자)을 z = 1700 → 0 으로 음적분 */
export function buildIon(core: Cosmology): Ionization {
  const P = core.P, nH0 = (1 - P.Yp) * P.Obh2 * 1.87847e-26 / MH, fHe = P.Yp / (4 * (1 - P.Yp));
  const DZ = 0.5, NZ = 3401, xH = new Float64Array(NZ);
  let x = 1;
  xH[NZ - 1] = 1;
  for (let k = NZ - 1; k > 0; k--) {
    const zz = 1 + (k - 1) * DZ, T = P.Tcmb * zz, kT = KB * T, nH = nH0 * zz * zz * zz, H = core.Hs(1 / zz);
    const t4 = T / 1e4, alpha = 1.14e-19 * 4.309 * Math.pow(t4, -0.6166) / (1 + 0.6703 * Math.pow(t4, 0.53));
    const beta = alpha * Math.pow(2 * Math.PI * ME * kT / (HP * HP), 1.5) * Math.exp(-EION / (4 * kT));
    const S = beta * Math.exp(-0.75 * EION / kT);
    const K = LYA * LYA * LYA / (8 * Math.PI * H), n1s = nH * Math.max(1e-12, 1 - x);
    const Cr = (1 + K * L2S * n1s) / (1 + K * (L2S + beta) * n1s);
    const g = -DZ * Cr / (H * zz);
    const A = g * nH * alpha, B = g * S - 1, C = x - g * S;
    x = 2 * C / (-B + Math.sqrt(B * B - 4 * A * C));
    xH[k - 1] = x;
  }
  const lg = (z: number, zc: number, w: number) => 1 / (1 + Math.exp(-(z - zc) / w));
  function xRec(z: number): number {
    const he = fHe * lg(z, 2000, 100) + fHe * lg(z, 6000, 400);
    if (z >= 1700) return 1 + he;
    const u = z / DZ, i = Math.floor(u);
    return xH[i] + (xH[i + 1] - xH[i]) * (u - i) + he;
  }
  // 재이온화: Planck 2018의 tanh 모형 (y = (1+z)^1.5), 헬륨 2차 이온화는 z ≈ 3.5
  const zre = P.zre, yre = Math.pow(1 + zre, 1.5), dy = 1.5 * Math.sqrt(1 + zre) * 0.5;
  const xReion = (z: number) => (1 + fHe) * 0.5 * (1 + Math.tanh((yre - Math.pow(1 + z, 1.5)) / dy)) + fHe * 0.5 * (1 + Math.tanh((3.5 - z) / 0.5));
  const xe = (z: number) => Math.max(xRec(z), xReion(z));
  const dtau = (z: number, xf: (z: number) => number) => CL * SIGT * nH0 * xf(z) * (1 + z) * (1 + z) / core.Hs(1 / (1 + z));
  const tau = new Float64Array(NZ);
  let tauRe = 0, zStar = 0, zHalf = 0;
  for (let k = 1; k < NZ; k++) {
    const z0 = (k - 1) * DZ, z1 = k * DZ;
    tau[k] = tau[k - 1] + 0.5 * (dtau(z0, xe) + dtau(z1, xe)) * DZ;
    if (z1 <= 40) tauRe += 0.5 * (dtau(z0, xReion) + dtau(z1, xReion)) * DZ;
    if (!zStar && tau[k] >= 1) zStar = z0 + (1 - tau[k - 1]) / (tau[k] - tau[k - 1]) * DZ;
  }
  for (let k = NZ - 1; k > 0 && !zHalf; k--) if (xH[k - 1] < 0.5 && xH[k] >= 0.5) zHalf = k * DZ;
  const mfp = (z: number) => 1 / (xe(z) * nH0 * (1 + z) * (1 + z) * SIGT);
  return { xe, mfp, zStar, zHalf, tauRe, nH0, fHe };
}

// ---------- 빅뱅 핵합성 ----------
export interface Nucleosynthesis {
  /** 적분 시작 (kT = 20 MeV) */
  la0: number;
  /** 중수소 병목이 풀리는 시점 (kT = 0.073 MeV) */
  laNuc: number;
  XnNuc: number;
  /** 헬륨 질량 비율 계산값 Yp ≈ 2 Xn */
  YpCalc: number;
  /** 중성자 비율 Xn = n/(n+p) */
  XnAt(la: number): number;
  /** 헬륨 원자핵 수 비율 */
  heNum: number;
  /** 핵합성 시각 [s] */
  tNuc: number;
}

/** 중성자↔양성자 약한 반응률(Bernstein, Brown & Feinberg 1989 근사)을 음적분 */
export function buildBBN(core: Cosmology): Nucleosynthesis {
  const Q = 1.293, tauN = core.P.tauN, TNUC = 0.073;
  const la0 = laOfTemp(core, 20), la1 = laOfTemp(core, 0.01), d = 0.002, n = Math.ceil((la1 - la0) / d) + 1;
  const Xn = new Float64Array(n);
  let T = core.TofA(Math.pow(10, la0)) * core.KMEV, X = 1 / (1 + Math.exp(Q / T));
  let tPrev = core.tOf(la0), frozen = false, XnNuc = 0, laNuc = la1;
  for (let i = 0; i < n; i++) {
    const la = la0 + i * d, t = core.tOf(la), dt = t - tPrev;
    tPrev = t;
    T = core.TofA(Math.pow(10, la)) * core.KMEV;
    if (!frozen) {
      // 약한 반응률은 중성미자 온도 T_ν = (4/11)^(1/3) T_CMB / a 로 계산
      const Tnu = Math.min(T, 1.9454 / Math.pow(10, la) * core.KMEV);
      const x = Q / Tnu, lam = 255 / tauN * (12 + 6 * x + x * x) / Math.pow(x, 5);
      const lnp = lam + 1 / tauN, lpn = lam * Math.exp(-x);
      X = (X + dt * lpn) / (1 + dt * (lnp + lpn));
      if (T < TNUC) { frozen = true; XnNuc = X; laNuc = la; }
    }
    Xn[i] = X;
  }
  const XnAt = (la: number) => {
    if (la <= la0) return Xn[0];
    const u = (la - la0) / d, j = Math.min(n - 2, Math.floor(u));
    return Xn[j] + (Xn[j + 1] - Xn[j]) * (u - j);
  };
  const Yp = core.P.Yp, heNum = (Yp / 4) / ((1 - Yp) + Yp / 4);
  return { la0, laNuc, XnNuc, YpCalc: 2 * XnNuc, XnAt, heNum, tNuc: core.tOf(laNuc) };
}

// ---------- 별 형성 역사와 원소 생성 통로 ----------
/** Madau & Dickinson (2014) 우주 별 형성률 밀도 [M☉/년/Mpc³] */
export function psiMD(z: number): number {
  return 0.015 * Math.pow(1 + z, 2.7) / (1 + Math.pow((1 + z) / 2.9, 5.6));
}

export type Channel = "cc" | "agb" | "ia" | "nsm";

export interface StarFormation {
  /** 누적 별 질량 밀도 [M☉/Mpc³] (반환 비율 27% 제외) */
  rhoAt(la: number): number;
  /** 각 원소 생성 통로가 오늘 대비 지금까지 내놓은 비율 (0~1) */
  chanAt(k: Channel, la: number): number;
  peak: number;
  /** 별 형성률이 최대인 적색편이 ("우주의 정오") */
  zNoon: number;
  rho0: number;
  la0: number;
}

export function buildSFR(core: Cosmology): StarFormation {
  const la0 = laZ(40), d = 0.005, n = Math.ceil((core.LA_MAX - la0) / d) + 1;
  const rho = new Float64Array(n), tY = new Float64Array(n), dm = new Float64Array(n);
  let peak = 0, zNoon = 0, acc = 0, tPrev = core.tOf(la0);
  for (let i = 0; i < n; i++) {
    const la = la0 + i * d, z = Math.pow(10, -la) - 1, t = core.tOf(la), p = psiMD(Math.max(z, -0.99));
    dm[i] = p * (t - tPrev) / YEAR; tPrev = t;
    acc += (1 - 0.27) * dm[i];
    rho[i] = acc; tY[i] = t / YEAR;
    if (p > peak && z > 0) { peak = p; zNoon = z; }
  }
  // 지연 시간 분포 ∝ t⁻¹ (t > t_min, Maoz & Mannucci 2012):
  // 무거운 별(즉시), 가벼운 별(AGB), 백색왜성 폭발(Ia), 중성자별 충돌
  const TMIN: Record<Channel, number> = { cc: 3e6, agb: 5e7, ia: 4e7, nsm: 3e7 };
  const chan = {} as Record<Channel, Float64Array>;
  (Object.keys(TMIN) as Channel[]).forEach((k) => {
    const tm = TMIN[k], arr = new Float64Array(n), norm = Math.log(1.4e10 / tm);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j <= i; j++) {
        const tau = tY[i] - tY[j];
        if (tau < tm) continue;
        s += dm[j] * (k === "cc" ? 1 : Math.min(1, Math.log(tau / tm) / norm));
      }
      arr[i] = s;
    }
    const ref = arr[Math.round(-la0 / d)] || 1;
    for (let i = 0; i < n; i++) arr[i] /= ref;
    chan[k] = arr;
  });
  const at = (arr: Float64Array, la: number) => {
    if (la <= la0) return 0;
    const u = (la - la0) / d, j = Math.min(n - 2, Math.floor(u));
    return arr[j] + (arr[j + 1] - arr[j]) * (u - j);
  };
  return {
    rhoAt: (la) => at(rho, la),
    chanAt: (k, la) => at(chan[k], la),
    peak, zNoon, rho0: at(rho, 0), la0,
  };
}

/** 각 성분이 차지하는 에너지 비율. 재가열 전(인플라톤 장)에는 null */
export function energyFractions(core: Cosmology, la: number): { r: number; b: number; c: number; de: number } | null {
  if (la < core.LA_RH) return null;
  const q = core.parts(Math.pow(10, la)), s = q.r + q.b + q.c + q.de;
  return { r: q.r / s, b: q.b / s, c: q.c / s, de: q.de / s };
}
