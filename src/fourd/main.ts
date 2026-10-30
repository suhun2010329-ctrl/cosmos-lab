// 4차원 관측실: 4차원 회전 → (원근/정사영) 3차원 투영 → 3차원 시점 회전 → 원근 화면 투영.
import { AXIS_NAMES, PLANES, PRESETS, rotate4, SHAPES, type Geometry4, type PresetKey, type ShapeDef, type ShapeKey, type Vec4 } from "./geometry";
import { SPEED_PRESETS, SpacetimeSeesaw } from "./relativity";
import { hexRgb, rgba } from "../shared/color";
import type { RGB } from "../shared/math";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const state = {
  shape: "tesseract" as ShapeKey,
  preset: "w4" as PresetKey | null,
  speeds: PRESETS.w4.speeds.slice(),
  angles: [0, 0, 0, 0, 0, 0],
  persp: true,
  dist4: 2.4,
  zoom: 1,
  yaw: -0.55,
  pitch: 0.38,
  showVerts: true,
  showAxes: true,
  running: !reduceMotion,
};
let geo: Geometry4 = SHAPES[state.shape].build();

const stage = $("stage"), cv = $<HTMLCanvasElement>("cv"), ctx = cv.getContext("2d")!;
let W = 0, H = 0, dpr = 1;

// ---- 색상 토큰 (테마가 바뀌면 다시 읽음) ----
const colors: Record<"wneg" | "wpos" | "ink" | "muted" | "line", RGB> = {
  wneg: [0, 0, 0], wpos: [0, 0, 0], ink: [0, 0, 0], muted: [0, 0, 0], line: [0, 0, 0],
};
function readTokens(): void {
  const cs = getComputedStyle(document.documentElement);
  (Object.keys(colors) as (keyof typeof colors)[]).forEach((k) => { colors[k] = hexRgb(cs.getPropertyValue("--" + k)); });
}
function wColor(w: number, a: number): string {
  const t = Math.max(0, Math.min(1, (w + 1) / 2)), n = colors.wneg, p = colors.wpos;
  return rgba([n[0] + (p[0] - n[0]) * t, n[1] + (p[1] - n[1]) * t, n[2] + (p[2] - n[2]) * t], a);
}

/** 3차원 시점 회전 (yaw → pitch) */
function view3(x: number, y: number, z: number): [number, number, number] {
  const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw), cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
  const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
  return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
}

// ---- 그리기 ----
function resize(): void {
  const r = stage.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = r.width; H = r.height;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
}

interface ScreenPt { x: number; y: number; z: number; w: number; f: number }

function draw(): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const S = 0.36 * Math.min(W, H) * state.zoom, D3 = 4.2, d4 = state.dist4;
  const pts: ScreenPt[] = geo.v.map((v: Vec4) => {
    const p = rotate4(v, state.angles), w = p[3];
    const k = state.persp ? (d4 - 1) / (d4 - w) : 1;
    const q = view3(p[0] * k, p[1] * k, p[2] * k);
    const f = D3 / (D3 - q[2]);
    return { x: W / 2 + q[0] * f * S, y: H / 2 - q[1] * f * S, z: q[2], w, f };
  });

  const lw = geo.dense ? 1 : 1.8;
  const edges = geo.e.map(([i, j]) => {
    const a = pts[i], b = pts[j];
    return { a, b, z: (a.z + b.z) / 2, w: (a.w + b.w) / 2, f: (a.f + b.f) / 2 };
  }).sort((m, n) => m.z - n.z);

  // 먼 것부터 그려 가까운 선이 위에 오게 함 (화가 알고리즘)
  ctx.lineCap = "round";
  for (const e of edges) {
    const depth = Math.max(0, Math.min(1, (e.z + 1.2) / 2.4));
    ctx.strokeStyle = wColor(e.w, (geo.dense ? 0.25 : 0.35) + 0.6 * depth);
    ctx.lineWidth = lw * e.f;
    ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y); ctx.stroke();
  }

  if (state.showVerts) {
    for (const p of pts.slice().sort((m, n) => m.z - n.z)) {
      const depth = Math.max(0, Math.min(1, (p.z + 1.2) / 2.4));
      ctx.fillStyle = wColor(p.w, 0.5 + 0.5 * depth);
      ctx.beginPath(); ctx.arc(p.x, p.y, (geo.dense ? 1.4 : 3.6) * p.f, 0, Math.PI * 2); ctx.fill();
    }
  }

  if (state.showAxes) drawAxes();
  if (flash > 0) { ctx.fillStyle = "rgba(255,255,255," + (0.85 * flash).toFixed(3) + ")"; ctx.fillRect(0, 0, W, H); }
}

function drawAxes(): void {
  const ox = 54, oy = H - 54, L = 34;
  ctx.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.strokeStyle = rgba(colors.line, 1); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(ox, oy, L + 8, 0, Math.PI * 2); ctx.stroke();
  const axes = [0, 1, 2, 3].map((k) => {
    const e: Vec4 = [0, 0, 0, 0]; e[k] = 1;
    const p = rotate4(e, state.angles), q = view3(p[0], p[1], p[2]);
    return { k, x: ox + q[0] * L, y: oy - q[1] * L, z: q[2], len: Math.hypot(q[0], q[1]) };
  }).sort((a, b) => a.z - b.z);
  for (const a of axes) {
    const c = a.k === 3 ? colors.wpos : a.k === 0 ? colors.ink : colors.muted;
    ctx.strokeStyle = rgba(c, 0.9); ctx.fillStyle = rgba(c, 1); ctx.lineWidth = a.k === 3 ? 2.2 : 1.6;
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(a.x, a.y); ctx.stroke();
    const dx = a.x - ox, dy = a.y - oy, n = Math.hypot(dx, dy) || 1;
    // 축이 화면에 거의 수직이면(길이 0에 가까움) 이름을 원점 옆에 둠
    const lx = a.len < 0.15 ? ox + 10 : a.x + dx / n * 9, ly = a.len < 0.15 ? oy - 10 : a.y + dy / n * 9;
    ctx.fillText(AXIS_NAMES[a.k], lx, ly);
  }
}

function updateHud(): void {
  $("hudShape").innerHTML = "<b>" + SHAPES[state.shape].label + "</b> · " + (state.persp ? "원근 d=" + state.dist4.toFixed(2) : "정사영")
    + (state.shape === "brane" ? " · 브레인 사이 " + (2 * braneGap).toFixed(2) + " · 충돌 " + collisions + "번" : "");
  $("hudState").textContent = state.running ? "회전 중" : "일시정지";
  $("playBtn").textContent = state.running ? "일시정지" : "재생";
}

// ---- 조종판 ----
function setPressed(container: HTMLElement, attr: string, value: string): void {
  container.querySelectorAll("[" + attr + "]").forEach((b) => b.setAttribute("aria-pressed", String(b.getAttribute(attr) === value)));
}

const shapeChips = $("shapeChips");
(Object.keys(SHAPES) as ShapeKey[]).forEach((key) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "chip"; b.textContent = SHAPES[key].label; b.setAttribute("data-shape", key);
  b.addEventListener("click", () => selectShape(key));
  shapeChips.appendChild(b);
});
function selectShape(key: ShapeKey): void {
  state.shape = key; geo = SHAPES[key].build(); animTime = 0; collisions = 0; wasApart = true;
  setPressed(shapeChips, "data-shape", key);
  $("shapeInfo").innerHTML = SHAPES[key].text + '<span class="num">' + SHAPES[key].num + "</span>";
  updateHud();
}

const presetChips = $("presetChips");
(Object.keys(PRESETS) as PresetKey[]).forEach((key) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "chip"; b.textContent = PRESETS[key].label; b.setAttribute("data-preset", key);
  b.addEventListener("click", () => applyPreset(key));
  presetChips.appendChild(b);
});

const sliderEls: { inp: HTMLInputElement; out: HTMLOutputElement }[] = [];
const sliders = $("sliders");
PLANES.forEach(([, , name], k) => {
  const id = "sp-" + name;
  const lab = document.createElement("label");
  lab.htmlFor = id;
  lab.innerHTML = name.replace("W", '<span class="w">W</span>');
  const inp = document.createElement("input");
  inp.type = "range"; inp.id = id; inp.min = "-1.5"; inp.max = "1.5"; inp.step = "0.05";
  const out = document.createElement("output");
  out.htmlFor.add(id);
  inp.addEventListener("input", () => {
    state.speeds[k] = parseFloat(inp.value);
    out.textContent = state.speeds[k].toFixed(2);
    state.preset = null;
    setPressed(presetChips, "data-preset", "");
    $("presetNote").textContent = "직접 조절한 회전입니다.";
  });
  sliders.append(lab, inp, out);
  sliderEls.push({ inp, out });
});
function applyPreset(key: PresetKey): void {
  state.preset = key;
  state.speeds = PRESETS[key].speeds.slice();
  sliderEls.forEach((s, k) => { s.inp.value = String(state.speeds[k]); s.out.textContent = state.speeds[k].toFixed(2); });
  setPressed(presetChips, "data-preset", key);
  $("presetNote").textContent = PRESETS[key].note;
  if (key !== "stop" && !state.running) { state.running = true; updateHud(); }
}

const projChips = $("projChips");
projChips.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("[data-proj]");
  if (!b) return;
  const v = b.getAttribute("data-proj")!;
  state.persp = v === "persp";
  setPressed(projChips, "data-proj", v);
  $<HTMLInputElement>("dist4").disabled = !state.persp;
  updateHud();
});
$<HTMLInputElement>("dist4").addEventListener("input", (e) => {
  state.dist4 = parseFloat((e.target as HTMLInputElement).value);
  $("dist4Out").textContent = state.dist4.toFixed(2);
  updateHud();
});
function setZoom(z: number): void {
  state.zoom = Math.max(0.4, Math.min(2.5, z));
  $<HTMLInputElement>("zoom").value = String(state.zoom);
  $("zoomOut").textContent = state.zoom.toFixed(2) + "×";
}
$("zoom").addEventListener("input", (e) => setZoom(parseFloat((e.target as HTMLInputElement).value)));
$("showVerts").addEventListener("change", (e) => { state.showVerts = (e.target as HTMLInputElement).checked; });
$("showAxes").addEventListener("change", (e) => { state.showAxes = (e.target as HTMLInputElement).checked; });
$("playBtn").addEventListener("click", () => { state.running = !state.running; updateHud(); });
$("resetBtn").addEventListener("click", () => { state.angles = [0, 0, 0, 0, 0, 0]; });

// ---- 시점 조작 ----
let drag: { x: number; y: number } | null = null;
stage.addEventListener("pointerdown", (e) => {
  drag = { x: e.clientX, y: e.clientY };
  stage.setPointerCapture(e.pointerId); stage.classList.add("dragging");
});
stage.addEventListener("pointermove", (e) => {
  if (!drag) return;
  state.yaw += (e.clientX - drag.x) * 0.008;
  state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch + (e.clientY - drag.y) * 0.008));
  drag = { x: e.clientX, y: e.clientY };
});
const endDrag = () => { drag = null; stage.classList.remove("dragging"); };
stage.addEventListener("pointerup", endDrag);
stage.addEventListener("pointercancel", endDrag);
stage.addEventListener("wheel", (e) => { e.preventDefault(); setZoom(state.zoom * Math.exp(-e.deltaY * 0.0012)); }, { passive: false });
stage.addEventListener("dblclick", () => { state.yaw = -0.55; state.pitch = 0.38; setZoom(1); });

// ---- 테마 변화 ----
readTokens();
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", readTokens);
new MutationObserver(readTokens).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

// ---- 시작 ----
new ResizeObserver(resize).observe(stage);
resize();
selectShape(state.shape);
applyPreset("w4");
if (reduceMotion) state.running = false;
// 첫 화면이 정면 정지 상태로 보이지 않도록 약간 돌려 둔다
state.angles[2] = 0.35; state.angles[4] = 0.2;
updateHud();

// ---- 움직이는 도형 (브레인 충돌) ----
let animTime = 0, braneGap = 1, collisions = 0, flash = 0, wasApart = true;
function animateShape(dt: number): void {
  const def: ShapeDef = SHAPES[state.shape];
  if (!def.animate) return;
  animTime += dt;
  braneGap = def.animate(animTime, geo.v);
  if (braneGap < 0.03 && wasApart) { collisions++; flash = 1; wasApart = false; }
  if (braneGap > 0.2) wasApart = true;
  updateHud();
}

let last = performance.now();
function frame(t: number): void {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  if (state.running) for (let k = 0; k < 6; k++) state.angles[k] += state.speeds[k] * dt;
  animateShape(dt);
  flash = Math.max(0, flash - dt * 1.5);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- 시공간 시소 (특수 상대성) ----
const seesaw = new SpacetimeSeesaw($<HTMLCanvasElement>("srCv"));
const speedIn = $<HTMLInputElement>("srSpeed");
function showSeesaw(): void {
  $("srReadouts").innerHTML = seesaw.readouts().map(([k, v]) => "<dt>" + k + "</dt><dd>" + v + "</dd>").join("");
}
speedIn.addEventListener("input", () => {
  seesaw.setSpeed(parseFloat(speedIn.value) * 299792458);
  $("srNote").textContent = "";
  $("srPresets").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false"));
  showSeesaw();
});
SPEED_PRESETS.forEach((p) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "chip"; b.textContent = p.label; b.setAttribute("aria-pressed", "false");
  b.addEventListener("click", () => {
    seesaw.setSpeed(p.v);
    speedIn.value = String(Math.min(p.v / 299792458, 0.999));
    $("srNote").textContent = p.note;
    $("srPresets").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    showSeesaw();
  });
  $("srPresets").appendChild(b);
});
seesaw.readTokens();
seesaw.setSpeed(0.8 * 299792458);
showSeesaw();
new MutationObserver(() => seesaw.readTokens()).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => seesaw.readTokens());
