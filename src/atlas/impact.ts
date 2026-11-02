// 픽셀 천체 충돌 시뮬레이션. 천체를 같은 크기의 ‘픽셀’(입자) 수천 개로 쌓고, 픽셀마다 실제 층 구조에 따른 물질과 원소를 준다.
// 힘: 자체 중력 (Barnes–Hut 팔진 트리, θ = 0.7, 플러머 완화) + 맞닿은 픽셀끼리 스프링–감쇠 접촉력 (이산 요소법).
// 접촉에서 잃은 운동 에너지는 열로 픽셀에 쌓여 온도가 오른다. 큰 행성은 고정된 점질량으로 둘 수 있다 (조석 붕괴).
// 이 방식은 SPH만큼 정밀하지 않지만, 거대 충돌의 원반 형성·조석 붕괴 같은 큰 그림은 같은 결론을 낸다 (Asphaug & Benz 1994; Canup 2004).
import { bulkComposition, ELEMENTS, sampleElement, type Composition, type El } from "./composition";

export const G_SI = 6.674e-11;

export interface BodySpec {
  name: string;
  comp: Composition;
  /** 질량 [kg], 반지름 [m] */
  M: number; R: number;
  /** 픽셀 수 (대략) */
  n: number;
  /** 처음 위치 [m], 속도 [m/s] (질량 중심 기준 관성계) */
  pos: [number, number, number]; vel: [number, number, number];
  /** z축 둘레 자전 [rad/s] */
  spin?: number;
}
export interface FixedBody { name: string; comp: Composition; M: number; R: number }
export interface ImpactSetup {
  key: string;
  bodies: BodySpec[];
  /** 가운데 고정된 큰 행성 (픽셀이 그 안으로 들어가면 흡수) */
  fixed?: FixedBody;
  /** 계산할 시간 [s] */
  duration: number;
  /** 화면이 따라갈 대상: 질량 중심(-1) 또는 천체 번호 */
  follow: number;
  /** 정지 상태로 단면만 보기 */
  still?: boolean;
}

/** 계산 단위: 길이 L, 질량 Mu, G = 1 → 시간 T = √(L³ / G Mu) */
export interface Units { L: number; Mu: number; T: number; E: number }
function unitsFor(s: ImpactSetup): Units {
  const big = s.bodies.reduce((a, b) => (b.M > a.M ? b : a));
  const L = s.fixed && !s.still ? Math.max(big.R, 1) : big.R, Mu = s.fixed ? s.fixed.M : s.bodies.reduce((a, b) => a + b.M, 0);
  const T = Math.sqrt(L ** 3 / (G_SI * Mu));
  return { L, Mu, T, E: G_SI * Mu / L };
}

/** 픽셀들 (계산 단위) */
export interface Particles {
  n: number;
  x: Float64Array; v: Float64Array; a: Float64Array;
  m: Float64Array; r: Float64Array;
  /** 쌓인 열 (단위 질량당 에너지, 계산 단위) */
  u: Float64Array;
  body: Uint8Array; layer: Uint16Array; el: Uint8Array;
  /** 0 = 자유, 1 = 고정 행성에 흡수됨 */
  gone: Uint8Array;
  /** 픽셀마다 비열 [J/kg/K], 처음 온도 [K] */
  cv: Float32Array; T0: Float32Array;
}
/** 모든 천체의 층을 한 줄로 (픽셀의 layer 번호가 가리킴) */
export interface LayerRef { body: number; name: string; el: Partial<Record<El, number>>; color: [number, number, number]; phase: string }
export const EL_LIST = Object.keys(ELEMENTS) as El[];

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** 육방 최밀 쌓기 격자로 반지름 R 구를 채움 (픽셀 반지름 rp) */
export function hcpSphere(R: number, rp: number): number[] {
  const out: number[] = [], s = 2 * rp, nz = Math.ceil(R / (s * Math.sqrt(2 / 3))) + 1, ny = Math.ceil(R / (s * Math.sqrt(3) / 2)) + 1, nx = Math.ceil(R / s) + 1;
  for (let k = -nz; k <= nz; k++) for (let j = -ny; j <= ny; j++) for (let i = -nx; i <= nx; i++) {
    const kk = ((k % 2) + 2) % 2, jj = ((j % 2) + 2) % 2;
    const x = s * (i + 0.5 * jj + 0.5 * kk), y = s * (Math.sqrt(3) / 2) * (j + kk / 3), z = s * Math.sqrt(2 / 3) * k;
    if (x * x + y * y + z * z <= (R - rp * 0.5) ** 2) out.push(x, y, z);
  }
  return out;
}

const INIT_T: Record<string, number> = { metal: 4500, rock: 2000, crust: 300, water: 280, ice: 90, gas: 1000, plasma: 6000 };

export interface Built { p: Particles; units: Units; layers: LayerRef[]; k: number; setup: ImpactSetup; bodyN: number[] }

/** 설정 → 픽셀 (계산 단위). 층은 반지름으로, 원소는 층의 비율로 뽑고, 질량은 층 밀도에 비례해 실제 질량에 맞춤 */
export function build(setup: ImpactSetup, seed = 1): Built {
  const units = unitsFor(setup), rnd = rng(seed);
  const xs: number[] = [], ms: number[] = [], rs: number[] = [], bs: number[] = [], ls: number[] = [], els: number[] = [], vs: number[] = [], cvs: number[] = [], t0s: number[] = [];
  const layers: LayerRef[] = [], bodyN: number[] = [];
  let kMax = 0;
  setup.bodies.forEach((b, bi) => {
    const R = b.R / units.L, rp = R * Math.pow(0.74 / b.n, 1 / 3), pts = hcpSphere(R, rp), n = pts.length / 3;
    const l0 = layers.length;
    for (const l of b.comp.layers) layers.push({ body: bi, name: l.name, el: l.el, color: l.color, phase: l.phase });
    const w: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = pts[3 * i], y = pts[3 * i + 1], z = pts[3 * i + 2], fr = Math.hypot(x, y, z) / R;
      // 표면 한 겹은 가장 바깥 층 (지각처럼 얇은 층도 보이게)
      let li = b.comp.layers.findIndex((l) => fr <= l.r);
      if (li < 0 || fr * R > R - 1.6 * rp) li = b.comp.layers.length - 1;
      const L = b.comp.layers[li];
      w.push(L.rho);
      ls.push(l0 + li); els.push(EL_LIST.indexOf(sampleElement(L.el, rnd())));
      // 처음 온도: 큰 천체 속은 뜨겁고 작은 천체는 차가움 (반지름 3000 km 이상이면 층의 대표 온도)
      cvs.push(L.cv); t0s.push(250 + ((INIT_T[L.phase] ?? 300) - 250) * Math.min(1, b.R / 3e6));
      // 처음에 살짝 흔들어 격자 무늬를 깸
      xs.push(x + b.pos[0] / units.L + (rnd() - 0.5) * 0.02 * rp, y + b.pos[1] / units.L + (rnd() - 0.5) * 0.02 * rp, z + b.pos[2] / units.L);
      const om = (b.spin ?? 0) * units.T;
      vs.push(b.vel[0] / units.L * units.T - om * y, b.vel[1] / units.L * units.T + om * x, b.vel[2] / units.L * units.T);
      rs.push(rp); bs.push(bi);
    }
    const sw = w.reduce((a, c) => a + c, 0), Mb = b.M / units.Mu;
    for (const x of w) ms.push(Mb * x / sw);
    // 접촉 강성: 중심 압력 Pc ≈ 0.24·GM²/R⁴ (×2, 중심 집중)을 픽셀 접촉 면적으로 받칠 때 겹침이 픽셀 반지름의 약 12%가 되게
    const Pc = 2 * 0.239 * Mb * Mb / R ** 4;
    kMax = Math.max(kMax, Pc * 4 * rp * rp / (0.12 * rp));
    bodyN.push(n);
  });
  const n = ms.length;
  const p: Particles = {
    n, x: Float64Array.from(xs), v: Float64Array.from(vs), a: new Float64Array(3 * n), m: Float64Array.from(ms), r: Float64Array.from(rs),
    u: new Float64Array(n), body: Uint8Array.from(bs), layer: Uint16Array.from(ls), el: Uint8Array.from(els), gone: new Uint8Array(n),
    cv: Float32Array.from(cvs), T0: Float32Array.from(t0s),
  };
  return { p, units, layers, k: kMax, setup, bodyN };
}

// ---------- 중력: Barnes–Hut 팔진 트리 ----------
export class Octree {
  private cap = 0;
  cx!: Float64Array; cy!: Float64Array; cz!: Float64Array; h!: Float64Array;
  mass!: Float64Array; mx!: Float64Array; my!: Float64Array; mz!: Float64Array;
  child!: Int32Array; leaf!: Int32Array;
  count = 0;
  private ensure(n: number): void {
    if (this.cap >= n) return;
    this.cap = n;
    this.cx = new Float64Array(n); this.cy = new Float64Array(n); this.cz = new Float64Array(n); this.h = new Float64Array(n);
    this.mass = new Float64Array(n); this.mx = new Float64Array(n); this.my = new Float64Array(n); this.mz = new Float64Array(n);
    this.child = new Int32Array(8 * n); this.leaf = new Int32Array(n);
  }
  private node(x: number, y: number, z: number, h: number): number {
    const k = this.count++;
    this.cx[k] = x; this.cy[k] = y; this.cz[k] = z; this.h[k] = h;
    this.mass[k] = 0; this.mx[k] = 0; this.my[k] = 0; this.mz[k] = 0; this.leaf[k] = -1;
    this.child.fill(-1, 8 * k, 8 * k + 8);
    return k;
  }
  build(p: Particles): void {
    this.ensure(Math.max(64, 4 * p.n + 64));
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < p.n; i++) {
      if (p.gone[i]) continue;
      const x = p.x[3 * i], y = p.x[3 * i + 1], z = p.x[3 * i + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    this.count = 0;
    const h = Math.max(x1 - x0, y1 - y0, z1 - z0) * 0.5 * 1.0001 + 1e-12;
    this.node((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, h);
    for (let i = 0; i < p.n; i++) if (!p.gone[i]) this.insert(p, i);
    this.moments(0, p);
  }
  private insert(p: Particles, i: number): void {
    let k = 0, depth = 0;
    const x = p.x[3 * i], y = p.x[3 * i + 1], z = p.x[3 * i + 2];
    for (;;) {
      const q = (x > this.cx[k] ? 1 : 0) + (y > this.cy[k] ? 2 : 0) + (z > this.cz[k] ? 4 : 0);
      const c = this.child[8 * k + q];
      if (c < 0) {
        const h = this.h[k] / 2, nk = this.node(this.cx[k] + (q & 1 ? h : -h), this.cy[k] + (q & 2 ? h : -h), this.cz[k] + (q & 4 ? h : -h), h);
        this.child[8 * k + q] = nk; this.leaf[nk] = i;
        return;
      }
      if (this.leaf[c] >= 0) {
        if (depth > 48 || this.count + 2 >= this.cap) { this.leaf[c] = -2 - i; return; } // 겹친 점: 더 쪼개지 않음
        const j = this.leaf[c];
        this.leaf[c] = -1;
        // 원래 있던 점을 한 단계 아래로 내림
        const h = this.h[c] / 2, xj = p.x[3 * j], yj = p.x[3 * j + 1], zj = p.x[3 * j + 2];
        const qj = (xj > this.cx[c] ? 1 : 0) + (yj > this.cy[c] ? 2 : 0) + (zj > this.cz[c] ? 4 : 0);
        const nj = this.node(this.cx[c] + (qj & 1 ? h : -h), this.cy[c] + (qj & 2 ? h : -h), this.cz[c] + (qj & 4 ? h : -h), h);
        this.child[8 * c + qj] = nj; this.leaf[nj] = j;
      }
      k = c; depth++;
    }
  }
  private moments(k: number, p: Particles): void {
    const lf = this.leaf[k];
    if (lf >= 0 || lf < -1) {
      const i = lf >= 0 ? lf : -2 - lf;
      this.mass[k] = p.m[i]; this.mx[k] = p.x[3 * i]; this.my[k] = p.x[3 * i + 1]; this.mz[k] = p.x[3 * i + 2];
      return;
    }
    let m = 0, sx = 0, sy = 0, sz = 0;
    for (let q = 0; q < 8; q++) {
      const c = this.child[8 * k + q];
      if (c < 0) continue;
      this.moments(c, p);
      const mc = this.mass[c];
      m += mc; sx += mc * this.mx[c]; sy += mc * this.my[c]; sz += mc * this.mz[c];
    }
    this.mass[k] = m;
    if (m > 0) { this.mx[k] = sx / m; this.my[k] = sy / m; this.mz[k] = sz / m; }
  }
}

const stack = new Int32Array(4096);
/** 중력 가속도 (G = 1). 가까운 픽셀은 플러머 완화 ε = 두 픽셀 반지름 중 큰 값 */
export function gravity(p: Particles, t: Octree, theta = 0.7): void {
  const th2 = theta * theta, a = p.a;
  for (let i = 0; i < p.n; i++) {
    a[3 * i] = a[3 * i + 1] = a[3 * i + 2] = 0;
    if (p.gone[i]) continue;
    const xi = p.x[3 * i], yi = p.x[3 * i + 1], zi = p.x[3 * i + 2], ei = p.r[i];
    let ax = 0, ay = 0, az = 0, sp = 0;
    stack[sp++] = 0;
    while (sp > 0) {
      const k = stack[--sp], m = t.mass[k];
      if (m === 0) continue;
      const dx = t.mx[k] - xi, dy = t.my[k] - yi, dz = t.mz[k] - zi, d2 = dx * dx + dy * dy + dz * dz;
      const lf = t.leaf[k];
      if (lf !== -1) {
        const j = lf >= 0 ? lf : -2 - lf;
        if (j === i) continue;
        const e = Math.max(ei, p.r[j]), r2 = d2 + e * e, inv = m / (r2 * Math.sqrt(r2));
        ax += dx * inv; ay += dy * inv; az += dz * inv;
        continue;
      }
      const s = 2 * t.h[k];
      if (s * s < th2 * d2) {
        const r2 = d2 + ei * ei, inv = m / (r2 * Math.sqrt(r2));
        ax += dx * inv; ay += dy * inv; az += dz * inv;
      } else {
        for (let q = 0; q < 8; q++) { const c = t.child[8 * k + q]; if (c >= 0) stack[sp++] = c; }
      }
    }
    a[3 * i] = ax; a[3 * i + 1] = ay; a[3 * i + 2] = az;
  }
  // 트리 근사는 작용–반작용이 정확히 맞지 않아 전체 운동량이 조금씩 샌다: 알짜 힘을 질량에 고르게 나눠 빼서 0으로 맞춤
  let fx = 0, fy = 0, fz = 0, M = 0;
  for (let i = 0; i < p.n; i++) if (!p.gone[i]) { fx += p.m[i] * a[3 * i]; fy += p.m[i] * a[3 * i + 1]; fz += p.m[i] * a[3 * i + 2]; M += p.m[i]; }
  if (M > 0) { fx /= M; fy /= M; fz /= M; for (let i = 0; i < p.n; i++) if (!p.gone[i]) { a[3 * i] -= fx; a[3 * i + 1] -= fy; a[3 * i + 2] -= fz; } }
}

// ---------- 접촉: 격자 해시로 맞닿은 픽셀 찾기 ----------
/** 접선 마찰 계수 (법선 감쇠에 대한 비) */
export let FRICTION = 0.1;
export function setFriction(f: number): void { FRICTION = f; }
export class Contacts {
  private head = new Int32Array(1); private next = new Int32Array(1);
  private ix = new Int32Array(1); private iy = new Int32Array(1); private iz = new Int32Array(1);
  /** 마지막 단계에서 열로 바뀐 에너지 (계산 단위) */
  heat = 0;
  /** 서로 다른 천체의 픽셀이 맞닿은 횟수 (누적) */
  cross = 0;
  /** 이웃한 픽셀 사이 가장 빠른 상대 속력 (시간 간격 제한용) */
  vRel = 0;
  apply(p: Particles, k: number, zeta: number, dt: number): void {
    const n = p.n;
    let rmax = 0;
    for (let i = 0; i < n; i++) if (p.r[i] > rmax) rmax = p.r[i];
    const cell = 2 * rmax, TB = 1 << Math.ceil(Math.log2(2 * n + 16));
    if (this.head.length !== TB) this.head = new Int32Array(TB);
    if (this.next.length < n) { this.next = new Int32Array(n); this.ix = new Int32Array(n); this.iy = new Int32Array(n); this.iz = new Int32Array(n); }
    this.head.fill(-1);
    const hash = (x: number, y: number, z: number) => ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0) & (TB - 1);
    for (let i = 0; i < n; i++) {
      if (p.gone[i]) continue;
      const x = Math.floor(p.x[3 * i] / cell), y = Math.floor(p.x[3 * i + 1] / cell), z = Math.floor(p.x[3 * i + 2] / cell);
      this.ix[i] = x; this.iy[i] = y; this.iz[i] = z;
      const h = hash(x, y, z);
      this.next[i] = this.head[h]; this.head[h] = i;
    }
    let heat = 0, vRel2 = 0;
    const X = p.x, V = p.v, A = p.a;
    for (let i = 0; i < n; i++) {
      if (p.gone[i]) continue;
      const xi = X[3 * i], yi = X[3 * i + 1], zi = X[3 * i + 2], ri = p.r[i], mi = p.m[i];
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cx = this.ix[i] + dx, cy = this.iy[i] + dy, cz = this.iz[i] + dz;
        for (let j = this.head[hash(cx, cy, cz)]; j >= 0; j = this.next[j]) {
          if (j <= i || this.ix[j] !== cx || this.iy[j] !== cy || this.iz[j] !== cz) continue;
          const ex = X[3 * j] - xi, ey = X[3 * j + 1] - yi, ez = X[3 * j + 2] - zi, d2 = ex * ex + ey * ey + ez * ez, rr = ri + p.r[j];
          if (d2 < 4 * rr * rr) {
            const wx = V[3 * j] - V[3 * i], wy = V[3 * j + 1] - V[3 * i + 1], wz = V[3 * j + 2] - V[3 * i + 2], w2 = wx * wx + wy * wy + wz * wz;
            if (w2 > vRel2) vRel2 = w2;
          }
          if (d2 >= rr * rr || d2 === 0) continue;
          const d = Math.sqrt(d2), nx = ex / d, ny = ey / d, nz = ez / d, ov = rr - d, mj = p.m[j];
          const rvx = V[3 * j] - V[3 * i], rvy = V[3 * j + 1] - V[3 * i + 1], rvz = V[3 * j + 2] - V[3 * i + 2];
          const vn = rvx * nx + rvy * ny + rvz * nz, me = mi * mj / (mi + mj), c = 2 * zeta * Math.sqrt(k * me);
          // 법선: 밀어내는 스프링 + 감쇠 (끌어당기지는 않음). 접선: 약한 마찰
          let fn = k * ov - c * vn;
          if (fn < 0) fn = 0;
          const tx = rvx - vn * nx, ty = rvy - vn * ny, tz = rvz - vn * nz, ct = FRICTION * c;
          const fx = -fn * nx + ct * tx, fy = -fn * ny + ct * ty, fz = -fn * nz + ct * tz;
          A[3 * i] += fx / mi; A[3 * i + 1] += fy / mi; A[3 * i + 2] += fz / mi;
          A[3 * j] -= fx / mj; A[3 * j + 1] -= fy / mj; A[3 * j + 2] -= fz / mj;
          // 감쇠가 빼앗은 일률 → 열 (두 픽셀에 반씩)
          // 다가올 때는 감쇠 전부, 멀어질 때는 (밀어내는 힘을 넘지 않는) 감쇠만 일을 함
          const P = (vn < 0 ? c * vn * vn : vn * Math.min(c * vn, k * ov)) + ct * (tx * tx + ty * ty + tz * tz);
          if (p.body[i] !== p.body[j]) this.cross++;
          const q = P * dt;
          heat += q;
          p.u[i] += 0.5 * q / mi; p.u[j] += 0.5 * q / mj;
        }
      }
    }
    this.heat = heat;
    this.vRel = Math.sqrt(vRel2);
  }
}

export interface SimState { t: number; steps: number; dt: number; tree: Octree; contacts: Contacts; damp: number; ag: Float64Array | null }

/** 고정 행성의 중력 + 흡수 */
function fixedPull(p: Particles, Mf: number, Rf: number): void {
  for (let i = 0; i < p.n; i++) {
    if (p.gone[i]) continue;
    const x = p.x[3 * i], y = p.x[3 * i + 1], z = p.x[3 * i + 2], r2 = x * x + y * y + z * z, r = Math.sqrt(r2);
    if (r < Rf) { p.gone[i] = 1; continue; }
    const f = Mf / (r2 * r);
    p.a[3 * i] -= x * f; p.a[3 * i + 1] -= y * f; p.a[3 * i + 2] -= z * f;
  }
}

export function newState(): SimState { return { t: 0, steps: 0, dt: 0, tree: new Octree(), contacts: new Contacts(), damp: 0, ag: null }; }
/** 중력은 느리게 변하므로 4단계마다 다시 계산 (접촉력은 매 단계) */
const G_EVERY = 4;

/** 다음 시간 간격: 접촉 진동을 15토막 이상, 이웃 픽셀끼리 픽셀 반지름의 1/4 이상 못 다가오게, 고정 행성 둘레 궤도도 촘촘히 */
function chooseDt(b: Built, s: SimState): number {
  const p = b.p;
  let mMin = Infinity, rMin = Infinity, orb = Infinity;
  const fx = b.setup.fixed && !b.setup.still ? { M: b.setup.fixed.M / b.units.Mu } : null;
  for (let i = 0; i < p.n; i++) {
    if (p.gone[i]) continue;
    if (p.m[i] < mMin) mMin = p.m[i];
    if (p.r[i] < rMin) rMin = p.r[i];
    if (fx) { const r = Math.hypot(p.x[3 * i], p.x[3 * i + 1], p.x[3 * i + 2]); orb = Math.min(orb, 0.004 * Math.sqrt(r ** 3 / fx.M)); }
  }
  return Math.min(2 * Math.PI * Math.sqrt(mMin / b.k) / 15, 0.25 * rMin / Math.max(s.contacts.vRel, 1e-30), orb);
}

/** 한 단계 (속도 베를레: 반 걸음 차기 → 이동 → 힘 → 반 걸음 차기) */
export function step(b: Built, s: SimState, zeta = 0.1): void {
  const p = b.p, n = p.n;
  if (s.steps === 0) forces(b, s, zeta, 0);
  const dt = chooseDt(b, s);
  s.dt = dt;
  for (let i = 0; i < 3 * n; i++) p.v[i] += 0.5 * dt * p.a[i];
  for (let i = 0; i < 3 * n; i++) p.x[i] += dt * p.v[i];
  forces(b, s, zeta, dt);
  for (let i = 0; i < 3 * n; i++) p.v[i] += 0.5 * dt * p.a[i];
  if (s.damp > 0) { const f = Math.exp(-s.damp * dt); for (let i = 0; i < 3 * n; i++) p.v[i] *= f; }
  s.t += dt; s.steps++;
}
function forces(b: Built, s: SimState, zeta: number, dt: number): void {
  const p = b.p;
  if (!s.ag || s.ag.length !== p.a.length) s.ag = new Float64Array(p.a.length);
  if (s.steps % G_EVERY === 0) { s.tree.build(p); gravity(p, s.tree, 0.75); s.ag.set(p.a); }
  else p.a.set(s.ag);
  if (b.setup.fixed && !b.setup.still) fixedPull(b.p, b.setup.fixed.M / b.units.Mu, b.setup.fixed.R / b.units.L);
  s.contacts.apply(b.p, b.k, zeta, dt);
}

/**
 * 충돌 전에 천체마다 따로 가라앉힘: 처음 격자는 자기 무게로 눌리지 않은 상태라서 그대로 두면 출렁인다.
 * 각 천체를 제자리에서 강한 감쇠로 몇 번의 진동 주기 동안 풀어 정역학 평형에 가깝게 만든 뒤, 원래 속도를 돌려준다.
 */
export function relax(b: Built, iters = 220): void {
  const p = b.p, n = p.n, saveV = p.v.slice(), saveFixed = b.setup.fixed;
  // 천체별 질량 중심 (위치를 나중에 되돌리기 위해)
  const cm = (bi: number) => { let m = 0, x = 0, y = 0, z = 0; for (let i = 0; i < n; i++) if (p.body[i] === bi) { m += p.m[i]; x += p.m[i] * p.x[3 * i]; y += p.m[i] * p.x[3 * i + 1]; z += p.m[i] * p.x[3 * i + 2]; } return [x / m, y / m, z / m]; };
  const nb = b.setup.bodies.length, c0 = Array.from({ length: nb }, (_, bi) => cm(bi));
  // 천체끼리 서로 끌지 않도록 멀리 떼어 놓고 가라앉힘
  for (let i = 0; i < n; i++) { p.x[3 * i] += p.body[i] * 1e4; }
  (b.setup as { fixed?: FixedBody }).fixed = undefined;
  p.v.fill(0);
  const s = newState();
  s.damp = 0;
  for (let k = 0; k < iters; k++) {
    step(b, s, 0.9);
    for (let i = 0; i < 3 * n; i++) p.v[i] *= 0.85;
  }
  (b.setup as { fixed?: FixedBody }).fixed = saveFixed;
  const c1 = Array.from({ length: nb }, (_, bi) => cm(bi));
  for (let i = 0; i < n; i++) { const bi = p.body[i]; for (let q = 0; q < 3; q++) p.x[3 * i + q] += c0[bi][q] - c1[bi][q]; }
  p.v.set(saveV);
  p.u.fill(0);
}

// ---------- 분석 ----------
export interface Analysis {
  /** 시간 [s] */
  t: number;
  /** 가장 큰 덩어리 (행성), 그 둘레를 도는 원반, 탈출, 고정 행성에 떨어짐 [질량 비율] */
  planet: number; disk: number; escape: number; absorbed: number;
  /** 원반 질량 [달 질량] */
  diskLunar: number;
  /** 원반 물질 가운데 두 번째 천체(충돌체)에서 온 비율 */
  diskFromImpactor: number;
  /** 원소별 질량 비율: 원반, 탈출 */
  diskEl: { el: El; f: number }[]; escEl: { el: El; f: number }[];
  /** 원반의 철 비율 / 행성의 철 비율 */
  diskFe: number; planetFe: number;
  /** 충돌로 1000 K 넘게 더 뜨거워진 질량 비율, 가장 뜨거운 픽셀 [K] */
  hot: number; Tmax: number;
  /** 덩어리 수 (픽셀 5개 이상) */
  clumps: number;
}

/** 픽셀 온도 [K] */
export function temperature(b: Built, i: number): number { return b.p.T0[i] + b.p.u[i] * b.units.E / b.p.cv[i]; }

export function analyze(b: Built, s: SimState): Analysis {
  const p = b.p, n = p.n, Mtot = p.m.reduce((a, c) => a + c, 0);
  // 1) 행성: 가장 무거운 천체 픽셀의 질량 중심에서 시작해, 묶인 픽셀로 반복해서 좁힘
  const fixed = b.setup.fixed && !b.setup.still;
  const cls = new Uint8Array(n); // 0 행성, 1 원반, 2 탈출, 3 흡수
  let absorbed = 0;
  for (let i = 0; i < n; i++) if (p.gone[i]) { cls[i] = 3; absorbed += p.m[i]; }
  let cx = 0, cy = 0, cz = 0, vx = 0, vy = 0, vz = 0, Mp = 0, Rp = 0;
  if (fixed) {
    Mp = b.setup.fixed!.M / b.units.Mu; Rp = b.setup.fixed!.R / b.units.L;
  } else {
    const big = b.setup.bodies.reduce((bi, x, k, arr) => (x.M > arr[bi].M ? k : bi), 0);
    const M0b = b.setup.bodies[big].M / b.units.Mu, R0b = b.setup.bodies[big].R / b.units.L;
    let inSet = (i: number) => p.body[i] === big;
    for (let it = 0; it < 6; it++) {
      let m = 0; cx = cy = cz = vx = vy = vz = 0;
      for (let i = 0; i < n; i++) if (!p.gone[i] && inSet(i)) { const mi = p.m[i]; m += mi; cx += mi * p.x[3 * i]; cy += mi * p.x[3 * i + 1]; cz += mi * p.x[3 * i + 2]; vx += mi * p.v[3 * i]; vy += mi * p.v[3 * i + 1]; vz += mi * p.v[3 * i + 2]; }
      cx /= m; cy /= m; cz /= m; vx /= m; vy /= m; vz /= m; Mp = m;
      // 행성 반지름: 처음 큰 천체와 같은 평균 밀도라고 보고 질량에서 구함 (Canup 2004의 방식)
      Rp = R0b * Math.cbrt(Mp / M0b);
      const R0 = Rp, M0 = Mp, ccx = cx, ccy = cy, ccz = cz, cvx = vx, cvy = vy, cvz = vz;
      inSet = (i: number) => {
        const dx = p.x[3 * i] - ccx, dy = p.x[3 * i + 1] - ccy, dz = p.x[3 * i + 2] - ccz, r = Math.hypot(dx, dy, dz);
        if (r <= R0) return true;
        const ux = p.v[3 * i] - cvx, uy = p.v[3 * i + 1] - cvy, uz = p.v[3 * i + 2] - cvz, E = 0.5 * (ux * ux + uy * uy + uz * uz) - M0 / r;
        if (E >= 0) return false;
        const hx = dy * uz - dz * uy, hy = dz * ux - dx * uz, hz = dx * uy - dy * ux, h2 = hx * hx + hy * hy + hz * hz;
        const e = Math.sqrt(Math.max(0, 1 + 2 * E * h2 / (M0 * M0))), a = -M0 / (2 * E);
        return a * (1 - e) <= R0; // 근점이 행성 안 → 다시 떨어짐
      };
    }
  }
  let planet = 0, disk = 0, escape = 0, diskImp = 0, hot = 0, Tmax = 0;
  const elDisk = new Float64Array(EL_LIST.length), elEsc = new Float64Array(EL_LIST.length);
  let feDisk = 0, fePl = 0;
  const feIdx = "Fe";
  for (let i = 0; i < n; i++) {
    const mi = p.m[i], T = temperature(b, i);
    if (T > Tmax) Tmax = T;
    if (T - p.T0[i] > 1000) hot += mi;
    if (cls[i] === 3) continue;
    const dx = p.x[3 * i] - cx, dy = p.x[3 * i + 1] - cy, dz = p.x[3 * i + 2] - cz, r = Math.hypot(dx, dy, dz);
    const ux = p.v[3 * i] - vx, uy = p.v[3 * i + 1] - vy, uz = p.v[3 * i + 2] - vz, E = 0.5 * (ux * ux + uy * uy + uz * uz) - Mp / r;
    let c = 0;
    if (r > Rp) {
      if (E >= 0) c = 2;
      else {
        const hx = dy * uz - dz * uy, hy = dz * ux - dx * uz, hz = dx * uy - dy * ux, h2 = hx * hx + hy * hy + hz * hz;
        const e = Math.sqrt(Math.max(0, 1 + 2 * E * h2 / (Mp * Mp))), a = -Mp / (2 * E);
        c = a * (1 - e) > Rp ? 1 : 0;
      }
    }
    if (fixed && c === 0) c = 1; // 고정 행성 둘레: 흡수되지 않고 묶인 것은 고리·원반
    cls[i] = c;
    const L = b.layers[p.layer[i]], fe = (L.el[feIdx] ?? 0) * mi;
    if (c === 0) { planet += mi; fePl += fe; }
    else if (c === 1) { disk += mi; feDisk += fe; if (p.body[i] === 1) diskImp += mi; for (const [k, v] of Object.entries(L.el)) elDisk[EL_LIST.indexOf(k as El)] += (v ?? 0) * mi; }
    else { escape += mi; for (const [k, v] of Object.entries(L.el)) elEsc[EL_LIST.indexOf(k as El)] += (v ?? 0) * mi; }
  }
  const toList = (a: Float64Array) => { const s = a.reduce((x, y) => x + y, 0) || 1; return EL_LIST.map((el, k) => ({ el, f: a[k] / s })).filter((x) => x.f > 0.002).sort((x, y) => y.f - x.f); };
  const MOON = 7.342e22;
  return {
    t: s.t * b.units.T,
    planet: planet / Mtot, disk: disk / Mtot, escape: escape / Mtot, absorbed: absorbed / Mtot,
    diskLunar: disk * b.units.Mu / MOON, diskFromImpactor: disk > 0 ? diskImp / disk : 0,
    diskEl: toList(elDisk), escEl: toList(elEsc),
    diskFe: disk > 0 ? feDisk / disk : 0, planetFe: planet > 0 ? fePl / planet : 0,
    hot: hot / Mtot, Tmax, clumps: countClumps(p),
  };
}

/** 친구의 친구: 픽셀 반지름 합의 1.3배 안이면 같은 덩어리. 5개 이상인 덩어리 수 */
export function countClumps(p: Particles): number {
  const n = p.n, par = new Int32Array(n);
  for (let i = 0; i < n; i++) par[i] = i;
  const find = (i: number): number => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  let rmax = 0;
  for (let i = 0; i < n; i++) if (p.r[i] > rmax) rmax = p.r[i];
  const cell = 2.6 * rmax, map = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    if (p.gone[i]) continue;
    const k = Math.floor(p.x[3 * i] / cell) + "," + Math.floor(p.x[3 * i + 1] / cell) + "," + Math.floor(p.x[3 * i + 2] / cell);
    const a = map.get(k); if (a) a.push(i); else map.set(k, [i]);
  }
  for (const [key, list] of map) {
    const [cx, cy, cz] = key.split(",").map(Number);
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const other = map.get((cx + dx) + "," + (cy + dy) + "," + (cz + dz));
      if (!other) continue;
      for (const i of list) for (const j of other) {
        if (j <= i) continue;
        const l = 1.3 * (p.r[i] + p.r[j]);
        if ((p.x[3 * i] - p.x[3 * j]) ** 2 + (p.x[3 * i + 1] - p.x[3 * j + 1]) ** 2 + (p.x[3 * i + 2] - p.x[3 * j + 2]) ** 2 < l * l) { const a = find(i), c = find(j); if (a !== c) par[a] = c; }
      }
    }
  }
  const size = new Map<number, number>();
  for (let i = 0; i < n; i++) if (!p.gone[i]) { const r = find(i); size.set(r, (size.get(r) ?? 0) + 1); }
  let c = 0;
  for (const v of size.values()) if (v >= 5) c++;
  return c;
}

/** 천체 전체의 원소 구성 (카드 표시용) */
export function elementSummary(c: Composition, top = 6): string {
  return bulkComposition(c).slice(0, top).map((x) => ELEMENTS[x.el].ko + " " + (x.f * 100 < 1 ? (x.f * 100).toFixed(1) : Math.round(x.f * 100)) + "%").join(" · ");
}

// ---------- 시나리오 ----------
/** 두 천체가 접촉할 때 상대 속력 vImp, 충돌각(정면 0°)이 되도록 거리 D에서 출발시킴 (질량 중심 기준) */
export function approach(M1: number, R1: number, M2: number, R2: number, vImp: number, angleDeg: number, Dfac = 2.6): { p1: [number, number, number]; v1: [number, number, number]; p2: [number, number, number]; v2: [number, number, number] } {
  const mu = G_SI * (M1 + M2), rc = R1 + R2, D = Dfac * rc, th = angleDeg * Math.PI / 180;
  const h = rc * vImp * Math.sin(th), vD2 = vImp * vImp - 2 * mu * (1 / rc - 1 / D);
  const vD = Math.sqrt(Math.max(vD2, 1e-6)), vt = h / D, vr = -Math.sqrt(Math.max(vD * vD - vt * vt, 0));
  // 상대 위치 (D, 0, 0), 상대 속도 (vr, vt, 0)를 질량 중심 좌표로
  const f1 = M2 / (M1 + M2), f2 = M1 / (M1 + M2);
  return { p1: [-f1 * D, 0, 0], v1: [-f1 * vr, -f1 * vt, 0], p2: [f2 * D, 0, 0], v2: [f2 * vr, f2 * vt, 0] };
}

/** 상호 탈출 속도 [m/s] */
export function mutualEscape(M1: number, R1: number, M2: number, R2: number): number { return Math.sqrt(2 * G_SI * (M1 + M2) / (R1 + R2)); }
