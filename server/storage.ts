import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./db.ts";
const bucket =
  process.env.SUPABASE_STORAGE_BUCKET || "transfer-compass-private";
function config() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw Error("Supabase storage is not configured");
  return {
    url: process.env.SUPABASE_URL.replace(/\/$/, ""),
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}
export async function putPrivate(id: string, buffer: Buffer, mime: string) {
  if (process.env.VERCEL && !process.env.SUPABASE_URL)
    throw Error("Vercel requires configured private Supabase storage.");
  if (process.env.SUPABASE_URL) {
    const { url, key } = config();
    const metadata = await fetch(
      `${url}/storage/v1/bucket/${encodeURIComponent(bucket)}`,
      {
        headers: { Authorization: `Bearer ${key}`, apikey: key },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!metadata.ok || (await metadata.json()).public !== false)
      throw Error("Storage bucket must exist and be private.");
    const r = await fetch(
      `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${id}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          apikey: key,
          "Content-Type": mime,
          "x-upsert": "false",
        },
        body: buffer as any,
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!r.ok) throw Error("Private storage upload failed");
    return "supabase:" + id;
  }
  const dir = path.join(dataDir, "private");
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const dest = path.join(dir, id);
  await fs.writeFile(dest, buffer, { mode: 0o600 });
  return dest;
}
export async function getPrivate(stored: string) {
  if (stored.startsWith("supabase:")) {
    const { url, key } = config();
    const r = await fetch(
      `${url}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${stored.slice(9)}`,
      {
        headers: { Authorization: `Bearer ${key}`, apikey: key },
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!r.ok) throw Error("Private storage download failed");
    return Buffer.from(await r.arrayBuffer());
  }
  return fs.readFile(stored);
}
export async function deletePrivate(stored: string) {
  if (stored.startsWith("supabase:")) {
    const { url, key } = config();
    const r = await fetch(
      `${url}/storage/v1/object/${encodeURIComponent(bucket)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${key}`,
          apikey: key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefixes: [stored.slice(9)] }),
      },
    );
    if (!r.ok) throw Error("Private storage deletion failed");
    return;
  }
  await fs.unlink(stored);
}
