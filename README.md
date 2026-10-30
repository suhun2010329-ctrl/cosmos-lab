# Cosmos Lab

공간과 시간을 직접 돌려 보는 과학 시뮬레이션 세 가지를 한 저장소에 모았습니다.
TypeScript + Three.js + Vite로 만들었고, 세 시뮬레이션이 같은 우주론 계산 모듈(`src/shared`)을 함께 씁니다.

| 페이지 | 내용 | 기술 |
|---|---|---|
| **4차원 관측실** (`/fourd/`) | 테서랙트, 16·24·5포체, 클리퍼드 토러스를 여섯 회전 평면으로 돌리고 3차원 그림자로 비춤 | Canvas 2D |
| **빅뱅 2D · 세 개의 시계** (`/bigbang/`) | 우주 한 단면의 입자 변화 + 팽창 시계 · 로그 시간 · 보통 시계 비교 | Canvas 2D |
| **팽창 시계 · 3D 우주 탐사기** (`/universe/`) | PM N-body 32³, 은하 약 11만 개, 은하 → 별 → 행성 LOD, 원소 기원 주기율표 | WebGL 2 · Three.js r128 · Web Worker |

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
src/
  shared/               공용 과학 모듈 (모두 strict TypeScript)
    cosmology.ts        프리드만 방정식, g*(T) 온도, 시간표, 선형 성장, Eisenstein–Hu P(k), 초기 조건, FFT
    physics.ts          재결합(피블스 방정식)·재이온화·광학 깊이, 빅뱅 핵합성 n/p, 별 형성 역사·원소 생성 통로
    eras.ts             시대 목록 (경계 대부분이 계산값)
    elements.ts         원소 118종의 기원(Johnson 2019)·태양 존재비(Asplund 2009)
    color.ts, format.ts, math.ts, base.css
  fourd/                4D 도형·회전(geometry.ts)과 화면(main.ts)
  bigbang/              2D 젤도비치 변위장(field2d.ts)과 화면(main.ts)
  universe/
    main.ts             3D 렌더링·카메라·LOD·별계·UI
    nbody.worker.ts     PM N-body + 은하 목록 생성 (Web Worker)
    shaders.ts          GLSL 셰이더 (VAT, 인스턴싱, 정밀 은하, 별·행성)
tests/physics.test.ts   계산값이 관측값과 맞는지 확인
```

## 계산 검증 (`npm test`)

| 값 | 계산 | 기준 |
|---|---|---|
| 우주 나이 | 13.797 Gyr | Planck 2018: 13.797 ± 0.023 Gyr |
| 마지막 산란면 z* | 1086 | Planck 2018: 1089.92 |
| 재이온화 광학 깊이 τ | 0.0540 | Planck 2018: 0.0544 |
| 헬륨 질량 비율 Yₚ | 0.231 | 관측 0.2453 ± 0.0034 (단순 n/p 동결 모형이라 조금 낮음) |
| 우주의 정오 | z ≈ 1.87 | Madau & Dickinson 2014: z ≈ 1.9 |

## 앞으로 할 일

- `src/universe/main.ts`는 원래 HTML 한 파일에 있던 화면 코드를 그대로 옮긴 것이라 아직 `// @ts-nocheck`입니다.
  카메라·LOD·별계·UI를 모듈로 나누고 타입을 붙이는 것이 다음 단계입니다.
- 3D 탐사기의 은하·별계 장면은 WebGL 2와 하드웨어 가속이 필요합니다.

## 참고 문헌

각 페이지 아래쪽에 출처를 적어 두었습니다 (Planck 2018, DESI DR2 2025, Eisenstein & Hu 1998, RECFAST, Madau & Dickinson 2014,
Baldry 2012, van der Wel 2014, Kroupa 2001, Johnson 2019, Asplund 2009, Kopparapu 2013 등 34편).
