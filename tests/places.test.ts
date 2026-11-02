import { describe, it, expect } from "vitest";
import { placeInfo } from "@/server/agent/places";

describe("offline Sri Lanka places", () => {
  it("finds a town from a hospital name, with district and distance", () => {
    const r = placeInfo("Kurunegala Teaching Hospital", "Kandy") as { found: boolean; place: { name: string; district: string }; distance: { approxRoadKm: number } };
    expect(r.found).toBe(true);
    expect(r.place.name).toBe("Kurunegala");
    expect(r.place.district).toBe("Kurunegala");
    expect(r.distance.approxRoadKm).toBeGreaterThan(30);
    expect(r.distance.approxRoadKm).toBeLessThan(80);
  });
  it("says so when a place is unknown", () => {
    expect(placeInfo("Atlantis").found).toBe(false);
  });
});
