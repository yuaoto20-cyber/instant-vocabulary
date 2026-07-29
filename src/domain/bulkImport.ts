import { Card, CardDraft } from "@/domain/library";

export type BulkField = keyof CardDraft;
export type BulkRow = CardDraft;
export type DuplicateStrategy = "skip" | "allow" | "overwrite";
export type ImportIssue = { row: number; field: "english" | "japanese"; message: string; severity: "error" | "warning" };
export type ImportPlan = {
  rows: Array<{ row: number; draft: CardDraft; existingCardId?: string }>;
  creates: CardDraft[];
  updates: Array<{ id: string; draft: CardDraft }>;
  skipped: number;
  duplicates: number;
  errors: ImportIssue[];
  warnings: ImportIssue[];
};

export const emptyBulkRow = (): BulkRow => ({ english: "", japanese: "", partOfSpeech: "", note: "" });
export const initialBulkRows = (count = 10) => Array.from({ length: count }, emptyBulkRow);
export const normalizeEnglish = (value: string) => value.trim().toLocaleLowerCase();

export function parseClipboardTable(text: string) {
  return text.replace(/\r\n?/g, "\n").split("\n").filter((line, index, all) => !(index === all.length - 1 && line === "")).map((line) => line.split("\t"));
}

export function applyClipboard(rows: BulkRow[], startRow: number, startField: BulkField, text: string, showOptional: boolean) {
  const fields: BulkField[] = showOptional ? ["english", "japanese", "partOfSpeech", "note"] : ["english", "japanese"];
  const startColumn = fields.indexOf(startField);
  const table = parseClipboardTable(text);
  const next = rows.map((row) => ({ ...row }));
  while (next.length < startRow + table.length + 1) next.push(emptyBulkRow());
  let ignoredColumns = 0;
  table.forEach((sourceRow, rowOffset) => sourceRow.forEach((value, columnOffset) => {
    const field = fields[startColumn + columnOffset];
    if (field) next[startRow + rowOffset][field] = value;
    else ignoredColumns += 1;
  }));
  return { rows: ensureTrailingRow(next), ignoredColumns };
}

export function ensureTrailingRow(rows: BulkRow[]) {
  return rows.length && Object.values(rows[rows.length - 1]).some(Boolean) ? [...rows, emptyBulkRow()] : rows;
}

export function analyzeImport(rows: BulkRow[], existingCards: Card[], strategy: DuplicateStrategy): ImportPlan {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const existing = new Map<string, Card>();
  existingCards.forEach((card) => existing.set(normalizeEnglish(card.english), card));
  const seen = new Set<string>();
  const planRows: ImportPlan["rows"] = [];
  const creates: CardDraft[] = [];
  const updates = new Map<string, CardDraft>();
  let skipped = 0;
  let duplicates = 0;

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const blank = !row.english.trim() && !row.japanese.trim() && !row.note.trim() && !row.partOfSpeech.trim();
    if (blank) return;
    if (!row.english.trim()) { errors.push({ row: rowNumber, field: "english", message: "英語が入力されていません。", severity: "error" }); return; }
    if (!row.japanese.trim()) { errors.push({ row: rowNumber, field: "japanese", message: "日本語が入力されていません。", severity: "error" }); return; }
    const draft: CardDraft = { english: row.english.trim(), japanese: row.japanese.trim(), partOfSpeech: row.partOfSpeech.trim(), note: row.note.trim() };
    if (draft.english !== row.english || draft.japanese !== row.japanese) warnings.push({ row: rowNumber, field: "english", message: "前後の空白は登録時に取り除かれます。", severity: "warning" });
    if (draft.english.length > 120 || draft.japanese.length > 250) warnings.push({ row: rowNumber, field: draft.english.length > 120 ? "english" : "japanese", message: "文字列が非常に長いため、内容を確認してください。", severity: "warning" });
    const key = normalizeEnglish(draft.english);
    const matched = existing.get(key);
    const duplicatedInInput = seen.has(key);
    if (matched || duplicatedInInput) {
      duplicates += 1;
      warnings.push({ row: rowNumber, field: "english", message: matched ? "既存のカードと英語が重複しています。" : "今回の入力内で英語が重複しています。", severity: "warning" });
      if (strategy === "skip") { skipped += 1; return; }
      if (strategy === "overwrite" && matched) { updates.set(matched.id, draft); planRows.push({ row: rowNumber, draft, existingCardId: matched.id }); seen.add(key); return; }
    }
    seen.add(key); planRows.push({ row: rowNumber, draft, existingCardId: matched?.id }); creates.push(draft);
  });
  return { rows: planRows, creates, updates: [...updates].map(([id, draft]) => ({ id, draft })), skipped, duplicates, errors, warnings };
}
