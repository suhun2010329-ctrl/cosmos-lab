// 여러 시뮬레이션이 함께 쓰는 작은 수학 도구.

export type RGB = [number, number, number];
export type Vec3 = [number, number, number];

export function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x));
}

/** 3차 에르미트 보간 (GLSL smoothstep과 같음) */
export function smooth(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function frac(x: number): number {
  return x - Math.floor(x);
}

/** 적색편이 z → log10(a) */
export function laZ(z: number): number {
  return -Math.log10(1 + z);
}

/** 구간 [lo, hi]에서 fn의 부호가 바뀌는 점을 이분법으로 찾는다. */
export function bisect(fn: (x: number) => number, lo: number, hi: number): number {
  let flo = fn(lo);
  for (let i = 0; i < 70; i++) {
    const mid = 0.5 * (lo + hi), fm = fn(mid);
    if (fm > 0 === flo > 0) { lo = mid; flo = fm; } else hi = mid;
  }
  return 0.5 * (lo + hi);
}

export type Rng = () => number;

/** mulberry32: 씨앗이 같으면 항상 같은 수열을 내는 32비트 난수 발생기 */
export function rng(seed: number): Rng {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 박스–뮬러 정규 분포 표본 */
export function gauss(r: Rng): number {
  const u = 1 - r(), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function len3(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2];
  return Math.sqrt(x * x + y * y + z * z);
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
