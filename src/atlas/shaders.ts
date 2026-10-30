// 우주지도 셰이더. 위치는 [pc]를 float 두 개(큰 값 hi + 나머지 lo)로 나눠 보내고, 카메라도 같은 방식으로 빼서
// (hi − camHi) + (lo − camLo) 로 '카메라 기준 상대 위치'를 만든다 (RTE). 그래서 수 AU부터 수 Gpc까지 떨림 없이 확대된다.

const RTE = `
uniform vec3 uCamHi;
uniform vec3 uCamLo;
vec3 rte(vec3 hi, vec3 lo) { return (hi - uCamHi) + (lo - uCamLo); }
float log10f(float x) { return log(x) * 0.4342944819; }
`;

// ---------- 별 (HYG) : 거리에 따른 겉보기 등급으로 크기·밝기 ----------
export const STAR_VS = RTE + `
attribute vec3 aHi; attribute vec3 aLo; attribute float aMag; attribute vec3 aCol;
uniform float uMLim; uniform float uFade; uniform float uPx;
varying vec3 vCol; varying float vA;
void main() {
  vec3 rel = rte(aHi, aLo);
  vec4 mv = viewMatrix * vec4(rel, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = max(length(rel), 1e-7);
  float m = aMag + 5.0 * log10f(d / 10.0);
  float f = pow(10.0, -0.4 * (m - uMLim));
  vA = clamp(f, 0.0, 1.0) * uFade;
  gl_PointSize = (vA > 0.008 && mv.z < 0.0) ? uPx * clamp(1.0 + 1.3 * log(1.0 + f), 1.0, 10.0) : 0.0;
  vCol = aCol;
}`;
export const STAR_FS = `
varying vec3 vCol; varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;
  float k = exp(-r * r * 4.0) + 0.25 * (1.0 - r);
  gl_FragColor = vec4(mix(vCol, vec3(1.0), 0.35 * exp(-r * r * 12.0)), vA * k);
}`;

// ---------- 외계행성계 표시 (고리) ----------
export const HOST_VS = RTE + `
attribute vec3 aHi; attribute vec3 aLo; attribute float aN;
uniform float uRange; uniform float uPx; uniform float uFade; uniform float uSelIdx;
attribute float aIdx;
varying float vA; varying float vSel;
void main() {
  vec3 rel = rte(aHi, aLo);
  vec4 mv = viewMatrix * vec4(rel, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = length(rel);
  vSel = abs(aIdx - uSelIdx) < 0.5 ? 1.0 : 0.0;
  vA = uFade * clamp(2.0 - d / uRange, 0.0, 1.0);
  vA = max(vA, vSel * uFade);
  gl_PointSize = (vA > 0.01 && mv.z < 0.0) ? uPx * (5.0 + 1.6 * min(aN, 6.0) + 6.0 * vSel) : 0.0;
}`;
export const HOST_FS = `
varying float vA; varying float vSel;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float ring = smoothstep(0.62, 0.74, r) * (1.0 - smoothstep(0.86, 1.0, r));
  if (ring <= 0.0) discard;
  vec3 c = mix(vec3(0.3, 0.95, 0.6), vec3(1.0, 0.85, 0.3), vSel);
  gl_FragColor = vec4(c, ring * vA * 0.9);
}`;

// ---------- 은하 (OpenNGC): 실제 크기·방향의 판 또는 점 ----------
export const GAL_VS = RTE + `
attribute vec3 gHi; attribute vec3 gLo; attribute vec3 gE1; attribute vec3 gE2; attribute vec4 gP;
uniform float uMLim; uniform float uScale; uniform vec2 uRes; uniform float uFade; uniform float uMinPx; uniform float uSelIdx;
attribute float gIdx;
varying vec2 vUV; varying float vType; varying float vSeed; varying float vA; varying float vPoint; varying float vSel;
void main() {
  vUV = position.xy; vType = gP.x; vSeed = gP.y; vPoint = 0.0;
  vSel = abs(gIdx - uSelIdx) < 0.5 ? 1.0 : 0.0;
  vec3 c = rte(gHi, gLo);
  vec4 cv = viewMatrix * vec4(c, 1.0);
  float d = -cv.z;
  if (d <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; }
  float R = length(gE1);
  float px = R * uScale / d;
  float m = gP.z + 5.0 * log10f(max(length(c), 1e-6) / 10.0);
  float f = pow(10.0, -0.4 * (m - uMLim));
  vA = clamp(f, 0.0, 1.0);
  if (px < 1.5) {
    vA *= uFade;
    vA = max(vA, vSel * uFade);
    if (vA < 0.01) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vPoint = 1.0;
    gl_Position = projectionMatrix * cv;
    gl_Position.xy += position.xy * (2.0 * uMinPx * (1.0 + 2.0 * vSel) / uRes) * gl_Position.w;
    return;
  }
  vA = max(vA, 0.55 * smoothstep(1.5, 8.0, px)) * uFade;
  vec3 w;
  if (gP.w > 0.5) {
    // 타원은하: 화면을 향한 판, 축비 적용
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    w = c + R * (position.x * right + position.y * up * clamp(length(gE2) / R, 0.3, 1.0));
  } else {
    w = c + position.x * gE1 + position.y * gE2;
  }
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
export const GAL_FS = `
varying vec2 vUV; varying float vType; varying float vSeed; varying float vA; varying float vPoint; varying float vSel;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float r2 = dot(vUV, vUV);
  if (r2 > 1.0 || vA <= 0.0) discard;
  if (vPoint > 0.5) {
    float k = 1.0 - sqrt(r2);
    vec3 pc = vType > 2.5 ? vec3(1.0, 0.82, 0.62) : vec3(0.75, 0.82, 1.0);
    gl_FragColor = vec4(mix(pc, vec3(1.0, 0.85, 0.3), vSel), vA * k * k);
    return;
  }
  float r = sqrt(r2) * 4.0;
  float th = atan(vUV.y, vUV.x);
  float I; vec3 col;
  if (vType < 0.5) {
    float pitch = 0.22 + 0.25 * fract(vSeed * 1.37), ph = fract(vSeed * 7.13) * 6.2832;
    float arm = 0.5 + 0.5 * cos(2.0 * (th - log(r + 0.05) / tan(pitch)) + ph);
    arm = pow(arm, 3.0) * smoothstep(0.15, 0.7, r);
    float bul = exp(-(r * r) / 0.05);
    I = exp(-r * 1.4) * (0.45 + 1.4 * arm) + 1.3 * bul;
    col = mix(vec3(1.0, 0.86, 0.66), vec3(0.62, 0.74, 1.0), clamp(arm * 1.3 * smoothstep(0.1, 0.6, r), 0.0, 1.0));
    col = mix(col, vec3(1.0, 0.8, 0.55), clamp(bul * 1.5, 0.0, 1.0));
  } else if (vType < 1.5) {
    vec2 g = vUV * 5.0 + vSeed * 13.0;
    float n = hash(floor(g)) * 0.6 + hash(floor(g * 2.0)) * 0.4;
    I = exp(-r * 1.1) * (0.4 + 0.9 * n);
    col = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.7, 0.85), step(0.85, n) * 0.6);
  } else if (vType < 3.5) {
    I = exp(-3.0 * (sqrt(r + 0.02) - 0.14));
    col = vec3(1.0, 0.8, 0.6);
  } else {
    I = 0.7 * exp(-r * 1.5) + 1.5 * exp(-(r * r) / 0.08);
    col = vec3(1.0, 0.82, 0.64);
  }
  I *= smoothstep(1.0, 0.8, sqrt(r2));
  col = mix(col, vec3(1.0, 0.9, 0.4), 0.35 * vSel);
  gl_FragColor = vec4(col, clamp(vA * I, 0.0, 1.0));
}`;

// ---------- 우리 은하 모형 점 (은하 중심 기준 좌표, 위치는 물체 이동으로) ----------
export const MW_VS = `
attribute vec4 aCol; attribute float aSize;
uniform float uScale; uniform float uFade; uniform float uMinPx;
varying vec4 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = max(1e-6, -mv.z);
  // 카메라 가까이의 점은 크기를 9 px로 묶고 그만큼 흐리게 (화소 계산량을 묶어 둠)
  float want = aSize * uScale / d, sz = clamp(want, uMinPx, 9.0);
  gl_PointSize = (mv.z < 0.0 && uFade > 0.0) ? sz : 0.0;
  vC = vec4(aCol.rgb, aCol.a * uFade * min(1.0, sz / max(want, 1e-6) * 1.5));
}`;
export const MW_FS = `
varying vec4 vC;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;
  gl_FragColor = vec4(vC.rgb, vC.a * (1.0 - r) * (1.0 - r));
}`;

// ---------- 행성계: 별과 행성 ----------
export const BODY_VS = "varying vec3 vN; varying vec3 vW; varying vec3 vP; void main() { vP = position; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }";
export const BODY_FS = "uniform vec3 uCol; uniform vec3 uCol2; uniform float uBands; uniform float uSeed; uniform vec3 uStar; varying vec3 vN; varying vec3 vW; varying vec3 vP;" +
  "float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164)) + uSeed) * 43758.5453); }" +
  "void main() { vec3 L = normalize(uStar - vW); float ndl = max(dot(normalize(vN), L), 0.0);" +
  " float b = uBands > 0.5 ? 0.5 + 0.5 * sin(vP.y / length(vP) * 14.0 + sin(vP.x / length(vP) * 3.0 + uSeed) * 1.5) : hash(floor(vP / length(vP) * 6.0));" +
  " vec3 c = mix(uCol, uCol2, b); gl_FragColor = vec4(c * (0.05 + 0.95 * ndl), 1.0); }";
export const SUN_VS = "varying vec3 vN; varying vec3 vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }";
export const SUN_FS = "uniform vec3 uCol; varying vec3 vN; varying vec3 vV; void main() { float mu = clamp(dot(vN, vV), 0.0, 1.0); float I = 1.0 - 0.6 * (1.0 - mu); gl_FragColor = vec4(uCol * I * 1.15, 1.0); }";
