// 국부 은하군의 미래: 우리 은하(MW), 안드로메다(M31), 대마젤란은하(LMC)를 헤르퀴스트 헤일로를 가진 천체로 보고
// 서로의 중력 + 찬드라세카르 역학적 마찰로 적분한다. 관측 불확실성(질량, M31의 접선 속도·거리)을 무작위로 바꿔 수백 번
// 돌려(몬테카를로) 병합 확률을 낸다. 비교: Sawala 외 (2025) — 100억 년 안에 MW–M31 병합 확률 약 50%,
// van der Marel 외 (2019) — M31 접선 속도 57 (+35/−31) km/s, Cautun 외 (2019) — LMC는 약 25억 년 뒤 우리 은하와 병합.
import { rng, gauss, type Rng } from "../shared/math";

const G = 4.30091e-6; // kpc (km/s)² / M☉
const KMS_KPC_GYR = 1.02271; // 1 km/s = 1.0227 kpc/Gyr
const DT = 0.002; // Gyr
const T_END = 14; // Gyr

/** 태양 중심 은하 좌표 (l, b, d[kpc]) → 은하 중심 좌표 [kpc] (태양 R0 = 8.178, z☉ = 0.0208) */
function gc(l: number, b: number, d: number): number[] {
  const L = l * Math.PI / 180, B = b * Math.PI / 180;
  return [d * Math.cos(B) * Math.cos(L) - 8.178, d * Math.cos(B) * Math.sin(L), d * Math.sin(B) + 0.0208];
}

interface Body { name: string; M: number; a: number; x: number[]; v: number[]; alive: boolean }

export interface LGParams { mMW: number; mM31: number; mLMC: number; vTan: number; tanAngle: number; dM31: number; vRad: number }
export const LG_BEST: LGParams = { mMW: 1.15e12, mM31: 1.5e12, mLMC: 1.38e11, vTan: 57, tanAngle: 0, dM31: 770, vRad: -109.3 };

export interface LGTrack {
  t: Float32Array;
  /** 우리 은하 중심 기준 M31·LMC 위치 [kpc] (병합 뒤에는 병합체 위치) */
  m31: Float32Array; lmc: Float32Array;
  sep: Float32Array;
  mergeM31: number | null; mergeLMC: number | null;
  firstPeri: number | null;
}

function hernquistRho(M: number, a: number, r: number): number { return M * a / (2 * Math.PI * Math.max(r, 0.1) * Math.pow(r + a, 3)); }
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

export function runLocalGroup(p: LGParams, keepTrack = true): LGTrack {
  // M31: 은하 중심 방향 시선 속도 v_rad, 접선 속도 v_tan (방향은 van der Marel 외 2012의 접선 성분을 tanAngle만큼 돌림)
  const xm = gc(121.17, -21.57, p.dM31), r = Math.hypot(xm[0], xm[1], xm[2]), rh = xm.map((c) => c / r);
  const ref = [66.1, -76.3, 45.1], dot = ref[0] * rh[0] + ref[1] * rh[1] + ref[2] * rh[2];
  let t1 = ref.map((c, k) => c - dot * rh[k]);
  const tl = Math.hypot(t1[0], t1[1], t1[2]); t1 = t1.map((c) => c / tl);
  const t2 = [rh[1] * t1[2] - rh[2] * t1[1], rh[2] * t1[0] - rh[0] * t1[2], rh[0] * t1[1] - rh[1] * t1[0]];
  const ca = Math.cos(p.tanAngle), sa = Math.sin(p.tanAngle);
  const vM31 = rh.map((c, k) => p.vRad * c + p.vTan * (ca * t1[k] + sa * t2[k]));
  const bodies: Body[] = [
    { name: "MW", M: p.mMW, a: 28, x: [0, 0, 0], v: [0, 0, 0], alive: true },
    { name: "M31", M: p.mM31, a: 32, x: xm, v: vM31, alive: true },
    { name: "LMC", M: p.mLMC, a: 15, x: gc(280.47, -32.89, 49.6), v: [-57, -226, 221], alive: true },
  ];
  const nT = Math.round(T_END / DT), every = 10, nS = Math.floor(nT / every) + 1;
  const tr: LGTrack = { t: new Float32Array(keepTrack ? nS : 0), m31: new Float32Array(keepTrack ? 3 * nS : 0), lmc: new Float32Array(keepTrack ? 3 * nS : 0), sep: new Float32Array(keepTrack ? nS : 0), mergeM31: null, mergeLMC: null, firstPeri: null };
  const acc = () => {
    const A = bodies.map(() => [0, 0, 0]);
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const bi = bodies[i], bj = bodies[j];
      if (!bi.alive || !bj.alive) continue;
      const d = [bj.x[0] - bi.x[0], bj.x[1] - bi.x[1], bj.x[2] - bi.x[2]], rr = Math.hypot(d[0], d[1], d[2]) + 1e-6, soft = Math.hypot(bi.a, bj.a) * 0.5;
      const f = G / (rr * (rr + soft) * (rr + soft));
      for (let k = 0; k < 3; k++) { A[i][k] += f * bj.M * d[k]; A[j][k] -= f * bi.M * d[k]; }
      // 역학적 마찰: 가벼운 쪽이 무거운 쪽 헤일로 안(약 300 kpc)에서 느려짐, 반작용은 무거운 쪽에
      const [hv, lt, sgn] = bi.M >= bj.M ? [bi, bj, 1] : [bj, bi, -1];
      if (rr < 300) {
        const dv = [lt.v[0] - hv.v[0], lt.v[1] - hv.v[1], lt.v[2] - hv.v[2]], V = Math.hypot(dv[0], dv[1], dv[2]) + 1e-3;
        const vc2 = G * hv.M * rr / Math.pow(rr + hv.a, 2), sigma = Math.sqrt(vc2 / 2), X = V / (Math.SQRT2 * sigma);
        const fac = 4 * Math.PI * G * G * lt.M * hernquistRho(hv.M, hv.a, rr) * 3 / (V * V) * (erf(X) - 2 * X / Math.sqrt(Math.PI) * Math.exp(-X * X)) / V;
        const li = sgn > 0 ? j : i, hi = sgn > 0 ? i : j;
        for (let k = 0; k < 3; k++) { A[li][k] -= fac * dv[k]; A[hi][k] += fac * dv[k] * lt.M / hv.M; }
      }
    }
    return A;
  };
  const toKpc = KMS_KPC_GYR;
  let A = acc(), prevSep = Infinity, prevD = 0;
  for (let s = 0; s <= nT; s++) {
    const t = s * DT;
    const mw = bodies[0];
    if (keepTrack && s % every === 0) {
      const k = s / every;
      tr.t[k] = t;
      for (let c = 0; c < 3; c++) {
        tr.m31[3 * k + c] = (bodies[1].alive ? bodies[1].x[c] : mw.x[c]) - mw.x[c];
        tr.lmc[3 * k + c] = (bodies[2].alive ? bodies[2].x[c] : mw.x[c]) - mw.x[c];
      }
    }
    const sepNow = bodies[1].alive ? Math.hypot(bodies[1].x[0] - mw.x[0], bodies[1].x[1] - mw.x[1], bodies[1].x[2] - mw.x[2]) : 0;
    if (keepTrack && s % every === 0) tr.sep[s / every] = sepNow;
    if (tr.firstPeri === null && bodies[1].alive && sepNow > prevSep && prevD < 0) tr.firstPeri = t - DT;
    prevD = sepNow - prevSep; prevSep = sepNow;
    // 병합 판정: 15 kpc 안에서 상대 속도 < 120 km/s → 하나로 합침
    for (const idx of [1, 2]) {
      const b = bodies[idx];
      if (!b.alive) continue;
      const host = mw;
      const d = Math.hypot(b.x[0] - host.x[0], b.x[1] - host.x[1], b.x[2] - host.x[2]), dv = Math.hypot(b.v[0] - host.v[0], b.v[1] - host.v[1], b.v[2] - host.v[2]);
      if (d < 15 && dv < 120) {
        const Mt = host.M + b.M;
        for (let c = 0; c < 3; c++) { host.x[c] = (host.x[c] * host.M + b.x[c] * b.M) / Mt; host.v[c] = (host.v[c] * host.M + b.v[c] * b.M) / Mt; }
        host.M = Mt; host.a = Math.hypot(host.a, b.a); b.alive = false;
        if (idx === 1) tr.mergeM31 = t; else tr.mergeLMC = t;
      }
    }
    // 도약 적분 (kick-drift-kick)
    for (let i = 0; i < 3; i++) for (let c = 0; c < 3; c++) bodies[i].v[c] += 0.5 * DT * A[i][c] * toKpc;
    for (let i = 0; i < 3; i++) for (let c = 0; c < 3; c++) bodies[i].x[c] += DT * bodies[i].v[c] * toKpc;
    A = acc();
    for (let i = 0; i < 3; i++) for (let c = 0; c < 3; c++) bodies[i].v[c] += 0.5 * DT * A[i][c] * toKpc;
    if (!keepTrack && tr.mergeM31 !== null && tr.mergeLMC !== null) break;
  }
  return tr;
}

// 단위: 가속도 G·M/r² 는 (km/s)²/kpc 이고, 여기에 Gyr를 곱하면 (km/s)·(km/s·Gyr/kpc) = 1.0227 km/s 이므로 dv = a·dt·1.0227

export interface LGForecast {
  best: LGTrack;
  runs: number;
  pMerge5: number; pMerge10: number;
  mergeTimes: number[];
  pLMC: number; lmcMedian: number | null;
}

/** 관측 불확실성 몬테카를로 */
export function forecastLocalGroup(n = 200, seed = 2025): LGForecast {
  const r: Rng = rng(seed), times: number[] = [], lmcT: number[] = [];
  const pos = (m: number, s: number) => Math.max(m * 0.3, m + s * gauss(r));
  for (let k = 0; k < n; k++) {
    const p: LGParams = {
      mMW: pos(1.15e12, 0.3e12), mM31: pos(1.5e12, 0.4e12), mLMC: pos(1.38e11, 0.25e11),
      vTan: Math.max(0, 57 + 33 * gauss(r)), tanAngle: (r() - 0.5) * 1.6, dM31: 770 + 25 * gauss(r), vRad: -109.3 + 4.4 * gauss(r),
    };
    const t = runLocalGroup(p, false);
    times.push(t.mergeM31 ?? Infinity);
    lmcT.push(t.mergeLMC ?? Infinity);
  }
  const sorted = [...lmcT].filter(isFinite).sort((a, b) => a - b);
  return {
    best: runLocalGroup(LG_BEST, true), runs: n,
    pMerge5: times.filter((t) => t <= 5).length / n, pMerge10: times.filter((t) => t <= 10).length / n,
    mergeTimes: times, pLMC: lmcT.filter((t) => t <= 10).length / n, lmcMedian: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
  };
}

/** 궤적에서 t[Gyr]의 값 (선형 보간) */
export function trackAt(tr: LGTrack, which: "m31" | "lmc", tGyr: number): [number, number, number] {
  const n = tr.t.length;
  if (!n) return [0, 0, 0];
  const u = Math.max(0, Math.min(n - 1.001, tGyr / (tr.t[1] - tr.t[0]))), i = Math.floor(u), w = u - i, arr = tr[which];
  return [0, 1, 2].map((c) => arr[3 * i + c] * (1 - w) + arr[3 * (i + 1) + c] * w) as [number, number, number];
}
