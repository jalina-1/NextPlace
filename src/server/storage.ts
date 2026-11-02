/**
 * Private file storage adapter.
 * - local:    files under LOCAL_STORAGE_DIR (outside /public; never served statically)
 * - supabase: a private Supabase Storage bucket accessed with the service-role key (server only)
 * Downloads always go through authorized API routes.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "./env-core";

export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(keys: string[]): Promise<void>;
  check(): Promise<{ ok: boolean; detail: string }>;
}

function safeKey(key: string) {
  if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes("..")) throw new Error("invalid storage key");
  return key;
}

class LocalStorage implements Storage {
  constructor(private dir: string) {}
  private p(key: string) {
    if (process.env.VERCEL) {
      // Serverless filesystems are ephemeral; never pretend files were stored privately and durably.
      throw new Error("Private storage is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) for this environment.");
    }
    return path.join(path.resolve(this.dir), safeKey(key));
  }
  async put(key: string, data: Buffer) {
    const p = this.p(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, data);
  }
  async get(key: string) {
    return fs.readFile(this.p(key));
  }
  async remove(keys: string[]) {
    await Promise.all(keys.map((k) => fs.rm(this.p(k), { force: true })));
  }
  async check() {
    this.p("healthcheck");
    await fs.mkdir(path.resolve(this.dir), { recursive: true });
    return { ok: true, detail: `local:${this.dir}` };
  }
}

class SupabaseStorage implements Storage {
  private bucketReady = false;
  constructor(private url: string, private key: string, private bucket: string) {}
  private async client() {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(this.url, this.key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  private async ensureBucket() {
    if (this.bucketReady) return;
    const c = await this.client();
    const { data } = await c.storage.getBucket(this.bucket);
    if (!data) {
      const { error } = await c.storage.createBucket(this.bucket, { public: false, fileSizeLimit: 20 * 1024 * 1024 });
      if (error && !/already exists/i.test(error.message)) throw new Error(`bucket create failed: ${error.message}`);
    } else if (data.public) {
      throw new Error(`Storage bucket "${this.bucket}" is public; it must be private.`);
    }
    this.bucketReady = true;
  }
  async put(key: string, data: Buffer, contentType: string) {
    await this.ensureBucket();
    const c = await this.client();
    const { error } = await c.storage.from(this.bucket).upload(safeKey(key), data, { contentType, upsert: false });
    if (error) throw new Error(`storage upload failed: ${error.message}`);
  }
  async get(key: string) {
    const c = await this.client();
    const { data, error } = await c.storage.from(this.bucket).download(safeKey(key));
    if (error || !data) throw new Error(`storage download failed`);
    return Buffer.from(await data.arrayBuffer());
  }
  async remove(keys: string[]) {
    if (keys.length === 0) return;
    const c = await this.client();
    await c.storage.from(this.bucket).remove(keys.map(safeKey));
  }
  async check() {
    await this.ensureBucket();
    const c = await this.client();
    const probe = `healthcheck/${Date.now()}.txt`;
    const up = await c.storage.from(this.bucket).upload(probe, Buffer.from("ok"), { contentType: "text/plain" });
    if (up.error) return { ok: false, detail: `upload failed: ${up.error.message}` };
    const down = await c.storage.from(this.bucket).download(probe);
    await c.storage.from(this.bucket).remove([probe]);
    return { ok: !down.error, detail: down.error ? `download failed: ${down.error.message}` : `supabase bucket ${this.bucket} (private)` };
  }
}

let instance: Storage | null = null;
export function storage(): Storage {
  if (!instance) {
    instance =
      env.storageDriver === "supabase"
        ? new SupabaseStorage(env.supabaseUrl!, env.supabaseServiceKey!, env.supabaseBucket)
        : new LocalStorage(env.localStorageDir);
  }
  return instance;
}
