import { env } from "../env-core";
import { demoClimate, demoFacilities, demoGeo, demoRoute } from "./demo";
import { googleFacilities, googleGeo, googleRoute, openMeteoClimate, osmGeo, overpassFacilities } from "./real";
import type { ClimateProvider, FacilitiesProvider, GeoProvider, RouteProvider } from "./types";

const noRoutes: RouteProvider = {
  name: "none",
  isDemo: false,
  attribution: "",
  cacheDays: 0,
  async route() {
    return { status: "unavailable", minutes: null, km: null, assumptions: "No routing provider is configured (OpenStreetMap mode has no routing). Straight-line distance is shown but not scored." };
  },
};

export function providers(): { geo: GeoProvider; route: RouteProvider; climate: ClimateProvider; facilities: FacilitiesProvider } {
  const p = env.providers;
  const hasGoogle = !!env.googleMapsKey;
  return {
    geo: p.maps === "google" && hasGoogle ? googleGeo : p.maps === "osm" ? osmGeo : demoGeo,
    route: p.maps === "google" && hasGoogle ? googleRoute : p.maps === "osm" ? noRoutes : demoRoute,
    climate: p.climate === "open-meteo" ? openMeteoClimate : demoClimate,
    facilities: p.facilities === "google" && hasGoogle ? googleFacilities : p.facilities === "overpass" ? overpassFacilities : demoFacilities,
  };
}
