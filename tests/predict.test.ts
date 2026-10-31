// 예측 모듈 검사: 영년 섭동, 태양 진화, 달, 국부 은하군, 별의 수명, 미션 계획, 시간축.
import { describe, expect, it } from "vitest";
import { buildSecular } from "../src/atlas/secular";
import { dayLength, earthAt, eclipseEndYears, moonDistance, sunAt } from "../src/atlas/sun";
import { forecastLocalGroup, runLocalGroup, LG_BEST } from "../src/atlas/localgroup";
import { aliveProbability, starPhys } from "../src/atlas/stellar";
import { planTransfer } from "../src/atlas/mission";
import { solarSystem } from "../src/atlas/system";
import { dtToSlider, sliderToDt, Timeline } from "../src/atlas/time";

describe("영년 섭동 (라플라스–라그랑주)", () => {
  const sec = buildSecular();
  it("지금 이심률을 그대로 재현", () => {
    expect(sec.at(0).e[2]).toBeCloseTo(0.0167, 4);
    expect(sec.at(0).e[4]).toBeCloseTo(0.0485, 4);
  });
  it("지구 이심률은 ±100만 년 동안 0 ~ 0.06 (Laskar 2004: 0 ~ 0.058)", () => {
    let lo = 1, hi = 0;
    for (let t = -1e6; t <= 1e6; t += 1000) { const e = sec.at(t).e[2]; lo = Math.min(lo, e); hi = Math.max(hi, e); }
    expect(lo).toBeLessThan(0.005);
    expect(hi).toBeGreaterThan(0.045);
    expect(hi).toBeLessThan(0.07);
  });
  it("고유 진동수에 g2 ≈ 7.4\"/년, g3 ≈ 17.4\"/년 (Laskar)", () => {
    expect(sec.g.some((g) => Math.abs(g - 7.45) < 0.3)).toBe(true);
    expect(sec.g.some((g) => Math.abs(g - 17.37) < 0.5)).toBe(true);
  });
});

describe("태양·지구·달", () => {
  it("10억 년 뒤 태양 광도 약 1.1배 (Gough 1981)", () => expect(sunAt(1).L).toBeCloseTo(1.096, 2));
  it("75.9억 년 뒤 적색거성 정점: 256 R☉, 2730 L☉", () => {
    const s = sunAt(7.589);
    expect(s.phase).toBe("적색거성");
    expect(s.R).toBeGreaterThan(200);
  });
  it("80억 년 뒤 백색왜성", () => expect(sunAt(8).phase).toBe("백색왜성"));
  it("지구는 적색거성 끝에 삼켜짐 (Schröder & Smith 2008)", () => {
    expect(earthAt(7.0).engulfed).toBe(false);
    expect(earthAt(7.6).engulfed).toBe(true);
  });
  it("달은 10억 년 뒤 약 41.5만 km, 하루는 약 29시간", () => {
    expect(moonDistance(1e9) / 1000).toBeCloseTo(415, 0);
    expect(dayLength(0)).toBeCloseTo(24, 2);
    expect(dayLength(1e9)).toBeGreaterThan(27);
  });
  it("개기일식은 2억~6억 년 뒤 끝남", () => {
    const y = eclipseEndYears();
    expect(y).toBeGreaterThan(2e8);
    expect(y).toBeLessThan(6e8);
  });
});

describe("국부 은하군", () => {
  it("최선 추정: 대마젤란은하가 먼저, 안드로메다는 50~100억 년 사이에 병합", () => {
    const b = runLocalGroup(LG_BEST);
    expect(b.mergeLMC!).toBeLessThan(4);
    expect(b.mergeM31!).toBeGreaterThan(5);
    expect(b.mergeM31!).toBeLessThan(10);
  });
  it("몬테카를로: 50억 년 안은 드물고, 100억 년 안은 절반 안팎 (Sawala 외 2025)", () => {
    const f = forecastLocalGroup(120, 7);
    expect(f.pMerge5).toBeLessThan(0.25);
    expect(f.pMerge10).toBeGreaterThan(0.3);
    expect(f.pMerge10).toBeLessThan(0.85);
  });
});

describe("별", () => {
  it("태양 같은 별: 약 1 M☉, 수명 약 100억 년", () => {
    const p = starPhys(4.83, 0.65, 5);
    expect(p.M).toBeCloseTo(1, 0);
    expect(p.tMS / 1e9).toBeCloseTo(10, -1);
  });
  it("초거성은 수백만 년 안에 죽고 초신성이 됨", () => {
    const p = starPhys(-5.85, 1.85, 1);
    expect(p.M).toBeGreaterThan(8);
    expect(aliveProbability(p, 5e6)).toBe(0);
    expect(p.fate).toMatch(/초신성|블랙홀/);
  });
});

describe("탐사선 미션 (호만 전이)", () => {
  const ss = solarSystem(), earth = ss.planets[2], mars = ss.planets[3];
  const now = (Date.UTC(2026, 9, 31) - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const tr = planTransfer(earth, mars, now);
  it("지구→화성: 비행 약 259일, 출발 v∞ ≈ 2.9 km/s, 위상각 ≈ 44°", () => {
    expect(tr.tofDays).toBeCloseTo(259, -1);
    expect(tr.vInf1).toBeCloseTo(2.94, 1);
    expect(tr.phaseDeg).toBeCloseTo(44, 0);
    expect(tr.dvDepart).toBeCloseTo(3.6, 0);
  });
  it("다음 화성 발사 창은 26개월 회합 주기 안", () => {
    expect(tr.windowDays).toBeGreaterThanOrEqual(0);
    expect(tr.windowDays).toBeLessThan(tr.synodicDays + 1);
    expect(tr.synodicDays).toBeCloseTo(780, -1);
  });
});

describe("통합 시간축", () => {
  const TL = new Timeline();
  it("지금은 a = 1, 빅뱅 쪽은 아주 작고, 먼 미래는 큼", () => {
    expect(TL.la(0)).toBeCloseTo(0, 6);
    expect(TL.la(-13.7e9)).toBeCloseTo(-1.5, 0); // 빅뱅 후 약 1억 년, z ≈ 30
    expect(TL.la(TL.dtMin + 1)).toBeCloseTo(-5.9, 0); // 빅뱅 후 1년 (복사 시대 a ∝ t^½)
    expect(TL.la(1e11)).toBeGreaterThan(2);
    expect(TL.Tcmb(0)).toBeCloseTo(2.7255, 3);
  });
  it("시간 막대 위치와 Δt가 서로 맞음", () => {
    for (const dt of [-1e9, -100, 0, 1000, 5e9, 1e14]) expect(sliderToDt(dtToSlider(dt, TL.dtMin, TL.dtMax), TL.dtMin, TL.dtMax) / (dt || 1)).toBeCloseTo(dt ? 1 : 0, 3);
  });
  it("빅 크런치를 고르면 끝이 약 190억 년 뒤", () => {
    TL.fate = "crunch";
    expect(TL.dtMax / 1e9).toBeGreaterThan(17);
    expect(TL.dtMax / 1e9).toBeLessThan(21);
    TL.fate = "lcdm";
  });
});
