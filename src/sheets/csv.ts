// Reading and writing CSV files: one sheet tab each.
// Plain RFC 4180: commas, double quotes around a cell that holds a comma, quote or line break,
// and "" for a quote inside one. Written with Windows line ends (what spreadsheets expect).

export type Row = Record<string, string>; // column heading -> cell, as typed

export type Sheet = { columns: string[]; rows: Row[] };

export function readCsv(text: string): Sheet {
  const records = parseRecords(text.replace(/^﻿/, ""));
  const columns = (records.shift() ?? []).map((c) => c.trim());
  const rows = records
    .filter((r) => r.some((cell) => cell.trim() !== ""))
    .map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? ""])));
  return { columns, rows };
}

function parseRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      record.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(cell);
      records.push(record);
      record = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || record.length > 0) {
    record.push(cell);
    records.push(record);
  }
  return records;
}

export function writeCsv(sheet: Sheet): string {
  const lines = [sheet.columns, ...sheet.rows.map((row) => sheet.columns.map((c) => row[c] ?? ""))];
  return lines.map((cells) => cells.map(quote).join(",")).join("\r\n") + "\r\n";
}

function quote(cell: string): string {
  return /[",\r\n]/.test(cell) ? '"' + cell.replace(/"/g, '""') + '"' : cell;
}
