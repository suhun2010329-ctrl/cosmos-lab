// 라플라스–라그랑주 영년 섭동 이론 (Murray & Dermott 1999, 7장): 행성들이 서로 당겨 궤도의 이심률 e·근일점 경도 ϖ,
// 궤도 경사 i·승교점 경도 Ω가 수만~수백만 년에 걸쳐 천천히 바뀌는 것을 고유 모드의 합으로 푼다.
// 지구 이심률의 약 10만 년·40만 년 주기(밀란코비치 주기)가 여기서 나온다. 수성에는 일반 상대성 근일점 이동을 더한다.
// 선형 이론이라 정확도는 수 % 수준이고, 태양계는 혼돈계라 약 5천만 년 너머는 어떤 이론으로도 정확히 예측할 수 없다 (Laskar 1989).
import { PLANETS } from "./catalog";

const DEG = Math.PI / 180, ARCSEC = Math.PI / 180 / 3600;
/** 행성 질량 [M☉] (지구는 달 포함) */
const MASS = [1.6601e-7, 2.4478e-6, 3.0404e-6, 3.2272e-7, 9.5479e-4, 2.8589e-4, 4.3662e-5, 5.1514e-5];
/** 일반 상대성 근일점 이동 ["/년] */
const GR = [0.4298, 0.0862, 0.0384, 0.0135, 0, 0, 0, 0];
export const SECULAR_LIMIT_YEARS = 5e7;

/** 라플라스 계수 b_s^(j)(α) = (1/π) ∫₀^2π cos(jψ) / (1 − 2α cos ψ + α²)^s dψ */
function laplace(s: number, j: number, a: number): number {
  const n = 720;
  let sum = 0;
  for (let k = 0; k < n; k++) {
    const psi = (k + 0.5) * 2 * Math.PI / n;
    sum += Math.cos(j * psi) / Math.pow(1 - 2 * a * Math.cos(psi) + a * a, s);
  }
  return sum * 2 / n;
}

/** 대칭 행렬 고유값 분해 (야코비 회전) */
function jacobi(S: number[][]): { val: number[]; vec: number[][] } {
  const n = S.length, A = S.map((r) => r.slice()), V: number[][] = S.map((_, i) => S.map((__, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
    if (off < 1e-40) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = 0.5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]), c = Math.cos(th), s = Math.sin(th);
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  return { val: A.map((r, i) => r[i]), vec: V };
}

interface Modes { freq: number[]; amp: number[][]; phase: number[] }

function solveModes(M: number[][], x0: number[], y0: number[], lam: number[]): Modes {
  // 비대칭 행렬 M을 D M D⁻¹ (D = diag(√Λ_j), Λ_j = m_j √a_j) 로 대칭화해서 푼다
  const n = M.length, d = lam.map(Math.sqrt);
  const S = M.map((r, i) => r.map((v, j) => d[i] * v / d[j]));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const m = 0.5 * (S[i][j] + S[j][i]); S[i][j] = S[j][i] = m; }
  const { val, vec } = jacobi(S);
  // M의 고유벡터 = D⁻¹ × S의 고유벡터
  const E = vec.map((r, i) => r.map((v) => v / d[i]));
  // 초기 조건: x0 = E c, y0 = E s  →  E는 D⁻¹V, 역행렬은 Vᵀ D
  const c = val.map((_, k) => vec.reduce((s, r, i) => s + r[k] * d[i] * x0[i], 0));
  const s = val.map((_, k) => vec.reduce((acc, r, i) => acc + r[k] * d[i] * y0[i], 0));
  const amp = E.map((r) => r.map((v, k) => v * Math.hypot(c[k], s[k])));
  const phase = val.map((_, k) => Math.atan2(c[k], s[k]));
  return { freq: val, amp, phase };
}

export interface Secular {
  /** 고유 진동수 g_i, s_i ["/년] */
  g: number[]; s: number[];
  at(years: number): { e: number[]; peri: number[]; i: number[]; node: number[] };
}

export function buildSecular(): Secular {
  const P = PLANETS.slice(0, 8), n = 8;
  const a = P.map((p) => p.a), nn = a.map((x) => 2 * Math.PI / Math.pow(x, 1.5)); // rad/년
  const A = Array.from({ length: n }, () => new Array(n).fill(0)), B = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
    if (j === k) continue;
    const inner = a[j] < a[k], al = inner ? a[j] / a[k] : a[k] / a[j], alb = inner ? al : 1;
    const f = nn[j] / 4 * MASS[k] / (1 + MASS[j]) * al * alb;
    const b1 = laplace(1.5, 1, al), b2 = laplace(1.5, 2, al);
    A[j][j] += f * b1; A[j][k] = -f * b2;
    B[j][j] -= f * b1; B[j][k] = f * b1;
  }
  for (let j = 0; j < n; j++) A[j][j] += GR[j] * ARCSEC;
  const lam = a.map((x, j) => MASS[j] * Math.sqrt(x));
  const e0 = P.map((p) => p.e), w0 = P.map((p) => p.peri * DEG), i0 = P.map((p) => p.i * DEG), O0 = P.map((p) => p.node * DEG);
  // h = e sin ϖ, k = e cos ϖ ;  p = i sin Ω, q = i cos Ω
  const ecc = solveModes(A, e0.map((e, j) => e * Math.sin(w0[j])), e0.map((e, j) => e * Math.cos(w0[j])), lam);
  const inc = solveModes(B, i0.map((x, j) => x * Math.sin(O0[j])), i0.map((x, j) => x * Math.cos(O0[j])), lam);
  const evalModes = (m: Modes, t: number) => {
    const x = new Array(n).fill(0), y = new Array(n).fill(0);
    for (let k = 0; k < n; k++) {
      const ph = m.freq[k] * t + m.phase[k], sn = Math.sin(ph), cs = Math.cos(ph);
      for (let j = 0; j < n; j++) { x[j] += m.amp[j][k] * sn; y[j] += m.amp[j][k] * cs; }
    }
    return { x, y };
  };
  return {
    g: ecc.freq.map((f) => f / ARCSEC), s: inc.freq.map((f) => f / ARCSEC),
    at(t: number) {
      const E = evalModes(ecc, t), I = evalModes(inc, t);
      return {
        e: E.x.map((h, j) => Math.hypot(h, E.y[j])),
        peri: E.x.map((h, j) => ((Math.atan2(h, E.y[j]) / DEG) % 360 + 360) % 360),
        i: I.x.map((p, j) => Math.hypot(p, I.y[j]) / DEG),
        node: I.x.map((p, j) => ((Math.atan2(p, I.y[j]) / DEG) % 360 + 360) % 360),
      };
    },
  };
}
