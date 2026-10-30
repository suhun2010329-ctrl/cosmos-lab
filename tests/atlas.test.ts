// 우주지도 자료와 계산 검사: 단위(pc), 좌표 변환, 생명 가능 지대, 질량–반지름 관계.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { galLB, loadAtlasData, radecToGal, radiusFromMass } from "../src/atlas/data";
import { habitableZone, exoSystem } from "../src/atlas/system";

// fetch 대신 public/ 아래 파일을 읽음
globalThis.fetch = (async (url: string) => {
  const buf = readFileSync(new URL("../public/" + String(url).replace(/^\//, ""), import.meta.url));
  return { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), json: async () => JSON.parse(buf.toString("utf-8")) };
}) as unknown as typeof fetch;

describe("우주지도 자료", async () => {
  const data = await loadAtlasData("/", () => {});
  it("별·행성계·은하 개수", () => {
    expect(data.stars.n).toBeGreaterThan(100000);
    expect(data.systems.length).toBeGreaterThan(3000);
    expect(data.galaxies.length).toBeGreaterThan(10000);
  });
  it("은하 위치는 pc 단위이고 거리와 일치", () => {
    for (const g of data.galaxies.slice(0, 500)) expect(Math.abs(Math.hypot(...g.pos) / 1e6 / g.dMpc - 1)).toBeLessThan(2e-3);
    const m31 = data.galaxies.find((g) => g.id === "NGC0224")!;
    const [l, b] = galLB(m31.pos);
    expect(l).toBeCloseTo(121.17, 1);
    expect(b).toBeCloseTo(-21.57, 1);
  });
  it("프록시마 센타우리는 1.30 pc, 행성 b가 있음", () => {
    const px = data.systems.find((s) => s.name === "Proxima Centauri")!;
    expect(Math.hypot(...px.pos)).toBeCloseTo(1.295, 2);
    expect(px.planets.some((p) => p.name === "Proxima Centauri b")).toBe(true);
  });
  it("TRAPPIST-1의 생명 가능 지대에는 e, f, g (Kopparapu 외 2013, 온도 의존)", () => {
    const s = exoSystem(data.systems.find((x) => x.name === "TRAPPIST-1")!);
    const inHZ = s.planets.filter((p) => p.a >= s.hz[0] && p.a <= s.hz[1]).map((p) => p.name.slice(-1));
    expect(inHZ).toEqual(["e", "f", "g"]);
  });
});

describe("좌표와 관계식", () => {
  it("은하 중심 방향 (적경 266.4°, 적위 −28.94°)은 l ≈ 0, b ≈ 0", () => {
    const [l, b] = galLB(radecToGal(266.405, -28.936, 1));
    expect(Math.min(l, 360 - l)).toBeLessThan(0.1);
    expect(Math.abs(b)).toBeLessThan(0.1);
  });
  it("태양의 생명 가능 지대 ≈ 0.95–1.67 AU", () => {
    const [a, b] = habitableZone(1, 5772);
    expect(a).toBeCloseTo(0.98, 1);
    expect(b).toBeCloseTo(1.69, 1);
  });
  it("Chen & Kipping 2017: 지구 질량 → 약 1 R⊕, 목성 질량 → 약 12 R⊕", () => {
    expect(radiusFromMass(1)).toBeCloseTo(1.0, 1);
    expect(radiusFromMass(317.8)).toBeGreaterThan(11);
    expect(radiusFromMass(317.8)).toBeLessThan(15);
  });
});
