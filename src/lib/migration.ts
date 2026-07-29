import { Card, Folder, WordSet } from "@/domain/library";
import { cloudLibraryRepository } from "@/lib/cloudRepository";
import { localLibraryRepository, setStorageMode } from "@/lib/repositories";
import { requireSupabaseClient } from "@/lib/supabase";

export const CARD_BATCH_SIZE = 200;
export type MigrationState = "not_started" | "validating" | "migrating" | "completed" | "partial_failure" | "failed" | "retryable";
export type ExistingCloudChoice = "abort" | "add" | "update";
export type MigrationIssue = { type: "folder" | "word_set" | "card"; id: string; name: string; message: string };
export type MigrationProgress = { phase: "folders" | "word_sets" | "cards"; completed: number; total: number };
export type MigrationResult = { folders: number; wordSets: number; cards: number; updated: number; skipped: number; startedAt: string; completedAt: string };
export type MigrationPreview = { local: { folders: number; wordSets: number; cards: number }; cloud: { folders: number; wordSets: number; cards: number }; issues: MigrationIssue[] };
type Snapshot = { folders: Folder[]; wordSets: WordSet[]; cards: Card[] };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function snapshot(): Promise<Snapshot> {
  const folders = await localLibraryRepository.listFolders(); const wordSets = (await Promise.all(folders.map((folder) => localLibraryRepository.listWordSets(folder.id)))).flat().map((set) => ({ id: set.id, folderId: set.folderId, name: set.name, createdAt: set.createdAt, updatedAt: set.updatedAt })); const cards = (await Promise.all(wordSets.map((set) => localLibraryRepository.listCards(set.id)))).flat(); return { folders, wordSets, cards };
}
function validate(data: Snapshot) {
  const issues: MigrationIssue[] = []; const folderIds = new Set<string>(); const setIds = new Set<string>(); const cardIds = new Set<string>();
  data.folders.forEach((folder) => { if (!folder.name.trim()) issues.push({ type: "folder", id: folder.id, name: folder.name, message: "フォルダ名が空です。" }); if (!uuid.test(folder.id) || folderIds.has(folder.id)) issues.push({ type: "folder", id: folder.id, name: folder.name, message: "IDがUUIDではないか重複しています。" }); folderIds.add(folder.id); });
  data.wordSets.forEach((set) => { if (!set.name.trim()) issues.push({ type: "word_set", id: set.id, name: set.name, message: "セット名が空です。" }); if (!folderIds.has(set.folderId)) issues.push({ type: "word_set", id: set.id, name: set.name, message: "参照先フォルダがありません。" }); if (!uuid.test(set.id) || setIds.has(set.id)) issues.push({ type: "word_set", id: set.id, name: set.name, message: "IDがUUIDではないか重複しています。" }); setIds.add(set.id); });
  data.cards.forEach((card) => { if (!card.english.trim() || !card.japanese.trim()) issues.push({ type: "card", id: card.id, name: card.english, message: "英語または日本語が空です。" }); if (!setIds.has(card.setId)) issues.push({ type: "card", id: card.id, name: card.english, message: "参照先セットがありません。" }); if (!Number.isInteger(card.orderIndex) || card.orderIndex < 1) issues.push({ type: "card", id: card.id, name: card.english, message: "orderIndexが不正です。" }); if (!uuid.test(card.id) || cardIds.has(card.id)) issues.push({ type: "card", id: card.id, name: card.english, message: "IDがUUIDではないか重複しています。" }); cardIds.add(card.id); });
  return issues;
}
async function cloudCounts() { const folders = await cloudLibraryRepository.listFolders(); const sets = (await Promise.all(folders.map((folder) => cloudLibraryRepository.listWordSets(folder.id)))).flat(); const cards = (await Promise.all(sets.map((set) => cloudLibraryRepository.listCards(set.id)))).flat(); return { folders: folders.length, wordSets: sets.length, cards: cards.length }; }
const statusKey = (userId: string) => `instant-vocabulary-migration/${userId}`;
const saveStatus = (userId: string, value: object) => { if (typeof window !== "undefined") window.localStorage.setItem(statusKey(userId), JSON.stringify(value)); };
export const getMigrationStatus = (userId: string) => typeof window === "undefined" ? null : window.localStorage.getItem(statusKey(userId));

export async function previewMigration(): Promise<MigrationPreview> { const local = await snapshot(); return { local: { folders: local.folders.length, wordSets: local.wordSets.length, cards: local.cards.length }, cloud: await cloudCounts(), issues: validate(local) }; }

export async function migrateLocalData(choice: ExistingCloudChoice, onProgress: (progress: MigrationProgress) => void): Promise<MigrationResult> {
  const supabase = requireSupabaseClient(); const { data: auth, error: authError } = await supabase.auth.getUser(); if (authError || !auth.user) throw new Error("移行するにはログインが必要です。"); const userId = auth.user.id; const startedAt = new Date().toISOString(); const data = await snapshot(); const issues = validate(data); if (issues.length) throw new Error("移行前の検証エラーを修正してください。"); const remote = await cloudCounts(); if (choice === "abort" && (remote.folders || remote.wordSets || remote.cards)) throw new Error("クラウド側に既存データがあります。方針を選択してください。");
  saveStatus(userId, { state: "migrating", startedAt, progress: { phase: "folders", completed: 0, total: data.folders.length + data.wordSets.length + data.cards.length } });
  const upsertOptions = { onConflict: "id", ignoreDuplicates: choice === "add" };
  let completed = 0; const total = data.folders.length + data.wordSets.length + data.cards.length;
  try {
    const folderRows = data.folders.map((folder) => ({ id: folder.id, user_id: userId, name: folder.name, description: "", sort_order: 0, created_at: folder.createdAt, updated_at: folder.updatedAt })); const { error: folderError } = await supabase.from("folders").upsert(folderRows, upsertOptions); if (folderError) throw folderError; completed += folderRows.length; onProgress({ phase: "folders", completed, total });
    const setRows = data.wordSets.map((set) => ({ id: set.id, user_id: userId, folder_id: set.folderId, name: set.name, description: "", sort_order: 0, created_at: set.createdAt, updated_at: set.updatedAt })); const { error: setError } = await supabase.from("word_sets").upsert(setRows, upsertOptions); if (setError) throw setError; completed += setRows.length; onProgress({ phase: "word_sets", completed, total });
    for (let start = 0; start < data.cards.length; start += CARD_BATCH_SIZE) { const batch = data.cards.slice(start, start + CARD_BATCH_SIZE).map((card) => ({ id: card.id, user_id: userId, set_id: card.setId, order_index: card.orderIndex, english: card.english, japanese: card.japanese, note: card.note, part_of_speech: card.partOfSpeech, created_at: card.createdAt, updated_at: card.updatedAt })); const { error } = await supabase.from("cards").upsert(batch, upsertOptions); if (error) throw error; completed += batch.length; onProgress({ phase: "cards", completed, total }); }
    const result = { folders: data.folders.length, wordSets: data.wordSets.length, cards: data.cards.length, updated: choice === "update" ? completed : 0, skipped: choice === "add" ? 0 : 0, startedAt, completedAt: new Date().toISOString() }; saveStatus(userId, { state: "completed", ...result }); setStorageMode("cloud"); return result;
  } catch (reason) { saveStatus(userId, { state: "partial_failure", startedAt, completed, total, error: reason instanceof Error ? reason.message : "移行に失敗しました。", retryable: true }); throw reason; }
}
