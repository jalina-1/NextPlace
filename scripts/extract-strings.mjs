import ts from "typescript";
import fs from "node:fs";
const path = "src/main.tsx";
const source = fs.readFileSync(path, "utf8");
const ast = ts.createSourceFile(
  path,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const edits = [];
const catalog = {};
const ids = new Map();
function key(value) {
  if (!ids.has(value)) {
    const name = "ui" + String(ids.size + 1).padStart(3, "0");
    ids.set(value, name);
    catalog[name] = value;
  }
  return ids.get(value);
}
function visit(n) {
  if (ts.isJsxText(n) && n.text.trim()) {
    const text = n.text.replace(/\s+/g, " ");
    edits.push([n.pos, n.end, `{t.${key(text)}}`]);
  } else if (
    ts.isJsxAttribute(n) &&
    ["placeholder", "title", "text", "eyebrow", "aria-label"].includes(
      n.name.getText(ast),
    ) &&
    n.initializer &&
    ts.isStringLiteral(n.initializer)
  ) {
    edits.push([
      n.initializer.getStart(ast),
      n.initializer.end,
      `{t.${key(n.initializer.text)}}`,
    ]);
  }
  ts.forEachChild(n, visit);
}
visit(ast);
let output = source;
for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0]))
  output = output.slice(0, start) + text + output.slice(end);
fs.writeFileSync(path, output);
fs.writeFileSync(
  "src/messages.en.ts",
  "// Translation keys extracted from the English UI. Preserve interpolation boundaries.\nexport const messages = " +
    JSON.stringify(catalog, null, 2) +
    " as const;\n",
);
const i18n = fs.readFileSync("src/i18n.ts", "utf8");
fs.writeFileSync(
  "src/i18n.ts",
  "import {messages} from './messages.en';\n" +
    i18n.replace("export const en={", "export const en={...messages,"),
);
console.log(`Extracted ${ids.size} interface strings.`);
