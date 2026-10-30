// 2차원 단면용 젤도비치 변위장. 3차원 선형 이론의 한 성분 rms 변위에 맞춰 크기를 정한다.
import { fft1, type Cosmology } from "../shared/cosmology";
import { gauss, rng } from "../shared/math";

function fft2(re: Float64Array, im: Float64Array, n: number, inv: boolean): void {
  const lr = new Float64Array(n), li = new Float64Array(n);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < n; k++) {
        const idx = pass === 0 ? i * n + k : k * n + i;
        lr[k] = re[idx]; li[k] = im[idx];
      }
      fft1(lr, li, inv);
      for (let k = 0; k < n; k++) {
        const idx = pass === 0 ? i * n + k : k * n + i;
        re[idx] = lr[k]; im[idx] = li[k];
      }
    }
  }
}

/**
 * 1차원 rms 젤도비치 변위 σψ [Mpc/h] (오늘, 상자에 들어가는 파수만):
 * σψ² = 1/(6π²) ∫ P(k) dk,  2π/L < k < π n / L
 */
export function sigmaPsi(core: Cosmology, L: number, n: number): number {
  const k0 = 2 * Math.PI / L, k1 = Math.PI * n / L, m = 600, l0 = Math.log(k0), dl = (Math.log(k1) - l0) / m;
  let s = 0;
  for (let i = 0; i <= m; i++) {
    const k = Math.exp(l0 + i * dl);
    s += (i === 0 || i === m ? 0.5 : 1) * core.Pk(k) * k;
  }
  return Math.sqrt(s * dl / (6 * Math.PI * Math.PI));
}

/** n×n 격자 입자의 변위 ψ (상자 길이 단위, [ψx, ψy] 교대로) */
export function genIC2D(core: Cosmology, L: number, n: number, seed: number): Float32Array {
  const r = rng(seed), N2 = n * n, dr = new Float64Array(N2), di = new Float64Array(N2);
  for (let i = 0; i < N2; i++) dr[i] = gauss(r);
  fft2(dr, di, n, false);
  const kf = 2 * Math.PI / L, out = new Float32Array(2 * N2);
  const re = new Float64Array(N2), im = new Float64Array(N2);
  const target = sigmaPsi(core, L, n) / L;
  for (let c = 0; c < 2; c++) {
    re.fill(0); im.fill(0);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (x === n / 2 || y === n / 2) continue;
      const fx = x < n / 2 ? x : x - n, fy = y < n / 2 ? y : y - n, k2n = fx * fx + fy * fy;
      if (!k2n) continue;
      const k = kf * Math.sqrt(k2n), idx = y * n + x;
      // ψ(k) = i k/k² δ(k),  δ(k) ∝ √P(k) × 백색 잡음
      const f = Math.sqrt(core.Pk(k)) * (c === 0 ? fx : fy) * kf / (k * k);
      re[idx] = -f * di[idx]; im[idx] = f * dr[idx];
    }
    fft2(re, im, n, true);
    let ss = 0;
    for (let i = 0; i < N2; i++) ss += re[i] * re[i];
    const scale = target / Math.sqrt(ss / N2 || 1);
    for (let i = 0; i < N2; i++) out[2 * i + c] = re[i] * scale;
  }
  return out;
}
