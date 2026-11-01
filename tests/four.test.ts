// 우주 지도의 4차원 변환 검사: 각이 0이면 3차원 지도와 같음, 회전은 직교, 광원뿔 시점, 빛이 온 거리.
import { describe, expect, it } from "vitest";
import { lightTravelTable, LY_PC, matrix4, PRESETS4, project4, wMixed, XW, YW, ZW } from "../src/atlas/four";
import { rotate4, type Vec4 } from "../src/fourd/geometry";
import { createCosmology } from "../src/shared/cosmology";

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

describe("빛이 온 거리 (w의 크기)", () => {
  const c = createCosmology(), t0 = c.tOf(0);
  const lt = lightTravelTable((z) => c.comovingDistance(z), (z) => (t0 - c.tOf(-Math.log10(1 + z))) / 3.15576e7);

  it("1 Mpc 안에서는 거리와 같다", () => {
    expect(lt(0)).toBe(0);
    expect(lt(8.2)).toBe(8.2);
    expect(lt(7.7e5)).toBe(7.7e5);
  });

  it("z = 1 은하: 공동 거리 약 3.4 Gpc, 빛이 온 거리 약 7.9 Gyr × c", () => {
    const dc = c.comovingDistance(1) * 1e6, tl = (t0 - c.tOf(-Math.log10(2))) / 3.15576e7;
    expect(dc / 1e9).toBeGreaterThan(3.2); expect(dc / 1e9).toBeLessThan(3.6);
    expect(tl / 1e9).toBeGreaterThan(7.6); expect(tl / 1e9).toBeLessThan(8.2);
    expect(lt(dc) / (tl * LY_PC)).toBeCloseTo(1, 2);
  });

  it("멀어질수록 늘지만 공동 거리보다 짧고, 우주 나이 × c를 넘지 않는다", () => {
    let prev = 0;
    for (const d of [2e6, 1e7, 1e8, 1e9, 5e9, 1e10, 1.4e10]) {
      const v = lt(d);
      expect(v).toBeGreaterThan(prev);
      expect(v).toBeLessThan(d);
      expect(v).toBeLessThan(t0 / 3.15576e7 * LY_PC);
      prev = v;
    }
  });
});
