"use client";

import { KeyboardEvent, ClipboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { BulkField, BulkRow, DuplicateStrategy, analyzeImport, applyClipboard, emptyBulkRow, ensureTrailingRow, initialBulkRows } from "@/domain/bulkImport";
import { Card, WordSetSummary } from "@/domain/library";
import { libraryRepository } from "@/lib/repositories";

type ImportResult = { created: number; updated: number; skipped: number; total: number };
const baseFields: BulkField[] = ["english", "japanese"];
const optionalFields: BulkField[] = ["partOfSpeech", "note"];
const fieldLabels: Record<BulkField, string> = { english: "英語", japanese: "日本語", partOfSpeech: "品詞", note: "補足" };

export function BulkImportScreen({ folderName, wordSet, existingCards, onBack, onStartStudy }: { folderName: string; wordSet: WordSetSummary; existingCards: Card[]; onBack: () => void; onStartStudy: () => void }) {
  const draftKey = `instant-vocabulary-bulk-draft/${wordSet.id}`;
  const [rows, setRows] = useState<BulkRow[]>(() => initialBulkRows());
  const [showOptional, setShowOptional] = useState(false);
  const [strategy, setStrategy] = useState<DuplicateStrategy>("skip");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [complete, setComplete] = useState<ImportResult | null>(null);
  const refs = useRef(new Map<string, HTMLInputElement>());
  const fields = showOptional ? [...baseFields, ...optionalFields] : baseFields;
  const plan = useMemo(() => analyzeImport(rows, existingCards, strategy), [rows, existingCards, strategy]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(draftKey);
      if (saved) {
        const value = JSON.parse(saved) as { rows?: BulkRow[]; showOptional?: boolean };
        if (value.rows?.length && window.confirm("前回の一括登録の入力途中データを復元しますか？")) {
          // Restore happens only after hydration because localStorage is browser-only.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setRows(ensureTrailingRow(value.rows.map((row) => ({ ...emptyBulkRow(), ...row }))));
          setShowOptional(Boolean(value.showOptional));
        }
      }
    } catch { setNotice("入力途中データを復元できませんでした。"); }
  }, [draftKey]);
  useEffect(() => {
    if (complete) return;
    const timer = window.setTimeout(() => { try { window.localStorage.setItem(draftKey, JSON.stringify({ rows, showOptional })); } catch { /* The table remains usable if temporary saving is unavailable. */ } }, 250);
    return () => window.clearTimeout(timer);
  }, [complete, draftKey, rows, showOptional]);

  const updateCell = (rowIndex: number, field: BulkField, value: string) => setRows((current) => ensureTrailingRow(current.map((row, index) => index === rowIndex ? { ...row, [field]: value } : row)));
  const paste = (event: ClipboardEvent<HTMLInputElement>, rowIndex: number, field: BulkField) => {
    const text = event.clipboardData.getData("text");
    if (!text.includes("\n") && !text.includes("\t")) return;
    event.preventDefault();
    const result = applyClipboard(rows, rowIndex, field, text, showOptional);
    setRows(result.rows);
    if (result.ignoredColumns) setNotice(`${result.ignoredColumns}個の対応していない列は読み込みませんでした。`);
  };
  const focus = (rowIndex: number, field: BulkField) => refs.current.get(`${rowIndex}:${field}`)?.focus();
  const keyDown = (event: KeyboardEvent<HTMLInputElement>, rowIndex: number, field: BulkField) => {
    const column = fields.indexOf(field);
    const move = (nextRow: number, nextColumn: number) => { event.preventDefault(); focus(Math.max(0, nextRow), fields[Math.max(0, Math.min(fields.length - 1, nextColumn))]); };
    if (event.key === "Tab") move(rowIndex + (event.shiftKey && column === 0 ? -1 : !event.shiftKey && column === fields.length - 1 ? 1 : 0), event.shiftKey ? (column === 0 ? fields.length - 1 : column - 1) : (column === fields.length - 1 ? 0 : column + 1));
    else if (event.key === "Enter" || event.key === "ArrowDown") move(rowIndex + 1, column);
    else if (event.key === "ArrowUp") move(rowIndex - 1, column);
    else if (event.key === "ArrowLeft") move(rowIndex, column - 1);
    else if (event.key === "ArrowRight") move(rowIndex, column + 1);
  };
  const rowIssue = (row: number, field: BulkField) => plan.errors.some((issue) => issue.row === row + 1 && issue.field === field);
  const addRow = () => setRows((current) => [...current, emptyBulkRow()]);
  const removeRow = (index: number) => setRows((current) => ensureTrailingRow(current.length === 1 ? [emptyBulkRow()] : current.filter((_, row) => row !== index)));
  const duplicateRow = (index: number) => setRows((current) => ensureTrailingRow([...current.slice(0, index + 1), { ...current[index] }, ...current.slice(index + 1)]));
  const moveRow = (index: number, direction: -1 | 1) => setRows((current) => { const target = index + direction; if (target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  const execute = async () => { try { const result = await libraryRepository.bulkImportCards(wordSet.id, rows, strategy); window.localStorage.removeItem(draftKey); setComplete(result); setConfirming(false); } catch (reason) { setNotice(reason instanceof Error ? reason.message : "一括登録に失敗しました。"); } };

  if (complete) return <main className="page bulk-page"><section className="bulk-summary"><p className="eyebrow">IMPORT COMPLETE</p><h1>登録が完了しました</h1><dl><div><dt>新規登録</dt><dd>{complete.created}語</dd></div><div><dt>スキップ</dt><dd>{complete.skipped}語</dd></div><div><dt>上書き</dt><dd>{complete.updated}語</dd></div><div><dt>登録後の合計</dt><dd>{complete.total}語</dd></div></dl><button className="primary" onClick={onBack}>単語セットへ戻る</button><button className="secondary full-button" onClick={() => { setRows(initialBulkRows()); setComplete(null); }}>続けて登録する</button><button className="text-button" onClick={onStartStudy}>学習を開始する</button></section></main>;

  const totalAfter = existingCards.length + plan.creates.length;
  return <main className="page bulk-page"><header className="app-header bulk-header"><button className="back-button" onClick={onBack}>← セット詳細へ戻る</button><span>一括登録</span></header><section className="bulk-content"><div className="page-title"><p className="eyebrow">BULK IMPORT</p><h1>{wordSet.name}</h1><p>{folderName}<br />現在：{existingCards.length}語　追加予定：{plan.creates.length}語　登録後：{totalAfter}語</p></div>{totalAfter !== 100 && <p className="import-warning">登録後の単語数は100語ではありません。保存は可能です。</p>}{notice && <div className="error-notice"><span>{notice}</span><button onClick={() => setNotice("")}>閉じる</button></div>}<div className="bulk-toolbar"><button className="secondary" onClick={() => setShowOptional((value) => !value)}>{showOptional ? "任意列を隠す" : "品詞・補足列を表示"}</button><label>重複時の扱い<select value={strategy} onChange={(event) => setStrategy(event.target.value as DuplicateStrategy)}><option value="skip">重複をスキップ</option><option value="allow">重複も別カードとして登録</option><option value="overwrite">既存カードの日本語を上書き</option></select></label></div><div className="grid-scroll"><table className="bulk-grid"><thead><tr><th>行</th>{fields.map((field) => <th key={field}>{fieldLabels[field]}</th>)}<th>操作</th></tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}><th scope="row">{rowIndex + 1}</th>{fields.map((field) => <td key={field}><input ref={(node) => { if (node) refs.current.set(`${rowIndex}:${field}`, node); else refs.current.delete(`${rowIndex}:${field}`); }} className={rowIssue(rowIndex, field) ? "cell-error" : ""} value={row[field]} onChange={(event) => updateCell(rowIndex, field, event.target.value)} onPaste={(event) => paste(event, rowIndex, field)} onKeyDown={(event) => keyDown(event, rowIndex, field)} aria-label={`${rowIndex + 1}行目・${fieldLabels[field]}`} /></td>)}<td className="grid-actions"><button onClick={() => moveRow(rowIndex, -1)} disabled={rowIndex === 0}>↑</button><button onClick={() => moveRow(rowIndex, 1)} disabled={rowIndex === rows.length - 1}>↓</button><button onClick={() => duplicateRow(rowIndex)}>複製</button><button className="danger-text" onClick={() => removeRow(rowIndex)}>削除</button></td></tr>)}</tbody></table></div><button className="secondary add-row" onClick={addRow}>＋ 行を追加</button>{(plan.errors.length > 0 || plan.warnings.length > 0) && <section className="issue-list"><h2>入力チェック</h2>{plan.errors.map((issue) => <button key={`e${issue.row}${issue.field}`} className="issue error" onClick={() => focus(issue.row - 1, issue.field)}>{issue.row}行目・{fieldLabels[issue.field]}：{issue.message}</button>)}{plan.warnings.map((issue) => <button key={`w${issue.row}${issue.field}${issue.message}`} className="issue warning" onClick={() => focus(issue.row - 1, issue.field)}>{issue.row}行目・{fieldLabels[issue.field]}：{issue.message}</button>)}</section>}<div className="bulk-bottom"><button className="primary" disabled={plan.errors.length > 0 || plan.creates.length + plan.updates.length === 0} onClick={() => setConfirming(true)}>登録内容を確認</button></div></section>{confirming && <div className="modal-backdrop"><section className="confirm-dialog" role="dialog" aria-modal="true"><h2>この内容で登録しますか？</h2><p>{wordSet.name}<br />新規登録：{plan.creates.length}語<br />重複：{plan.duplicates}件<br />スキップ：{plan.skipped}件<br />上書き：{plan.updates.length}件<br />エラー：{plan.errors.length}件<br />登録後：{totalAfter}語</p><div><button className="secondary" onClick={() => setConfirming(false)}>戻る</button><button className="primary" onClick={() => void execute()}>登録を実行</button></div></section></div>}</main>;
}
