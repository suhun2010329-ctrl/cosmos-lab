# Cosmos Lab

공간과 시간을 직접 돌려 보는 과학 시뮬레이션과 실제 관측 자료로 만든 우주 지도를 한 저장소에 모았습니다.
TypeScript + Three.js + Vite로 만들었고, 모든 페이지가 같은 우주론 계산 모듈(`src/shared`)을 함께 씁니다.

| 페이지 | 내용 | 기술 |
|---|---|---|
| **4차원 관측실** (`/fourd/`) | 정다포체·클리퍼드 토러스·3-구면(호프 올)을 여섯 회전 평면으로 회전, 브레인 충돌, 특수 상대성 ‘시공간 시소’와 쌍둥이 여행 | Canvas 2D |
| **빅뱅 2D · 세 개의 시계** (`/bigbang/`) | 우주 한 단면의 입자 변화, 세 시계 비교, 미래 네 가지(ΛCDM·DESI·빅 크런치·빅 립), 순환 우주와 포앵카레 재귀, 중심 없는 팽창 | Canvas 2D |
| **우주 시뮬레이터** (`/atlas/`) | 우주 지도(별 109,400 · 외계행성 5,043 · 은하 10,195)와 팽창 시계(빅뱅~먼 미래)를 합친 예측 시뮬레이터. 별의 운동·수명, 태양 진화, 행성 궤도의 영년 변화, 달의 후퇴, 국부 은하군 병합(몬테카를로), 우주 팽창, 탐사선 발사 창. 지도 자체가 4차원 (x, y, z, w = 빛이 떠난 때 × c)이라 XW·YW·ZW 회전으로 과거 광원뿔과 행성의 세계선을 바로 볼 수 있음 | WebGL · Three.js · RTE 셰이더 · 4차원 회전 |
| **팽창 시계 · 3D 우주 탐사기** (`/universe/`) | PM N-body 32³, 10⁷ M☉까지 은하 약 30만 개, 은하 → 별 → 행성 LOD, 원소 기원 주기율표 | WebGL 2 · Three.js r128 · Web Worker |

## 내 컴퓨터(Windows)에서 실행하기

1. **Node.js 설치**: <https://nodejs.org> 에서 **LTS** 버전(22 이상)을 받아 설치합니다.
2. **Git 설치** (GitHub에 올릴 때 필요): <https://git-scm.com/download/win>
3. 명령 프롬프트(또는 PowerShell)를 열고 설치를 확인합니다.
   ```
   node -v
   git --version
   ```
4. 프로젝트 폴더로 가서 실행합니다.
   ```
   cd cosmos-lab
   npm install
   npm run dev
   ```
5. 화면에 나온 주소(보통 <http://localhost:5173>)를 브라우저로 엽니다.

### 명령어

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 (코드를 고치면 바로 반영) |
| `npm run build` | 타입 검사 후 `dist/`에 배포용 파일 생성 |
| `npm run preview` | 빌드 결과를 로컬에서 확인 |
| `npm test` | 과학 계산 회귀 테스트 (vitest) |
| `npm run typecheck` | TypeScript 타입 검사만 |

## GitHub에 올리기

1. GitHub에서 **빈 저장소**를 만듭니다 (README·.gitignore 추가하지 않음). 예: `cosmos-lab`
2. 이 폴더에서:
   ```
   git remote add origin https://github.com/<사용자명>/cosmos-lab.git
   git push -u origin main
   ```
   (이미 첫 커밋이 들어 있습니다. 처음 푸시할 때 GitHub 로그인 창이 뜹니다.)

### GitHub Pages로 공개하기 (선택)

저장소의 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꾸면,
`main`에 푸시할 때마다 `.github/workflows/deploy.yml`이 테스트·빌드 후
`https://<사용자명>.github.io/cosmos-lab/` 에 올립니다.

## 폴더 구조

```
index.html              허브 페이지
fourd/index.html        4차원 관측실
bigbang/index.html      빅뱅 2D
universe/index.html     3D 우주 탐사기
atlas/index.html        우주 지도
public/data/            우주 지도 자료 (출처·라이선스는 public/data/README.md)
scripts/build_data.py   관측 목록 → public/data 변환
src/
  shared/               공용 과학 모듈 (모두 strict TypeScript)
    cosmology.ts        프리드만 방정식, g*(T) 온도, 시간표, 선형 성장, Eisenstein–Hu P(k), 초기 조건, FFT
    physics.ts          재결합(피블스 방정식)·재이온화·광학 깊이, 빅뱅 핵합성 n/p, 별 형성 역사·원소 생성 통로
    scenarios.ts        미래 시나리오: 축이온 장 + 음의 우주상수(크런치), 팬텀 에너지(빅 립), 수축 구간 적분
    eras.ts             시대 목록 (경계 대부분이 계산값)
    elements.ts         원소 118종의 기원(Johnson 2019)·태양 존재비(Asplund 2009)
    color.ts, format.ts, math.ts, base.css
  fourd/                4D 도형·회전(geometry.ts), 시공간 시소(relativity.ts), 화면(main.ts)
  bigbang/              2D 젤도비치 변위장(field2d.ts)과 화면(main.ts)
  universe/
    main.ts             3D 렌더링·카메라·LOD·별계·UI
    nbody.worker.ts     PM N-body + 은하 목록 생성 (Web Worker)
    shaders.ts          GLSL 셰이더 (VAT, 인스턴싱, 정밀 은하, 별·행성)
  atlas/                우주 시뮬레이터: 자료 읽기, 천체 목록, 우리 은하 모형, 행성계 장면, RTE 셰이더,
                        시간축(time), 태양(sun), 영년 섭동(secular), 별(stellar), 국부 은하군(localgroup),
                        천체 특성(bodies), 미션(mission), 예측·사건(predict), 그래프(charts), 4차원 좌표·광원뿔(four),
                        원소 구성(composition), 픽셀 충돌(impact·impactview·impactscenes), 실시간 자료(live)
tests/                  계산값이 관측값·문헌값과 맞는지 확인 (70개)
scripts/live/           실시간 우주 자료 수집기 (GitHub Actions에서 실행)
```

## 계산 검증 (`npm test`)

| 값 | 계산 | 기준 |
|---|---|---|
| 우주 나이 | 13.797 Gyr | Planck 2018: 13.797 ± 0.023 Gyr |
| 마지막 산란면 z* | 1086 | Planck 2018: 1089.92 |
| 재이온화 광학 깊이 τ | 0.0540 | Planck 2018: 0.0544 |
| 헬륨 질량 비율 Yₚ | 0.231 | 관측 0.2453 ± 0.0034 (단순 n/p 동결 모형이라 조금 낮음) |
| 우주의 정오 | z ≈ 1.87 | Madau & Dickinson 2014: z ≈ 1.9 |
| 빅 크런치 시나리오 | 팽창 최대 248억 년, 수명 약 328억 년 | Luu, Qiu & Tye 2025: 약 330억 년 |
| 빅 립 (w = −1.5) | 약 230억 년 뒤, 우리 은하는 6천만 년 전에 찢김 | Caldwell 외 2003: 약 220억 년 (H₀ = 70), 6천만 년 |
| 안드로메다 은하 위치 | l = 121.17°, b = −21.57° | 목록값과 일치 |
| TRAPPIST-1 생명 가능 지대 | e, f, g | Kopparapu 외 2013 (온도 의존 식) |

## 우주 시뮬레이터의 예측 방법

| 대상 | 방법 | 검증 (tests/) |
|---|---|---|
| 행성 위치 | JPL 표 1 궤도 요소와 변화율(Standish) + 케플러 방정식 | 실시간 수집한 JPL Horizons와 각 오차: 지구 0.06′, 수성 0.3′, 목성 1.4′, 토성 4.4′ (변화율을 넣기 전 토성 68′) |
| 행성 궤도의 장기 변화 | 라플라스–라그랑주 영년 섭동 (8행성, 수성 일반 상대성 포함) | 지구 이심률 ±100만 년 0–0.057 (Laskar 2004: 0–0.058) |
| 태양 | 주계열 Gough (1981), 이후 Schröder & Smith (2008) | 10억 년 뒤 1.10 L☉, 75.9억 년 뒤 적색거성 정점 |
| 달 | 조석 후퇴 3.82 cm/년, da/dt ∝ a^(−11/2), 각운동량 보존 | 10억 년 뒤 41.5만 km, 하루 29.6시간 |
| 별 | 고유 운동 + 시선 속도 직선 운동, 질량–광도 관계로 수명·최후 | 바너드 별 141 km/s |
| 국부 은하군 | 헤르퀴스트 헤일로 3체 + 역학적 마찰, 200회 몬테카를로 | 100억 년 안 병합 63% (Sawala 외 2025: 약 50%) |
| 우주 | Planck 2018 과거 + 네 가지 미래 시나리오 | 크런치 약 328억 년, 빅 립 약 230억 년 뒤 |
| 탐사선 | 호만 전이 Δv·비행 시간·위상각, 실제 행성 위치로 발사 창 탐색 | 지구→화성 259일, v∞ 2.94 km/s, 다음 창 2026년 12월 |

탐사선 미션 계획의 궤도 전이 공식과 발사체 자료는 **Space Engineering Pack**을 참고했습니다.
Original work by IDEAMAX Skills Factory · Creator: Dimitar Georgiev - Biko ·
https://ideamax.eu | https://biko.bg | https://github.com/devideamax (MIT + Attribution, 전문은 `THIRD_PARTY_NOTICES.md`).

## 우주 지도의 4차원

4차원은 별도 화면이 아니라 우주 지도 자체에 들어 있습니다. 지도 위의 모든 점(별·외계행성계·은하·우리 은하·거리 껍질)은
(x, y, z, **w**) 좌표를 가지고, 모든 셰이더와 이름표·고르기가 같은 4차원 변환을 거칩니다.

| 항목 | 내용 |
|---|---|
| w의 뜻 (지도) | 그 천체에서 지금 보이는 빛이 출발한 때 × 빛의 속도 = 과거 광원뿔 위의 자리. 1 Mpc 밖은 공동 거리가 아니라 빛이 온 거리 c·t_lookback (z = 1 은하: 공동 거리 3.4 Gpc, w = −7.9 Gyr × c) |
| w의 뜻 (행성계) | 시간. 행성은 태양의 곧은 세계선을 감는 나선으로 그려짐 (길이는 시야에 맞춘 케플러 주기) |
| 회전 | 4차원 관측실과 같은 여섯 평면 회전 `rotate4`. XW·YW·ZW 막대, Shift+드래그, 자동 회전 |
| 시점 | 3차원 단면(각 0 = 보통의 지도), 과거 광원뿔(ZW −90°), 시공간 45°, 옆에서 본 4차원 |
| 보조 | w 축척(빛 = 45°가 기본), w를 색으로(최근의 빛 분홍 → 오래된 빛 청록), w 원근, 화면 왼쪽 아래 X·Y·Z·W 축 |
| 검증 | 각 0이면 단위 행렬, 회전 직교성, 광원뿔 시점에서 거리 d → 높이 −d, 빛이 온 거리 (`tests/four.test.ts`) |

### 시공간 조건: 팽창 · 공간 = 시간 (지도에 바로 들어 있음)

| 조건 | 계산 | 검증 (`tests/four.test.ts`) |
|---|---|---|
| 팽창 | 은하 거리 = 오늘 거리 × a(t), 빛은 χ = ∫ c dt / a 를 건넘 | — |
| 공간 = 시간 | 관측 시점의 과거 광원뿔: w = −c(t_obs − t_e), 지평선 밖 숨김, 별의 죽음은 빛 도착 뒤 | 입자 지평선 46.2 Gly, z = 1의 빛은 79.5억 년 전 출발 |
| 광원뿔 쪽으로 돌리기 | ‘같은 순간의 위치’ → ‘빛이 떠날 때의 위치’(× a_e/a) | 눈물방울 최대 약 58억 광년 (z ≈ 1.6), 우주배경복사 4,200만 광년 |

## 원소로 된 픽셀 천체와 충돌 (`src/atlas/composition.ts`, `impact.ts`)

- 천체마다 층 구조와 층별 원소 질량 비율 (지구 전체 철 32.4 · 산소 29.9 · 규소 16.2 · 마그네슘 15.0%, McDonough 2003과 일치).
- 픽셀(입자) 수천 개를 육방 최밀 쌓기로 채우고, Barnes–Hut 중력 + 스프링–감쇠 접촉력 + 마찰, 잃은 에너지는 열. Web Worker에서 계산.
- 시나리오: 테이아 충돌(45.1억 년 전), 슈메이커–레비 9 조석 붕괴(1992), 포보스의 고리(2천만~4천만 년 뒤), 트리톤(약 36억 년 뒤), 수성–금성 충돌(확률 약 1%), 직접 고르는 충돌, 천체 단면.
- 검증 (`tests/impact.test.ts`): 트리 중력 오차 < 2%, 운동량 보존, 에너지 변화 < 3%, 테이아 충돌에서 철이 적은 원반이 생기고 원반의 대부분이 테이아 물질 (보통 해상도에서 달 질량 약 1.9배, 테이아 물질 94%, 철 13.5% 대 행성 36.8%).

## 실시간 우주 자료와 논문 (`scripts/live/`, `src/atlas/live.ts`)

- GitHub Actions(`deploy.yml`)가 6시간마다 `scripts/live/fetch.mjs`로 NOAA SWPC, JPL CAD·Sentry·Horizons, NASA Exoplanet Archive, CelesTrak, arXiv·Crossref를 모아 `data/live.json`으로 함께 배포합니다. 원천 하나가 실패해도 배포는 계속됩니다.
- 브라우저는 Kp 지수·X선 플레어·위성 궤도를 5분마다 직접 다시 받습니다.
- 분석: 태양 주기 25를 Hathaway 외 (1994) 함수로 맞춰 극대·다음 극소 예측, 소행성 충돌 에너지·충돌구 (Collins 외 2005), 위성의 지금 위치 (J2 섭동), 행성 위치 모형을 JPL Horizons와 비교, 새로 등록된 외계행성을 지도에 추가.
- 논문: `public/data/literature.json`은 사람이 확인한 측정값(학술지 게재 = 반영, 프리프린트 = 보류). 자동 수집기는 arXiv 초록에서 값을 뽑아 범위·불확도·학술지 게재·기존 측정과 6σ 이내를 모두 통과할 때만 반영합니다 (`scripts/live/lib.mjs`, `tests/live.test.ts`).

## 미래 시나리오에 대하여

빅 크런치 시나리오는 Luu, Qiu & Tye (2025)의 축이온 암흑에너지 + 음의 우주상수 모형을 그대로 푼 것이 아니라,
‘오늘부터 굴러가기 시작하는 축이온 장’으로 단순화해 그 결론(총수명 약 330억 년, 팽창 최대 약 110억 년 뒤)에 맞춘 것입니다.
과거 역사는 모든 시나리오에서 Planck 2018 ΛCDM과 같습니다. 수축 구간에서는 장의 운동 에너지가 a⁻⁶으로 커지므로
마지막 순간은 그 해석해로 이어 붙였습니다.

## 앞으로 할 일

- `src/universe/main.ts`는 원래 HTML 한 파일에 있던 화면 코드를 그대로 옮긴 것이라 아직 `// @ts-nocheck`입니다.
  카메라·LOD·별계·UI를 모듈로 나누고 타입을 붙이는 것이 다음 단계입니다.
- 3D 탐사기의 은하·별계 장면은 WebGL 2와 하드웨어 가속이 필요합니다.

## 참고 문헌

각 페이지 아래쪽에 출처를 적어 두었습니다 (Planck 2018, DESI DR2 2025, Eisenstein & Hu 1998, RECFAST, Madau & Dickinson 2014,
Baldry 2012, van der Wel 2014, Kroupa 2001, Johnson 2019, Asplund 2009, Kopparapu 2013 등 34편).
