// N-body 작업자: 젤도비치 초기 조건(z = 99) → 입자-메시(PM) 중력, KDK 도약 적분.
// 끝나면 은하 별질량 함수(Baldry 2012)로 은하 목록을 만들어 입자에 붙인다.
import { createCosmology, fft3, type ModelName } from "../shared/cosmology";
import { rng } from "../shared/math";
import type { WorkerOut } from "./messages";

const ctx = self as unknown as { postMessage(m: WorkerOut, transfer?: Transferable[]): void; onmessage: ((ev: MessageEvent) => void) | null };

ctx.onmessage = (ev: MessageEvent<{ model: ModelName; seed: number }>) => {
  const core = createCosmology(ev.data);
  const L = 100, n = 32, N = n * n * n, NM = 64, M3 = NM * NM * NM;
  const psi = core.genIC(L, n, ev.data.seed);
  ctx.postMessage({ type: "ic", psi });

  const aI = 0.01, laI = -2, DI = core.growth(laI), fI = core.growthF(laI), EI = core.E(aI);
  const x = new Float64Array(3 * N), p = new Float64Array(3 * N), q = new Float64Array(3 * N), acc = new Float64Array(3 * N);
  const densP = new Float64Array(N), dens1 = new Float64Array(N);
  let best1 = 1e9;
  for (let zz = 0; zz < n; zz++) for (let yy = 0; yy < n; yy++) for (let xx = 0; xx < n; xx++) {
    const id = (zz * n + yy) * n + xx;
    q[3 * id] = (xx + 0.5) / n; q[3 * id + 1] = (yy + 0.5) / n; q[3 * id + 2] = (zz + 0.5) / n;
  }
  for (let i = 0; i < 3 * N; i++) { x[i] = q[i] + DI * psi[i]; p[i] = aI * aI * fI * DI * EI * psi[i]; }

  const rho = new Float64Array(M3), im = new Float64Array(M3);
  const gx = new Float64Array(M3), gy = new Float64Array(M3), gz = new Float64Array(M3);
  const Om = core.Om, TWO_PI2 = 4 * Math.PI * Math.PI;
  const ci = new Int32Array(8 * N), cw = new Float64Array(8 * N);

  // 구름-격자(CIC) 가중치: 입자마다 주변 8칸과 가중치
  function cicWeights(): void {
    for (let i = 0; i < N; i++) {
      const u = x[3 * i] - Math.floor(x[3 * i]), v = x[3 * i + 1] - Math.floor(x[3 * i + 1]), w = x[3 * i + 2] - Math.floor(x[3 * i + 2]);
      const gxp = u * NM - 0.5, gyp = v * NM - 0.5, gzp = w * NM - 0.5;
      const ix = Math.floor(gxp), iy = Math.floor(gyp), iz = Math.floor(gzp);
      const fx = gxp - ix, fy = gyp - iy, fz = gzp - iz;
      const x0 = (ix + NM) % NM, x1 = (ix + 1) % NM, y0 = (iy + NM) % NM, y1 = (iy + 1) % NM, z0 = (iz + NM) % NM, z1 = (iz + 1) % NM;
      const o = 8 * i;
      ci[o] = (z0 * NM + y0) * NM + x0; cw[o] = (1 - fx) * (1 - fy) * (1 - fz);
      ci[o + 1] = (z0 * NM + y0) * NM + x1; cw[o + 1] = fx * (1 - fy) * (1 - fz);
      ci[o + 2] = (z0 * NM + y1) * NM + x0; cw[o + 2] = (1 - fx) * fy * (1 - fz);
      ci[o + 3] = (z0 * NM + y1) * NM + x1; cw[o + 3] = fx * fy * (1 - fz);
      ci[o + 4] = (z1 * NM + y0) * NM + x0; cw[o + 4] = (1 - fx) * (1 - fy) * fz;
      ci[o + 5] = (z1 * NM + y0) * NM + x1; cw[o + 5] = fx * (1 - fy) * fz;
      ci[o + 6] = (z1 * NM + y1) * NM + x0; cw[o + 6] = (1 - fx) * fy * fz;
      ci[o + 7] = (z1 * NM + y1) * NM + x1; cw[o + 7] = fx * fy * fz;
    }
  }

  // 밀도 → FFT 푸아송 풀이 → 4차 유한 차분 기울기 → CIC로 입자에 되돌림
  function force(): void {
    cicWeights();
    rho.fill(0); im.fill(0);
    const mass = M3 / N;
    for (let i = 0; i < 8 * N; i++) rho[ci[i]] += mass * cw[i];
    for (let i = 0; i < N; i++) {
      let s = 0;
      const o = 8 * i;
      for (let m = 0; m < 8; m++) s += cw[o + m] * rho[ci[o + m]];
      densP[i] = s;
    }
    for (let k = 0; k < M3; k++) rho[k] -= 1;
    fft3(rho, im, NM, false);
    for (let z = 0; z < NM; z++) for (let y = 0; y < NM; y++) for (let xq = 0; xq < NM; xq++) {
      const k = (z * NM + y) * NM + xq;
      const fx = xq < NM / 2 ? xq : xq - NM, fy = y < NM / 2 ? y : y - NM, fz = z < NM / 2 ? z : z - NM;
      const k2 = TWO_PI2 * (fx * fx + fy * fy + fz * fz);
      const g = k2 ? -1.5 * Om / k2 / M3 : 0;
      rho[k] *= g; im[k] *= g;
    }
    fft3(rho, im, NM, true);
    const c12 = NM / 12;
    for (let z = 0; z < NM; z++) {
      const zp = ((z + 1) % NM) * NM * NM, zm = ((z - 1 + NM) % NM) * NM * NM, zp2 = ((z + 2) % NM) * NM * NM, zm2 = ((z - 2 + NM) % NM) * NM * NM, z0 = z * NM * NM;
      for (let y = 0; y < NM; y++) {
        const yp = ((y + 1) % NM) * NM, ym = ((y - 1 + NM) % NM) * NM, yp2 = ((y + 2) % NM) * NM, ym2 = ((y - 2 + NM) % NM) * NM, y0 = y * NM;
        for (let xq = 0; xq < NM; xq++) {
          const xp = (xq + 1) % NM, xm = (xq - 1 + NM) % NM, xp2 = (xq + 2) % NM, xm2 = (xq - 2 + NM) % NM;
          const k = z0 + y0 + xq;
          gx[k] = (8 * (rho[z0 + y0 + xp] - rho[z0 + y0 + xm]) - (rho[z0 + y0 + xp2] - rho[z0 + y0 + xm2])) * c12;
          gy[k] = (8 * (rho[z0 + yp + xq] - rho[z0 + ym + xq]) - (rho[z0 + yp2 + xq] - rho[z0 + ym2 + xq])) * c12;
          gz[k] = (8 * (rho[zp + y0 + xq] - rho[zm + y0 + xq]) - (rho[zp2 + y0 + xq] - rho[zm2 + y0 + xq])) * c12;
        }
      }
    }
    for (let i = 0; i < N; i++) {
      let ax = 0, ay = 0, az = 0;
      const o2 = 8 * i;
      for (let m = 0; m < 8; m++) { const c = ci[o2 + m], w = cw[o2 + m]; ax += w * gx[c]; ay += w * gy[c]; az += w * gz[c]; }
      acc[3 * i] = -ax; acc[3 * i + 1] = -ay; acc[3 * i + 2] = -az;
    }
  }

  // 심프슨 적분 (변수 ln a)
  function integ(fn: (a: number) => number, a0: number, a1: number): number {
    const m = 16, l0 = Math.log(a0), d = (Math.log(a1) - l0) / m;
    let s = 0;
    for (let j = 0; j <= m; j++) s += (j === 0 || j === m ? 1 : j % 2 ? 4 : 2) * fn(Math.exp(l0 + j * d));
    return s * d / 3;
  }
  const kickF = (a: number) => 1 / (a * core.E(a));
  const driftF = (a: number) => 1 / (a * a * core.E(a));

  // 스냅숏: 변위는 Int16(1/8192 상자 단위), 밀도는 log 눈금 8비트로 압축해 보냄
  function snap(s: number, a: number): void {
    const d = new Int16Array(3 * N), dq = new Uint8Array(N);
    for (let k = 0; k < 3 * N; k++) d[k] = Math.max(-32767, Math.min(32767, Math.round((x[k] - q[k]) * 8192)));
    for (let k = 0; k < N; k++) dq[k] = Math.max(0, Math.min(255, Math.round((Math.log10(Math.max(densP[k], 0.1)) + 1) / 3.5 * 255)));
    const la = Math.log10(a);
    if (Math.abs(la) < best1) { best1 = Math.abs(la); dens1.set(densP); }
    ctx.postMessage({ type: "snap", i: s, la, d, q: dq }, [d.buffer, dq.buffer]);
  }

  const NS = 96, l0 = Math.log(aI), l1 = core.LA_MAX * Math.LN10, dl = (l1 - l0) / NS;
  force();
  snap(0, aI);
  for (let s = 0; s < NS; s++) {
    const a0 = Math.exp(l0 + s * dl), a1 = Math.exp(l0 + (s + 1) * dl), ah = Math.sqrt(a0 * a1);
    const k1 = integ(kickF, a0, ah), dr = integ(driftF, a0, a1), k2 = integ(kickF, ah, a1);
    for (let i = 0; i < 3 * N; i++) p[i] += acc[i] * k1;
    for (let i = 0; i < 3 * N; i++) x[i] += p[i] * dr;
    force();
    for (let i = 0; i < 3 * N; i++) p[i] += acc[i] * k2;
    snap(s + 1, a1);
  }
  ctx.postMessage({ type: "done" });

  // ---- 은하 목록 (부분격자 모형) ----
  const r = rng((ev.data.seed ^ 0x9e3779b9) >>> 0);
  const gs = () => { const u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  // Baldry et al. (2012) 이중 셰히터 별질량 함수 [Mpc⁻³ dex⁻¹]
  const LMS = 10.66, p1 = 3.96e-3, a1s = -0.35, p2 = 0.79e-3, a2s = -1.47;
  const phi = (lm: number) => { const xx = Math.pow(10, lm - LMS); return Math.LN10 * Math.exp(-xx) * (p1 * Math.pow(xx, a1s + 1) + p2 * Math.pow(xx, a2s + 1)); };
  const LM0 = 8, LM1 = 12.2, NB = 840, dlm = (LM1 - LM0) / NB, cdf = new Float64Array(NB + 1);
  for (let i = 0; i < NB; i++) cdf[i + 1] = cdf[i] + phi(LM0 + (i + 0.5) * dlm) * dlm;
  const V = Math.pow(L / core.h, 3), G = Math.min(150000, Math.round(cdf[NB] * V));
  // 무거운 은하일수록 빽빽한 곳(높은 밀도 가중치 ρ^β)에 놓임
  const betas = [0.6, 0.9, 1.2, 1.5, 1.9];
  const hostCdf = betas.map((b) => {
    const c = new Float64Array(N + 1);
    for (let k = 0; k < N; k++) c[k + 1] = c[k] + Math.pow(Math.max(dens1[k], 0.05), b);
    return c;
  });
  const search = (c: Float64Array, len: number, t: number) => {
    let lo = 0, hi = len;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= t) lo = m; else hi = m; }
    return lo;
  };
  const host = new Int32Array(G), off = new Float32Array(3 * G), GP = new Float32Array(8 * G), nrm = new Float32Array(3 * G);
  for (let gi = 0; gi < G; gi++) {
    const t = r() * cdf[NB], j = search(cdf, NB, t);
    const lm = LM0 + (j + (t - cdf[j]) / Math.max(1e-30, cdf[j + 1] - cdf[j])) * dlm;
    const bin = cl(Math.floor((lm - 8) / 0.8), 0, 4), hc = hostCdf[bin];
    const hh = search(hc, N, r() * hc[N]);
    host[gi] = hh;
    const sg = 0.0035 * (lm > 10.8 ? 0.35 : 0.5 + 0.5 * r());
    off[3 * gi] = gs() * sg; off[3 * gi + 1] = gs() * sg; off[3 * gi + 2] = gs() * sg;
    // 별 형성 정지 확률: 질량 + 환경 (Peng et al. 2010)
    const rh = Math.max(dens1[hh], 0.05);
    const fq = 1 - Math.exp(-Math.pow(rh / 25, 0.6) - Math.pow(Math.pow(10, lm - 10.56), 0.8));
    const quen = r() < fq;
    const zq = quen ? (0.25 + 2.3 * cl((lm - 9) / 2.5, 0, 1)) * (0.6 + 0.8 * r()) : -1;
    const tq = lm > 10.8 ? (r() < 0.7 ? 0 : 1) : lm > 9.3 ? (r() < 0.45 ? 0 : 1) : 2;
    // GP: [log M*(오늘), 밀도 기울기, 정지 z, 정지 형태, 왜소 여부, 축비, 씨앗, 번호]
    const o = 8 * gi;
    GP[o] = lm; GP[o + 1] = cl(1.5 - 0.22 * (lm - 8), 0.6, 1.5); GP[o + 2] = zq; GP[o + 3] = tq;
    GP[o + 4] = lm > 9.2 ? 0 : 1; GP[o + 5] = 0.55 + 0.4 * r(); GP[o + 6] = r(); GP[o + 7] = gi;
    const cz = 2 * r() - 1, ph = 2 * Math.PI * r(), sz = Math.sqrt(1 - cz * cz);
    nrm[3 * gi] = sz * Math.cos(ph); nrm[3 * gi + 1] = sz * Math.sin(ph); nrm[3 * gi + 2] = cz;
  }
  ctx.postMessage({ type: "gal", G, host, off, GP, nrm }, [host.buffer, off.buffer, GP.buffer, nrm.buffer]);
};
