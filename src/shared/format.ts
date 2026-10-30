// 한국어 숫자·시간·길이·에너지 표기.

export const YEAR = 3.15576e7;
export const GYR = YEAR * 1e9;

const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };

/** 위 첨자로 바꿈: sup(-3) → "⁻³" */
export function sup(n: number | string): string {
  return String(n).split("").map((c) => SUP[c] ?? c).join("");
}

/** 과학 표기: sci(12345) → "1.2 × 10⁴" */
export function sci(x: number, d = 1): string {
  if (x === 0) return "0";
  let e = Math.floor(Math.log10(x)), m = x / Math.pow(10, e);
  if (m >= 9.95) { m /= 10; e += 1; }
  return m.toFixed(d) + " × 10" + sup(e);
}

export function fmtNum(x: number): string {
  return Math.round(x).toLocaleString("ko-KR");
}

export function fmtTime(s: number): string {
  if (s < 1e-3) return sci(s) + " 초";
  if (s < 60) return s.toPrecision(3) + " 초";
  if (s < 3600) return (s / 60).toFixed(1) + " 분";
  if (s < 86400) return (s / 3600).toFixed(1) + " 시간";
  if (s < YEAR) return (s / 86400).toFixed(1) + " 일";
  const y = s / YEAR;
  if (y < 1e4) return fmtNum(y) + " 년";
  if (y < 1e8) return (y / 1e4).toFixed(y < 1e5 ? 1 : 0) + "만 년";
  return (y / 1e8).toFixed(y < 1e10 ? 2 : 1) + "억 년";
}

export function fmtLen(m: number): string {
  if (m < 1e-3) return sci(m) + " m";
  if (m < 1) return (m * 100).toPrecision(3) + " cm";
  if (m < 1e3) return m.toPrecision(3) + " m";
  if (m < 1e13) return m < 1e6 ? (m / 1e3).toPrecision(3) + " km" : sci(m / 1e3) + " km";
  const ly = m / 9.4607e15;
  if (ly < 1e4) return ly.toPrecision(3) + " 광년";
  if (ly < 1e8) return (ly / 1e4).toPrecision(3) + "만 광년";
  if (ly < 1e12) return (ly / 1e8).toPrecision(3) + "억 광년";
  return sci(ly / 1e8, 2) + "억 광년";
}

/** 온도 [K]: 낮은 온도는 유효숫자 4자리 (오늘 2.725 K) */
export function fmtTemp(T: number): string {
  return T >= 1e5 ? sci(T) : T < 100 ? T.toPrecision(4) : fmtNum(T);
}

export function fmtEnergy(mev: number): string {
  if (mev >= 1e3) return (mev >= 1e6 ? sci(mev / 1e3) : (mev / 1e3).toPrecision(3)) + " GeV";
  if (mev >= 1) return mev.toPrecision(3) + " MeV";
  if (mev >= 1e-3) return (mev * 1e3).toPrecision(3) + " keV";
  return (mev * 1e6).toPrecision(3) + " eV";
}

const REFS: [string, number][] = [["양성자", 1.7e-15], ["원자", 1e-10], ["바이러스", 1e-7], ["머리카락 굵기", 8e-5], ["모래알", 1e-3],
  ["사과", 0.08], ["사람 키", 1.7], ["축구장", 105], ["서울", 6e4], ["지구", 1.27e7], ["태양", 1.39e9],
  ["태양계", 9e12], ["우리 은하", 1e21], ["국부 은하군", 3e22], ["라니아케아 초은하단", 1.6e24]];

/** 길이를 익숙한 물체와 비교: "지구의 약 12배" */
export function compare(m: number): string {
  if (m < REFS[0][1]) return REFS[0][0] + "보다 작음";
  let r = REFS[0];
  for (const ref of REFS) if (ref[1] <= m) r = ref;
  const k = m / r[1];
  if (k < 3) return "약 " + r[0] + " 크기";
  return r[0] + "의 약 " + (k < 1000 ? fmtNum(k) : sci(k, 0)) + "배";
}
