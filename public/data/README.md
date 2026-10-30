# 우주지도 자료 (public/data)

`scripts/build_data.py`가 아래 공개 목록에서 만든 파일입니다. 좌표는 은하 좌표계 직교 좌표(원점 태양)입니다.

| 파일 | 내용 | 원본 · 라이선스 |
|---|---|---|
| `stars.bin` | 별 109,400개: x, y, z [pc], 절대등급, B−V (float32 × 5) | HYG Database v4.1 — astronexus, CC BY-SA 4.0 |
| `star-names.json` | 고유 이름·바이어·플램스티드 이름이 있는 별 1,894개 | HYG Database v4.1 — CC BY-SA 4.0 |
| `exoplanets.json` | 확인된 행성 5,043개를 가진 행성계 3,778개 | Open Exoplanet Catalogue — MIT |
| `galaxies.json` | NGC·IC 은하 10,195개: 위치 [Mpc], 거리, 크기, 축비, 위치각, 시선 속도 | OpenNGC — Mattia Verga, CC BY-SA 4.0 |

CC BY-SA 자료에서 만든 파일(`stars.bin`, `star-names.json`, `galaxies.json`)은 같은 CC BY-SA 4.0 조건으로 배포됩니다.

다시 만들기:

```
# 원본을 한 폴더(예: raw/)에 내려받은 뒤
python3 scripts/build_data.py raw public/data
```

- HYG: https://github.com/astronexus/HYG-Database (`hyg/CURRENT/hygdata_v41.csv`)
- OpenNGC: https://github.com/mattiaverga/OpenNGC (`database_files/NGC.csv`, `addendum.csv`)
- Open Exoplanet Catalogue: https://github.com/OpenExoplanetCatalogue/oec_gzip (`systems.xml.gz`)
