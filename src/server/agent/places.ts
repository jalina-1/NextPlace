/** Offline Sri Lanka places (GeoNames, CC BY 4.0) for the assistant: districts, provinces,
 *  coordinates, population where known, and rough distances between places. */
import data from "@/data/lk-places.json";
import { haversineKm } from "../providers/demo";

type Row = [string, string, string, number, number, number];
const rows = (data as unknown as { rows: Row[] }).rows;
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
const STRIP = /\b(base|district|general|teaching|divisional|hospital|dh|bh|gh|th|pmcu|mch|moh|office|town|city)\b/g;

export function findPlaces(query: string, limit = 5) {
  const q = norm(query).replace(STRIP, " ").replace(/\s+/g, " ").trim();
  if (!q) return [];
  const exact = rows.filter((r) => norm(r[0]) === q);
  const starts = exact.length ? [] : rows.filter((r) => norm(r[0]).startsWith(q));
  const words = exact.length || starts.length ? [] : rows.filter((r) => q.split(" ").some((w) => w.length > 3 && norm(r[0]) === w));
  return [...exact, ...starts, ...words].slice(0, limit);
}

/** Some big towns have no district in the source; borrow it from the closest place that has one. */
function districtOf(r: Row): string {
  if (r[1]) return r[1];
  let best = "";
  let bestKm = 20;
  for (const o of rows) {
    if (!o[1] || o[2] !== r[2]) continue;
    const km = haversineKm({ lat: r[3], lng: r[4] }, { lat: o[3], lng: o[4] });
    if (km < bestKm) [best, bestKm] = [o[1], km];
  }
  return best || "unknown";
}

const view = (r: Row) => ({ name: r[0], district: districtOf(r), province: r[2], lat: r[3], lon: r[4], population: r[5] || "unknown" });

export function placeInfo(name: string, from?: string) {
  const hits = findPlaces(name);
  if (!hits.length) return { found: false, note: `No place called "${name}" in the Sri Lanka places list.` };
  const p = hits[0];
  const near = rows
    .filter((r) => r[5] > 0 && r !== p)
    .map((r) => ({ r, km: haversineKm({ lat: p[3], lng: p[4] }, { lat: r[3], lng: r[4] }) }))
    .filter((x) => x.km < 40)
    .sort((a, b) => a.km - b.km)
    .slice(0, 5)
    .map((x) => ({ name: x.r[0], population: x.r[5], km: Math.round(x.km) }));
  let distance = null;
  const f = from ? findPlaces(from)[0] : undefined;
  if (f) {
    const straight = haversineKm({ lat: f[3], lng: f[4] }, { lat: p[3], lng: p[4] });
    const road = straight * 1.25;
    distance = {
      from: f[0],
      straightLineKm: Math.round(straight),
      approxRoadKm: Math.round(road),
      approxBusHours: Math.round((road / 38) * 10) / 10,
      note: "Estimates from map distance, not a timetable.",
    };
  }
  return {
    found: true,
    place: view(p),
    otherMatches: hits.slice(1).map(view),
    nearbyLargerTowns: near,
    distance,
    source: "GeoNames (geonames.org), CC BY 4.0",
  };
}
