/**
 * Real provider adapters. These need credentials or have usage policies; they are
 * selected via environment variables (see .env.example). They were implemented
 * against public API documentation and have NOT been exercised live in automated tests.
 *
 * - Google Places (New) Text Search / Nearby Search, Routes API computeRoutes.
 * - OpenStreetMap Nominatim (geocoding) and Overpass (facility counts) — respect their usage policies.
 * - Open-Meteo historical archive (climate normals computed from daily data).
 */
import { normalizeText } from "@/lib/scoring";
import { env } from "../env-core";
import type { ClimateProvider, FacilitiesProvider, GeoProvider, GeoResult, RouteProvider } from "./types";
import { ProviderError } from "./types";
import { findDistrict } from "./demo";

async function fetchJson(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 20_000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (res.status === 429 || res.status >= 500) throw new ProviderError(`provider HTTP ${res.status}`, true);
    if (!res.ok) throw new ProviderError(`provider HTTP ${res.status}`, false);
    return (await res.json()) as unknown;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(e instanceof Error ? e.message : "network error", true);
  } finally {
    clearTimeout(timer);
  }
}

function classify(name: string, district: string | null, cands: GeoResult["candidates"]): GeoResult {
  if (cands.length === 0) return { status: "not_found", candidates: [] };
  const top = cands[0];
  const nameOk = normalizeText(top.label).includes(normalizeText(name).split(" ").slice(0, 3).join(" "));
  const districtOk = !district || normalizeText(top.label).includes(normalizeText(district));
  if (cands.length === 1 && districtOk) return { status: "resolved", candidates: cands };
  if (nameOk && districtOk && top.confidence >= 0.8) return { status: "resolved", candidates: cands };
  return { status: "ambiguous", candidates: cands.slice(0, 5) };
}

/* --------------------------------- Google -------------------------------- */

export const googleGeo: GeoProvider = {
  name: "google-places",
  isDemo: false,
  attribution: "Location data © Google Maps",
  cacheDays: 30, // coordinates must not be cached beyond 30 days under Google Maps Platform terms
  async geocode(name, district) {
    const q = [name, district ? `${district} District` : null, "Sri Lanka"].filter(Boolean).join(", ");
    const data = (await fetchJson("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": env.googleMapsKey ?? "",
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.googleMapsUri",
      },
      body: JSON.stringify({ textQuery: q, regionCode: "LK", languageCode: "en", maxResultCount: 5 }),
    })) as { places?: { id: string; displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number }; types?: string[]; googleMapsUri?: string }[] };
    const cands = (data.places ?? [])
      .filter((p) => p.location)
      .map((p, i) => ({
        label: `${p.displayName?.text ?? name} — ${p.formattedAddress ?? ""}`,
        lat: p.location!.latitude,
        lng: p.location!.longitude,
        placeRef: `google:${p.id}`,
        sourceUrl: p.googleMapsUri,
        confidence: (p.types ?? []).includes("hospital") ? 0.9 - i * 0.1 : 0.6 - i * 0.1,
      }));
    return classify(name, district, cands);
  },
};

export const googleRoute: RouteProvider = {
  name: "google-routes",
  isDemo: false,
  attribution: "Routes © Google Maps",
  cacheDays: 30,
  async route(from, to, mode) {
    const data = (await fetchJson("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": env.googleMapsKey ?? "",
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
        destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
        travelMode: mode === "drive" ? "DRIVE" : "TRANSIT",
        ...(mode === "drive" ? { routingPreference: "TRAFFIC_UNAWARE" } : {}),
      }),
    })) as { routes?: { duration?: string; distanceMeters?: number }[] };
    const r = data.routes?.[0];
    if (!r?.duration) return { status: "unavailable", minutes: null, km: null, assumptions: mode === "transit" ? "No transit route returned for this pair." : "No driving route returned." };
    return {
      status: "ok",
      minutes: Math.round(parseInt(r.duration, 10) / 60),
      km: r.distanceMeters != null ? Math.round(r.distanceMeters / 100) / 10 : null,
      assumptions: mode === "drive" ? "Google estimate, typical conditions without live traffic." : "Google transit estimate for a departure now; coverage in Sri Lanka may be limited.",
    };
  },
};

const GOOGLE_TYPES: Record<string, string[]> = {
  schools: ["primary_school", "secondary_school", "school"],
  shops: ["supermarket", "grocery_store", "market"],
  pharmacies: ["pharmacy"],
  banks: ["bank"],
};

export const googleFacilities: FacilitiesProvider = {
  name: "google-places",
  isDemo: false,
  attribution: "Places data © Google Maps",
  cacheDays: 30,
  async facilities(lat, lng, radiusKm) {
    const counts: Record<string, number | null> = {};
    const capped: Record<string, boolean> = {};
    for (const [cat, types] of Object.entries(GOOGLE_TYPES)) {
      const data = (await fetchJson("https://places.googleapis.com/v1/places:searchNearby", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": env.googleMapsKey ?? "", "X-Goog-FieldMask": "places.id" },
        body: JSON.stringify({
          includedTypes: types,
          maxResultCount: 20,
          locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(radiusKm * 1000, 50000) } },
        }),
      })) as { places?: unknown[] };
      counts[cat] = data.places?.length ?? 0;
      capped[cat] = (data.places?.length ?? 0) >= 20;
    }
    return { status: "ok", counts, capped };
  },
};

/* ------------------------------ OpenStreetMap ----------------------------- */

function osmHeaders() {
  return { "User-Agent": `NextPlace/0.1 (${env.osmContactEmail ?? "contact-not-configured"})`, Accept: "application/json" };
}

export const osmGeo: GeoProvider = {
  name: "osm-nominatim",
  isDemo: false,
  attribution: "© OpenStreetMap contributors (ODbL)",
  cacheDays: 90,
  async geocode(name, district) {
    const q = [name, district, "Sri Lanka"].filter(Boolean).join(", ");
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=lk&limit=5&q=${encodeURIComponent(q)}`;
    const data = (await fetchJson(url, { headers: osmHeaders() })) as { display_name: string; lat: string; lon: string; osm_type: string; osm_id: number; importance?: number }[];
    const cands = data.map((d) => ({
      label: d.display_name,
      lat: Number(d.lat),
      lng: Number(d.lon),
      placeRef: `osm:${d.osm_type}/${d.osm_id}`,
      sourceUrl: `https://www.openstreetmap.org/${d.osm_type}/${d.osm_id}`,
      confidence: Math.min(0.95, d.importance ?? 0.5),
    }));
    const res = classify(name, district ?? findDistrict(name), cands);
    return res;
  },
};

const OSM_TAGS: Record<string, string> = {
  schools: '["amenity"="school"]',
  shops: '["shop"~"supermarket|convenience|general"]',
  pharmacies: '["amenity"="pharmacy"]',
  banks: '["amenity"="bank"]',
};

export const overpassFacilities: FacilitiesProvider = {
  name: "osm-overpass",
  isDemo: false,
  attribution: "© OpenStreetMap contributors (ODbL). OSM coverage varies by area.",
  cacheDays: 90,
  async facilities(lat, lng, radiusKm) {
    const r = Math.round(radiusKm * 1000);
    const parts = Object.entries(OSM_TAGS)
      .map(([k, tag]) => `(node${tag}(around:${r},${lat},${lng});way${tag}(around:${r},${lat},${lng}););out count; // ${k}`)
      .join("\n");
    const query = `[out:json][timeout:25];\n${parts}`;
    const data = (await fetchJson("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { ...osmHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      timeoutMs: 30_000,
    })) as { elements?: { tags?: { total?: string } }[] };
    const keys = Object.keys(OSM_TAGS);
    const counts: Record<string, number | null> = {};
    keys.forEach((k, i) => (counts[k] = data.elements?.[i]?.tags?.total != null ? Number(data.elements[i].tags!.total) : null));
    return { status: "ok", counts };
  },
};

/* -------------------------------- Open-Meteo ------------------------------ */

export const openMeteoClimate: ClimateProvider = {
  name: "open-meteo",
  isDemo: false,
  attribution: "Weather data by Open-Meteo.com (CC BY 4.0)",
  cacheDays: 365,
  async climate(lat, lng) {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&start_date=2015-01-01&end_date=2024-12-31&daily=temperature_2m_mean,precipitation_sum&timezone=Asia%2FColombo`;
    const data = (await fetchJson(url, { timeoutMs: 30_000 })) as { daily?: { temperature_2m_mean?: (number | null)[]; precipitation_sum?: (number | null)[] } };
    const t = (data.daily?.temperature_2m_mean ?? []).filter((x): x is number => x != null);
    const p = (data.daily?.precipitation_sum ?? []).filter((x): x is number => x != null);
    if (t.length < 300) return { status: "unavailable", meanTempC: null, annualRainMm: null, period: "insufficient data" };
    const years = p.length / 365.25;
    return {
      status: "ok",
      meanTempC: Math.round((t.reduce((a, b) => a + b, 0) / t.length) * 10) / 10,
      annualRainMm: years > 0.9 ? Math.round(p.reduce((a, b) => a + b, 0) / years) : null,
      period: "2015–2024 daily reanalysis (ERA5-based), averaged",
      sourceUrl: "https://open-meteo.com/en/docs/historical-weather-api",
    };
  },
};
