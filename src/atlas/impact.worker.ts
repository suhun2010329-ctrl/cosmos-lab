// 픽셀 충돌 계산을 화면과 따로 돌리는 Web Worker. 계산한 만큼 위치·온도를 보내고, 가끔 분석값을 보낸다.
import { analyze, build, newState, relax, step, temperature, type Built, type ImpactSetup, type SimState } from "./impact";

type In = { type: "start"; setup: ImpactSetup } | { type: "pause" } | { type: "resume" } | { type: "budget"; ms: number } | { type: "follow"; body: number } | { type: "stop" } | { type: "extend"; seconds: number };

let B: Built | null = null, S: SimState | null = null, running = false, budget = 16, follow = -1, timer = 0, lastStats = 0, gen = 0;

function center(): [number, number, number] {
  if (follow === -2) return [0, 0, 0];
  const p = B!.p;
  let m = 0, x = 0, y = 0, z = 0;
  for (let i = 0; i < p.n; i++) {
    if (p.gone[i] || (follow >= 0 && p.body[i] !== follow)) continue;
    m += p.m[i]; x += p.m[i] * p.x[3 * i]; y += p.m[i] * p.x[3 * i + 1]; z += p.m[i] * p.x[3 * i + 2];
  }
  return m > 0 ? [x / m, y / m, z / m] : [0, 0, 0];
}

function sendFrame(done: boolean): void {
  const p = B!.p, c = center(), x = new Float32Array(3 * p.n), T = new Float32Array(p.n);
  for (let i = 0; i < p.n; i++) {
    x[3 * i] = p.x[3 * i] - c[0]; x[3 * i + 1] = p.x[3 * i + 1] - c[1]; x[3 * i + 2] = p.x[3 * i + 2] - c[2];
    T[i] = temperature(B!, i);
  }
  const gone = p.gone.slice();
  (self as unknown as Worker).postMessage({ type: "frame", t: S!.t * B!.units.T, center: c, x, T, gone, done }, [x.buffer, T.buffer, gone.buffer]);
}
function sendStats(): void {
  (self as unknown as Worker).postMessage({ type: "stats", a: analyze(B!, S!), contact: S!.contacts.cross > 0, steps: S!.steps, dt: S!.dt * B!.units.T });
}

function loop(g: number): void {
  if (!running || g !== gen || !B || !S) return;
  const t0 = performance.now(), end = B.setup.duration / B.units.T;
  let done = false;
  while (performance.now() - t0 < budget) {
    step(B, S);
    if (S.t >= end) { done = true; break; }
  }
  sendFrame(done);
  if (performance.now() - lastStats > 600 || done) { lastStats = performance.now(); sendStats(); }
  if (done) { running = false; return; }
  timer = setTimeout(() => loop(g), 0) as unknown as number;
}

self.onmessage = (e: MessageEvent<In>) => {
  const m = e.data;
  if (m.type === "start") {
    gen++; running = false; clearTimeout(timer);
    const post = (o: unknown) => (self as unknown as Worker).postMessage(o);
    post({ type: "progress", text: "픽셀 천체를 쌓는 중…" });
    B = build(m.setup);
    follow = m.setup.follow;
    post({ type: "built", n: B.p.n, r: Float32Array.from(B.p.r), layer: B.p.layer, el: B.p.el, body: B.p.body, L: B.units.L, layers: B.layers, bodyN: B.bodyN });
    if (!m.setup.still) {
      post({ type: "progress", text: "자기 무게로 가라앉히는 중 (정역학 평형)…" });
      relax(B);
    }
    S = newState();
    sendFrame(false); sendStats();
    if (!m.setup.still) { running = true; const g = gen; setTimeout(() => loop(g), 0); }
  } else if (m.type === "pause") { running = false; }
  else if (m.type === "resume") { if (B && S && !running && !B.setup.still) { running = true; const g = gen; loop(g); } }
  else if (m.type === "budget") budget = m.ms;
  else if (m.type === "follow") { follow = m.body; if (B && S) sendFrame(false); }
  else if (m.type === "extend") { if (B) B.setup.duration += m.seconds; }
  else if (m.type === "stop") { running = false; gen++; B = null; S = null; }
};
