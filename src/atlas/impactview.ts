// 픽셀 충돌 장면 그리기: 계산은 impact.worker.ts, 여기서는 픽셀을 네모난 점으로 그리고 분석값을 받아 둔다.
import * as THREE from "three";
import { ELEMENTS, sampleElement, type Composition } from "./composition";
import { EL_LIST, hcpSphere, type Analysis, type ImpactSetup, type LayerRef } from "./impact";

const VS = `
attribute vec3 aCol; attribute vec3 aEl; attribute vec3 aOrg; attribute float aT; attribute float aR; attribute float aGone;
uniform float uMode; uniform float uScale; uniform float uCut; uniform vec3 uCamDir; uniform float uMinPx;
varying vec3 vC;
vec3 bb(float T) {
  float t = T / 100.0;
  float r = t <= 66.0 ? 1.0 : clamp(1.293 * pow(t - 60.0, -0.1332), 0.0, 1.0);
  float g = t <= 66.0 ? clamp(0.390 * log(t) - 0.632, 0.0, 1.0) : clamp(1.130 * pow(t - 60.0, -0.0755), 0.0, 1.0);
  float b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.543 * log(t - 10.0) - 1.196, 0.0, 1.0));
  return vec3(r, g, b);
}
vec3 tempMap(float T) {
  // 차가움(남색) → 2000 K(빨강) → 5000 K(노랑) → 2만 K(흰색), 로그 눈금
  float x = clamp((log(max(T, 30.0)) - log(30.0)) / (log(20000.0) - log(30.0)), 0.0, 1.0);
  vec3 c = mix(vec3(0.05, 0.08, 0.35), vec3(0.15, 0.45, 0.9), smoothstep(0.0, 0.35, x));
  c = mix(c, vec3(0.9, 0.15, 0.1), smoothstep(0.35, 0.72, x));
  c = mix(c, vec3(1.0, 0.85, 0.2), smoothstep(0.72, 0.88, x));
  return mix(c, vec3(1.0), smoothstep(0.88, 1.0, x));
}
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  // 단면: 카메라 쪽 절반을 걷어 내 속을 보임
  if (aGone > 0.5 || (uCut > 0.5 && dot(wp.xyz, uCamDir) > 0.0)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(uMinPx, 1.8 * aR * uScale / max(-mv.z, 1e-9));
  vec3 c = uMode < 0.5 ? aCol : (uMode < 1.5 ? aEl : (uMode < 2.5 ? tempMap(aT) : aOrg));
  // 물질 보기: 아주 뜨거운 픽셀은 스스로 빛남 (녹은 바위의 주황~노랑, 6500 K에서 멈춤)
  if (uMode < 0.5) c = mix(c, bb(min(aT, 6500.0)) * 1.05, smoothstep(3000.0, 9000.0, aT) * 0.8);
  vC = c;
}`;
const FS = `
varying vec3 vC;
void main() {
  // 네모난 픽셀: 가장자리를 조금 어둡게
  vec2 q = abs(gl_PointCoord - 0.5);
  float edge = step(0.4, max(q.x, q.y));
  gl_FragColor = vec4(vC * (1.0 - 0.28 * edge), 1.0);
}`;

export type ColorMode = 0 | 1 | 2 | 3;
export const MODE_NAMES = ["물질", "원소", "온도", "출처"];
const ORIGIN_COLS: [number, number, number][] = [[0.35, 0.65, 1.0], [1.0, 0.55, 0.25], [0.6, 0.9, 0.4]];

export interface ImpactInfo {
  setup: ImpactSetup | null;
  n: number; t: number; progress: string; running: boolean; done: boolean;
  a: Analysis | null; contact: boolean; L: number; dt: number;
  layers: LayerRef[];
  /** 지금 화면에 있는 원소 (범례용) */
  elements: string[];
}

export class ImpactView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 1e-3, 1e8);
  theta = 0.5; phi = 1.0; r = 6; rMin = 0.05; rMax = 1e7;
  mode: ColorMode = 0; cut = false; auto = true;
  info: ImpactInfo = { setup: null, n: 0, t: 0, progress: "", running: false, done: false, a: null, contact: false, L: 1, dt: 0, layers: [], elements: [] };
  follow = -1;
  private worker: Worker | null = null;
  private pts: THREE.Points | null = null;
  private fixedPts: THREE.Points | null = null;
  private mat: THREE.ShaderMaterial;
  private fixedR = 0;
  private center = [0, 0, 0];
  onChange: () => void = () => {};

  constructor() {
    this.mat = new THREE.ShaderMaterial({ uniforms: { uMode: { value: 0 }, uScale: { value: 500 }, uCut: { value: 0 }, uCamDir: { value: new THREE.Vector3() }, uMinPx: { value: 2 } }, vertexShader: VS, fragmentShader: FS });
  }

  start(setup: ImpactSetup): void {
    this.clear();
    this.info = { setup, n: 0, t: 0, progress: "준비 중…", running: false, done: false, a: null, contact: false, L: 1, dt: 0, layers: [], elements: [] };
    this.follow = setup.follow;
    if (!this.worker) {
      this.worker = new Worker(new URL("./impact.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e) => this.onMsg(e.data);
    }
    this.worker.postMessage({ type: "start", setup });
    this.onChange();
  }
  pause(): void { this.worker?.postMessage({ type: "pause" }); this.info.running = false; this.onChange(); }
  resume(): void {
    if (!this.info.setup || this.info.setup.still) return;
    if (this.info.done) { this.worker?.postMessage({ type: "extend", seconds: this.info.setup.duration * 0.5 }); this.info.done = false; }
    this.worker?.postMessage({ type: "resume" }); this.info.running = true; this.onChange();
  }
  setFollow(f: number): void {
    this.follow = f; this.worker?.postMessage({ type: "follow", body: f });
    // 행성 중심으로 옮기면 행성 밖에서 보이게 물러남
    if (f === -2 && this.fixedR) this.r = Math.max(this.r, this.fixedR * 3.2);
  }
  /** 계산 시간 예산 [ms/프레임] */
  setBudget(ms: number): void { this.worker?.postMessage({ type: "budget", ms }); }
  stop(): void { this.worker?.postMessage({ type: "stop" }); this.clear(); this.info.setup = null; }

  private clear(): void {
    for (const o of [this.pts, this.fixedPts]) if (o) { this.scene.remove(o); o.geometry.dispose(); if (o !== this.pts) (o.material as THREE.Material).dispose(); }
    this.pts = null; this.fixedPts = null;
  }

  private onMsg(m: { type: string; [k: string]: unknown }): void {
    if (m.type === "progress") { this.info.progress = m.text as string; this.onChange(); return; }
    if (m.type === "built") {
      const n = m.n as number, layer = m.layer as Uint16Array, el = m.el as Uint8Array, body = m.body as Uint8Array, r = m.r as Float32Array, layers = m.layers as LayerRef[];
      this.info.n = n; this.info.L = m.L as number; this.info.layers = layers;
      const g = new THREE.BufferGeometry(), col = new Float32Array(3 * n), elc = new Float32Array(3 * n), org = new Float32Array(3 * n), seen = new Set<string>();
      for (let i = 0; i < n; i++) {
        const L = layers[layer[i]], ec = ELEMENTS[EL_LIST[el[i]]].color, oc = ORIGIN_COLS[body[i] % 3];
        // 같은 층 안에서도 조금씩 달라 보이게
        const j = 0.88 + 0.24 * ((i * 2654435761) % 1000) / 1000;
        col.set([L.color[0] * j, L.color[1] * j, L.color[2] * j], 3 * i); elc.set(ec, 3 * i); org.set(oc, 3 * i);
        seen.add(EL_LIST[el[i]]);
      }
      this.info.elements = [...seen].sort((a, b) => ELEMENTS[a as keyof typeof ELEMENTS].Z - ELEMENTS[b as keyof typeof ELEMENTS].Z);
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3 * n), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute("aCol", new THREE.BufferAttribute(col, 3)); g.setAttribute("aEl", new THREE.BufferAttribute(elc, 3)); g.setAttribute("aOrg", new THREE.BufferAttribute(org, 3));
      g.setAttribute("aT", new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute("aGone", new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute("aR", new THREE.BufferAttribute(r, 1));
      this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false;
      this.scene.add(this.pts);
      const s = this.info.setup!;
      const big = s.bodies.reduce((a, b) => (b.R > a.R ? b : a));
      this.r = s.fixed ? big.R / this.info.L * 9 : big.R / this.info.L * 6.5;
      this.phi = 1.15; this.theta = 0.5;
      if (s.still) this.r = 3.2;
      this.rMin = (big.R / this.info.L) * 0.2;
      if (s.fixed) this.buildFixed(s.fixed.comp, s.fixed.R / this.info.L);
      this.info.running = !s.still;
      this.onChange();
      return;
    }
    if (m.type === "frame" && this.pts) {
      const g = this.pts.geometry, x = m.x as Float32Array, T = m.T as Float32Array, gone = m.gone as Uint8Array;
      (g.attributes.position as THREE.BufferAttribute).set(x); g.attributes.position.needsUpdate = true;
      (g.attributes.aT as THREE.BufferAttribute).set(T); g.attributes.aT.needsUpdate = true;
      const ga = g.attributes.aGone as THREE.BufferAttribute;
      for (let i = 0; i < gone.length; i++) (ga.array as Float32Array)[i] = gone[i];
      ga.needsUpdate = true;
      this.center = m.center as number[];
      if (this.fixedPts) this.fixedPts.position.set(-this.center[0], -this.center[1], -this.center[2]);
      this.info.t = m.t as number;
      if (m.done) { this.info.done = true; this.info.running = false; }
      this.info.progress = "";
      return;
    }
    if (m.type === "stats") { this.info.a = m.a as Analysis; this.info.contact = m.contact as boolean; this.info.dt = m.dt as number; this.onChange(); }
  }

  /** 가운데 고정된 행성도 픽셀로 (움직이지 않음, 층·원소 색) */
  private buildFixed(comp: Composition, R: number): void {
    const rp = R * Math.pow(0.74 / 9000, 1 / 3), pts = hcpSphere(R, rp), n = pts.length / 3;
    const col = new Float32Array(3 * n), elc = new Float32Array(3 * n), org = new Float32Array(3 * n).fill(0.5);
    let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < n; i++) {
      const fr = Math.hypot(pts[3 * i], pts[3 * i + 1], pts[3 * i + 2]) / R;
      let li = comp.layers.findIndex((l) => fr <= l.r);
      if (li < 0 || fr * R > R - 1.6 * rp) li = comp.layers.length - 1;
      const L = comp.layers[li], j = 0.85 + 0.3 * rnd();
      col.set([L.color[0] * j, L.color[1] * j, L.color[2] * j], 3 * i);
      elc.set(ELEMENTS[sampleElement(L.el, rnd())].color, 3 * i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
    g.setAttribute("aCol", new THREE.BufferAttribute(col, 3)); g.setAttribute("aEl", new THREE.BufferAttribute(elc, 3)); g.setAttribute("aOrg", new THREE.BufferAttribute(org, 3));
    g.setAttribute("aT", new THREE.BufferAttribute(new Float32Array(n).fill(300), 1));
    g.setAttribute("aGone", new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute("aR", new THREE.BufferAttribute(new Float32Array(n).fill(rp), 1));
    const m = this.mat.clone();
    m.uniforms = this.mat.uniforms; // 같은 유니폼을 함께 씀
    this.fixedPts = new THREE.Points(g, m); this.fixedPts.frustumCulled = false;
    this.fixedR = R;
    this.scene.add(this.fixedPts);
  }

  update(dt: number, W: number, H: number, dpr: number): void {
    if (this.auto && this.info.setup?.still) this.theta += 0.15 * dt;
    const sp = Math.sin(this.phi), r = this.r;
    this.camera.position.set(r * sp * Math.cos(this.theta), r * sp * Math.sin(this.theta), r * Math.cos(this.phi));
    this.camera.up.set(0, 0, 1);
    this.camera.lookAt(0, 0, 0);
    this.camera.aspect = W / Math.max(1, H);
    this.camera.near = r * 1e-3; this.camera.far = Math.max(r * 1e4, this.fixedR * 4 + r * 10);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    const u = this.mat.uniforms;
    u.uMode.value = this.mode; u.uCut.value = this.cut ? 1 : 0;
    u.uScale.value = H * dpr / (2 * Math.tan(this.camera.fov / 2 * Math.PI / 180));
    u.uMinPx.value = 1.5 * dpr;
    u.uCamDir.value.copy(this.camera.position).normalize();
  }
}
