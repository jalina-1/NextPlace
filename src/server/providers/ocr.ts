/**
 * OCR adapters for scanned PDFs. Disabled unless configured. OCR output is low-confidence
 * and always goes through manual review. Not exercised live in automated tests.
 */
import { env } from "../env-core";

export function ocrAvailable() {
  const p = env.providers.ocr;
  return (p === "google-vision" && !!env.googleVisionKey) || (p === "ocr-space" && !!env.ocrSpaceKey);
}

export async function ocrPdf(buf: Buffer): Promise<string[] | null> {
  const p = env.providers.ocr;
  if (p === "google-vision" && env.googleVisionKey) {
    // files:annotate handles up to 5 pages per synchronous request.
    const res = await fetch(`https://vision.googleapis.com/v1/files:annotate?key=${env.googleVisionKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{ inputConfig: { content: buf.toString("base64"), mimeType: "application/pdf" }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }], pages: [1, 2, 3, 4, 5] }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { responses?: { responses?: { fullTextAnnotation?: { text?: string } }[] }[] };
    const text = (data.responses?.[0]?.responses ?? []).map((r) => r.fullTextAnnotation?.text ?? "").join("\n");
    return text.split(/\r?\n/).filter((l) => l.trim());
  }
  if (p === "ocr-space" && env.ocrSpaceKey) {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buf)], { type: "application/pdf" }), "upload.pdf");
    form.append("isTable", "true");
    form.append("OCREngine", "2");
    const res = await fetch("https://api.ocr.space/parse/image", { method: "POST", headers: { apikey: env.ocrSpaceKey }, body: form });
    if (!res.ok) return null;
    const data = (await res.json()) as { ParsedResults?: { ParsedText?: string }[] };
    const text = (data.ParsedResults ?? []).map((r) => r.ParsedText ?? "").join("\n");
    return text.split(/\r?\n/).filter((l) => l.trim());
  }
  return null;
}
