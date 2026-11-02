import type { LocationCandidate } from "../db/schema";

export type GeoResult = {
  status: "resolved" | "ambiguous" | "not_found";
  candidates: LocationCandidate[];
  sourceUrl?: string;
};

export type RouteResult = {
  status: "ok" | "unavailable";
  minutes: number | null;
  km: number | null;
  assumptions: string;
  sourceUrl?: string;
};

export type ClimateResult = {
  status: "ok" | "unavailable";
  meanTempC: number | null;
  annualRainMm: number | null;
  period: string;
  sourceUrl?: string;
};

export type FacilityResult = {
  status: "ok" | "unavailable";
  counts: Record<string, number | null>;
  capped?: Record<string, boolean>;
  sourceUrl?: string;
};

export interface Provider {
  name: string;
  isDemo: boolean;
  /** Attribution text that must accompany displayed data. */
  attribution: string;
  /** Days results may be cached (respecting the provider's terms). */
  cacheDays: number;
}

export interface GeoProvider extends Provider {
  geocode(name: string, district: string | null): Promise<GeoResult>;
}
export interface RouteProvider extends Provider {
  route(from: { lat: number; lng: number }, to: { lat: number; lng: number }, mode: "drive" | "transit"): Promise<RouteResult>;
}
export interface ClimateProvider extends Provider {
  climate(lat: number, lng: number): Promise<ClimateResult>;
}
export interface FacilitiesProvider extends Provider {
  facilities(lat: number, lng: number, radiusKm: number): Promise<FacilityResult>;
}

export class ProviderError extends Error {
  constructor(message: string, public retryable: boolean) {
    super(message);
  }
}
