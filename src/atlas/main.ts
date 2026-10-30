// 우주지도: 행성 궤도(AU)부터 관측 가능한 우주의 끝(Gpc)까지 실제 목록으로 만든 하나의 확대 지도.
// 좌표는 은하 좌표계 [pc], 원점은 태양, Z가 은하 북극. 카메라는 원점에 두고 세상을 옮긴다(부동 원점 + RTE 셰이더).
import * as THREE from "three";
import { createCosmology } from "../shared/cosmology";
import { clamp, smooth } from "../shared/math";
import { GLOBULARS, LARGE_SCALE, LOCAL_GROUP, NEBULAE, SATELLITES, SUN_POS_NOTE, type NamedObject } from "./catalog";
import { bvToTemp, galLB, hubbleName, hubbleType, loadAtlasData, planetA, planetRadiusEarth, radecToGal, starColor, type AtlasData, type Galaxy } from "./data";
import { buildMilkyWay, GC_POS } from "./milkyway";
import { GAL_FS, GAL_VS, HOST_FS, HOST_VS, MW_FS, MW_VS, STAR_FS, STAR_VS } from "./shaders";
import { exoSystem, solarSystem, SystemView, type SysData } from "./system";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const AU_PC = 4.8481368e-6, LY_PC = 0.306601, FOV = 50;
const core = createCosmology();

// ---------- 표기 ----------
/** 유효숫자 3자리, 단 1000 이상은 정수로 (1.50e+3 같은 표기를 피함) */
function p3(x: number): string { return x >= 1000 ? Math.round(x).toLocaleString("ko-KR") : x.toPrecision(3); }
function fmtPc(pc: number): string {
  if (pc < 0.02) return p3(pc / AU_PC) + " AU";
  const ly = pc / LY_PC;
  if (ly < 1e4) return p3(ly) + " 광년";
  if (ly < 1e8) return p3(ly / 1e4) + "만 광년";
  return p3(ly / 1e8) + "억 광년";
}
function fmtPcUnit(pc: number): string {
  if (pc < 0.02) return p3(pc / AU_PC) + " AU";
  if (pc < 1e3) return pc.toPrecision(3) + " pc";
  if (pc < 1e6) return (pc / 1e3).toPrecision(3) + " kpc";
  if (pc < 1e9) return (pc / 1e6).toPrecision(3) + " Mpc";
  return (pc / 1e9).toPrecision(3) + " Gpc";
}
const GREEK: Record<string, string> = { Alp: "α", Bet: "β", Gam: "γ", Del: "δ", Eps: "ε", Zet: "ζ", Eta: "η", The: "θ", Iot: "ι", Kap: "κ", Lam: "λ", Mu: "μ", Nu: "ν", Xi: "ξ", Omi: "ο", Pi: "π", Rho: "ρ", Sig: "σ", Tau: "τ", Ups: "υ", Phi: "φ", Chi: "χ", Psi: "ψ", Ome: "ω" };
const STAR_KO: Record<string, string> = {
  Sirius: "시리우스", Canopus: "카노푸스", Arcturus: "아르크투루스", "Rigil Kentaurus": "알파 센타우리 A", Toliman: "알파 센타우리 B", Vega: "베가 (직녀성)", Capella: "카펠라",
  Rigel: "리겔", Procyon: "프로키온", Achernar: "아케르나르", Betelgeuse: "베텔게우스", Hadar: "하다르", Altair: "알타이르 (견우성)", Acrux: "아크룩스", Aldebaran: "알데바란",
  Antares: "안타레스", Spica: "스피카", Pollux: "폴룩스", Fomalhaut: "포말하우트", Deneb: "데네브", Mimosa: "미모사", Regulus: "레굴루스", Adhara: "아다라", Castor: "카스토르",
  Shaula: "샤울라", Gacrux: "가크룩스", Bellatrix: "벨라트릭스", Elnath: "엘나트", Alnilam: "알닐람", Alnitak: "알니타크", Mintaka: "민타카", Polaris: "북극성", Mira: "미라",
  Algol: "알골", "Proxima Centauri": "프록시마 센타우리", "Barnard's Star": "바너드 별", Dubhe: "두베", Alkaid: "알카이드", Mizar: "미자르", Thuban: "투반", Rasalhague: "라스알하게",
};
function starLabel(name: string): string {
  if (STAR_KO[name]) return STAR_KO[name];
  const m = /^([A-Z][a-z]{1,2})(\d?) (\w+)$/.exec(name);
  return m && GREEK[m[1]] ? GREEK[m[1]] + m[2] + " " + m[3] : name;
}

// ---------- 화면 ----------
const stage = $("stage"), cv = $<HTMLCanvasElement>("cv"), labelsEl = $("labels");
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: "high-performance" });
renderer.setClearColor(0x000000, 1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 1e-6, 1e12);
camera.up.set(0, 0, 1);
let W = 0, H = 0, dpr = 1;
const sys = new SystemView($("sysLabels"));

/** 위치를 float 두 개로 나눔 (RTE) */
function split(arr: ArrayLike<number>, n: number): { hi: Float32Array; lo: Float32Array } {
  const hi = new Float32Array(3 * n), lo = new Float32Array(3 * n);
  for (let i = 0; i < 3 * n; i++) { hi[i] = Math.fround(arr[i]); lo[i] = arr[i] - hi[i]; }
  return { hi, lo };
}
const camU = { uCamHi: { value: new THREE.Vector3() }, uCamLo: { value: new THREE.Vector3() } };
const uScale = { value: 1 }, uRes = { value: new THREE.Vector2(1, 1) };

// ---------- 카메라 (배정밀도) ----------
const cam = { target: [0, 0, 0] as number[], r: 8, theta: 0.6, phi: 1.05, auto: false, fly: null as null | Fly, label: "태양" };
interface Fly { t: number; T: number; from: number[]; to: number[]; r0: number; r1: number; bump: number; phi1?: number; phi0: number; onDone?: () => void }
const camPos = [0, 0, 0];
function camDir(): [number, number, number] {
  const sp = Math.sin(cam.phi);
  return [sp * Math.cos(cam.theta), sp * Math.sin(cam.theta), Math.cos(cam.phi)];
}
function flyTo(p: ArrayLike<number>, r: number, label: string, opts: { phi?: number; onDone?: () => void } = {}): void {
  const d = Math.hypot(p[0] - cam.target[0], p[1] - cam.target[1], p[2] - cam.target[2]);
  const bump = Math.max(0, Math.log(d / Math.max(cam.r, r) + 1)) * 0.9;
  const T = clamp(1.6 + 0.18 * Math.abs(Math.log10((d + r) / cam.r)), 1.8, 4.2);
  cam.fly = { t: 0, T, from: cam.target.slice(), to: [p[0], p[1], p[2]], r0: cam.r, r1: r, bump, phi0: cam.phi, phi1: opts.phi, onDone: opts.onDone };
  cam.label = label;
}
function ease(t: number): number { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function updateCamera(dt: number): void {
  const f = cam.fly;
  if (f) {
    f.t += dt;
    const u = clamp(f.t / f.T, 0, 1), e = ease(u);
    // 목표는 로그 척도로 이동: 멀리 갈 때는 먼저 물러났다가 다가감 (구글 어스식)
    for (let k = 0; k < 3; k++) cam.target[k] = f.from[k] + (f.to[k] - f.from[k]) * e;
    cam.r = Math.exp(Math.log(f.r0) + (Math.log(f.r1) - Math.log(f.r0)) * e + f.bump * Math.sin(Math.PI * e));
    if (f.phi1 !== undefined) cam.phi = f.phi0 + (f.phi1 - f.phi0) * e;
    if (u >= 1) { cam.fly = null; f.onDone?.(); }
  } else if (cam.auto && !pointers.size) cam.theta += 0.05 * dt;
  const d = camDir();
  for (let k = 0; k < 3; k++) camPos[k] = cam.target[k] + cam.r * d[k];
  camera.position.set(0, 0, 0);
  camera.lookAt(-d[0], -d[1], -d[2]);
  camera.near = Math.max(cam.r * 1e-4, 1e-9);
  camera.far = Math.max(cam.r * 1e7, 1e3);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  for (let k = 0; k < 3; k++) {
    const hi = Math.fround(camPos[k]);
    camU.uCamHi.value.setComponent(k, hi); camU.uCamLo.value.setComponent(k, camPos[k] - hi);
  }
}

// ---------- 층 ----------
let data: AtlasData;
let starMat: THREE.ShaderMaterial, hostMat: THREE.ShaderMaterial, galMat: THREE.ShaderMaterial, mwMat: THREE.ShaderMaterial, dustMat: THREE.ShaderMaterial;
let mwPts: THREE.Points, dustPts: THREE.Points, starPts: THREE.Points, hostPts: THREE.Points, galMesh: THREE.Mesh;
const shells: { g: THREE.LineSegments; R: number; name: string; note: string }[] = [];
/** 지도에 놓이는 모든 은하 (OpenNGC + 직접 적은 국부 은하군·위성은하) */
interface GalEntry { name: string; sub: string; pos: number[]; R: number; type: number; absMag: number; g?: Galaxy; o?: NamedObject }
const gals: GalEntry[] = [];
interface Named { name: string; pos: number[]; kind: NamedObject["kind"]; o: NamedObject }
const named: Named[] = [];

function buildLayers(): void {
  // 별 (HYG) + 태양
  const n = data.stars.n + 1, P = new Float64Array(3 * n), mag = new Float32Array(n), col = new Float32Array(3 * n);
  for (let i = 0; i < data.stars.n; i++) {
    const b = data.stars.buf;
    P[3 * i] = b[5 * i]; P[3 * i + 1] = b[5 * i + 1]; P[3 * i + 2] = b[5 * i + 2];
    mag[i] = b[5 * i + 3];
    const c = starColor(b[5 * i + 4]);
    col[3 * i] = c[0]; col[3 * i + 1] = c[1]; col[3 * i + 2] = c[2];
  }
  mag[n - 1] = 4.83; col.set(starColor(0.656), 3 * (n - 1));
  const sp = split(P, n), sg = new THREE.BufferGeometry(), hiAttr = new THREE.BufferAttribute(sp.hi, 3);
  sg.setAttribute("position", hiAttr); sg.setAttribute("aHi", hiAttr); sg.setAttribute("aLo", new THREE.BufferAttribute(sp.lo, 3));
  sg.setAttribute("aMag", new THREE.BufferAttribute(mag, 1)); sg.setAttribute("aCol", new THREE.BufferAttribute(col, 3));
  starMat = new THREE.ShaderMaterial({ uniforms: { ...camU, uMLim: { value: 6.5 }, uFade: { value: 1 }, uPx: { value: 1.6 } }, vertexShader: STAR_VS, fragmentShader: STAR_FS, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
  starPts = new THREE.Points(sg, starMat); starPts.frustumCulled = false; scene.add(starPts);

  // 외계행성계 표시
  const ns = data.systems.length, HP = new Float64Array(3 * ns), hn = new Float32Array(ns), hidx = new Float32Array(ns);
  data.systems.forEach((s, i) => { HP.set(s.pos, 3 * i); hn[i] = s.planets.length; hidx[i] = i; });
  const hs = split(HP, ns), hg = new THREE.BufferGeometry(), hh = new THREE.BufferAttribute(hs.hi, 3);
  hg.setAttribute("position", hh); hg.setAttribute("aHi", hh); hg.setAttribute("aLo", new THREE.BufferAttribute(hs.lo, 3));
  hg.setAttribute("aN", new THREE.BufferAttribute(hn, 1)); hg.setAttribute("aIdx", new THREE.BufferAttribute(hidx, 1));
  hostMat = new THREE.ShaderMaterial({ uniforms: { ...camU, uRange: { value: 10 }, uPx: { value: 1 }, uFade: { value: 1 }, uSelIdx: { value: -1 } }, vertexShader: HOST_VS, fragmentShader: HOST_FS, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
  hostPts = new THREE.Points(hg, hostMat); hostPts.frustumCulled = false; scene.add(hostPts);

  // 은하
  for (const g of data.galaxies) {
    const absMag = g.bmag != null ? g.bmag - 5 * Math.log10(g.dMpc * 1e6 / 10) : -19;
    gals.push({ name: galName(g), sub: g.id, pos: g.pos, R: (g.sizeKpc ?? 10) * 1000, type: hubbleType(g.hubble), absMag, g });
  }
  const extraMag = (o: NamedObject) => (o.en === "LMC" ? -18.1 : o.en === "SMC" ? -16.8 : o.kind === "satellite" ? -10 : -13.5);
  for (const o of [...SATELLITES, ...LOCAL_GROUP]) gals.push({ name: o.name, sub: o.en ?? "", pos: radecToGal(o.ra, o.dec, o.dkpc! * 1000), R: (o.size ?? 1.5) * 1000, type: o.en === "LMC" || o.en === "SMC" || o.kind === "localgroup" ? 1 : 3, absMag: extraMag(o), o });
  const ng = gals.length, GP = new Float64Array(3 * ng), E1 = new Float32Array(3 * ng), E2 = new Float32Array(3 * ng), gp = new Float32Array(4 * ng), gi = new Float32Array(ng);
  gals.forEach((e, i) => {
    GP.set(e.pos, 3 * i);
    const [a, b] = diskAxes(e);
    E1.set(a, 3 * i); E2.set(b, 3 * i);
    gp[4 * i] = e.type; gp[4 * i + 1] = hash01(e.sub || e.name); gp[4 * i + 2] = e.absMag; gp[4 * i + 3] = e.type === 3 ? 1 : 0; gi[i] = i;
  });
  const gs = split(GP, ng), geo = new THREE.InstancedBufferGeometry();
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geo.setAttribute("gHi", new THREE.InstancedBufferAttribute(gs.hi, 3)); geo.setAttribute("gLo", new THREE.InstancedBufferAttribute(gs.lo, 3));
  geo.setAttribute("gE1", new THREE.InstancedBufferAttribute(E1, 3)); geo.setAttribute("gE2", new THREE.InstancedBufferAttribute(E2, 3));
  geo.setAttribute("gP", new THREE.InstancedBufferAttribute(gp, 4)); geo.setAttribute("gIdx", new THREE.InstancedBufferAttribute(gi, 1));
  geo.instanceCount = ng;
  galMat = new THREE.ShaderMaterial({ uniforms: { ...camU, uMLim: { value: 20 }, uScale, uRes, uFade: { value: 1 }, uMinPx: { value: 1.6 }, uSelIdx: { value: -1 } }, vertexShader: GAL_VS, fragmentShader: GAL_FS, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
  galMesh = new THREE.Mesh(geo, galMat); galMesh.frustumCulled = false; scene.add(galMesh);

  // 우리 은하 모형 + 먼지
  const mw = buildMilkyWay();
  const mg = new THREE.BufferGeometry();
  mg.setAttribute("position", new THREE.BufferAttribute(mw.pos, 3)); mg.setAttribute("aCol", new THREE.BufferAttribute(mw.col, 4)); mg.setAttribute("aSize", new THREE.BufferAttribute(mw.size, 1));
  mwMat = new THREE.ShaderMaterial({ uniforms: { uScale, uFade: { value: 1 }, uMinPx: { value: 1.2 } }, vertexShader: MW_VS, fragmentShader: MW_FS, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
  mwPts = new THREE.Points(mg, mwMat); mwPts.frustumCulled = false;
  const dg = new THREE.BufferGeometry();
  dg.setAttribute("position", new THREE.BufferAttribute(mw.dust.pos, 3)); dg.setAttribute("aCol", new THREE.BufferAttribute(mw.dust.col, 4)); dg.setAttribute("aSize", new THREE.BufferAttribute(mw.dust.size, 1));
  dustMat = new THREE.ShaderMaterial({ uniforms: { uScale, uFade: { value: 1 }, uMinPx: { value: 1.0 } }, vertexShader: MW_VS, fragmentShader: MW_FS, transparent: true, depthTest: false, depthWrite: false, blending: THREE.NormalBlending });
  dustPts = new THREE.Points(dg, dustMat); dustPts.frustumCulled = false;
  scene.add(mwPts); scene.add(dustPts);

  // 이름 붙은 천체 (구상성단·성운·은하단·초은하단·공동)
  for (const o of [...GLOBULARS, ...NEBULAE, ...LARGE_SCALE]) {
    const dpc = o.dkpc !== undefined ? o.dkpc * 1000 : core.comovingDistance(o.z!) * 1e6;
    named.push({ name: o.name, pos: radecToGal(o.ra, o.dec, dpc), kind: o.kind, o });
  }

  // 관측 가능한 우주의 경계들 (공동 거리, Planck 2018)
  const ring = (R: number) => {
    const pts: number[] = [], seg = 128;
    const circ = (f: (t: number) => [number, number, number]) => { for (let k = 0; k < seg; k++) pts.push(...f(2 * Math.PI * k / seg), ...f(2 * Math.PI * (k + 1) / seg)); };
    circ((t) => [R * Math.cos(t), R * Math.sin(t), 0]);
    circ((t) => [R * Math.cos(t), 0, R * Math.sin(t)]);
    circ((t) => [0, R * Math.cos(t), R * Math.sin(t)]);
    for (const lat of [-60, -30, 30, 60]) { const z = R * Math.sin(lat * Math.PI / 180), rr = R * Math.cos(lat * Math.PI / 180); circ((t) => [rr * Math.cos(t), rr * Math.sin(t), z]); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
    return g;
  };
  const shellDefs: [string, number, string, number][] = [
    ["z = 0.1", core.comovingDistance(0.1) * 1e6, "빛이 약 13억 년 걸려 오는 거리. 근방 우주 지도(SDSS·2dF)의 깊이.", 0x5d7fbf],
    ["허블 거리 c/H₀", 299792.458 / (100 * core.h) * 1e6, "지금 후퇴 속도가 빛의 속도와 같은 거리 (약 44.5억 파섹).", 0x7a6fd1],
    ["z = 1", core.comovingDistance(1) * 1e6, "우주 나이가 지금의 약 43%였을 때 빛을 낸 은하들.", 0x5d7fbf],
    ["z = 14.44 (MoM-z14)", core.comovingDistance(14.44) * 1e6, "JWST가 분광으로 확인한 가장 먼 은하 (Naidu 외 2025).", 0xd98a3a],
    ["우주배경복사 (z ≈ 1090)", core.comovingDistance(1089.9) * 1e6, "마지막 산란면. 우리가 볼 수 있는 가장 오래된 빛.", 0xe0603a],
    ["입자 지평선", core.comovingDistance(1e9) * 1e6, "빅뱅 이후 빛이 올 수 있었던 가장 먼 곳. 관측 가능한 우주의 반지름.", 0xc8c8d8],
  ];
  for (const [name, R, note, color] of shellDefs) {
    const g = new THREE.LineSegments(ring(R), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false }));
    g.frustumCulled = false; scene.add(g);
    shells.push({ g, R, name, note });
  }
}

const GAL_KO: Record<string, string> = {
  "Andromeda Galaxy": "안드로메다 은하", "Triangulum Galaxy": "삼각형자리 은하", "Whirlpool Galaxy": "소용돌이 은하", "Sombrero Galaxy": "솜브레로 은하",
  "Pinwheel Galaxy": "바람개비 은하", "Southern Pinwheel Galaxy": "남쪽 바람개비 은하", "Cigar Galaxy": "시가 은하", "Bode's Galaxy": "보데 은하",
  "Black Eye Galaxy": "검은 눈 은하", "Sunflower Galaxy": "해바라기 은하", "Centaurus A": "센타우루스 A", "Virgo Galaxy": "처녀자리 은하 (M87)",
  "Sculptor Galaxy": "조각가자리 은하", "Silver Coin": "은화 은하", "Barnard's Galaxy": "바너드 은하", "Cartwheel Galaxy": "수레바퀴 은하",
  "Stephan's Quintet": "스테판의 오중주", "Fornax A": "화로자리 A", "Needle Galaxy": "바늘 은하", "Leo Triplet": "사자자리 삼중주",
  "Antennae Galaxies": "더듬이 은하", "Tadpole Galaxy": "올챙이 은하", "Sculptor Filament": "조각가자리 필라멘트",
};
function galName(g: Galaxy): string {
  const common = GAL_KO[g.common] ?? g.common;
  if (common && g.messier && !common.includes("M" + g.messier)) return common + " (M" + g.messier + ")";
  if (common) return common;
  if (g.messier) return "M" + g.messier;
  return g.id.replace(/^(NGC|IC)0*/, "$1 ");
}
function hash01(s: string): number {
  let h = 2166136261;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619) >>> 0;
  return h / 4294967296;
}

/**
 * 원반의 두 축 [pc]. 하늘의 위치각 PA(북→동)와 축비 q(경사각 i = acos q)로 원반면을 3차원에 세움.
 * 그래서 지구에서 보면 실제 사진과 같은 기울기로 보이고, 다른 곳에서 보면 진짜 3차원 방향으로 보인다.
 */
function diskAxes(e: GalEntry): [number[], number[]] {
  const R = e.R, g = e.g;
  if (!g || g.q == null || g.pa == null) {
    const h = hash01(e.name), u = 2 * Math.PI * h, v = Math.acos(2 * hash01(e.name + "v") - 1);
    const n = [Math.sin(v) * Math.cos(u), Math.sin(v) * Math.sin(u), Math.cos(v)];
    const a = norm(cross(n, Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), b = cross(n, a);
    return [a.map((x) => x * R), b.map((x) => x * R * (e.type === 3 ? 0.8 : 1))];
  }
  const ra = g.ra * Math.PI / 180, dec = g.dec * Math.PI / 180, pa = g.pa * Math.PI / 180;
  const rhat = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const east = [-Math.sin(ra), Math.cos(ra), 0], north = [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)];
  const major = [0, 1, 2].map((k) => Math.cos(pa) * north[k] + Math.sin(pa) * east[k]);
  const minorSky = cross(rhat, major), inc = Math.acos(clamp(g.q, 0.1, 1));
  // 원반의 짧은 축 = 하늘면의 짧은 축을 시선 방향으로 i만큼 기울인 것
  const minor = [0, 1, 2].map((k) => Math.cos(inc) * minorSky[k] + Math.sin(inc) * rhat[k]);
  const toGal = (v: number[]) => radecToGal(Math.atan2(v[1], v[0]) * 180 / Math.PI, Math.asin(clamp(v[2], -1, 1)) * 180 / Math.PI, 1);
  const a = toGal(major), b = toGal(minor);
  return [a.map((x) => x * R), b.map((x) => x * R * (e.type === 3 ? Math.max(g.q ?? 1, 0.4) : 1))];
}
function cross(a: number[], b: number[]): number[] { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a: number[]): number[] { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

// ---------- 층 표시 ----------
const layers = { stars: true, hosts: true, mw: true, named: true, gals: true, shells: true };
// 주소에 ?hide=stars,mw 처럼 적으면 그 층을 끈 채로 시작
for (const k of new URLSearchParams(location.search).get("hide")?.split(",") ?? []) {
  if (k in layers) {
    (layers as Record<string, boolean>)[k] = false;
    const box = document.querySelector<HTMLInputElement>('#layerBox input[data-layer="' + k + '"]');
    if (box) box.checked = false;
  }
}
function updateLayers(): void {
  const r = cam.r;
  const mLim = clamp(6.5 + 2.5 * Math.log10(Math.max(r, 0.05)), 5.5, 30);
  starMat.uniforms.uMLim.value = mLim;
  starMat.uniforms.uFade.value = layers.stars ? 1 - smooth(3e3, 3e4, r) : 0;
  hostMat.uniforms.uRange.value = Math.max(r * 2.5, 3);
  hostMat.uniforms.uFade.value = layers.hosts ? 1 - smooth(4e3, 2e4, r) : 0;
  galMat.uniforms.uMLim.value = mLim + 1.5;
  galMat.uniforms.uFade.value = layers.gals ? 0.35 + 0.65 * smooth(2e3, 3e4, r) : 0;
  const mwF = layers.mw ? smooth(150, 2500, r) * (1 - smooth(5e6, 6e7, r)) : 0;
  mwMat.uniforms.uFade.value = mwF; dustMat.uniforms.uFade.value = mwF;
  for (const o of [mwPts, dustPts]) o.position.set(GC_POS[0] - camPos[0], GC_POS[1] - camPos[1], GC_POS[2] - camPos[2]);
  // 다 흐려진 층은 아예 그리지 않음 (투명한 점도 화소 계산은 하므로)
  mwPts.visible = dustPts.visible = mwF > 0.01;
  starPts.visible = starMat.uniforms.uFade.value > 0.01;
  hostPts.visible = hostMat.uniforms.uFade.value > 0.01;
  galMesh.visible = galMat.uniforms.uFade.value > 0.01;
  for (const s of shells) {
    s.g.position.set(-camPos[0], -camPos[1], -camPos[2]);
    const m = s.g.material as THREE.LineBasicMaterial;
    m.opacity = layers.shells ? 0.4 * smooth(s.R * 0.02, s.R * 0.15, r) * (1 - smooth(s.R * 30, s.R * 300, r)) : 0;
    s.g.visible = m.opacity > 0.003;
  }
}

// ---------- 이름표 (자주 바뀌지 않게 몇 프레임마다 다시 고름) ----------
interface Cand { name: string; pos: ArrayLike<number>; pri: number; cls: string }
const labelPool: HTMLDivElement[] = [];
let shown: { el: HTMLDivElement; c: Cand }[] = [];
const vtmp = new THREE.Vector3();
function project(p: ArrayLike<number>): [number, number, number] | null {
  vtmp.set(p[0] - camPos[0], p[1] - camPos[1], p[2] - camPos[2]).applyMatrix4(camera.matrixWorldInverse);
  const depth = -vtmp.z;
  if (depth <= 0) return null;
  vtmp.applyMatrix4(camera.projectionMatrix);
  if (Math.abs(vtmp.x) > 1.02 || Math.abs(vtmp.y) > 1.02) return null;
  return [(vtmp.x * 0.5 + 0.5) * W, (-vtmp.y * 0.5 + 0.5) * H, depth];
}
function dist3(a: ArrayLike<number>, b: ArrayLike<number>): number { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

function candidates(): Cand[] {
  const r = cam.r, out: Cand[] = [], mLim = clamp(6.5 + 2.5 * Math.log10(Math.max(r, 0.05)), 5.5, 30);
  if (layers.stars && r < 3e3) {
    for (const s of data.stars.named) {
      const p = [data.stars.buf[5 * s.i], data.stars.buf[5 * s.i + 1], data.stars.buf[5 * s.i + 2]];
      const m = data.stars.buf[5 * s.i + 3] + 5 * Math.log10(Math.max(dist3(p, camPos), 1e-6) / 10);
      if (m < mLim - 3) out.push({ name: starLabel(s.name), pos: p, pri: 10 - m + (STAR_KO[s.name] ? 3 : 0), cls: "star" });
    }
    out.push({ name: "태양", pos: [0, 0, 0], pri: r < 50 ? 30 : 8, cls: "sun" });
  }
  if (layers.hosts && r < 400) {
    data.systems.forEach((s) => {
      const d = dist3(s.pos, camPos);
      if (d < r * 2.2) out.push({ name: s.name, pos: s.pos, pri: 6 + s.planets.length - Math.log10(d + 1), cls: "host" });
    });
  }
  if (layers.named) {
    for (const o of named) {
      const k = o.kind, ok = k === "nebula" ? r > 2 && r < 4e3 : k === "globular" ? r > 800 && r < 3e5 : k === "cluster" ? r > 4e6 && r < 2e9 : r > 2e7 && r < 5e9;
      if (ok) out.push({ name: o.name, pos: o.pos, pri: k === "supercluster" ? 22 : k === "cluster" ? 18 : k === "void" ? 12 : 9, cls: k });
    }
  }
  if (layers.gals && r > 3e3) {
    for (const g of gals) {
      if (!(g.g?.messier || g.g?.common || g.o)) continue;
      const d = dist3(g.pos, camPos), m = g.absMag + 5 * Math.log10(Math.max(d, 1) / 10);
      if (m < mLim - 1 && d < r * 8) out.push({ name: g.name, pos: g.pos, pri: 14 - m * 0.5 + (g.g?.messier ? 3 : 0), cls: g.o ? "sat" : "gal" });
    }
  }
  if (layers.mw && r > 4e3 && r < 3e6) out.push({ name: "우리 은하 중심 (궁수자리 A*)", pos: GC_POS, pri: 25, cls: "gc" });
  if (layers.shells) for (const s of shells) if (s.g.visible) out.push({ name: s.name, pos: [s.R * 0.7071, s.R * 0.7071, 0], pri: 20, cls: "shell" });
  return out;
}

function chooseLabels(): void {
  const cs = candidates().sort((a, b) => b.pri - a.pri), taken: number[][] = [];
  const next: { c: Cand; s: [number, number, number] }[] = [];
  for (const c of cs) {
    if (next.length >= 42) break;
    const s = project(c.pos);
    if (!s) continue;
    let w = 16;
    for (const ch of c.name) w += ch.charCodeAt(0) > 0x2000 ? 12.5 : 7;
    if (taken.some(([x, y, ww]) => Math.abs(x - s[0]) < (w + ww) / 2 && Math.abs(y - s[1]) < 18)) continue;
    taken.push([s[0] + w / 2, s[1], w]);
    next.push({ c, s });
  }
  while (labelPool.length < next.length) { const el = document.createElement("div"); el.className = "lbl"; labelsEl.appendChild(el); labelPool.push(el); }
  shown = next.map((n, i) => { const el = labelPool[i]; el.textContent = n.c.name; el.className = "lbl " + n.c.cls; el.style.display = "block"; return { el, c: n.c }; });
  for (let i = next.length; i < labelPool.length; i++) labelPool[i].style.display = "none";
}
function placeLabels(): void {
  for (const { el, c } of shown) {
    const s = project(c.pos);
    if (!s) { el.style.display = "none"; continue; }
    el.style.display = "block";
    el.style.transform = "translate(" + s[0].toFixed(1) + "px," + s[1].toFixed(1) + "px)";
  }
  const sel = selected ? project(selected.pos) : null;
  const ring = $("selRing");
  ring.hidden = !sel || mode !== "map";
  if (sel) ring.style.transform = "translate(" + sel[0].toFixed(1) + "px," + sel[1].toFixed(1) + "px)";
}

// ---------- 고르기 ----------
type Sel =
  | { kind: "star"; i: number; pos: number[]; name: string }
  | { kind: "sun"; pos: number[]; name: string }
  | { kind: "host"; i: number; pos: number[]; name: string }
  | { kind: "gal"; i: number; pos: number[]; name: string }
  | { kind: "named"; o: NamedObject; pos: number[]; name: string }
  | { kind: "mw"; pos: number[]; name: string };
let selected: Sel | null = null;

function pick(x: number, y: number): Sel | null {
  let best: Sel | null = null, bs = 16;
  const r = cam.r, mLim = clamp(6.5 + 2.5 * Math.log10(Math.max(r, 0.05)), 5.5, 30);
  const tryP = (pos: ArrayLike<number>, bonus: number, make: () => Sel) => {
    const s = project(pos);
    if (!s) return;
    const sc = Math.hypot(s[0] - x, s[1] - y) - bonus;
    if (sc < bs) { bs = sc; best = make(); }
  };
  if (layers.hosts && hostMat.uniforms.uFade.value > 0.05) data.systems.forEach((s, i) => { if (dist3(s.pos, camPos) < r * 5) tryP(s.pos, 4, () => ({ kind: "host", i, pos: [...s.pos], name: s.name })); });
  if (layers.stars && starMat.uniforms.uFade.value > 0.05) {
    const b = data.stars.buf;
    for (let i = 0; i < data.stars.n; i++) {
      const p = [b[5 * i], b[5 * i + 1], b[5 * i + 2]], m = b[5 * i + 3] + 5 * Math.log10(Math.max(dist3(p, camPos), 1e-6) / 10);
      if (m > mLim) continue;
      tryP(p, (mLim - m) * 0.8, () => ({ kind: "star", i, pos: p, name: starName(i) }));
    }
    tryP([0, 0, 0], 6, () => ({ kind: "sun", pos: [0, 0, 0], name: "태양" }));
  }
  if (layers.gals && galMat.uniforms.uFade.value > 0.05) gals.forEach((g, i) => {
    const d = dist3(g.pos, camPos), m = g.absMag + 5 * Math.log10(Math.max(d, 1) / 10);
    if (m < mLim + 1.5) tryP(g.pos, Math.min(10, g.R / d * W * 0.6), () => ({ kind: "gal", i, pos: [...g.pos], name: g.name }));
  });
  if (layers.named) for (const o of named) tryP(o.pos, 2, () => ({ kind: "named", o: o.o, pos: [...o.pos], name: o.name }));
  if (layers.mw && cam.r > 3e3) tryP(GC_POS, 3, () => ({ kind: "mw", pos: [...GC_POS], name: "우리 은하" }));
  return best;
}
const starNameIdx = new Map<number, string>();
function starName(i: number): string {
  const n = starNameIdx.get(i);
  if (n) return starLabel(n);
  const host = data.systems.find((s) => s.hyg === i);
  return host ? host.name : "HYG 별 #" + i;
}

// ---------- 정보 카드 ----------
function row(k: string, v: string): string { return "<dt>" + k + "</dt><dd>" + v + "</dd>"; }
function lbText(p: ArrayLike<number>): string { const [l, b] = galLB(p); return "l = " + l.toFixed(2) + "°, b = " + b.toFixed(2) + "°"; }
function select(s: Sel | null): void {
  selected = s;
  hostMat.uniforms.uSelIdx.value = s?.kind === "host" ? s.i : -1;
  galMat.uniforms.uSelIdx.value = s?.kind === "gal" ? s.i : -1;
  const card = $("infoCard");
  if (!s) { card.hidden = true; return; }
  card.hidden = false;
  const d = Math.hypot(s.pos[0], s.pos[1], s.pos[2]);
  let title = s.name, sub = "", rows = "", text = "", canSystem = false;
  const lt = d / LY_PC;
  const common = row("태양에서 거리", fmtPc(d) + "<small>" + fmtPcUnit(d) + " · 빛으로 " + (lt < 1 ? (lt * 365.25).toPrecision(3) + "일" : fmtYears(lt)) + "</small>") + (d > 0 ? row("은하 좌표", lbText(s.pos)) : "");
  if (s.kind === "sun") {
    sub = "G2V 주계열성"; canSystem = true;
    rows = row("질량 · 반지름", "1 M☉ · 1 R☉") + row("표면 온도", "5,772 K") + row("나이", "45.7억 년") + row("은하 중심까지", "8.18 kpc");
    text = SUN_POS_NOTE + " 지구를 포함한 8개 행성과 왜소행성, 위성들이 있습니다.";
  } else if (s.kind === "star" || s.kind === "host") {
    const sys = s.kind === "host" ? data.systems[s.i] : data.systems.find((x) => x.hyg === s.i);
    const hi = s.kind === "star" ? s.i : sys && sys.hyg >= 0 ? sys.hyg : -1;
    const b = data.stars.buf, nm = hi >= 0 ? data.stars.named.find((x) => x.i === hi) : undefined;
    if (hi >= 0) {
      const bv = b[5 * hi + 4];
      rows += row("절대 등급", b[5 * hi + 3].toFixed(2)) + row("색지수 B−V", bv.toFixed(2) + "<small>표면 온도 약 " + Math.round(bvToTemp(bv)).toLocaleString("ko-KR") + " K</small>");
      if (nm?.spect) rows += row("분광형", nm.spect);
      if (nm) rows += row("겉보기 등급 (지구)", nm.mag.toFixed(2));
    }
    if (sys) {
      canSystem = true;
      sub = sys.planets.length + "개 행성을 가진 별";
      const st = sys.star;
      if (st.mass) rows += row("별 질량 · 반지름", st.mass + " M☉" + (st.radius ? " · " + st.radius + " R☉" : ""));
      if (st.temp) rows += row("별 온도", Math.round(st.temp).toLocaleString("ko-KR") + " K");
      if (st.feh != null) rows += row("금속량 [Fe/H]", st.feh.toFixed(2));
      rows += row("행성", sys.planets.map((p) => p.name.replace(sys.name, "").trim() || p.name).join(", "));
      const yrs = sys.planets.map((p) => p.year).filter((y): y is number => !!y);
      if (yrs.length) rows += row("처음 발견", Math.min(...yrs) + "년 · " + (sys.planets[0].method ?? ""));
      text = "Open Exoplanet Catalogue의 확인된 행성입니다. ‘행성계 보기’로 실제 궤도 자료(긴반지름·주기·이심률)로 만든 행성계로 들어갈 수 있습니다.";
    } else {
      sub = nm?.spect ? nm.spect + " 별" : "별";
      text = "HYG 별 목록 v4.1 (Hipparcos·Yale·Gliese)의 위치와 밝기입니다.";
    }
  } else if (s.kind === "gal") {
    const e = gals[s.i], g = e.g;
    sub = g ? hubbleName(g.hubble) + (g.hubble ? " (" + g.hubble + ")" : "") : e.o?.kind === "satellite" ? "우리 은하의 위성은하" : "국부 은하군 은하";
    if (g) {
      if (g.messier) rows += row("메시에 번호", "M" + g.messier);
      rows += row("목록 이름", g.id) + row("지름 (D25)", g.sizeKpc ? g.sizeKpc.toPrecision(3) + " kpc<small>" + fmtPc(g.sizeKpc * 1000) + "</small>" : "—");
      if (g.cz != null) rows += row("시선 속도 cz", Math.round(g.cz).toLocaleString("ko-KR") + " km/s");
      if (g.bmag != null) rows += row("B 등급 · 절대 등급", g.bmag.toFixed(1) + " · " + e.absMag.toFixed(1));
      rows += row("거리 근거", g.src === "lit" ? "세페이드·TRGB 등 문헌 거리" : g.src === "virgo" ? "처녀자리 은하단 평균 거리 (16.5 Mpc)" : g.src === "fornax" ? "화로자리 은하단 평균 거리" : "적색편이 → 공동 거리 (특이 속도 무시)");
      text = "OpenNGC 목록의 은하입니다. 판의 크기와 기울기는 실제 지름과 하늘에서의 위치각·축비로 만들었고, 모양 무늬는 허블 형태에 맞춘 그림입니다.";
    } else if (e.o) { rows += row("지름", (e.o.size ?? 1.5) + " kpc (대략)"); text = e.o.note; }
  } else if (s.kind === "named") {
    const o = s.o;
    sub = { satellite: "위성은하", localgroup: "국부 은하군", globular: "구상성단", nebula: "성운·성단", cluster: "은하단", supercluster: "초은하단", void: "우주 공동" }[o.kind];
    if (o.z) rows += row("적색편이", "z = " + o.z);
    text = o.note;
  } else if (s.kind === "mw") {
    sub = "막대나선은하 (SBbc)";
    rows = row("별 질량", "약 6 × 10¹⁰ M☉ (Licquia & Newman 2015)") + row("원반 지름", "약 30 kpc") + row("나선팔", "직각자–바깥, 방패–센타우루스, 궁수–용골, 페르세우스, 국부(오리온) 팔");
    text = "나선팔 위치는 Reid 외 (2019) 메이저 시차 측정을 단순화한 모형입니다. 우리는 은하 안에 있어서 은하 전체의 모습은 직접 찍을 수 없고 측정으로 재구성합니다.";
  }
  $("icTitle").textContent = title;
  $("icSub").textContent = sub;
  $("icRows").innerHTML = common + rows;
  $("icText").textContent = text;
  $("icSystem").hidden = !canSystem;
}
function fmtYears(y: number): string {
  if (y < 1e4) return (y < 100 ? y.toPrecision(3) : Math.round(y).toLocaleString("ko-KR")) + "년";
  if (y < 1e8) return (y / 1e4).toPrecision(3) + "만 년";
  return (y / 1e8).toPrecision(3) + "억 년";
}
function flyToSel(s: Sel): void {
  if (s.kind === "gal") return flyTo(s.pos, Math.max(gals[s.i].R * 2.2, 50), s.name);
  if (s.kind === "named") {
    const k = s.o.kind;
    return flyTo(s.pos, k === "globular" ? 60 : k === "nebula" ? 25 : k === "cluster" ? 1.2e7 : k === "void" ? 6e7 : 8e7, s.name);
  }
  if (s.kind === "mw") return flyTo(GC_POS, 4.5e4, "우리 은하", { phi: 0.35 });
  return flyTo(s.pos, 0.04, s.name);
}

// ---------- 행성계 ----------
let mode: "map" | "system" = "map";
function systemFor(s: Sel): SysData | null {
  if (s.kind === "sun") return solarSystem();
  const ps = s.kind === "host" ? data.systems[s.i] : s.kind === "star" ? data.systems.find((x) => x.hyg === s.i) : undefined;
  return ps ? exoSystem(ps) : null;
}
function enterSystem(d: SysData): void {
  $("fade").classList.add("on");
  setTimeout(() => {
    sys.show(d);
    mode = "system";
    labelsEl.hidden = true;
    $("mapControls").hidden = true; $("sysControls").hidden = false;
    showSysCard(d);
    setTimeout(() => $("fade").classList.remove("on"), 60);
  }, 320);
}
function exitSystem(): void {
  $("fade").classList.add("on");
  setTimeout(() => {
    mode = "map";
    sys.clear();
    labelsEl.hidden = false;
    $("mapControls").hidden = false; $("sysControls").hidden = true; $("sysCard").hidden = true;
    setTimeout(() => $("fade").classList.remove("on"), 60);
  }, 320);
}
function showSysCard(d: SysData): void {
  $("sysCard").hidden = false;
  $("scName").textContent = d.name;
  const s = d.star;
  $("scStar").innerHTML = row("별", (s.spect || "—") + " · " + Math.round(s.T).toLocaleString("ko-KR") + " K") + row("질량 · 반지름", s.M.toPrecision(3) + " M☉ · " + s.R.toPrecision(3) + " R☉")
    + row("광도", (s.L < 0.01 ? s.L.toExponential(1) : s.L.toPrecision(3)) + " L☉") + row("생명 가능 지대", d.hz[0].toPrecision(2) + "–" + d.hz[1].toPrecision(2) + " AU<small>Kopparapu 외 2013</small>");
  const rows = d.planets.map((p) => {
    const inHZ = p.a >= d.hz[0] && p.a <= d.hz[1];
    return "<tr><td>" + p.name + "</td><td>" + p.type + (inHZ ? ' <span class="hz">· 생명 가능 지대</span>' : "") + '</td><td class="num">' + p.R.toFixed(2) + (p.Rest ? "*" : "") + '</td><td class="num">' + p.a.toPrecision(3) + '</td><td class="num">' + (p.P < 1000 ? p.P.toFixed(p.P < 10 ? 2 : 1) : Math.round(p.P).toLocaleString("ko-KR")) + '</td><td class="num">' + (p.e ? p.e.toFixed(2) : "0") + "</td></tr>";
  }).join("");
  $("scPlanets").innerHTML = "<thead><tr><th>천체</th><th>종류</th><th>R⊕</th><th>a (AU)</th><th>주기 (일)</th><th>e</th></tr></thead><tbody>" + rows + "</tbody>";
  $("scNote").textContent = d.real
    ? "J2000 궤도 요소와 케플러 방정식으로 계산한 오늘 날짜의 실제 위치에서 시작합니다. 행성·위성의 크기와 위성 궤도는 보기 쉽게 키웠습니다."
    : "Open Exoplanet Catalogue의 실제 긴반지름·주기·이심률입니다. 궤도 방향과 현재 위치는 알 수 없어 임의로 정했습니다. * 표시는 질량에서 추정한 반지름 (Chen & Kipping 2017).";
}

// ---------- 외계행성 분포 그래프 (주기–반지름) ----------
const scat = $<HTMLCanvasElement>("scat"), sctx = scat.getContext("2d")!;
interface ScatPt { x: number; y: number; sys: number; method: string; est: boolean }
let scatPts: ScatPt[] = [];
const METHOD_COL: Record<string, string> = { transit: "#2a78d6", RV: "#eb6834", imaging: "#d55181", microlensing: "#1baf7a", timing: "#eda100" };
const SOLAR_REF: [string, number, number][] = [["수성", 87.97, 0.383], ["금성", 224.7, 0.949], ["지구", 365.26, 1], ["화성", 687, 0.532], ["목성", 4333, 11.21], ["토성", 10759, 9.45], ["천왕성", 30687, 4.01], ["해왕성", 60190, 3.88]];
const SX = { p0: -1, p1: 6, r0: -0.6, r1: 1.5, padL: 46, padB: 30 };
function scatXY(P: number, R: number, w: number, h: number): [number, number] {
  return [SX.padL + (Math.log10(P) - SX.p0) / (SX.p1 - SX.p0) * (w - SX.padL - 8), 8 + (1 - (Math.log10(R) - SX.r0) / (SX.r1 - SX.r0)) * (h - SX.padB - 8)];
}
function buildScatter(): void {
  scatPts = [];
  data.systems.forEach((s, si) => s.planets.forEach((p) => {
    const a = planetA(p, s.star.mass), P = p.period ?? (a ? 365.25 * Math.sqrt(a * a * a / (s.star.mass ?? 1)) : null);
    if (!P) return;
    const { R, estimated } = planetRadiusEarth(p);
    if (p.radius == null && p.mass == null) return;
    scatPts.push({ x: P, y: R, sys: si, method: p.method ?? "", est: estimated });
  }));
}
function drawScatter(): void {
  const r = scat.getBoundingClientRect(), w = r.width, h = r.height, c = sctx, pr = Math.min(window.devicePixelRatio || 1, 2);
  if (!w) return;
  if (scat.width !== Math.round(w * pr)) { scat.width = Math.round(w * pr); scat.height = Math.round(h * pr); }
  c.setTransform(pr, 0, 0, pr, 0, 0); c.clearRect(0, 0, w, h);
  const cs = getComputedStyle(document.documentElement), muted = cs.getPropertyValue("--muted").trim(), line = cs.getPropertyValue("--line").trim(), ink = cs.getPropertyValue("--ink").trim();
  c.font = "11px 'IBM Plex Mono', ui-monospace, monospace"; c.strokeStyle = line; c.fillStyle = muted; c.lineWidth = 1;
  for (let e = SX.p0; e <= SX.p1; e++) { const [x] = scatXY(Math.pow(10, e), 1, w, h); c.beginPath(); c.moveTo(x + 0.5, 8); c.lineTo(x + 0.5, h - SX.padB); c.stroke(); c.textAlign = "center"; c.fillText(e < 0 ? "0.1" : String(Math.pow(10, e)).replace("000000", "백만").replace("00000", "십만").replace("0000", "만"), x, h - SX.padB + 14); }
  for (const R of [0.3, 1, 2, 4, 10, 30]) { const [, y] = scatXY(1, R, w, h); c.beginPath(); c.moveTo(SX.padL, y + 0.5); c.lineTo(w - 8, y + 0.5); c.stroke(); c.textAlign = "right"; c.fillText(String(R), SX.padL - 6, y + 4); }
  c.textAlign = "center"; c.fillText("공전 주기 (일)", (w + SX.padL) / 2, h - 4);
  c.save(); c.translate(11, (h - SX.padB) / 2); c.rotate(-Math.PI / 2); c.fillText("반지름 (지구 = 1)", 0, 0); c.restore();
  // 반지름 골짜기 (Fulton 외 2017: 1.5–2.0 R⊕)
  const [, ya] = scatXY(1, 2.0, w, h), [, yb] = scatXY(1, 1.5, w, h);
  c.fillStyle = "rgba(128,128,140,0.12)"; c.fillRect(SX.padL, ya, w - SX.padL - 8, yb - ya);
  for (const p of scatPts) {
    const [x, y] = scatXY(p.x, p.y, w, h);
    if (x < SX.padL || y < 4 || y > h - SX.padB) continue;
    const key = /transit/i.test(p.method) ? "transit" : /RV|radial/i.test(p.method) ? "RV" : /imag/i.test(p.method) ? "imaging" : /micro/i.test(p.method) ? "microlensing" : "timing";
    c.globalAlpha = p.est ? 0.25 : 0.55; c.fillStyle = METHOD_COL[key];
    c.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
  }
  c.globalAlpha = 1;
  for (const [n, P, R] of SOLAR_REF) { const [x, y] = scatXY(P, R, w, h); c.fillStyle = ink; c.beginPath(); c.arc(x, y, 3.5, 0, 6.2832); c.fill(); c.textAlign = "left"; c.fillText(n, x + 5, y - 4); }
  const sel = selected?.kind === "host" ? selected.i : selected?.kind === "star" ? data.systems.findIndex((s) => s.hyg === (selected as { i: number }).i) : -1;
  if (sel >= 0) for (const p of scatPts) if (p.sys === sel) {
    const [x, y] = scatXY(p.x, p.y, w, h);
    c.strokeStyle = "#f2b300"; c.lineWidth = 2.5; c.beginPath(); c.arc(x, y, 6, 0, 6.2832); c.stroke();
  }
}
scat.addEventListener("click", (e) => {
  const r = scat.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  let best = -1, bd = 12;
  for (const p of scatPts) { const [px, py] = scatXY(p.x, p.y, r.width, r.height), d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = p.sys; } }
  if (best < 0) return;
  const s = data.systems[best];
  const sel: Sel = { kind: "host", i: best, pos: [...s.pos], name: s.name };
  select(sel); flyToSel(sel); drawScatter();
});

// ---------- 검색 ----------
interface Entry { key: string; label: string; sel: () => Sel }
let index: Entry[] = [];
function buildIndex(): void {
  const add = (keys: string[], label: string, sel: () => Sel) => index.push({ key: keys.join(" ").toLowerCase().replace(/\s+/g, ""), label, sel });
  add(["태양", "sun", "sol", "태양계"], "태양 (태양계)", () => ({ kind: "sun", pos: [0, 0, 0], name: "태양" }));
  add(["우리은하", "milkyway", "은하수", "궁수자리a*"], "우리 은하", () => ({ kind: "mw", pos: [...GC_POS], name: "우리 은하" }));
  for (const s of data.stars.named) {
    starNameIdx.set(s.i, s.name);
    const p = [data.stars.buf[5 * s.i], data.stars.buf[5 * s.i + 1], data.stars.buf[5 * s.i + 2]];
    add([s.name, STAR_KO[s.name] ?? "", starLabel(s.name)], starLabel(s.name) + (STAR_KO[s.name] ? " · " + s.name : "") + " (별)", () => ({ kind: "star", i: s.i, pos: p, name: starLabel(s.name) }));
  }
  data.systems.forEach((s, i) => add([s.name, ...s.planets.map((p) => p.name)], s.name + " (행성 " + s.planets.length + "개)", () => ({ kind: "host", i, pos: [...s.pos], name: s.name })));
  gals.forEach((g, i) => add([g.name, g.sub, g.g?.messier ? "m" + g.g.messier : "", g.g?.id.replace(/0+(\d)/, "$1") ?? ""], g.name + (g.sub && g.sub !== g.name ? " · " + g.sub : "") + " (은하)", () => ({ kind: "gal", i, pos: [...g.pos], name: g.name })));
  for (const o of named) add([o.name, o.o.en ?? ""], o.name, () => ({ kind: "named", o: o.o, pos: [...o.pos], name: o.name }));
}
const searchIn = $<HTMLInputElement>("search"), sugg = $("sugg");
function search(q: string): Entry[] {
  const k = q.toLowerCase().replace(/\s+/g, "").replace(/^ngc0*/, "ngc").replace(/^ic0*/, "ic");
  if (!k) return [];
  const starts: Entry[] = [], inc: Entry[] = [];
  for (const e of index) { const p = e.key.indexOf(k); if (p === 0 || e.key.includes(" " + k)) starts.push(e); else if (p > 0) inc.push(e); if (starts.length > 12) break; }
  return [...starts, ...inc].slice(0, 9);
}
searchIn.addEventListener("input", () => {
  const res = search(searchIn.value);
  sugg.innerHTML = "";
  sugg.hidden = !res.length;
  res.forEach((e) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = e.label;
    b.addEventListener("click", () => { go(e); });
    sugg.appendChild(b);
  });
});
searchIn.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { const r = search(searchIn.value); if (r[0]) go(r[0]); } if (ev.key === "Escape") sugg.hidden = true; });
function go(e: Entry): void {
  const s = e.sel();
  sugg.hidden = true; searchIn.value = "";
  if (mode === "system") exitSystem();
  select(s); flyToSel(s); drawScatter();
}

// ---------- 축척 단계 ----------
const LEVELS: [string, string, () => void][] = [
  ["solar", "태양계", () => enterSystem(solarSystem())],
  ["near", "태양 이웃 (20광년)", () => flyTo([0, 0, 0], 6, "태양 이웃")],
  ["stars", "별 지도 (1000광년)", () => flyTo([0, 0, 0], 300, "태양 주변 별")],
  ["mw", "우리 은하", () => flyTo(GC_POS, 4.5e4, "우리 은하", { phi: 0.35 })],
  ["lg", "국부 은하군", () => flyTo(radecToGal(10.68, 41.27, 3.2e5), 2.6e6, "국부 은하군")],
  ["virgo", "근방 은하 (처녀자리)", () => flyTo(radecToGal(187.7, 12.39, 5e6), 3.2e7, "국부 초은하단")],
  ["local", "근방 우주 (10억 광년)", () => flyTo([0, 0, 0], 3.5e8, "근방 우주")],
  ["obs", "관측 가능한 우주", () => flyTo([0, 0, 0], 4.6e10, "관측 가능한 우주")],
];
LEVELS.forEach(([key, label, fn]) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "chip"; b.textContent = label; b.dataset.level = key;
  b.addEventListener("click", () => { if (mode === "system" && key !== "solar") exitSystem(); fn(); });
  $("levels").appendChild(b);
});

// ---------- 입력 ----------
const pointers = new Map<number, { x: number; y: number }>();
let downAt: { x: number; y: number; t: number } | null = null;
stage.addEventListener("pointerdown", (e) => {
  stage.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); stage.classList.add("dragging");
  downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
});
stage.addEventListener("pointermove", (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  if (pointers.size === 1) {
    if (mode === "system") { sys.theta += dx * 0.006; sys.phi = clamp(sys.phi - dy * 0.006, 0.05, Math.PI - 0.05); }
    else { cam.theta -= dx * 0.006; cam.phi = clamp(cam.phi - dy * 0.006, 0.02, Math.PI - 0.02); }
    p.x = e.clientX; p.y = e.clientY;
  } else if (pointers.size === 2) {
    const ps = [...pointers.values()], before = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
    p.x = e.clientX; p.y = e.clientY;
    const qs = [...pointers.values()], after = Math.hypot(qs[0].x - qs[1].x, qs[0].y - qs[1].y);
    if (after > 0) zoom(before / after);
  }
});
function endPointer(e: PointerEvent): void {
  pointers.delete(e.pointerId);
  if (!pointers.size) stage.classList.remove("dragging");
  if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 5 && performance.now() - downAt.t < 450 && mode === "map") {
    const r = stage.getBoundingClientRect(), s = pick(e.clientX - r.left, e.clientY - r.top);
    if (s) { select(s); drawScatter(); } else select(null);
  }
  downAt = null;
}
stage.addEventListener("pointerup", endPointer);
stage.addEventListener("pointercancel", (e) => { pointers.delete(e.pointerId); downAt = null; });
stage.addEventListener("dblclick", () => { if (selected && mode === "map") flyToSel(selected); });
stage.addEventListener("wheel", (e) => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0015)); }, { passive: false });
function zoom(f: number): void {
  if (mode === "system") { sys.r = clamp(sys.r * f, sys.rMin, sys.rMax); return; }
  cam.fly = null;
  cam.r = clamp(cam.r * f, 2e-5, 8e10);
}
$("flyBtn").addEventListener("click", () => { if (selected) flyToSel(selected); });
$("icSystem").addEventListener("click", () => { if (!selected) return; const d = systemFor(selected); if (d) enterSystem(d); });
$("sysBack").addEventListener("click", exitSystem);
$("autoBtn").addEventListener("click", (e) => { cam.auto = !cam.auto; (e.currentTarget as HTMLElement).setAttribute("aria-pressed", String(cam.auto)); });
$("sysSpeed").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("[data-days]");
  if (!b) return;
  sys.daysPerSec = parseFloat(b.getAttribute("data-days")!);
  $("sysSpeed").querySelectorAll("[data-days]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
});
$("layerBox").addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement;
  (layers as Record<string, boolean>)[t.dataset.layer!] = t.checked;
});

// ---------- 크기 · 화면 갱신 ----------
function resize(): void {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = stage.getBoundingClientRect();
  W = r.width; H = r.height;
  renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
  camera.aspect = W / Math.max(1, H); camera.updateProjectionMatrix();
  uScale.value = H * dpr / (2 * Math.tan(FOV / 2 * Math.PI / 180));
  uRes.value.set(W * dpr, H * dpr);
  if (starMat) { starMat.uniforms.uPx.value = 1.6 * dpr; hostMat.uniforms.uPx.value = dpr; galMat.uniforms.uMinPx.value = 1.6 * dpr; mwMat.uniforms.uMinPx.value = 1.1 * dpr; }
  drawScatter();
}

function scaleName(r: number): string {
  if (r < 0.02) return "행성계 크기";
  if (r < 30) return "태양 이웃";
  if (r < 3000) return "태양 주변 별";
  if (r < 3e5) return "우리 은하";
  if (r < 6e6) return "국부 은하군";
  if (r < 1.5e8) return "근방 은하";
  if (r < 3e9) return "근방 우주";
  return "관측 가능한 우주";
}
const lastTxt: Record<string, string> = {};
function setText(id: string, v: string, html = false): void {
  if (lastTxt[id] === v) return;
  lastTxt[id] = v;
  if (html) $(id).innerHTML = v; else $(id).textContent = v;
}
function updateHud(): void {
  if (mode === "system") {
    const d = sys.data!;
    setText("hudScale", d.name);
    setText("hudSub", d.real ? new Date(Date.UTC(2000, 0, 1, 12) + sys.days * 86400000).toISOString().slice(0, 10) + " · 1초 = " + sys.daysPerSec + "일" : "1초 = " + sys.daysPerSec + "일 · 실제 궤도 자료");
    setText("hudTarget", "시야 " + (sys.r < 0.2 ? (sys.r * 149.6).toPrecision(3) + "백만 km" : sys.r.toPrecision(3) + " AU"));
    setText("hudDist", "");
    return;
  }
  setText("hudScale", scaleName(cam.r));
  setText("hudSub", "시야 반지름 " + fmtPc(cam.r) + " (" + fmtPcUnit(cam.r) + ")");
  const d = Math.hypot(cam.target[0], cam.target[1], cam.target[2]);
  setText("hudTarget", cam.label);
  setText("hudDist", d < 1e-6 ? "태양 기준" : "태양에서 " + fmtPc(d));
}

let frameNo = 0, prev = performance.now(), fpsT = 0, fpsN = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - prev) / 1000);
  fpsT += now - prev; fpsN++;
  if (fpsT > 1000) { stage.dataset.fps = String(Math.round(fpsN * 1000 / fpsT)); fpsT = 0; fpsN = 0; }
  prev = now; frameNo++;
  if (mode === "system") {
    sys.update(dt, W, H, cam.auto);
    renderer.render(sys.scene, sys.camera);
  } else {
    updateCamera(dt);
    updateLayers();
    if (frameNo % 6 === 1) chooseLabels();
    placeLabels();
    renderer.render(scene, camera);
  }
  updateHud();
  requestAnimationFrame(frame);
}

// ---------- 시작 ----------
(async () => {
  // 빌드는 상대 경로(base "./")라서, 한 단계 아래(/atlas/)에 있는 이 페이지에서 사이트 뿌리를 계산함
  const base = import.meta.env.BASE_URL, root = base.startsWith("/") ? base : new URL("../", location.href).pathname;
  try {
    data = await loadAtlasData(root, (m) => setText("loading", m));
  } catch (err) {
    setText("loading", "자료를 읽지 못했습니다: " + String(err));
    return;
  }
  setText("loading", "지도 만드는 중…");
  buildLayers();
  buildIndex();
  buildScatter();
  $("loading").hidden = true;
  setText("stats", row("별 (HYG v4.1)", data.stars.n.toLocaleString("ko-KR") + "개") + row("행성계 · 행성 (OEC)", data.systems.length.toLocaleString("ko-KR") + " · " + data.systems.reduce((s, x) => s + x.planets.length, 0).toLocaleString("ko-KR") + "개")
    + row("은하 (OpenNGC)", data.galaxies.length.toLocaleString("ko-KR") + "개") + row("위성·국부 은하군 · 구상성단 · 성운", (SATELLITES.length + LOCAL_GROUP.length) + " · " + GLOBULARS.length + " · " + NEBULAE.length) + row("은하단 · 초은하단 · 공동", LARGE_SCALE.length + "개"), true);
  new ResizeObserver(resize).observe(stage);
  new ResizeObserver(() => drawScatter()).observe(scat);
  resize();
  select({ kind: "sun", pos: [0, 0, 0], name: "태양" });
  cam.r = 3e4; cam.phi = 0.5;
  flyTo([0, 0, 0], 8, "태양 이웃", { phi: 1.05 });
  requestAnimationFrame(frame);
})();
