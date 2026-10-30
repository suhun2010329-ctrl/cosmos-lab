// 행성계 장면 (AU 단위): 실제 태양계(오늘 날짜의 행성 위치, 위성, 고리, 소행성대·카이퍼대)와 외계행성계.
import * as THREE from "three";
import { blackbody } from "../shared/color";
import { BODY_FS, BODY_VS, SUN_FS, SUN_VS } from "./shaders";
import { MOONS, PLANETS, type Body } from "./catalog";
import { planetA, planetRadiusEarth, type PlanetSystem } from "./data";
import { rng } from "../shared/math";

export interface SysPlanet {
  name: string;
  a: number; e: number; i: number; node: number; peri: number;
  /** J2000 평균 경도 [°] 또는 임의 위상 */
  L0: number;
  /** 공전 주기 [일] */
  P: number;
  R: number;
  Rest: boolean;
  type: string;
  col: [number, number, number]; col2: [number, number, number]; bands: boolean; rings?: [number, number];
  mass?: number | null; Teq?: number; year?: number | null; method?: string | null;
}
export interface SysData {
  name: string;
  real: boolean;
  star: { T: number; R: number; L: number; M: number; spect: string };
  planets: SysPlanet[];
  hz: [number, number];
}

const J2000 = Date.UTC(2000, 0, 1, 12);
const DEG = Math.PI / 180;

/** 케플러 방정식 E − e sin E = M (뉴턴법) */
function kepler(M: number, e: number): number {
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

/** 궤도 요소 → 황도 좌표 [AU] → three.js 좌표 (y가 황도 북극) */
export function orbitPos(p: SysPlanet, days: number, out: THREE.Vector3): THREE.Vector3 {
  const n = 360 / p.P, M = ((p.L0 + n * days - p.peri) % 360) * DEG;
  const E = kepler(M, p.e), nu = 2 * Math.atan2(Math.sqrt(1 + p.e) * Math.sin(E / 2), Math.sqrt(1 - p.e) * Math.cos(E / 2));
  const r = p.a * (1 - p.e * Math.cos(E));
  return eclipticToThree(p, nu, r, out);
}
function eclipticToThree(p: SysPlanet, nu: number, r: number, out: THREE.Vector3): THREE.Vector3 {
  const O = p.node * DEG, w = (p.peri - p.node) * DEG, i = p.i * DEG, u = w + nu;
  const x = r * (Math.cos(O) * Math.cos(u) - Math.sin(O) * Math.sin(u) * Math.cos(i));
  const y = r * (Math.sin(O) * Math.cos(u) + Math.cos(O) * Math.sin(u) * Math.cos(i));
  const z = r * Math.sin(u) * Math.sin(i);
  return out.set(x, z, -y);
}

/**
 * 보수적 생명 가능 지대 (Kopparapu 외 2013, 정오표 반영): 안쪽 = 폭주 온실, 바깥쪽 = 최대 온실.
 * 경계 복사량 S_eff는 별 온도에 따라 달라짐: S = S☉ + aT + bT² + cT³ + dT⁴, T = T_eff − 5780 K (2600–7200 K에서 유효)
 */
export function habitableZone(L: number, Teff = 5780): [number, number] {
  const T = Math.max(2600, Math.min(7200, Teff)) - 5780;
  const S = (s0: number, a: number, b: number, c: number, d: number) => s0 + a * T + b * T * T + c * T * T * T + d * T * T * T * T;
  const sIn = S(1.0385, 1.2456e-4, 1.4612e-8, -7.6345e-12, -1.7511e-15), sOut = S(0.3507, 5.9578e-5, 1.6707e-9, -3.0058e-12, -5.1925e-16);
  return [Math.sqrt(L / sIn), Math.sqrt(L / sOut)];
}

export function solarSystem(): SysData {
  const planets: SysPlanet[] = PLANETS.map((b: Body) => ({
    name: b.name, a: b.a, e: b.e, i: b.i, node: b.node, peri: b.peri, L0: b.L, P: 365.256 * Math.pow(b.a, 1.5), R: b.R, Rest: false,
    type: b.type, col: b.col, col2: b.col2, bands: !!b.bands, rings: b.rings, Teq: 278.6 / Math.sqrt(b.a) * 0.915,
  }));
  return { name: "태양계", real: true, star: { T: 5772, R: 1, L: 1, M: 1, spect: "G2V" }, planets, hz: habitableZone(1, 5772) };
}

function hash01(s: string): number {
  let h = 2166136261;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619) >>> 0;
  return h / 4294967296;
}

export function exoSystem(s: PlanetSystem): SysData {
  const M = s.star.mass ?? 1, R = s.star.radius ?? Math.pow(M, 0.8), T = s.star.temp ?? 5772 * Math.pow(M, 0.5);
  const L = R * R * Math.pow(T / 5772, 4);
  const planets: SysPlanet[] = [];
  for (const p of s.planets) {
    const a = planetA(p, s.star.mass);
    if (!a) continue;
    const { R: Rp, estimated } = planetRadiusEarth(p), h = hash01(p.name);
    const P = p.period ?? 365.25 * Math.sqrt(a * a * a / M);
    const Teq = p.temp ?? 278.6 * Math.pow(L, 0.25) / Math.sqrt(a) * 0.915;
    const type = Rp < 1.6 ? "암석 행성" : Rp < 4 ? (Rp < 1.9 ? "슈퍼지구" : "미니 해왕성") : Rp < 7 ? "얼음 거대행성" : P < 10 ? "뜨거운 목성" : "가스 거대행성";
    const gas = Rp >= 4, hot = Teq > 700;
    const col: [number, number, number] = gas ? (hot ? [0.75, 0.45, 0.35] : Rp < 7 ? [0.45, 0.7, 0.85] : [0.82, 0.68, 0.5]) : hot ? [0.55, 0.3, 0.2] : Teq > 200 && Teq < 330 ? [0.2, 0.42, 0.7] : [0.5, 0.47, 0.44];
    const col2: [number, number, number] = gas ? (Rp < 7 ? [0.6, 0.82, 0.92] : [0.95, 0.88, 0.75]) : hot ? [0.85, 0.5, 0.25] : Teq > 200 && Teq < 330 ? [0.42, 0.55, 0.35] : [0.7, 0.66, 0.6];
    planets.push({ name: p.name, a, e: p.e ?? 0, i: 0, node: 0, peri: h * 360, L0: hash01(p.name + "L") * 360, P, R: Rp, Rest: estimated, type, col, col2, bands: gas, mass: p.mass, Teq, year: p.year, method: p.method });
  }
  planets.sort((x, y) => x.a - y.a);
  return { name: s.name, real: false, star: { T, R, L, M, spect: s.star.spect ?? "" }, planets, hz: habitableZone(L, T) };
}

interface Live { mesh: THREE.Mesh; p: SysPlanet; label: HTMLDivElement; moons: { mesh: THREE.Mesh; dist: number; P: number; phase: number; label: HTMLDivElement }[] }

export class SystemView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 1e-5, 1e6);
  data: SysData | null = null;
  theta = 0.7; phi = 1.1; r = 3; rMin = 0.01; rMax = 300;
  daysPerSec = 20;
  /** 태양계는 실제 오늘 날짜에서 시작 */
  days = (Date.now() - J2000) / 86400000;
  private live: Live[] = [];
  private glow: THREE.Texture;
  private v = new THREE.Vector3();

  constructor(private labels: HTMLElement) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d")!, g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.2, "rgba(255,255,255,0.55)"); g.addColorStop(0.5, "rgba(255,255,255,0.12)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    this.glow = new THREE.CanvasTexture(c);
  }

  clear(): void {
    const s = this.scene;
    while (s.children.length) {
      const o = s.children.pop() as THREE.Mesh;
      o.traverse?.((ch) => { const m = ch as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose?.(); });
    }
    for (const l of this.live) { l.label.remove(); l.moons.forEach((m) => m.label.remove()); }
    this.live = [];
    this.data = null;
  }

  show(d: SysData): void {
    this.clear();
    this.data = d;
    const s = this.scene, aMin = Math.min(...d.planets.map((p) => p.a * (1 - p.e)), 1);
    const sc = blackbody(d.star.T).map((v) => v / 255) as [number, number, number];
    // 화면 크기는 보기 쉽게 키우되, 가장 안쪽 궤도보다 커지지 않게 제한
    const Rs = Math.min(0.05 * Math.sqrt(d.star.R), 0.35 * aMin);
    const star = new THREE.Mesh(new THREE.SphereGeometry(Rs, 48, 24), new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Vector3(...sc) } }, vertexShader: SUN_VS, fragmentShader: SUN_FS }));
    s.add(star);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: new THREE.Color(...sc), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(Rs * 9); s.add(glow);
    const hz = new THREE.Mesh(new THREE.RingGeometry(d.hz[0], d.hz[1], 180, 1), new THREE.MeshBasicMaterial({ color: 0x1baf7a, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }));
    hz.rotation.x = -Math.PI / 2; s.add(hz);
    // 배경 별
    const bg = new THREE.BufferGeometry(), bp = new Float32Array(3 * 3000), rb = rng(99);
    for (let i = 0; i < 3000; i++) { const cz = 2 * rb() - 1, ph = 6.2831853 * rb(), sn = Math.sqrt(1 - cz * cz); bp[3 * i] = 5e4 * sn * Math.cos(ph); bp[3 * i + 1] = 5e4 * cz; bp[3 * i + 2] = 5e4 * sn * Math.sin(ph); }
    bg.setAttribute("position", new THREE.BufferAttribute(bp, 3));
    s.add(new THREE.Points(bg, new THREE.PointsMaterial({ color: 0xbfc4dc, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.7 })));
    if (d.real) this.addBelts();

    const sorted = [...d.planets].sort((x, y) => x.a - y.a);
    sorted.forEach((p, k) => {
      const orb: THREE.Vector3[] = [];
      for (let j = 0; j <= 256; j++) {
        const E = j / 256 * 2 * Math.PI, nu = 2 * Math.atan2(Math.sqrt(1 + p.e) * Math.sin(E / 2), Math.sqrt(1 - p.e) * Math.cos(E / 2));
        orb.push(eclipticToThree(p, nu, p.a * (1 - p.e * Math.cos(E)), new THREE.Vector3()));
      }
      const dwarf = p.type === "왜소행성";
      s.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(orb), new THREE.LineBasicMaterial({ color: dwarf ? 0x6f6a82 : 0x8a86a0, transparent: true, opacity: dwarf ? 0.22 : 0.4 })));
      const gap = Math.min(p.a - (sorted[k - 1]?.a ?? 0), (sorted[k + 1]?.a ?? p.a * 2) - p.a);
      const rd = Math.max(Math.min(0.02 * Math.sqrt(p.R), 0.3 * gap, 0.25 * p.a), 0.002);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(rd, 32, 16), new THREE.ShaderMaterial({
        uniforms: { uCol: { value: new THREE.Vector3(...p.col) }, uCol2: { value: new THREE.Vector3(...p.col2) }, uBands: { value: p.bands ? 1 : 0 }, uSeed: { value: k * 1.7 + 0.3 }, uStar: { value: new THREE.Vector3() } },
        vertexShader: BODY_VS, fragmentShader: BODY_FS,
      }));
      if (p.rings) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(rd * p.rings[0], rd * p.rings[1], 96, 1), new THREE.MeshBasicMaterial({ color: p.name === "토성" ? 0xd9c9a3 : 0x9fb3c8, transparent: true, opacity: p.name === "토성" ? 0.55 : 0.25, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2 + (p.name === "토성" ? 26.7 : 82) * DEG;
        mesh.add(ring);
      }
      s.add(mesh);
      const label = this.makeLabel(p.name, dwarf ? "dwarf" : "");
      const moons = d.real ? MOONS.filter((m) => m[1] === p.name).map(([name, , aKm, P, rKm], j) => {
        const Rkm = p.R * 6371, dist = rd * (1.8 + 1.4 * Math.log10(aKm / Rkm));
        const mm = new THREE.Mesh(new THREE.SphereGeometry(Math.max(rd * 0.28 * Math.sqrt(rKm / Rkm), rd * 0.06), 16, 8), new THREE.ShaderMaterial({
          uniforms: { uCol: { value: new THREE.Vector3(0.62, 0.6, 0.58) }, uCol2: { value: new THREE.Vector3(0.8, 0.78, 0.75) }, uBands: { value: 0 }, uSeed: { value: j * 3.1 }, uStar: { value: new THREE.Vector3() } },
          vertexShader: BODY_VS, fragmentShader: BODY_FS,
        }));
        s.add(mm);
        return { mesh: mm, dist, P, phase: hash01(name) * 2 * Math.PI, label: this.makeLabel(name, "moon") };
      }) : [];
      this.live.push({ mesh, p, label, moons });
    });
    const aMax = Math.max(...d.planets.map((p) => p.a * (1 + p.e)), d.hz[1], 0.2);
    this.r = d.real ? 4.5 : Math.min(Math.max(aMax * 2.6, 0.08), 200);
    this.rMin = Rs * 2.5; this.rMax = Math.max(400, aMax * 10);
    this.theta = 0.7; this.phi = 1.1;
    this.camera.near = Math.max(this.rMin * 0.01, 1e-6);
    this.camera.updateProjectionMatrix();
    if (!d.real) this.days = 0;
    else this.days = (Date.now() - J2000) / 86400000;
  }

  private addBelts(): void {
    const r = rng(7), make = (n: number, a0: number, a1: number, iMax: number, color: number, op: number) => {
      const g = new THREE.BufferGeometry(), p = new Float32Array(3 * n), tmp = new THREE.Vector3();
      for (let k = 0; k < n; k++) {
        const pl: SysPlanet = { name: "", a: a0 + (a1 - a0) * r(), e: 0.15 * r(), i: iMax * r() * r(), node: 360 * r(), peri: 360 * r(), L0: 360 * r(), P: 1, R: 0, Rest: false, type: "", col: [0, 0, 0], col2: [0, 0, 0], bands: false };
        eclipticToThree(pl, 2 * Math.PI * r(), pl.a, tmp);
        p[3 * k] = tmp.x; p[3 * k + 1] = tmp.y; p[3 * k + 2] = tmp.z;
      }
      g.setAttribute("position", new THREE.BufferAttribute(p, 3));
      this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color, size: 1.3, sizeAttenuation: false, transparent: true, opacity: op, depthWrite: false })));
    };
    make(4000, 2.1, 3.3, 18, 0xb8a990, 0.45);
    make(5000, 30, 50, 25, 0x8fa6c2, 0.35);
  }

  private makeLabel(text: string, cls: string): HTMLDivElement {
    const el = document.createElement("div");
    el.className = "plabel " + cls;
    el.textContent = text;
    this.labels.appendChild(el);
    return el;
  }

  hideLabels(): void {
    for (const l of this.live) { l.label.style.display = "none"; l.moons.forEach((m) => (m.label.style.display = "none")); }
  }

  update(dt: number, W: number, H: number, autoRotate: boolean): void {
    if (!this.data) return;
    this.days += dt * this.daysPerSec;
    if (autoRotate) this.theta += 0.04 * dt;
    const sp = Math.sin(this.phi);
    this.camera.position.set(this.r * sp * Math.cos(this.theta), this.r * Math.cos(this.phi), this.r * sp * Math.sin(this.theta));
    this.camera.lookAt(0, 0, 0);
    this.camera.aspect = W / Math.max(1, H);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    const place = (el: HTMLDivElement, pos: THREE.Vector3, minSep = 0, ref?: THREE.Vector3) => {
      this.v.copy(pos).project(this.camera);
      let vis = this.v.z < 1 && Math.abs(this.v.x) < 1.05 && Math.abs(this.v.y) < 1.05;
      const sx = (this.v.x * 0.5 + 0.5) * W, sy = (-this.v.y * 0.5 + 0.5) * H;
      if (vis && ref && minSep) { const q = ref.clone().project(this.camera); vis = Math.hypot(sx - (q.x * 0.5 + 0.5) * W, sy - (-q.y * 0.5 + 0.5) * H) > minSep; }
      el.style.display = vis ? "block" : "none";
      if (vis) { el.style.left = sx + "px"; el.style.top = sy + "px"; }
    };
    for (const l of this.live) {
      orbitPos(l.p, this.days, l.mesh.position);
      l.mesh.rotation.y += dt * 0.5;
      (l.mesh.material as THREE.ShaderMaterial).uniforms.uStar.value.set(0, 0, 0);
      place(l.label, l.mesh.position);
      for (const m of l.moons) {
        const ang = m.phase + 2 * Math.PI * this.days / m.P;
        m.mesh.position.set(l.mesh.position.x + m.dist * Math.cos(ang), l.mesh.position.y, l.mesh.position.z - m.dist * Math.sin(ang));
        place(m.label, m.mesh.position, 26, l.mesh.position);
      }
    }
  }
}
