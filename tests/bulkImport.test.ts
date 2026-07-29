import { describe, expect, it } from "vitest";
import { analyzeImport, applyClipboard, initialBulkRows, parseClipboardTable } from "@/domain/bulkImport";
import { Card } from "@/domain/library";

const existing: Card = { id: "card-1", setId: "set-1", orderIndex: 1, english: "Apple", japanese: "りんご", note: "", partOfSpeech: "noun", createdAt: "2026-01-01", updatedAt: "2026-01-01" };

describe("一括登録の貼り付け解析", () => {
  it("改行区切りの1列データを下方向へ展開する", () => {
    const result = applyClipboard(initialBulkRows(2), 0, "english", "conventional\nelaborate\ndeteriorate", false);
    expect(result.rows.slice(0, 3).map((row) => row.english)).toEqual(["conventional", "elaborate", "deteriorate"]);
  });

  it("タブ区切りの2列データを英語・日本語へ展開する", () => {
    const result = applyClipboard(initialBulkRows(1), 0, "english", "conventional\t従来の\nelaborate\t手の込んだ", false);
    expect(result.rows.slice(0, 2)).toMatchObject([{ english: "conventional", japanese: "従来の" }, { english: "elaborate", japanese: "手の込んだ" }]);
    expect(parseClipboardTable("a\tb\n")).toEqual([["a", "b"]]);
  });

  it("未対応の列を数え、必要な行を自動追加する", () => {
    const result = applyClipboard(initialBulkRows(1), 0, "english", "a\tA\tignored\nb\tB\textra", false);
    expect(result.ignoredColumns).toBe(2);
    expect(result.rows).toHaveLength(3);
  });

  it("500行の2列貼り付けを展開できる", () => {
    const text = Array.from({ length: 500 }, (_, index) => `word-${index}\t訳-${index}`).join("\n");
    const result = applyClipboard(initialBulkRows(1), 0, "english", text, false);
    expect(result.rows).toHaveLength(501);
    expect(result.rows[499]).toMatchObject({ english: "word-499", japanese: "訳-499" });
  });
});

describe("一括登録の入力チェック", () => {
  it("片方だけの入力をエラーにし、空行を無視する", () => {
    const plan = analyzeImport([{ english: "only", japanese: "", note: "", partOfSpeech: "" }, { english: "", japanese: "", note: "", partOfSpeech: "" }], [], "skip");
    expect(plan.errors).toHaveLength(1);
    expect(plan.creates).toHaveLength(0);
  });

  it("大文字小文字を区別せず既存カードとの重複を処理する", () => {
    const skip = analyzeImport([{ english: " apple ", japanese: "新しい訳", note: "", partOfSpeech: "" }], [existing], "skip");
    expect(skip.skipped).toBe(1);
    expect(skip.warnings).toHaveLength(2);
    const overwrite = analyzeImport([{ english: "apple", japanese: "新しい訳", note: "", partOfSpeech: "" }], [existing], "overwrite");
    expect(overwrite.updates).toEqual([{ id: "card-1", draft: { english: "apple", japanese: "新しい訳", note: "", partOfSpeech: "" } }]);
  });
});
