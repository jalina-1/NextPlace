import { describe, it, expect } from "vitest";
import { errorResponse } from "@/server/http";

describe("storage not configured on a serverless host", () => {
  it("returns a clear 503 message instead of a generic error", async () => {
    process.env.VERCEL = "1";
    try {
      const { storage } = await import("@/server/storage");
      let caught: unknown;
      try {
        await storage().put("projects/x/source/y.csv", Buffer.from("a"), "text/csv");
      } catch (e) {
        caught = e;
      }
      const res = errorResponse(caught);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toBe("storage_not_configured");
      expect(body.message).toMatch(/File uploads aren’t switched on/);
    } finally {
      delete process.env.VERCEL;
    }
  });
});
