// 3D 화면의 GLSL 셰이더 (WebGL 2, Three.js r128 ShaderMaterial).
// GLSL_COMMON: VAT 키프레임 보간 + 부동 원점/주기 경계 상대 위치.

export const GLSL_COMMON = [
  "uniform sampler2D uTexA;", "uniform sampler2D uTexB;",
  "uniform float uSA;", "uniform float uSB;", "uniform float uWDA;", "uniform float uWDB;",
  "uniform vec3 uCam;", "uniform float uWrap;", "uniform float uScale;", "uniform vec2 uRes;",
  "vec2 texUV(float idx) { return vec2((mod(idx, 256.0) + 0.5) / 256.0, (floor(idx / 256.0) + 0.5) / 128.0); }",
  "vec3 hostDisp(float idx, out float logd) {",
  "  vec2 uv = texUV(idx); vec4 a = texture2D(uTexA, uv); vec4 b = texture2D(uTexB, uv);",
  "  logd = a.a * uWDA + b.a * uWDB;",
  "  return a.rgb * uSA + b.rgb * uSB;",
  "}",
  "vec3 relPos(vec3 boxPos) {",
  "  vec3 p = fract(boxPos) * 10.0; vec3 rel = p - uCam;",
  "  if (uWrap > 0.5) rel -= 10.0 * floor(rel / 10.0 + 0.5);",
  "  return rel;",
  "}"
].join("\n");

// ---------- 우주망 입자 (VAT) ----------
export const PART_VS = GLSL_COMMON + "\n" + [
  "attribute float aIdx; attribute vec3 aQ; attribute vec4 aRand;",
  "uniform float uMinSize; uniform float uMaxPx; uniform float uFogDensity; uniform float uFogStart; uniform float uTime; uniform float uJit;",
  "uniform float uPhase; uniform float uXn; uniform float uHeF; uniform float uIon; uniform float uGasBase; uniform float uDark; uniform float uDM; uniform float uNearFade;",
  "varying vec4 vColor; varying float vFog;",
  "void main() {",
  "  float logd; vec3 disp = hostDisp(aIdx, logd);",
  "  vec3 bp = aQ + disp;",
  "  if (uJit > 0.0) bp += uJit * (vec3(fract(sin(aRand.z * 91.3 + uTime * 37.0) * 4375.5), fract(sin(aRand.w * 57.1 + uTime * 29.0) * 7613.1), fract(sin(aRand.y * 33.7 + uTime * 41.0) * 5121.7)) - 0.5);",
  "  vec3 rel = relPos(bp);",
  "  vec4 mv = modelViewMatrix * vec4(rel, 1.0);",
  "  gl_Position = projectionMatrix * mv;",
  "  float d = max(1e-4, -mv.z);",
  "  vec3 c; float al; float sz;",
  "  if (uPhase < 0.5) { c = vec3(0.72, 0.6, 1.0); al = 0.5; sz = 0.06; }",
  "  else if (uPhase < 1.5) { c = aRand.x < 0.5 ? vec3(0.78, 0.12, 0.2) : (aRand.x < 1.5 ? vec3(0.08, 0.55, 0.24) : vec3(0.16, 0.27, 0.82)); al = 0.85; sz = 0.09; }",
  "  else if (uPhase < 2.5) { c = aRand.y < uXn ? vec3(0.31, 0.31, 0.39) : vec3(0.75, 0.2, 0.14); al = 0.85; sz = 0.09; }",
  "  else if (uPhase < 3.5) { bool he = aRand.y < uHeF; c = he ? vec3(0.7, 0.45, 0.04) : vec3(0.75, 0.24, 0.16); al = he ? 0.95 : 0.75; sz = he ? 0.15 : 0.08; }",
  "  else {",
  "    sz = 0.07;",
  "    if (uDark > 0.5) { c = mix(vec3(0.5, 0.56, 0.85), vec3(0.68, 0.56, 0.92), uIon); float t = clamp(log(1.0 + pow(10.0, logd)) / log(11.0), 0.0, 1.0); al = uGasBase * (0.12 + 0.88 * t) * uDM; }",
  "    else { c = vec3(0.22, 0.2, 0.32); al = 0.7; }",
  "  }",
  "  al *= mix(1.0, smoothstep(0.02, 0.25, d), uNearFade);",
  "  gl_PointSize = al > 0.002 ? clamp(sz * uScale / d, uMinSize, uMaxPx) : 0.0;",
  "  float fd = max(0.0, d - uFogStart) * uFogDensity;",
  "  vFog = 1.0 - exp(-fd * fd);",
  "  vColor = vec4(c, al);",
  "}"
].join("\n");
export const POINT_FS = [
  "uniform vec3 uFogColor;",
  "varying vec4 vColor; varying float vFog;",
  "void main() {",
  "  vec2 c = gl_PointCoord - vec2(0.5); float r = length(c) * 2.0;",
  "  if (r > 1.0 || vColor.a <= 0.0) discard;",
  "  vec3 col = mix(vColor.rgb, uFogColor, vFog);",
  "  gl_FragColor = vec4(col, vColor.a * (1.0 - r) * (1.0 - 0.95 * vFog));",
  "}"
].join("\n");

// ---------- 은하 임포스터 (GPU 인스턴싱) ----------
export const GAL_VS = GLSL_COMMON + "\n" + [
  "attribute float gHost; attribute vec3 gBase; attribute vec4 gP1; attribute vec4 gP2; attribute vec3 gNrm;",
  "uniform float uLogRho; uniform float uZ; uniform float uAinv; uniform float uHub; uniform float uExp; uniform float uMinPx;",
  "uniform vec4 uHideId; uniform vec4 uHideF;",
  "varying vec2 vUV; varying vec2 vAxis; varying float vRatio; varying float vType; varying float vSeed; varying vec3 vCol; varying float vAlpha; varying float vPoint;",
  "void main() {",
  "  vUV = position.xy; vAlpha = 0.0; vPoint = 0.0; vAxis = vec2(1.0, 0.0); vRatio = 1.0; vType = 0.0; vSeed = gP1.w; vCol = vec3(1.0);",
  "  float lm = gP1.x + gP1.y * uLogRho;",
  "  if (lm < 5.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }",
  "  float logd; vec3 disp = hostDisp(gHost, logd);",
  "  vec3 rel = relPos(gBase + disp);",
  "  vec4 c = modelViewMatrix * vec4(rel, 1.0);",
  "  float d = -c.z;",
  "  if (d < 1e-7) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }",
  "  bool quen = gP1.z >= 0.0 && uZ < gP1.z;",
  "  float type = quen ? 3.0 + gP2.x : (gP2.y < 0.5 ? ((uZ > 2.0 && lm > 9.0) ? 2.0 : 0.0) : 1.0);",
  "  float M = pow(10.0, lm);",
  "  float rk = (quen && gP2.x < 0.5 && lm > 10.0) ? max(0.4, 4.0 * pow(M / 5e10, 0.75) * pow(1.0 + uZ, -1.48)) : max(0.4, 7.1 * pow(M / 5e10, 0.22) * pow(1.0 + uZ, -0.75));",
  "  float Rw = rk * 1e-4 * uHub * uAinv;",
  "  float ext = (type > 2.5 && type < 3.5 ? 5.0 : 3.5) * Rw;",
  "  float px = ext * uScale / d;",
  "  float flux = uExp * M * (quen ? 0.5 : 1.2) / (d * d);",
  "  float hide = 1.0;",
  "  if (abs(gP2.w - uHideId.x) < 0.5) hide = uHideF.x;",
  "  if (abs(gP2.w - uHideId.y) < 0.5) hide = uHideF.y;",
  "  if (abs(gP2.w - uHideId.z) < 0.5) hide = uHideF.z;",
  "  vType = type;",
  "  vCol = quen ? vec3(1.0, 0.78, 0.56) : (type > 1.5 ? vec3(0.62, 0.74, 1.0) : vec3(0.78, 0.84, 1.0));",
  "  if (type < 2.5 || (type > 3.5 && type < 4.5)) {",
  "    vec3 n = normalize(mat3(modelViewMatrix) * gNrm);",
  "    vec2 ax = vec2(-n.y, n.x); float L = length(ax);",
  "    vAxis = L > 1e-4 ? ax / L : vec2(1.0, 0.0);",
  "    vRatio = max(abs(n.z), (type > 0.5 && type < 1.5) ? 0.45 : 0.12);",
  "  } else { float ang = fract(gP1.w * 3.17) * 6.2832; vAxis = vec2(cos(ang), sin(ang)); vRatio = gP2.z; }",
  "  if (px < 1.0) {",
  "    float a = min(1.0, flux * 0.6) * hide;",
  "    if (a < 0.004) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }",
  "    vPoint = 1.0; vAlpha = a;",
  "    gl_Position = projectionMatrix * c;",
  "    gl_Position.xy += position.xy * (2.0 * uMinPx / uRes) * gl_Position.w;",
  "  } else {",
  "    float sb = clamp(0.25 + 0.2 * (log(M / (ext * ext)) / log(10.0) - 15.0), 0.12, 0.9);",
  "    float fl = min(1.0, flux * 5.0 / (px * px));",
  "    vAlpha = mix(fl, sb, smoothstep(1.0, 4.0, px)) * hide;",
  "    if (vAlpha < 0.003) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }",
  "    c.xy += position.xy * ext;",
  "    gl_Position = projectionMatrix * c;",
  "  }",
  "}"
].join("\n");
export const GAL_FS = [
  "varying vec2 vUV; varying vec2 vAxis; varying float vRatio; varying float vType; varying float vSeed; varying vec3 vCol; varying float vAlpha; varying float vPoint;",
  "float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
  "void main() {",
  "  float r2 = dot(vUV, vUV);",
  "  if (r2 > 1.0 || vAlpha <= 0.0) discard;",
  "  if (vPoint > 0.5) { float k = 1.0 - sqrt(r2); gl_FragColor = vec4(vCol, vAlpha * k * k); return; }",
  "  vec2 q = vec2(dot(vUV, vAxis), dot(vUV, vec2(-vAxis.y, vAxis.x)) / vRatio);",
  "  float lq = length(q);",
  "  if (lq > 1.0) discard;",
  "  float ext = (vType > 2.5 && vType < 3.5) ? 5.0 : 3.5;",
  "  float r = lq * ext;",
  "  float th = atan(q.y, q.x);",
  "  float I; vec3 col = vCol;",
  "  if (vType < 0.5) {",
  "    float pitch = 0.22 + 0.25 * fract(vSeed * 1.37); float ph = fract(vSeed * 7.13) * 6.2832;",
  "    float arm = 0.5 + 0.5 * cos(2.0 * (th - log(r + 0.05) / tan(pitch)) + ph);",
  "    arm = pow(arm, 3.0) * smoothstep(0.15, 0.6, r);",
  "    float bul = exp(-(r * r) / 0.03);",
  "    I = exp(-r * 1.68) * (0.45 + 1.4 * arm) + 1.3 * bul;",
  "    col = mix(vec3(1.0, 0.86, 0.66), vec3(0.62, 0.74, 1.0), clamp(arm * 1.3 * smoothstep(0.1, 0.5, r), 0.0, 1.0));",
  "    col = mix(col, vec3(1.0, 0.8, 0.55), clamp(bul * 1.5, 0.0, 1.0));",
  "  } else if (vType < 1.5) {",
  "    vec2 g = q * 3.0 + vSeed * 13.0;",
  "    float n = hash(floor(g)) * 0.6 + hash(floor(g * 2.0)) * 0.4;",
  "    I = exp(-r * 1.3) * (0.4 + 0.9 * n);",
  "    col = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.7, 0.85), step(0.85, n) * 0.6);",
  "  } else if (vType < 2.5) {",
  "    I = 0.5 * exp(-r * 1.5);",
  "    for (int k = 0; k < 6; k++) { float fk = float(k); vec2 cp = (vec2(hash(vec2(vSeed, fk)), hash(vec2(fk, vSeed))) - 0.5) * 1.6; vec2 dd = q * ext - cp; I += 0.9 * exp(-dot(dd, dd) / 0.02); }",
  "    col = vec3(0.6, 0.74, 1.0);",
  "  } else if (vType < 3.5) {",
  "    I = exp(-3.2 * (sqrt(r + 0.02) - 0.14));",
  "  } else if (vType < 4.5) {",
  "    I = 0.7 * exp(-r * 1.68) + 1.5 * exp(-(r * r) / 0.06);",
  "    col = vec3(1.0, 0.82, 0.62);",
  "  } else {",
  "    I = 0.6 * exp(-r * 1.2);",
  "    col = vec3(0.95, 0.85, 0.7);",
  "  }",
  "  I *= smoothstep(1.0, 0.8, lq);",
  "  gl_FragColor = vec4(col, clamp(vAlpha * I, 0.0, 1.0));",
  "}"
].join("\n");

// ---------- 정밀 은하 (LOD 2단계, 별 수만 개) ----------
export const DET_VS = [
  "attribute vec4 aCol; attribute float aSize;",
  "uniform float uScale; uniform float uMinSize; uniform float uUnit; uniform float uFade; uniform float uSB;",
  "varying vec4 vC;",
  "void main() {",
  "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
  "  gl_Position = projectionMatrix * mv;",
  "  float d = max(1e-9, -mv.z);",
  "  gl_PointSize = clamp(aSize * uUnit * uScale / d, uMinSize, 40.0);",
  "  vC = vec4(aCol.rgb, aCol.a * uFade * uSB);",
  "}"
].join("\n");
export const DET_FS = [
  "varying vec4 vC;",
  "void main() {",
  "  vec2 c = gl_PointCoord - vec2(0.5); float r = length(c) * 2.0;",
  "  if (r > 1.0) discard;",
  "  gl_FragColor = vec4(vC.rgb, vC.a * (1.0 - r) * (1.0 - r));",
  "}"
].join("\n");

// ---------- 별계 장면 ----------
export const STAR_VS = "varying vec3 vN; varying vec3 vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }";
export const STAR_FS = "uniform vec3 uCol; varying vec3 vN; varying vec3 vV; void main() { float mu = clamp(dot(vN, vV), 0.0, 1.0); float I = 1.0 - 0.6 * (1.0 - mu); gl_FragColor = vec4(uCol * I * 1.15, 1.0); }";
export const PL_VS = "varying vec3 vN; varying vec3 vW; varying vec3 vP; void main() { vP = position; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }";
export const PL_FS = "uniform vec3 uCol; uniform vec3 uCol2; uniform float uBands; uniform float uSeed; varying vec3 vN; varying vec3 vW; varying vec3 vP;" +
  "float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164)) + uSeed) * 43758.5453); }" +
  "void main() { vec3 L = normalize(-vW); float ndl = max(dot(normalize(vN), L), 0.0);" +
  " float b = uBands > 0.5 ? 0.5 + 0.5 * sin(vP.y * 14.0 + sin(vP.x * 3.0 + uSeed) * 1.5) : hash(floor(vP * 6.0));" +
  " vec3 c = mix(uCol, uCol2, b); gl_FragColor = vec4(c * (0.06 + 0.94 * ndl), 1.0); }";
