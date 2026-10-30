// 원소 118종: 기원(Johnson 2019 단순화), 태양 존재비(Asplund 2009), 주기율표 위치, 시점별 생성 비율.
import { smooth } from "./math";
import type { Nucleosynthesis, StarFormation } from "./physics";

export const EL_SYM = "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og".split(" ");
export const EL_KO = "수소 헬륨 리튬 베릴륨 붕소 탄소 질소 산소 플루오린 네온 나트륨 마그네슘 알루미늄 규소 인 황 염소 아르곤 칼륨 칼슘 스칸듐 타이타늄 바나듐 크로뮴 망가니즈 철 코발트 니켈 구리 아연 갈륨 저마늄 비소 셀레늄 브로민 크립톤 루비듐 스트론튬 이트륨 지르코늄 나이오븀 몰리브데넘 테크네튬 루테늄 로듐 팔라듐 은 카드뮴 인듐 주석 안티모니 텔루륨 아이오딘 제논 세슘 바륨 란타넘 세륨 프라세오디뮴 네오디뮴 프로메튬 사마륨 유로퓸 가돌리늄 터븀 디스프로슘 홀뮴 어븀 툴륨 이터븀 루테튬 하프늄 탄탈럼 텅스텐 레늄 오스뮴 이리듐 백금 금 수은 탈륨 납 비스무트 폴로늄 아스타틴 라돈 프랑슘 라듐 악티늄 토륨 프로트악티늄 우라늄 넵투늄 플루토늄 아메리슘 퀴륨 버클륨 캘리포늄 아인슈타이늄 페르뮴 멘델레븀 노벨륨 로렌슘 러더포듐 더브늄 시보귬 보륨 하슘 마이트너륨 다름슈타튬 뢴트게늄 코페르니슘 니호늄 플레로븀 모스코븀 리버모륨 테네신 오가네손".split(" ");

/** 기원 코드: B 빅뱅, M 무거운 별 폭발, L 가벼운 별의 죽음, W 백색왜성 폭발, N 중성자별 충돌, C 우주선, H 사람 */
export type OriginCode = "B" | "M" | "L" | "W" | "N" | "C" | "H";

// 원소마다 기원 비율 (10분율), Z = 1~92
const EL_ORIG = ("B10 B9M1 B3C3L4 C10 C10 L5M5 L6M4 M10 L5M5 M10 M10 M10 M10 M6W4 M10 M6W4 M8W2 M6W4 M8W2 M5W5 " +
  "M10 M5W5 M5W5 M3W7 M2W8 M4W6 M5W5 M4W6 M8L2 M9L1 M6L4 M6L4 M5L3N2 M5L2N3 M4L2N4 M4L4N2 L5N3M2 L7N1M2 L7N2M1 L7N2M1 " +
  "L6N4 L5N3M2 H10 N6L4 N8L2 N5L5 N7L3 L6N4 L6N4 L7N3 N6L4 N8L2 N9L1 N8L2 N8L2 L8N2 L7N3 L8N2 L5N5 L6N4 " +
  "H10 N7L3 N10 N8L2 N9L1 N9L1 N9L1 N8L2 N9L1 N7L3 N8L2 L5N5 L6N4 L6N4 N9L1 N9L1 N10 N10 N10 L6N4 " +
  "L7N3 L8N2 L5N5 N10 N10 N10 N10 N10 N10 N10 N10 N10").split(" ");

/** [코드, 이름, CSS 색 토큰] */
export const ORIGINS: [OriginCode, string, string][] = [
  ["B", "빅뱅 핵합성", "o1"], ["M", "무거운 별의 폭발", "o2"], ["L", "가벼운 별의 죽음", "o3"], ["W", "백색왜성 폭발", "o4"],
  ["N", "중성자별 충돌", "o5"], ["C", "우주선 쪼개짐", "o6"], ["H", "사람이 만듦", "o7"],
];

/** 태양 존재비 log ε (수소 = 12) */
export const LOGEPS: Record<number, number> = {
  1: 12.0, 2: 10.93, 3: 1.05, 4: 1.38, 5: 2.7, 6: 8.43, 7: 7.83, 8: 8.69, 9: 4.56, 10: 7.93, 11: 6.24, 12: 7.6, 13: 6.45, 14: 7.51, 15: 5.41, 16: 7.12,
  17: 5.5, 18: 6.4, 19: 5.03, 20: 6.34, 21: 3.15, 22: 4.95, 23: 3.93, 24: 5.64, 25: 5.43, 26: 7.5, 27: 4.99, 28: 6.22, 29: 4.19, 30: 4.56, 31: 3.04, 32: 3.65,
  36: 3.25, 37: 2.52, 38: 2.87, 39: 2.21, 40: 2.58, 41: 1.46, 42: 1.88, 44: 1.75, 45: 0.91, 46: 1.57, 47: 0.94, 49: 0.8, 50: 2.04, 54: 2.24, 56: 2.18, 57: 1.1,
  58: 1.58, 59: 0.72, 60: 1.42, 62: 0.96, 63: 0.52, 64: 1.07, 65: 0.3, 66: 1.1, 67: 0.48, 68: 0.92, 69: 0.1, 70: 0.84, 71: 0.1, 72: 0.85, 74: 0.85, 76: 1.4,
  77: 1.38, 79: 0.92, 81: 0.9, 82: 1.75, 90: 0.02, 92: -0.54,
};

export type OriginMix = Partial<Record<OriginCode, number>>;

export function elOrigins(Z: number): OriginMix {
  if (Z > 92) return { H: 1 };
  const o: OriginMix = {}, re = /([A-Z])(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(EL_ORIG[Z - 1]))) o[m[1] as OriginCode] = parseInt(m[2], 10) / 10;
  return o;
}

/** 주기율표 위치 [행, 열] (란타넘족 9행, 악티늄족 10행) */
export function ptPos(Z: number): [number, number] {
  if (Z === 1) return [1, 1];
  if (Z === 2) return [1, 18];
  if (Z <= 10) return [2, Z <= 4 ? Z - 2 : Z + 8];
  if (Z <= 18) return [3, Z <= 12 ? Z - 10 : Z];
  if (Z <= 36) return [4, Z - 18];
  if (Z <= 54) return [5, Z - 36];
  if (Z <= 86) { if (Z >= 57 && Z <= 71) return [9, Z - 54]; return [6, Z <= 56 ? Z - 54 : Z - 68]; }
  if (Z >= 89 && Z <= 103) return [10, Z - 86];
  return [7, Z <= 88 ? Z - 86 : Z - 100];
}

/** 각 기원이 오늘 대비 지금까지 원소를 얼마나 내놓았는가 (0~1) */
export function originFractions(la: number, BBN: Nucleosynthesis, SFR: StarFormation): Record<OriginCode, number> {
  const big = la >= BBN.laNuc ? 1 : smooth(BBN.laNuc - 0.25, BBN.laNuc, la);
  const cc = SFR.chanAt("cc", la);
  return { B: big, M: cc, L: SFR.chanAt("agb", la), W: SFR.chanAt("ia", la), N: SFR.chanAt("nsm", la), C: cc, H: la >= -0.0002 ? 1 : 0 };
}

export function elFraction(o: OriginMix, F: Record<OriginCode, number>): number {
  let s = 0;
  for (const k in o) s += (o[k as OriginCode] ?? 0) * F[k as OriginCode];
  return s;
}
