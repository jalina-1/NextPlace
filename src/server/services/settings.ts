import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db";

/** Admin-configurable settings with safe defaults. Bank details are never invented. */
export const settingsSchema = z.object({
  priceLkr: z.number().int().min(0).max(1_000_000),
  accessMonths: z.number().int().min(1).max(36),
  bank: z.object({
    configured: z.boolean(),
    bankName: z.string().max(120),
    branch: z.string().max(120),
    accountName: z.string().max(120),
    accountNumber: z.string().max(60),
    instructions: z.string().max(2000),
  }),
  quotas: z.object({
    freeProjectsPerUser: z.number().int().min(0).max(100),
    maxOptionsPerProject: z.number().int().min(10).max(5000),
    previewAnalysisOptionLimit: z.number().int().min(3).max(5000),
    externalLookupsPerUserPerDay: z.number().int().min(0).max(100_000),
    aiMessagesPerUserPerDay: z.number().int().min(0).max(10_000),
    analysesPerProjectPerDay: z.number().int().min(1).max(1000),
  }),
  jobs: z.object({ concurrency: z.number().int().min(1).max(16), maxAttempts: z.number().int().min(1).max(10) }),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  priceLkr: 5000,
  accessMonths: 12,
  bank: { configured: false, bankName: "", branch: "", accountName: "", accountNumber: "", instructions: "" },
  quotas: {
    freeProjectsPerUser: 2,
    maxOptionsPerProject: 2000,
    previewAnalysisOptionLimit: 400,
    externalLookupsPerUserPerDay: 3000,
    aiMessagesPerUserPerDay: 60,
    analysesPerProjectPerDay: 10,
  },
  jobs: { concurrency: 4, maxAttempts: 3 },
};

export async function getSettings(): Promise<Settings> {
  const row = await db.select().from(schema.appSetting).where(eq(schema.appSetting.key, "global")).limit(1);
  if (!row.length) return structuredClone(DEFAULT_SETTINGS);
  const v = row[0].value as Partial<Settings>;
  const merged = {
    ...DEFAULT_SETTINGS,
    ...v,
    bank: { ...DEFAULT_SETTINGS.bank, ...(v.bank ?? {}) },
    quotas: { ...DEFAULT_SETTINGS.quotas, ...(v.quotas ?? {}) },
    jobs: { ...DEFAULT_SETTINGS.jobs, ...(v.jobs ?? {}) },
  };
  const p = settingsSchema.safeParse(merged);
  return p.success ? p.data : structuredClone(DEFAULT_SETTINGS);
}

export async function saveSettings(s: Settings, adminId: string) {
  const v = settingsSchema.parse(s);
  // Bank details count as configured only when the essentials are present.
  v.bank.configured = !!(v.bank.bankName && v.bank.accountName && v.bank.accountNumber);
  await db
    .insert(schema.appSetting)
    .values({ key: "global", value: v, updatedBy: adminId })
    .onConflictDoUpdate({ target: schema.appSetting.key, set: { value: v, updatedBy: adminId, updatedAt: new Date() } });
  return v;
}
