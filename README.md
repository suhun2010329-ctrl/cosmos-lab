# Cosmos Lab

공간과 시간을 직접 돌려 보는 과학 시뮬레이션과 실제 관측 자료로 만든 우주 지도를 한 저장소에 모았습니다.
TypeScript + Three.js + Vite로 만들었고, 모든 페이지가 같은 우주론 계산 모듈(`src/shared`)을 함께 씁니다.

| 페이지 | 내용 | 기술 |
|---|---|---|
| **4차원 관측실** (`/fourd/`) | 정다포체·클리퍼드 토러스·3-구면(호프 올)을 여섯 회전 평면으로 회전, 브레인 충돌, 특수 상대성 ‘시공간 시소’와 쌍둥이 여행 | Canvas 2D |
| **빅뱅 2D · 세 개의 시계** (`/bigbang/`) | 우주 한 단면의 입자 변화, 세 시계 비교, 미래 네 가지(ΛCDM·DESI·빅 크런치·빅 립), 순환 우주와 포앵카레 재귀, 중심 없는 팽창 | Canvas 2D |
| **우주 시뮬레이터** (`/atlas/`) | 우주 지도(별 109,400 · 외계행성 5,043 · 은하 10,195)와 팽창 시계(빅뱅~먼 미래)를 합친 예측 시뮬레이터. 별의 운동·수명, 태양 진화, 행성 궤도의 영년 변화, 달의 후퇴, 국부 은하군 병합(몬테카를로), 우주 팽창, 탐사선 발사 창 | WebGL · Three.js · RTE 셰이더 |
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
                        천체 특성(bodies), 미션(mission), 예측·사건(predict), 그래프(charts)
tests/                  계산값이 관측값·문헌값과 맞는지 확인 (47개)
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
| 행성 위치 | J2000 궤도 요소 + 케플러 방정식 | — |
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
