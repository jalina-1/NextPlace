"""Build src/data/lk-places.json from the GeoNames Sri Lanka dump (CC BY 4.0).

Usage: download https://download.geonames.org/export/dump/LK.zip, unzip, then
  python3 scripts/build-lk-places.py LK.txt
Output rows: [name, district, province, lat, lon, population or 0]
"""
import csv, json, sys

rows = list(csv.reader(open(sys.argv[1], encoding="utf-8"), delimiter="\t", quoting=csv.QUOTE_NONE))
adm1 = {r[10]: r[1].replace("Province of ", "").replace(" Province", "") for r in rows if r[7] == "ADM1"}
adm2 = {(r[10], r[11]): r[1].replace(" District", "") for r in rows if r[7] == "ADM2"}
out, seen = [], set()
for r in rows:
    if r[6] != "P" or r[7] in ("PPLQ", "PPLH"):
        continue
    name = r[2] or r[1]
    key = (name.lower(), r[10], r[11])
    if key in seen:
        continue
    seen.add(key)
    out.append([name, adm2.get((r[10], r[11]), ""), adm1.get(r[10], ""), round(float(r[4]), 4), round(float(r[5]), 4), int(r[14] or 0)])
out.sort(key=lambda x: (-x[5], x[0]))
json.dump({"source": "GeoNames (geonames.org), CC BY 4.0", "rows": out}, open("src/data/lk-places.json", "w"), separators=(",", ":"), ensure_ascii=False)
print(len(out), "places")
