import { readWorkbook } from "./workbook.js";
import yauzl from "yauzl";
async function checkArchive(buffer: Buffer) {
  await new Promise<void>((resolve, reject) =>
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(Error("Invalid XLSX archive"));
      let bytes = 0,
        count = 0;
      zip.on("entry", (entry) => {
        bytes += entry.uncompressedSize;
        count++;
        if (
          bytes > 50 * 1024 * 1024 ||
          count > 2000 ||
          /vbaProject\.bin$/i.test(entry.fileName)
        ) {
          zip.close();
          reject(
            Error("Workbook exceeds processing limits or contains macros."),
          );
          return;
        }
        zip.readEntry();
      });
      zip.on("error", reject);
      zip.on("end", resolve);
      zip.readEntry();
    }),
  );
}
import { randomUUID } from "node:crypto";
export function pdfTables(text: string) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const rows: string[][] = [];
  let header = "";
  for (const line of lines) {
    if (/institution/i.test(line) && /designation|post/i.test(line)) {
      if (!header) {
        header = line;
        rows.push(line.split(/\s{2,}|\t|\|/));
      }
      continue;
    }
    const cells = line.split(/\s{2,}|\t|\|/);
    if (cells.length === 1 && rows.length > 1)
      rows[rows.length - 1][rows[rows.length - 1].length - 1] += " " + line;
    else rows.push(cells);
  }
  return rows;
}
export function suggest(headers: string[]) {
  const aliases: any = {
    index: /^(index|id|no\.?|serial|number)$/i,
    district: /district|region/i,
    institution: /institution|hospital|facility|station/i,
    post: /designation|post|specialty|position|unit/i,
    vacancies: /vacanc|count/i,
  };
  return Object.fromEntries(
    Object.entries(aliases).map(([key, re]: any) => [
      key,
      headers.find((h) => re.test(h)) || "",
    ]),
  );
}
export async function extract(buffer: Buffer, name: string) {
  if (/\.pdf$/i.test(name)) {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
    }).promise;
    if (doc.numPages > 100) throw Error("PDF limit: 100 pages.");
    let text = "";
    for (let page = 1; page <= doc.numPages; page++) {
      const c = await (await doc.getPage(page)).getTextContent();
      let y: number | undefined;
      for (const item of c.items as any[]) {
        if (!("str" in item)) continue;
        const yy = item.transform[5];
        text +=
          (y !== undefined && Math.abs(y - yy) > 3 ? "\n" : "  ") + item.str;
        y = yy;
      }
      text += "\n";
    }
    if (text.trim().length < 20) {
      if (process.env.OCR_SPACE_KEY) {
        const form = new FormData();
        form.set(
          "file",
          new Blob([new Uint8Array(buffer)], { type: "application/pdf" }),
          "scan.pdf",
        );
        form.set("language", "eng");
        const result = await fetch("https://api.ocr.space/parse/image", {
          method: "POST",
          headers: { apikey: process.env.OCR_SPACE_KEY },
          body: form,
          signal: AbortSignal.timeout(60000),
        });
        const body = await result.json();
        if (!result.ok || body.IsErroredOnProcessing)
          throw Error("OCR provider could not extract the document");
        text = (body.ParsedResults || [])
          .map((p: any) => p.ParsedText)
          .join("\n");
      } else {
        if (!process.env.OCR_ENDPOINT)
          throw Error(
            "Scanned PDF: OCR is unavailable. Upload CSV/XLSX or a text-based PDF.",
          );
        const r = await fetch(process.env.OCR_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OCR_KEY || ""}`,
            "Content-Type": "application/pdf",
          },
          body: buffer as any,
        });
        if (!r.ok) throw Error("OCR service failed");
        text = await r.text();
      }
    }
    const rows = pdfTables(text);
    return [
      {
        name: "PDF extraction",
        rows,
        warnings: [
          "PDF extraction may contain wrapped or ambiguous rows. Verify every mapping and value before confirming.",
        ],
        confidence: "review-required",
      },
    ];
  }
  if (/\.xlsx$/i.test(name)) await checkArchive(buffer);
  const sheets = await readWorkbook(buffer, name);
  return sheets.map((sheet) => {
    const rows = sheet.rows;
    if (rows.length > 2000) throw Error("Import limit: 2,000 rows per sheet.");
    const header = rows.findIndex(
      (r) => Object.values(suggest(r.map(String))).filter(Boolean).length >= 2,
    );
    return {
      name: sheet.name,
      rows: rows.slice(Math.max(0, header)),
      confidence: "review-required",
      warnings: sheet.warnings,
    };
  });
}
export function mappedRows(table: any, mapping: any, edits?: any[]) {
  const headers = table.rows[0].map(String);
  if (new Set(headers).size !== headers.length)
    throw Error(
      "Duplicate column names: rename the columns in your source file before importing.",
    );
  if (!mapping.institution)
    throw Error(
      "Map the institution column. For posts, map a column or explicitly enter values in the review table.",
    );
  const seen = new Set();
  return table.rows
    .slice(1)
    .filter((r: any[]) => r.some((v) => v !== ""))
    .map((row: any[], i: number) => {
      const original = Object.fromEntries(
        headers.map((h: string, j: number) => [h, row[j] ?? ""]),
      );
      const edit = edits?.[i] || {};
      const get = (k: string) =>
        String(edit[k] ?? original[mapping[k]] ?? "").trim();
      const institution = get("institution"),
        post = get("post"),
        district = get("district");
      const key = JSON.stringify([institution, post, district]);
      const duplicate = seen.has(key);
      seen.add(key);
      return {
        id: randomUUID(),
        original,
        sourceRow: i + 2,
        index: get("index"),
        institution,
        post,
        district,
        vacancies: get("vacancies"),
        duplicate,
        invalid: !institution || !post,
        provenance: { table: table.name, row: i + 2 },
        evidence: {},
      };
    });
}
