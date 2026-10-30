// 배경 우주론: 프리드만 방정식, 온도–척도 인자 관계, 시간표, 선형 성장, 물질 파워 스펙트럼, 초기 조건.
// 화면 쪽 코드와 N-body 작업자(Web Worker)가 같은 모듈을 쓴다.
import { gauss, rng } from "./math";

export type ModelName = "lcdm" | "desi";

/** Planck 2018 (TT,TE,EE+lowE+lensing) 기본 매개변수 */
export const PLANCK18 = {
  h: 0.6736, Obh2: 0.02237, Och2: 0.12, Onuh2: 0.00064, ns: 0.9649, sigma8: 0.8111,
  Tcmb: 2.7255, Neff: 3.046, zre: 7.67, Yp: 0.2471, tauN: 878.4,
} as const;
export type CosmoParams = typeof PLANCK18;

export interface EnergyParts { r: number; b: number; c: number; de: number }

export interface Cosmology {
  P: CosmoParams;
  model: ModelName;
  w0: number; wa: number; h: number;
  Om: number; Ob: number; Oc: number; Onu: number; Or: number; OL: number; Ogam: number;
  /** H0 [1/s] */
  H0s: number;
  /** 볼츠만 상수 [MeV/K] */
  KMEV: number;
  /** 시뮬레이션이 다루는 log10(a)의 범위와 재가열 시점 */
  LA_MIN: number; LA_RH: number; LA_MAX: number;
  E(a: number): number;
  E2(a: number): number;
  /** H(a) [1/s] */
  Hs(a: number): number;
  /** 각 성분의 밀도 / 오늘의 임계 밀도 */
  parts(a: number): EnergyParts;
  wOf(a: number): number;
  fDE(a: number): number;
  /** 광자 온도 [K] (유효 자유도 g*로 보정) */
  TofA(a: number): number;
  gsOf(a: number): number;
  /** 우주 나이 [s] (log10 a의 함수) */
  tOf(la: number): number;
  laOfT(t: number): number;
  /** 선형 성장 인자 D(a), D(1) = 1 */
  growth(la: number): number;
  /** 성장률 f = dlnD/dlna */
  growthF(la: number): number;
  /** 선형 물질 파워 스펙트럼 [(Mpc/h)³], k [h/Mpc] */
  Pk(k: number): number;
  sigmaM(M: number): number;
  sEH: number;
  genIC(L: number, n: number, seed: number): Float32Array;
}

const LN10 = Math.LN10;

export function createCosmology(opt: { model?: ModelName } = {}): Cosmology {
  const P = PLANCK18;
  const model: ModelName = opt.model === "desi" ? "desi" : "lcdm";
  // DESI DR2 BAO + CMB + DESY5 (2025): w0 = -0.752, wa = -0.86
  const w0 = model === "desi" ? -0.752 : -1, wa = model === "desi" ? -0.86 : 0;
  const h = P.h, h2 = h * h;
  const Ob = P.Obh2 / h2, Oc = P.Och2 / h2, Onu = P.Onuh2 / h2, Om = Ob + Oc + Onu;
  const Ogam = 2.473e-5 * Math.pow(P.Tcmb / 2.7255, 4) / h2;
  const Or = Ogam * (1 + 0.22711 * P.Neff);
  const OL = 1 - Om - Or;
  const H0s = 100 * h / 3.0857e19;
  const KMEV = 8.617333e-11;

  // 유효 자유도 g*(T) (Husdal 2016의 표준 모형 값을 시그모이드 계단으로 근사)
  const GS0 = 2 + 7 / 8 * 2 * P.Neff * (4 / 11);
  const GR0 = 2 + 7 / 8 * 2 * P.Neff * Math.pow(4 / 11, 4 / 3);
  const GSTEP: [number, number, number][] = [[40, 0.35, 6.5], [156.5, 0.2, 44.5], [500, 0.35, 14], [1400, 0.35, 10.5], [25000, 0.35, 10], [57000, 0.35, 10.5]];
  const sig = (T: number, Tc: number, w: number) => 1 / (1 + Math.exp(-Math.log(T / Tc) / w));
  function gfun(Tm: number, floor: number): number {
    let g = floor + (10.75 - floor) * sig(Tm, 0.2, 0.35);
    for (const [Tc, w, dg] of GSTEP) g += dg * sig(Tm, Tc, w);
    return g;
  }
  function TofA(a: number): number {
    const T0 = P.Tcmb / a;
    if (a > 3e-7) return T0;
    let T = T0;
    for (let i = 0; i < 6; i++) T = T0 * Math.cbrt(GS0 / gfun(T * KMEV, GS0));
    return T;
  }
  const gsOf = (a: number) => (a > 3e-7 ? GS0 : gfun(TofA(a) * KMEV, GS0));
  function radF(a: number): number {
    if (a > 3e-7) return 1;
    const Tm = TofA(a) * KMEV;
    return (gfun(Tm, GR0) / GR0) * Math.pow(GS0 / gfun(Tm, GS0), 4 / 3);
  }
  const wOf = (a: number) => w0 + wa * (1 - a);
  const fDE = (a: number) => (model === "desi" ? Math.pow(a, -3 * (1 + w0 + wa)) * Math.exp(-3 * wa * (1 - a)) : 1);
  const E2 = (a: number) => { const a2 = a * a; return Or * radF(a) / (a2 * a2) + Om / (a2 * a) + OL * fDE(a); };
  const E = (a: number) => Math.sqrt(E2(a));
  const Hs = (a: number) => H0s * E(a);
  const parts = (a: number): EnergyParts => {
    const a2 = a * a;
    return { r: Or * radF(a) / (a2 * a2), b: Ob / (a2 * a), c: (Oc + Onu) / (a2 * a), de: OL * fDE(a) };
  };

  // 시간표 t(log a): 재가열 이후는 사다리꼴 적분, 그 이전(인플레이션)은 H 일정
  const LA_MIN = -38, LA_RH = -26, LA_MAX = 0.6, STEP = 0.005;
  const NT = Math.round((LA_MAX - LA_RH) / STEP) + 1, tTab = new Float64Array(NT);
  const H_INF = Hs(Math.pow(10, LA_RH));
  tTab[0] = 1 / (2 * H_INF);
  let prevInv = 1 / H_INF;
  for (let i = 1; i < NT; i++) {
    const inv = 1 / Hs(Math.pow(10, LA_RH + i * STEP));
    tTab[i] = tTab[i - 1] + 0.5 * (prevInv + inv) * STEP * LN10;
    prevInv = inv;
  }
  function tOf(la: number): number {
    if (la < LA_RH) return tTab[0] + (la - LA_RH) * LN10 / H_INF;
    const x = (la - LA_RH) / STEP, j = Math.min(NT - 2, Math.floor(x));
    return tTab[j] + (tTab[j + 1] - tTab[j]) * (x - j);
  }
  function laOfT(t: number): number {
    if (t <= tTab[0]) return Math.max(LA_MIN, LA_RH + (t - tTab[0]) * H_INF / LN10);
    if (t >= tTab[NT - 1]) return LA_MAX;
    let lo = 0, hi = NT - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tTab[mid] < t) lo = mid; else hi = mid; }
    return LA_RH + (lo + (t - tTab[lo]) / (tTab[hi] - tTab[lo])) * STEP;
  }

  // 선형 성장 방정식 D'' + (2 + dlnH/dlna) D' = 1.5 Ωm(a) D 를 RK4로 적분 (변수 ln a)
  const G0 = -6, GN = Math.round((LA_MAX - G0) / STEP) + 1, gD = new Float64Array(GN), gF = new Float64Array(GN);
  {
    const aeq = Or / Om, hh = STEP * LN10, eps = 1e-4;
    const a0 = Math.pow(10, G0);
    let D = 1 + 1.5 * a0 / aeq, Pp = 1.5 * a0 / aeq, lna = G0 * LN10;
    const acc = (l: number, Dv: number, Pv: number) => {
      const aa = Math.exp(l), e2 = E2(aa);
      const dlnH = 0.25 * (Math.log(E2(aa * Math.exp(eps))) - Math.log(E2(aa * Math.exp(-eps)))) / eps;
      return -(2 + dlnH) * Pv + 1.5 * (Om / (aa * aa * aa) / e2) * Dv;
    };
    gD[0] = D; gF[0] = Pp / D;
    for (let i = 1; i < GN; i++) {
      const k1d = Pp, k1p = acc(lna, D, Pp);
      const k2d = Pp + hh / 2 * k1p, k2p = acc(lna + hh / 2, D + hh / 2 * k1d, Pp + hh / 2 * k1p);
      const k3d = Pp + hh / 2 * k2p, k3p = acc(lna + hh / 2, D + hh / 2 * k2d, Pp + hh / 2 * k2p);
      const k4d = Pp + hh * k3p, k4p = acc(lna + hh, D + hh * k3d, Pp + hh * k3p);
      D += hh / 6 * (k1d + 2 * k2d + 2 * k3d + k4d);
      Pp += hh / 6 * (k1p + 2 * k2p + 2 * k3p + k4p);
      lna += hh; gD[i] = D; gF[i] = Pp / D;
    }
    const d1 = gD[Math.round(-G0 / STEP)];
    for (let j = 0; j < GN; j++) gD[j] /= d1;
  }
  function interp(tab: Float64Array, la: number): number {
    if (la <= G0) return tab[0];
    const x = (la - G0) / STEP, i = Math.min(GN - 2, Math.floor(x));
    return tab[i] + (tab[i + 1] - tab[i]) * (x - i);
  }
  const growth = (la: number) => interp(gD, la);
  const growthF = (la: number) => interp(gF, la);

  // Eisenstein & Hu (1998) 무진동 전달함수 + σ8 정규화
  const omh2 = P.Obh2 + P.Och2, fb = P.Obh2 / omh2, th = P.Tcmb / 2.7;
  const sEH = 44.5 * Math.log(9.83 / omh2) / Math.sqrt(1 + 10 * Math.pow(P.Obh2, 0.75));
  const aG = 1 - 0.328 * Math.log(431 * omh2) * fb + 0.38 * Math.log(22.3 * omh2) * fb * fb;
  function Tk(k: number): number {
    const Geff = (omh2 / h) * (aG + (1 - aG) / (1 + Math.pow(0.43 * k * h * sEH, 4)));
    const q = k * th * th / Geff;
    const L0 = Math.log(2 * Math.E + 1.8 * q), C0 = 14.2 + 731 / (1 + 62.5 * q);
    return L0 / (L0 + C0 * q * q);
  }
  const Wth = (x: number) => (x < 1e-3 ? 1 - x * x / 10 : 3 * (Math.sin(x) - x * Math.cos(x)) / (x * x * x));
  function sig2raw(R: number): number {
    let s = 0;
    const n = 1400, l0 = Math.log(1e-4), l1 = Math.log(2e3), d = (l1 - l0) / n;
    for (let i = 0; i <= n; i++) {
      const k = Math.exp(l0 + i * d), t = Tk(k), w = Wth(k * R);
      s += (i === 0 || i === n ? 0.5 : 1) * Math.pow(k, 3 + P.ns) * t * t * w * w;
    }
    return s * d / (2 * Math.PI * Math.PI);
  }
  const Anorm = P.sigma8 * P.sigma8 / sig2raw(8);
  const Pk = (k: number) => { const t = Tk(k); return Anorm * Math.pow(k, P.ns) * t * t; };
  const sigmaM = (M: number) => Math.sqrt(Anorm * sig2raw(Math.cbrt(3 * M / (4 * Math.PI * 2.775e11 * Om))));

  /** 젤도비치 변위장 ψ(q) (상자 길이 단위). 주기 경계 n³ 격자, 씨앗 고정 */
  function genIC(L: number, n: number, seed: number): Float32Array {
    const r = rng(seed), N3 = n * n * n, dr = new Float64Array(N3), di = new Float64Array(N3);
    for (let idx = 0; idx < N3; idx++) dr[idx] = gauss(r);
    fft3(dr, di, n, false);
    const V = L * L * L, kf = 2 * Math.PI / L, out = new Float32Array(3 * N3);
    const re = new Float64Array(N3), im = new Float64Array(N3);
    for (let c = 0; c < 3; c++) {
      re.fill(0); im.fill(0);
      for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (x === n / 2 || y === n / 2 || z === n / 2) continue;
        const idx = (z * n + y) * n + x;
        const fx = x < n / 2 ? x : x - n, fy = y < n / 2 ? y : y - n, fz = z < n / 2 ? z : z - n;
        const k2n = fx * fx + fy * fy + fz * fz;
        if (!k2n) continue;
        const k = kf * Math.sqrt(k2n), amp = Math.sqrt(N3 * Pk(k) / V);
        const f = amp * kf * (c === 0 ? fx : c === 1 ? fy : fz) / (k * k);
        re[idx] = -f * di[idx]; im[idx] = f * dr[idx];
      }
      fft3(re, im, n, true);
      for (let idx = 0; idx < N3; idx++) out[3 * idx + c] = re[idx] / N3 / L;
    }
    return out;
  }

  return {
    P, model, w0, wa, h, Om, Ob, Oc, Onu, Or, OL, Ogam, H0s, KMEV, LA_MIN, LA_RH, LA_MAX,
    E, E2, Hs, parts, wOf, fDE, TofA, gsOf, tOf, laOfT, growth, growthF, Pk, sigmaM, sEH, genIC,
  };
}

/** 제자리 1차원 FFT (길이는 2의 거듭제곱). inv = true면 역변환(정규화 안 함) */
export function fft1(re: Float64Array, im: Float64Array, inv: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = 2 * Math.PI / len * (inv ? 1 : -1), wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const p = i + k, q = p + half;
        const br = re[q] * cr - im[q] * ci, bi = re[q] * ci + im[q] * cr;
        re[q] = re[p] - br; im[q] = im[p] - bi;
        re[p] += br; im[p] += bi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/** n³ 격자의 3차원 FFT (축마다 1차원 FFT) */
export function fft3(re: Float64Array, im: Float64Array, n: number, inv: boolean): void {
  const lr = new Float64Array(n), li = new Float64Array(n), strides = [1, n, n * n];
  for (let a = 0; a < 3; a++) {
    const s = strides[a];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const base = a === 0 ? (i * n + j) * n : a === 1 ? i * n * n + j : i * n + j;
      for (let k = 0; k < n; k++) { lr[k] = re[base + k * s]; li[k] = im[base + k * s]; }
      fft1(lr, li, inv);
      for (let k = 0; k < n; k++) { re[base + k * s] = lr[k]; im[base + k * s] = li[k]; }
    }
  }
}
