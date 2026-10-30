"""우주지도(atlas)용 관측 자료를 public/data/ 아래 작은 파일로 바꾼다.

입력 (내려받아 한 폴더에 둠):
  hygdata_v41.csv   HYG 별 목록 v4.1   https://github.com/astronexus/HYG-Database
  NGC.csv, addendum.csv   OpenNGC     https://github.com/mattiaverga/OpenNGC
  systems.xml.gz    Open Exoplanet Catalogue   https://github.com/OpenExoplanetCatalogue/oec_gzip

사용: python3 scripts/build_data.py <입력 폴더> public/data
좌표는 모두 은하 좌표계 직교 좌표 (X: 은하 중심 방향, Y: 회전 방향 l = 90°, Z: 은하 북극), 원점은 태양.
"""
import csv, gzip, json, math, struct, sys, xml.etree.ElementTree as ET

SRC, OUT = sys.argv[1], sys.argv[2]

# ICRS(J2000) → 은하 좌표 회전 행렬 (Hipparcos 정의)
M = [[-0.0548755604, -0.8734370902, -0.4838350155],
     [0.4941094279, -0.4448296300, 0.7469822445],
     [-0.8676661490, -0.1980763734, 0.4559837762]]

def eq_to_gal(x, y, z):
    return [M[i][0] * x + M[i][1] * y + M[i][2] * z for i in range(3)]

def radec_to_gal(ra_deg, dec_deg, d):
    ra, dec = math.radians(ra_deg), math.radians(dec_deg)
    return eq_to_gal(d * math.cos(dec) * math.cos(ra), d * math.cos(dec) * math.sin(ra), d * math.sin(dec))

def sexa(s, hours):
    s = s.strip().replace(":", " ")
    parts = s.split()
    sign = -1 if parts[0].startswith("-") else 1
    v = abs(float(parts[0])) + float(parts[1]) / 60 + (float(parts[2]) if len(parts) > 2 else 0) / 3600
    return sign * v * (15 if hours else 1)

def fnum(s):
    try:
        v = float(s)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None

def r4(v, n=4):
    return None if v is None else float(f"{v:.{n}g}")

# ---------- 별 (HYG) ----------
stars, names, hip_idx, hd_idx, gl_idx = [], [], {}, {}, {}
with open(f"{SRC}/hygdata_v41.csv", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        d = fnum(r["dist"])
        if d is None or d >= 100000 or r["id"] == "0":
            continue
        x, y, z = eq_to_gal(float(r["x"]), float(r["y"]), float(r["z"]))
        ci = fnum(r["ci"])
        i = len(stars)
        stars.append((x, y, z, float(r["absmag"]), ci if ci is not None else 0.65))
        if r["hip"]: hip_idx[r["hip"]] = i
        if r["hd"]: hd_idx[r["hd"]] = i
        if r["gl"]: gl_idx[r["gl"].replace(" ", "")] = i
        mag = fnum(r["mag"]) or 99
        label = r["proper"] or (f'{r["bayer"]} {r["con"]}' if r["bayer"] and mag < 6 else "") or (f'{r["flam"]} {r["con"]}' if r["flam"] and mag < 5 else "")
        if label:
            names.append([i, label, r["spect"], r4(d), r4(mag, 3)])
with open(f"{OUT}/stars.bin", "wb") as f:
    for s in stars:
        f.write(struct.pack("<5f", *s))
json.dump(names, open(f"{OUT}/star-names.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("stars", len(stars), "named", len(names))

# ---------- 외계행성 (Open Exoplanet Catalogue) ----------
def txt(el, tag):
    c = el.find(tag)
    return c.text.strip() if c is not None and c.text else None

systems = []
root = ET.fromstring(gzip.open(f"{SRC}/systems.xml.gz").read())
for sysel in root.findall("system"):
    d, ra, dec = fnum(txt(sysel, "distance")), txt(sysel, "rightascension"), txt(sysel, "declination")
    if d is None or ra is None or dec is None:
        continue
    for st in sysel.iter("star"):
        pls = []
        for p in st.findall("planet"):
            lists = [l.text for l in p.findall("list")]
            if "Confirmed planets" not in lists:
                continue
            pls.append([txt(p, "name"), r4(fnum(txt(p, "mass"))), r4(fnum(txt(p, "radius"))), r4(fnum(txt(p, "period")), 6),
                        r4(fnum(txt(p, "semimajoraxis"))), r4(fnum(txt(p, "eccentricity")), 3), fnum(txt(p, "discoveryyear")),
                        txt(p, "discoverymethod"), r4(fnum(txt(p, "temperature")))])
        if not pls:
            continue
        snames = [n.text for n in st.findall("name") if n.text]
        h = -1
        for n in snames:
            if n.startswith("HIP ") and n[4:] in hip_idx: h = hip_idx[n[4:]]; break
            if n.startswith("HD ") and n[3:] in hd_idx: h = hd_idx[n[3:]]; break
            if n.startswith("GJ ") and ("Gl" + n[3:].replace(" ", "")) in gl_idx: h = gl_idx["Gl" + n[3:].replace(" ", "")]; break
        pos = radec_to_gal(sexa(ra, True), sexa(dec, False), d)
        systems.append({"n": snames[0] if snames else txt(sysel, "name"), "p": [r4(v, 6) for v in pos], "d": r4(d),
                        "s": [r4(fnum(txt(st, "mass"))), r4(fnum(txt(st, "radius"))), r4(fnum(txt(st, "temperature"))),
                              r4(fnum(txt(st, "metallicity")), 3), txt(st, "spectraltype"), r4(fnum(txt(st, "magV")), 3)],
                        "h": h, "pl": pls})
json.dump(systems, open(f"{OUT}/exoplanets.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("planet systems", len(systems), "planets", sum(len(s["pl"]) for s in systems), "matched to HYG", sum(1 for s in systems if s["h"] >= 0))

# ---------- 은하 (OpenNGC) ----------
H0, OM, C = 67.36, 0.3153, 299792.458
def comoving_mpc(z):
    n, s = 200, 0.0
    for i in range(n + 1):
        zz = z * i / n
        w = 0.5 if i in (0, n) else 1
        s += w / math.sqrt(OM * (1 + zz) ** 3 + 1 - OM)
    return C / H0 * s * z / n

# 적색편이보다 믿을 만한 거리(Mpc)를 아는 가까운 은하들 (세페이드·TRGB 등 문헌값을 반올림)
LIT = {"NGC0224": 0.78, "NGC0221": 0.78, "NGC0205": 0.82, "NGC0147": 0.68, "NGC0185": 0.62, "NGC0598": 0.81, "IC0010": 0.79,
       "IC1613": 0.76, "NGC6822": 0.46, "NGC0253": 3.5, "NGC0055": 2.1, "NGC0300": 2.0, "NGC0247": 3.6, "NGC7793": 3.9,
       "NGC3031": 3.6, "NGC3034": 3.5, "NGC2403": 3.2, "NGC4236": 4.4, "IC0342": 3.3, "NGC2976": 3.6, "NGC3077": 3.8,
       "NGC5128": 3.8, "NGC5236": 4.7, "NGC4945": 3.7, "NGC5102": 3.4, "NGC5253": 3.6, "NGC4736": 4.7, "NGC4826": 5.3,
       "NGC4244": 4.3, "NGC4449": 4.2, "NGC4214": 2.9, "NGC4395": 4.6, "NGC4258": 7.6, "NGC5457": 6.9, "NGC5194": 8.6,
       "NGC5195": 8.6, "NGC5055": 9.0, "NGC4594": 9.6, "NGC0628": 9.8, "NGC6946": 7.7, "NGC3627": 10.6, "NGC3623": 10.6,
       "NGC3628": 10.6, "NGC3368": 10.4, "NGC3351": 10.0, "NGC3379": 10.3, "NGC1313": 4.3, "NGC0891": 9.9, "NGC2903": 8.9,
       "NGC4631": 7.4, "NGC1068": 14.4, "NGC1399": 20.0, "NGC1316": 20.8, "NGC1365": 17.9, "NGC4486": 16.5}
VIRGO, FORNAX = (187.706, 12.391), (54.622, -35.450)

def sep_deg(a, b):
    ra1, d1, ra2, d2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    return math.degrees(math.acos(max(-1, min(1, math.sin(d1) * math.sin(d2) + math.cos(d1) * math.cos(d2) * math.cos(ra1 - ra2)))))

def hash01(s):
    h = 2166136261
    for ch in s:
        h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    return h / 4294967296

gals = []
for fn in ("NGC.csv", "addendum.csv"):
    with open(f"{SRC}/{fn}", encoding="utf-8") as f:
        for r in csv.DictReader(f, delimiter=";"):
            if r["Type"] not in ("G", "GPair", "GTrpl", "GGroup") or not r["RA"] or not r["Dec"]:
                continue
            ra, dec = sexa(r["RA"], True), sexa(r["Dec"], False)
            z = fnum(r["Redshift"])
            cz = fnum(r["RadVel"]) if fnum(r["RadVel"]) is not None else (z * C if z is not None else None)
            name, src = r["Name"], "z"
            if name in LIT:
                d, src = LIT[name], "lit"
            elif cz is None:
                continue
            elif sep_deg((ra, dec), VIRGO) < 8 and cz < 2800:
                d, src = 16.5 + (hash01(name) - 0.5) * 2.0, "virgo"
            elif sep_deg((ra, dec), FORNAX) < 4 and cz < 2500:
                d, src = 19.5 + (hash01(name) - 0.5) * 1.6, "fornax"
            elif cz < 400:
                continue
            else:
                d = comoving_mpc(cz / C)
            maj, mnr = fnum(r["MajAx"]), fnum(r["MinAx"])
            size_kpc = maj / 60 * math.pi / 180 * d * 1000 if maj else None
            pos = radec_to_gal(ra, dec, d)
            gals.append([name, r["Common names"].split(",")[0] if r["Common names"] else "", int(r["M"]) if r["M"] else 0,
                         r["Hubble"], [r4(v, 5) for v in pos], r4(d), r4(size_kpc, 3), r4(mnr / maj if maj and mnr else None, 2),
                         fnum(r["PosAng"]), r4(cz, 5), fnum(r["B-Mag"]) or fnum(r["V-Mag"]), src, r4(ra, 6), r4(dec, 6)])
json.dump(gals, open(f"{OUT}/galaxies.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("galaxies", len(gals), {k: sum(1 for g in gals if g[11] == k) for k in ("lit", "virgo", "fornax", "z")})
