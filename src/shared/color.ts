// 흑체 색과 시대별 하늘 색.
import type { Cosmology } from "./cosmology";
import { clamp, smooth, type RGB } from "./math";

export function mixc(c1: RGB, c2: RGB, t: number): RGB {
  return [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
}

export function rgba(c: RGB, a: number): string {
  return "rgba(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + "," + a.toFixed(3) + ")";
}

export function hexRgb(hx: string | undefined): RGB {
  const s = (hx || "#888888").trim().replace("#", "");
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  const v = parseInt(full, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** 흑체 온도[K] → sRGB (Tanner Helland 근사, 1000–40000 K) */
export function blackbody(T: number): RGB {
  const t = clamp(T, 1000, 40000) / 100;
  let r: number, g: number, b: number;
  if (t <= 66) { r = 255; g = 99.4708 * Math.log(t) - 161.1196; b = t <= 19 ? 0 : 138.5177 * Math.log(t - 10) - 305.0448; }
  else { r = 329.6987 * Math.pow(t - 60, -0.1332); g = 288.1222 * Math.pow(t - 60, -0.0755); b = 255; }
  return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)];
}

const VOID: RGB = [12, 6, 28];

/** 그 시대 우주 안에서 본 하늘 색: 인플레이션은 보랏빛 진공, 이후는 광자 온도의 흑체 색 */
export function skyColor(core: Cosmology, la: number): RGB {
  if (la < core.LA_RH) return mixc(VOID, [40, 18, 80], smooth(core.LA_MIN, core.LA_RH, la));
  const T = core.TofA(Math.pow(10, la));
  let c = blackbody(T);
  if (T > 6500) c = mixc(c, [255, 255, 255], 0.3);
  c = mixc(c, [255, 255, 255], 1 - smooth(core.LA_RH, core.LA_RH + 0.5, la));
  const bright = T >= 3000 ? 1 : Math.pow(clamp(Math.log10(T / 250) / Math.log10(3000 / 250), 0, 1), 1.6);
  return [c[0] * bright, c[1] * bright, c[2] * bright];
}

/** 상대 휘도 (0~1) */
export function lum(c: RGB): number {
  return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
}
