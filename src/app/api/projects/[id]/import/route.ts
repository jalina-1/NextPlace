import { userRoute, assertSameOrigin } from "@/server/route";
import { errors } from "@/server/http";
import { getImportState, uploadSource, MAX_UPLOAD_BYTES } from "@/server/services/imports";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = userRoute(async ({ user, params }) => getImportState(params.id, user));
export const POST = userRoute(async ({ req, user, params }) => {
  assertSameOrigin(req);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 100_000) throw errors.bad("Files must be 15 MB or smaller.");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw errors.bad("Choose a file to upload.");
  return uploadSource(params.id, user, { name: file.name, type: file.type, bytes: Buffer.from(await file.arrayBuffer()) });
});
