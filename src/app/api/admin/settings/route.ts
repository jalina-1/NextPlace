import { adminRoute, readJson, assertSameOrigin } from "@/server/route";
import { getSettings, saveSettings, settingsSchema } from "@/server/services/settings";
import { audit } from "@/server/services/audit";

export const dynamic = "force-dynamic";
export const GET = adminRoute(async () => ({ settings: await getSettings() }));
export const PUT = adminRoute(async ({ req, user }) => {
  assertSameOrigin(req);
  const s = await saveSettings(settingsSchema.parse(await readJson(req)), user.id);
  await audit(user.id, "settings.update", "settings", "global", { priceLkr: s.priceLkr, accessMonths: s.accessMonths, bankConfigured: s.bank.configured });
  return { settings: s };
});
