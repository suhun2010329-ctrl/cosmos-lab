// 원소 구성과 픽셀 충돌 엔진 검사: 지구 전체 원소 비율, 격자 채우기, 중력 트리 정확도, 운동량·에너지 보존,
// 그리고 표준 거대 충돌(테이아)에서 철이 적은 원반이 생기는지.
import { describe, expect, it } from "vitest";
import { BODY_COMP, bulkComposition, layerMasses } from "../src/atlas/composition";
import { analyze, approach, build, G_SI, gravity, hcpSphere, newState, Octree, relax, step, type Built } from "../src/atlas/impact";
import { SCENES } from "../src/atlas/impactscenes";

describe("원소 구성", () => {
  it("지구 전체: 철 32%, 산소 30%, 규소 16%, 마그네슘 15% (McDonough 2003: 32.1 · 29.7 · 16.1 · 15.4)", () => {
    const b = Object.fromEntries(bulkComposition(BODY_COMP["지구"]).map((x) => [x.el, x.f]));
    expect(b.Fe).toBeCloseTo(0.321, 1); expect(b.O).toBeCloseTo(0.297, 1); expect(b.Si).toBeCloseTo(0.161, 1); expect(b.Mg).toBeCloseTo(0.154, 1);
    expect(layerMasses(BODY_COMP["지구"]).slice(0, 2).reduce((a, c) => a + c, 0)).toBeGreaterThan(0.29); // 핵 ≈ 32%
  });
  it("달은 철이 적고, 목성은 수소·헬륨, 모든 층의 원소 비율 합은 1", () => {
    const moon = Object.fromEntries(bulkComposition(BODY_COMP["달"]).map((x) => [x.el, x.f]));
    expect(moon.Fe).toBeLessThan(0.13);
    const jup = Object.fromEntries(bulkComposition(BODY_COMP["목성"]).map((x) => [x.el, x.f]));
    expect(jup.H + jup.He).toBeGreaterThan(0.85);
    for (const c of Object.values(BODY_COMP)) for (const l of c.layers) expect(Object.values(l.el).reduce((a, v) => a + (v ?? 0), 0)).toBeCloseTo(1, 9);
  });
});

describe("픽셀 엔진", () => {
  it("육방 최밀 쌓기: 채움률 약 74%", () => {
    const rp = 0.05, n = hcpSphere(1, rp).length / 3;
    expect(n * rp ** 3 / 1).toBeGreaterThan(0.6); expect(n * rp ** 3).toBeLessThan(0.8);
  });

  it("Barnes–Hut 중력이 직접 합과 2% 안에서 같다", () => {
    const b = build({ key: "t", duration: 0, follow: -1, still: true, bodies: [{ name: "지구", comp: BODY_COMP["지구"], M: 5.97e24, R: 6.371e6, n: 900, pos: [0, 0, 0], vel: [0, 0, 0] }] });
    const p = b.p, t = new Octree();
    t.build(p); gravity(p, t, 0.7);
    let err = 0, ref = 0;
    for (let i = 0; i < p.n; i += 37) {
      let ax = 0, ay = 0, az = 0;
      for (let j = 0; j < p.n; j++) { if (j === i) continue; const dx = p.x[3 * j] - p.x[3 * i], dy = p.x[3 * j + 1] - p.x[3 * i + 1], dz = p.x[3 * j + 2] - p.x[3 * i + 2], e = Math.max(p.r[i], p.r[j]), r2 = dx * dx + dy * dy + dz * dz + e * e, f = p.m[j] / (r2 * Math.sqrt(r2)); ax += f * dx; ay += f * dy; az += f * dz; }
      err += Math.hypot(p.a[3 * i] - ax, p.a[3 * i + 1] - ay, p.a[3 * i + 2] - az); ref += Math.hypot(ax, ay, az);
    }
    expect(err / ref).toBeLessThan(0.02);
  });

  it("접근 궤도: 거리 D에서 출발해도 에너지·각운동량이 접촉 순간 값과 같다", () => {
    const M1 = 5.97e24, R1 = 6.37e6, M2 = 7.3e22, R2 = 1.74e6, v = 9000, ang = 30;
    const a = approach(M1, R1, M2, R2, v, ang), mu = G_SI * (M1 + M2);
    const rx = a.p2[0] - a.p1[0], ry = a.p2[1] - a.p1[1], vx = a.v2[0] - a.v1[0], vy = a.v2[1] - a.v1[1];
    const E = 0.5 * (vx * vx + vy * vy) - mu / Math.hypot(rx, ry), h = rx * vy - ry * vx;
    expect(E).toBeCloseTo(0.5 * v * v - mu / (R1 + R2), -2);
    expect(Math.abs(h) / ((R1 + R2) * v * Math.sin(ang * Math.PI / 180))).toBeCloseTo(1, 6);
  });

  it("작은 충돌: 운동량 보존, 에너지(운동 + 중력 + 열) 변화 3% 미만, NaN 없음", () => {
    const M1 = 5.97e24, R1 = 6.371e6, M2 = 6.4e23, R2 = 3.39e6, ap = approach(M1, R1, M2, R2, 12000, 30);
    const b = build({ key: "t", duration: 3 * 3600, follow: -1, bodies: [
      { name: "A", comp: BODY_COMP["지구"], M: M1, R: R1, n: 300, pos: ap.p1, vel: ap.v1 },
      { name: "B", comp: BODY_COMP["화성"], M: M2, R: R2, n: 120, pos: ap.p2, vel: ap.v2 },
    ] });
    relax(b, 60);
    const E = (bb: Built) => { const p = bb.p; let K = 0, W = 0, Q = 0; for (let i = 0; i < p.n; i++) { K += 0.5 * p.m[i] * (p.v[3 * i] ** 2 + p.v[3 * i + 1] ** 2 + p.v[3 * i + 2] ** 2); Q += p.m[i] * p.u[i]; for (let j = i + 1; j < p.n; j++) { const d = Math.hypot(p.x[3 * i] - p.x[3 * j], p.x[3 * i + 1] - p.x[3 * j + 1], p.x[3 * i + 2] - p.x[3 * j + 2]), e = Math.max(p.r[i], p.r[j]); W -= p.m[i] * p.m[j] / Math.sqrt(d * d + e * e); } } return { tot: K + W + Q, W };
    };
    const P = (bb: Built) => { const p = bb.p; let x = 0, y = 0; for (let i = 0; i < p.n; i++) { x += p.m[i] * p.v[3 * i]; y += p.m[i] * p.v[3 * i + 1]; } return [x, y]; };
    const e0 = E(b), p0 = P(b), s = newState(), end = 3 * 3600 / b.units.T;
    while (s.t < end) step(b, s);
    const e1 = E(b), p1 = P(b);
    expect(b.p.x.every((v) => isFinite(v))).toBe(true);
    expect(s.contacts.cross).toBeGreaterThan(0);
    expect(Math.abs(e1.tot - e0.tot) / Math.abs(e0.W)).toBeLessThan(0.03);
    // 부딪친 천체 운동량의 백만분의 1보다 작게
    const pImp = (M2 / b.units.Mu) * 12000 / (b.units.L / b.units.T);
    expect(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / pImp).toBeLessThan(1e-6);
  });

  it("테이아 충돌 (거친 해상도): 원반이 생기고, 원반은 행성보다 철이 적으며 대부분 테이아 물질", () => {
    const sc = SCENES.find((x) => x.key === "theia")!, st = sc.make(0);
    st.bodies[0].n = 700; st.bodies[1].n = 260; st.duration = 6 * 3600;
    const b = build(st);
    relax(b, 100);
    const s = newState(), end = st.duration / b.units.T;
    while (s.t < end) step(b, s);
    const a = analyze(b, s);
    expect(a.diskLunar).toBeGreaterThan(0.3);
    expect(a.diskLunar).toBeLessThan(6);
    expect(a.diskFe).toBeLessThan(a.planetFe);
    expect(a.diskFromImpactor).toBeGreaterThan(0.5);
  }, 120000);
});
