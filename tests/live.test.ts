// 실시간 자료 분석 검사: 태양 주기 맞춤, 충돌 에너지·충돌구, 인공위성 궤도, 허블 상수 종합, 논문 값 추출·검증 규칙.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ageForH0, diameterFromH, fitSolarCycle, hathaway, impactEffects, satNow, summarizeH0, type Measurement } from "../src/atlas/live";
import { orbitPos, solarSystem } from "../src/atlas/system";
// @ts-expect-error 순수 JS 모듈
import { PARAMS, parseAtom, verify } from "../scripts/live/lib.mjs";

describe("변인 분석", () => {
  it("태양 주기 맞춤: 알려진 주기 함수에서 만든 자료의 극대 시점을 되찾는다", () => {
    const a = 0.0026, t0 = 2019 * 12 + 11, rows: [string, number, number, number][] = [];
    for (let k = t0 - 6; k <= t0 + 70; k++) rows.push([Math.floor(k / 12) + "-" + String((k % 12) + 1).padStart(2, "0"), Math.max(0, hathaway(a, k - t0) + 8 * Math.sin(k)), -1, 150]);
    const f = fitSolarCycle(rows)!;
    let tm = 0, rm = 0; for (let t = 0; t < 200; t += 0.25) { const r = hathaway(a, t); if (r > rm) { rm = r; tm = t0 + t; } }
    expect(Math.abs(f.maxAt - tm)).toBeLessThan(4);
    expect(Math.abs(f.maxR - rm) / rm).toBeLessThan(0.1);
    expect(f.minAt).toBeGreaterThan(f.maxAt + 36);
  });

  it("소행성: H = 22 → 지름 약 140 m, 첼랴빈스크(20 m, 19 km/s) ≈ 0.5 Mt 공중 폭발", () => {
    expect(diameterFromH(22)).toBeGreaterThan(130); expect(diameterFromH(22)).toBeLessThan(150);
    const c = impactEffects(20, 19);
    expect(c.E_Mt).toBeGreaterThan(0.3); expect(c.E_Mt).toBeLessThan(0.7); expect(c.airburst).toBe(true);
    const big = impactEffects(1000, 20);
    expect(big.craterKm!).toBeGreaterThan(8); expect(big.craterKm!).toBeLessThan(25); // 1 km 소행성 → 충돌구 약 10–20 km
  });

  it("국제우주정거장: 하루 15.5바퀴 → 고도 약 420 km, 92.9분", () => {
    const s = satNow({ name: "ISS", id: 25544, epoch: "2026-11-01T00:00:00", n: 15.5, e: 0.0004, i: 51.64, raan: 100, argp: 50, M: 300, bstar: 1e-4 }, new Date("2026-11-01T06:00:00Z"));
    expect(s.alt).toBeGreaterThan(400); expect(s.alt).toBeLessThan(440);
    expect(s.periodMin).toBeCloseTo(92.9, 0);
    expect(s.ageDays).toBeCloseTo(0.25, 6);
  });

  it("허블 상수 종합: 검증된 측정에서 초기·후기 우주 값과 긴장(약 3–5σ)", () => {
    const lit = JSON.parse(readFileSync(new URL("../public/data/literature.json", import.meta.url), "utf-8")).measurements as Measurement[];
    const h = summarizeH0(lit, []);
    expect(h.early.mean).toBeCloseTo(67.4, 1);
    expect(h.late.mean).toBeGreaterThan(71); expect(h.late.mean).toBeLessThan(73.5);
    expect(h.tension).toBeGreaterThan(3); expect(h.tension).toBeLessThan(6);
    expect(ageForH0(73.04)).toBeCloseTo(12.73, 1);
  });
});

describe("실시간 자료로 모형 검증", () => {
  it("행성 위치: JPL Horizons(2026-11-02 0시, 실시간 수집기가 받은 값)와 각 5′ 안 (JPL 표 1 요소 + 변화율)", () => {
    // 태양 중심 황도 J2000 좌표 [AU]
    const H: Record<string, number[]> = { 수성: [0.2922, 0.1484, -0.0147], 금성: [0.5152, 0.5068, -0.0228], 지구: [0.769, 0.6273, 0], 화성: [-0.3015, 1.5661, 0.0402], 목성: [-3.6717, 3.8454, 0.0662], 토성: [9.2141, 1.9413, -0.4006], 천왕성: [8.8176, 17.3201, -0.05], 해왕성: [29.8319, 1.481, -0.718] };
    const days = 2461346.5 - 2451545.0, v = new THREE.Vector3();
    for (const p of solarSystem().planets) {
      const h = H[p.name];
      if (!h) continue;
      orbitPos(p, days, v);
      const e = [v.x, -v.z, v.y], ang = Math.acos(Math.min(1, (e[0] * h[0] + e[1] * h[1] + e[2] * h[2]) / (Math.hypot(...e) * Math.hypot(...h))));
      expect(ang * 180 / Math.PI * 60, p.name).toBeLessThan(5);
    }
  });
});

describe("논문 자동 수집기의 규칙", () => {
  const atom = `<feed><entry><id>http://arxiv.org/abs/2611.01234v1</id><published>2026-11-01T00:00:00Z</published><title>A new
    distance-ladder measurement</title><summary>We find $H_0 = 72.6 \\pm 1.4$ km/s/Mpc using ...</summary><arxiv:journal_ref>Astronomy &amp; Astrophysics 999, 1 (2026)</arxiv:journal_ref></entry>
    <entry><id>http://arxiv.org/abs/2611.05555v1</id><title>Exotic</title><summary>We obtain H0=95.0 ± 1.0 km/s/Mpc.</summary></entry></feed>`;
  it("초록에서 값과 불확도를 뽑고 학술지 정보를 읽는다", () => {
    const e = parseAtom(atom);
    expect(e).toHaveLength(2);
    expect(e[0].title).toBe("A new distance-ladder measurement");
    const m = e[0].summary.match(PARAMS.H0.re);
    expect(+m[1]).toBe(72.6); expect(+m[2]).toBe(1.4);
    expect(e[0].journal).toBe("Astronomy & Astrophysics 999, 1 (2026)");
  });
  it("범위 밖·게재 미확인·크게 어긋난 값은 보류, 나머지는 반영", () => {
    const ref = { mean: 68.4, sigma: 0.4, n: 4 }, [a, b] = parseAtom(atom);
    expect(verify("H0", 72.6, 1.4, ref, { journal: a.journal }, a).status).toBe("accepted");
    expect(verify("H0", 72.6, 1.4, ref, { journal: "Astronomy &amp; Astrophysics" }, a).journal).toBe("Astronomy & Astrophysics");
    const bad = verify("H0", 95, 1, ref, null, b);
    expect(bad.status).toBe("pending");
    expect(bad.reasons.join(" ")).toMatch(/범위/);
    expect(bad.reasons.join(" ")).toMatch(/게재/);
    expect(verify("H0", 80, 1, ref, { journal: "X" }, a).reasons.join(" ")).toMatch(/σ 차이/);
  });
});
