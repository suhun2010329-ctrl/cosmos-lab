// 우주 지도의 4차원 변환 검사: 각이 0이면 3차원 지도와 같음, 회전은 직교, 광원뿔 시점, 팽창하는 우주의 과거 광원뿔.
import { describe, expect, it } from "vitest";
import { buildLightCone, coneAt, LY_PC, matrix4, PRESETS4, project4, wMixed, XW, YW, ZW } from "../src/atlas/four";
import { rotate4, type Vec4 } from "../src/fourd/geometry";
import { Timeline, YEAR_S } from "../src/atlas/time";

const DEG = Math.PI / 180;

describe("4차원 회전 행렬", () => {
  it("각이 모두 0이면 단위 행렬이고 w는 화면에 나오지 않는다", () => {
    const M = matrix4([0, 0, 0, 0, 0, 0]);
    expect(M).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(project4(M, 3, -4, 5, -1e9)).toEqual([3, -4, 5]);
    expect(wMixed([0, 0, 0, 0, 0, 0])).toBe(false);
    expect(wMixed([0.3, 0.2, 0, 0.1, 0, 0])).toBe(false); // XY·XZ·YZ는 보통의 3차원 회전
  });

  it("행렬은 직교이고 rotate4와 같은 결과를 준다", () => {
    const ang = [0.3, -1.1, 0.7, 2.0, -0.4, 1.3], M = matrix4(ang);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += M[4 * i + k] * M[4 * j + k];
      expect(s).toBeCloseTo(i === j ? 1 : 0, 12);
    }
    const p: Vec4 = [1.5, -2, 0.25, -3], r = rotate4(p, ang), q = project4(M, ...p);
    for (let k = 0; k < 3; k++) expect(q[k]).toBeCloseTo(r[k], 12);
  });

  it("과거 광원뿔 시점(ZW −90°): 세로축이 w가 되어 거리 d인 천체가 d만큼 아래에 놓인다", () => {
    const p = PRESETS4.cone, ang = [0, 0, 0, 0, 0, 0];
    ang[XW] = p.XW * DEG; ang[YW] = p.YW * DEG; ang[ZW] = p.ZW * DEG;
    const M = matrix4(ang);
    // 황도면(xy)의 원 위 점들: w = −d
    for (const t of [0, 1, 2, 3]) {
      const d = 100, x = d * Math.cos(t), y = d * Math.sin(t), q = project4(M, x, y, 0, -d);
      expect(q[0]).toBeCloseTo(x, 9); expect(q[1]).toBeCloseTo(y, 9); expect(q[2]).toBeCloseTo(-d, 9);
    }
    expect(wMixed(ang)).toBe(true);
    expect(ang[YW]).toBe(0);
  });

  it("w 원근: 관측자 쪽(최근의 빛)이 크게, 먼 과거가 작게 보인다", () => {
    const M = matrix4([0, 0, 0, 0, 0, 0]);
    expect(project4(M, 1, 0, 0, -0.5, 1, 1)[0]).toBeCloseTo(1 / 1.5, 12);
    expect(project4(M, 1, 0, 0, 0.5, 1, 1)[0]).toBeCloseTo(2, 12);
    expect(project4(M, 1, 0, 0, 10, 1, 1)[0]).toBeCloseTo(5, 12); // 0.2로 잘라 무한대가 되지 않음
  });
});

describe("시공간 조건: 관측자의 과거 광원뿔", () => {
  const TL = new Timeline(), t0 = TL.t0 / YEAR_S, c = TL.core;
  const today = buildLightCone((d) => TL.la(d), t0, 0, true);
  const chiOf = (z: number) => c.comovingDistance(z) * 1e6;

  it("입자 지평선 약 462억 광년 (Planck 2018 ΛCDM: 약 46.3 Gly)", () => {
    const gly = today.horizon / LY_PC / 1e9;
    expect(gly).toBeGreaterThan(45.5); expect(gly).toBeLessThan(47);
  });

  it("z = 1: 빛이 약 79억 년 전에 떠났고, 그때 우주 크기는 1/(1+z) = 0.5", () => {
    const r = coneAt(today, chiOf(1)), tlb = (TL.t0 - c.tOf(-Math.log10(2))) / YEAR_S;
    expect(-r.w / LY_PC / tlb).toBeCloseTo(1, 2);
    expect(r.ratio).toBeCloseTo(0.5, 3);
    expect(r.ok).toBe(true);
  });

  it("눈물방울 모양: 빛이 떠날 때의 거리는 z ≈ 1.6에서 최대 약 58억 광년, 우주배경복사는 약 4200만 광년", () => {
    let best = 0, zBest = 0;
    for (let z = 0.5; z < 4; z += 0.05) { const r = coneAt(today, chiOf(z)), d = chiOf(z) * r.ratio / LY_PC / 1e9; if (d > best) { best = d; zBest = z; } }
    expect(best).toBeGreaterThan(5.5); expect(best).toBeLessThan(6.0);
    expect(zBest).toBeGreaterThan(1.3); expect(zBest).toBeLessThan(1.9);
    const cmb = coneAt(today, chiOf(1090));
    expect(chiOf(1090) * cmb.ratio / LY_PC / 1e6).toBeGreaterThan(38);
    expect(chiOf(1090) * cmb.ratio / LY_PC / 1e6).toBeLessThan(46);
  });

  it("공간 = 시간: 지평선 밖은 보이지 않고, 과거로 갈수록 지평선이 좁아지며, 먼 미래에는 약 630억 광년에서 멈춘다", () => {
    expect(coneAt(today, today.horizon * 1.01).ok).toBe(false);
    const past = buildLightCone((d) => TL.la(d), t0, -1e10, true), far = buildLightCone((d) => TL.la(d), t0, 1e14, true);
    expect(past.horizon).toBeLessThan(today.horizon * 0.75);
    expect(far.horizon / LY_PC / 1e9).toBeGreaterThan(61); expect(far.horizon / LY_PC / 1e9).toBeLessThan(65);
  });

  it("팽창이 없으면 w = −거리, 배율 1, 지평선 = c × 우주 나이", () => {
    const st = buildLightCone((d) => TL.la(d), t0, 0, false), r = coneAt(st, 1e9);
    expect(r.w).toBeCloseTo(-1e9, 3); expect(r.ratio).toBe(1);
    expect(st.horizon / LY_PC / t0).toBeCloseTo(1, 6);
  });
});
