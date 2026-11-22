// Reading and writing .xlsx workbooks: each tab as rows of text, no formatting.
// A workbook is a zip of XML files; only the workbook, its tabs and the shared strings are read.
// Formulas are read as their last saved value. Written cells are text, except plain whole numbers,
// so "+1", "0-1" and "4+" stay exactly as typed.

import { readZip, writeZip } from "./zip";

export type WorkbookTab = { name: string; rows: string[][] };

// --- Reading ------------------------------------------------------------------------------------

export async function readXlsx(bytes: Uint8Array): Promise<WorkbookTab[]> {
  const zip = await readZip(bytes);
  const text = (name: string) => (zip[name] ? new TextDecoder().decode(zip[name]) : null);
  const workbook = text("xl/workbook.xml");
  if (!workbook) throw new Error("not a workbook (no xl/workbook.xml)");
  const targets = new Map<string, string>();
  for (const m of (text("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) targets.set(id, target.replace(/^\/?xl\//, "").replace(/^\//, ""));
  }
  const shared = sharedStrings(text("xl/sharedStrings.xml") ?? "");
  const tabs: WorkbookTab[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const target = targets.get(attr(m[0], "r:id") ?? "");
    const xml = target ? text("xl/" + target) : null;
    if (xml) tabs.push({ name: attr(m[0], "name") ?? "Sheet", rows: sheetRows(xml, shared) });
  }
  return tabs;
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp("\\s" + name + '="([^"]*)"').exec(tag);
  return m ? decodeXml(m[1]) : null;
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

// The text of every <t> in a fragment (rich text has several runs).
function texts(fragment: string): string {
  let out = "";
  for (const m of fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += decodeXml(m[1]);
  return out;
}

function sharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
}

// "C12" -> column 2 (counting from 0).
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of /^[A-Z]+/.exec(ref)?.[0] ?? "A") n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function sheetRows(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(attr(rm[0], "r") ?? rows.length + 1);
    const row: string[] = [];
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = "<c " + cm[1] + ">";
      const type = attr(tag, "t");
      const body = cm[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = "";
      if (type === "s" && v !== undefined) value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = texts(body);
      else if (type === "b" && v !== undefined) value = v === "1" ? "TRUE" : "FALSE";
      else if (v !== undefined) value = cleanNumber(decodeXml(v));
      row[columnIndex(attr(tag, "r") ?? "")] = value;
    }
    for (let i = 0; i < row.length; i++) row[i] ??= "";
    while (rows.length < rowNumber - 1) rows.push([]);
    rows.push(row);
  }
  return rows;
}

// A spreadsheet may store 4 as "4.0000000000000009": keep what a person typed.
function cleanNumber(v: string): string {
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n * 1e9) / 1e9) : v;
}

// --- Writing ------------------------------------------------------------------------------------

export function writeXlsx(tabs: WorkbookTab[]): Uint8Array {
  const enc = (s: string) => new TextEncoder().encode(s);
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": enc(contentTypes(tabs.length)),
    "_rels/.rels": enc(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": enc(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
        tabs.map((t, i) => `<sheet name="${escapeXml(sheetName(t.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
        `</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": enc(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        tabs.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rId${tabs.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/styles.xml": enc(STYLES),
  };
  tabs.forEach((t, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = enc(sheetXml(t.rows))));
  return writeZip(files);
}

function contentTypes(count: number): string {
  let sheets = "";
  for (let i = 1; i <= count; i++)
    sheets += `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    sheets +
    `</Types>`
  );
}

const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
  `</styleSheet>`;

// The first row is bold (the column headings) and stays in view when scrolling.
function sheetXml(rows: string[][]): string {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          if (value === "") return "";
          const ref = columnName(c) + (r + 1);
          const style = r === 0 ? ' s="1"' : "";
          if (/^(0|[1-9]\d{0,14})$/.test(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;
          return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetData>${body}</sheetData></worksheet>`
  );
}

function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

// Tab names: at most 31 characters, none of : \ / ? * [ ]
function sheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, " ").slice(0, 31);
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
