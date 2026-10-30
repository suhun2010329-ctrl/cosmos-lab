// 공용 과학 모듈이 관측값·표준 계산과 맞는지 확인하는 회귀 테스트.
import { describe, expect, it } from "vitest";
import { createCosmology } from "../src/shared/cosmology";
import { buildBBN, buildIon, buildSFR, energyFractions } from "../src/shared/physics";
import { buildEras } from "../src/shared/eras";
import { elOrigins, originFractions, ptPos } from "../src/shared/elements";
import { GYR } from "../src/shared/format";
import { laZ } from "../src/shared/math";
import { genIC2D, sigmaPsi } from "../src/bigbang/field2d";

const core = createCosmology();
const ION = buildIon(core);
const BBN = buildBBN(core);
const SFR = buildSFR(core);

describe("배경 우주 (Planck 2018 ΛCDM)", () => {
  it("우주 나이 ≈ 13.797 Gyr", () => {
    expect(core.tOf(0) / GYR).toBeCloseTo(13.797, 1);
  });
  it("오늘 H = H0, 성분 합 = 1", () => {
    expect(core.E(1)).toBeCloseTo(1, 6);
    const f = energyFractions(core, 0)!;
    expect(f.r + f.b + f.c + f.de).toBeCloseTo(1, 10);
    expect(f.de).toBeCloseTo(0.685, 2);
  });
  it("온도는 오늘 T_CMB이고 과거로 갈수록 1/a로 커짐", () => {
    expect(core.TofA(1)).toBeCloseTo(2.7255, 4);
    expect(core.TofA(1e-3)).toBeCloseTo(2725.5, 0);
  });
  it("시간표와 역함수가 일치", () => {
    for (const la of [-20, -10, -5, -2, -0.5, 0.3]) expect(core.laOfT(core.tOf(la))).toBeCloseTo(la, 3);
  });
  it("성장 인자: D(1) = 1, 물질 시대에 D ∝ a", () => {
    expect(core.growth(0)).toBeCloseTo(1, 6);
    expect(core.growth(-2) / core.growth(-2.5)).toBeCloseTo(Math.pow(10, 0.5), 0);
  });
  it("물질–복사 동등 z ≈ 3400", () => {
    const { zEq } = buildEras(core, ION, BBN, SFR);
    expect(zEq).toBeGreaterThan(3300);
    expect(zEq).toBeLessThan(3500);
  });
});

describe("재결합과 재이온화", () => {
  it("마지막 산란면 z* ≈ 1090 (Planck 2018: 1089.92)", () => {
    expect(ION.zStar).toBeGreaterThan(1060);
    expect(ION.zStar).toBeLessThan(1120);
  });
  it("재이온화 광학 깊이 τ ≈ 0.054", () => {
    expect(ION.tauRe).toBeGreaterThan(0.045);
    expect(ION.tauRe).toBeLessThan(0.065);
  });
  it("오늘은 이온화, 암흑 시대는 거의 중성", () => {
    expect(ION.xe(0)).toBeGreaterThan(1);
    expect(ION.xe(200)).toBeLessThan(1e-2);
  });
});

describe("빅뱅 핵합성", () => {
  it("헬륨 질량 비율 Yp ≈ 0.25", () => {
    expect(BBN.YpCalc).toBeGreaterThan(0.22);
    expect(BBN.YpCalc).toBeLessThan(0.27);
  });
  it("핵합성은 빅뱅 후 수 분", () => {
    expect(BBN.tNuc).toBeGreaterThan(60);
    expect(BBN.tNuc).toBeLessThan(600);
  });
});

describe("별 형성과 원소", () => {
  it("우주의 정오 z ≈ 1.9 (Madau & Dickinson 2014)", () => {
    expect(SFR.zNoon).toBeGreaterThan(1.5);
    expect(SFR.zNoon).toBeLessThan(2.3);
  });
  it("원소 생성 통로는 오늘 1로 정규화", () => {
    for (const k of ["cc", "agb", "ia", "nsm"] as const) expect(SFR.chanAt(k, 0)).toBeCloseTo(1, 2);
  });
  it("첫 별 전에는 무거운 원소가 없음", () => {
    const F = originFractions(laZ(50), BBN, SFR);
    expect(F.M).toBe(0);
    expect(F.B).toBe(1);
  });
  it("원소 기원 비율의 합은 1, 주기율표 위치는 겹치지 않음", () => {
    const seen = new Set<string>();
    for (let Z = 1; Z <= 118; Z++) {
      const o = elOrigins(Z);
      expect(Object.values(o).reduce((s, v) => s + (v ?? 0), 0)).toBeCloseTo(1, 6);
      const key = ptPos(Z).join(",");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe("DESI DR2 w0wa 모형", () => {
  it("오늘 E = 1이고 나이는 ΛCDM과 수천만 년 이내", () => {
    const desi = createCosmology({ model: "desi" });
    expect(desi.E(1)).toBeCloseTo(1, 6);
    expect(Math.abs(desi.tOf(0) - core.tOf(0)) / GYR).toBeLessThan(0.3);
  });
});

describe("2D 단면 초기 조건", () => {
  it("한 성분 rms 변위가 선형 이론 σψ와 같음", () => {
    const n = 32, L = 100, psi = genIC2D(core, L, n, 1);
    let s = 0;
    for (let i = 0; i < n * n; i++) s += psi[2 * i] * psi[2 * i];
    expect(Math.sqrt(s / (n * n))).toBeCloseTo(sigmaPsi(core, L, n) / L, 6);
    expect(sigmaPsi(core, L, n)).toBeGreaterThan(2);
    expect(sigmaPsi(core, L, n)).toBeLessThan(12);
  });
});

describe("미래 시나리오", async () => {
  const { buildFates } = await import("../src/shared/scenarios");
  const fates = buildFates(core, createCosmology({ model: "desi" }));
  it("ΛCDM은 계속 가속 팽창", () => {
    const f = fates.lcdm;
    expect(f.end).toBe("forever");
    expect(f.aAt(f.t0 + 20 * GYR)).toBeGreaterThan(3);
    expect(f.HAt(f.t0 + 20 * GYR)).toBeGreaterThan(0);
  });
  it("빅 크런치: 팽창 최대 약 248억 년, 총수명 약 330억 년 (Luu, Qiu & Tye 2025에 맞춤)", () => {
    const f = fates.crunch;
    expect(f.end).toBe("crunch");
    expect(f.tTurn! / GYR).toBeCloseTo(24.8, 0);
    expect(f.tEnd / GYR).toBeGreaterThan(32);
    expect(f.tEnd / GYR).toBeLessThan(34);
    expect(f.aMax!).toBeGreaterThan(1.5);
    expect(f.HAt(f.tTurn! + GYR)).toBeLessThan(0);
    expect(f.aAt(f.tEnd - 1e6 * 3.15576e7)).toBeLessThan(0.2);
    expect(f.aAt(f.tEnd - 1)).toBeLessThan(1e-8);
    const ev = f.events.map((e) => e.t);
    expect([...ev].sort((x, y) => x - y)).toEqual(ev);
  });
  it("빅 립: w = −1.5에서 약 230억 년 뒤 (Caldwell 외 2003의 근사식과 일치)", () => {
    const f = fates.rip;
    expect(f.end).toBe("rip");
    const approx = 2 / (3 * 0.5 * core.H0s * Math.sqrt(1 - core.Om)) / GYR;
    expect((f.tEnd - f.t0) / GYR).toBeGreaterThan(approx * 0.9);
    expect((f.tEnd - f.t0) / GYR).toBeLessThan(approx * 1.1);
    const milky = f.events.find((e) => e.label.includes("우리 은하가"))!;
    expect((f.tEnd - milky.t) / (1e6 * 3.15576e7)).toBeCloseTo(63, -1);
  });
  it("DESI w0wa를 늘이면 가속이 끝남", () => {
    expect(fates.desi.events.some((e) => e.label.includes("가속 팽창이 끝남"))).toBe(true);
  });
  it("공동 거리: z* ≈ 1090까지 약 139억 파섹", () => {
    expect(core.comovingDistance(1089.9) / 1000).toBeCloseTo(13.9, 0);
  });
});
