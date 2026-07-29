import { DBSchema, IDBPDatabase, openDB, deleteDB } from "idb";
import { Card, CardDraft, Folder, WordSet, WordSetSummary } from "@/domain/library";
import { DuplicateStrategy, analyzeImport } from "@/domain/bulkImport";

interface VocabularyDB extends DBSchema {
  folders: { key: string; value: Folder };
  wordSets: { key: string; value: WordSet; indexes: { folderId: string } };
  cards: { key: string; value: Card; indexes: { setId: string; setOrder: [string, number] } };
  appState: { key: string; value: { key: string; value: string } };
}

export interface FolderRepository {
  listFolders(): Promise<Folder[]>;
  createFolder(name: string): Promise<Folder>;
  updateFolder(id: string, name: string): Promise<Folder>;
  deleteFolder(id: string): Promise<void>;
}

export interface WordSetRepository {
  listWordSets(folderId: string): Promise<WordSetSummary[]>;
  getWordSet(id: string): Promise<WordSet | undefined>;
  createWordSet(folderId: string, name: string): Promise<WordSet>;
  updateWordSet(id: string, name: string): Promise<WordSet>;
  duplicateWordSet(id: string): Promise<WordSet>;
  deleteWordSet(id: string): Promise<void>;
}

export interface CardRepository {
  listCards(setId: string, query?: string): Promise<Card[]>;
  createCard(setId: string, draft: CardDraft): Promise<Card>;
  updateCard(id: string, draft: CardDraft): Promise<Card>;
  deleteCard(id: string): Promise<void>;
  moveCard(setId: string, cardId: string, direction: "up" | "down"): Promise<void>;
  bulkImportCards(setId: string, drafts: CardDraft[], strategy: DuplicateStrategy): Promise<{ created: number; updated: number; skipped: number; total: number }>;
}

export interface LibraryRepository extends FolderRepository, WordSetRepository, CardRepository {
  ensureInitialData(): Promise<void>;
}

const DB_NAME = "instant-vocabulary";
let dbPromise: Promise<IDBPDatabase<VocabularyDB>> | undefined;
const now = () => new Date().toISOString();
const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const validName = (value: string, label: string) => {
  const name = value.trim();
  if (!name) throw new Error(`${label}を入力してください。`);
  return name;
};
const validDraft = (draft: CardDraft) => {
  const english = draft.english.trim();
  const japanese = draft.japanese.trim();
  if (!english || !japanese) throw new Error("英語と日本語の意味を入力してください。");
  return { english, japanese, note: draft.note.trim(), partOfSpeech: draft.partOfSpeech.trim() };
};

async function db() {
  if (!dbPromise) {
    dbPromise = openDB<VocabularyDB>(DB_NAME, 1, {
      upgrade(database) {
        database.createObjectStore("folders", { keyPath: "id" });
        const wordSets = database.createObjectStore("wordSets", { keyPath: "id" });
        wordSets.createIndex("folderId", "folderId");
        const cards = database.createObjectStore("cards", { keyPath: "id" });
        cards.createIndex("setId", "setId");
        cards.createIndex("setOrder", ["setId", "orderIndex"]);
        database.createObjectStore("appState", { keyPath: "key" });
      }
    });
  }
  return dbPromise;
}

async function cardsForSet(database: IDBPDatabase<VocabularyDB>, setId: string) {
  return (await database.getAllFromIndex("cards", "setId", setId)).sort((a, b) => a.orderIndex - b.orderIndex);
}

async function normalizeOrders(database: IDBPDatabase<VocabularyDB>, setId: string, cards?: Card[]) {
  const ordered = cards ?? await cardsForSet(database, setId);
  const transaction = database.transaction("cards", "readwrite");
  await Promise.all(ordered.map((card, index) => transaction.store.put({ ...card, orderIndex: index + 1 })));
  await transaction.done;
}

const seedCards: Array<Pick<Card, "english" | "japanese">> = [
  ["conventional", "従来の、慣習的な"], ["elaborate", "手の込んだ、詳細に説明する"], ["deteriorate", "悪化する"],
  ["substantial", "かなりの、実質的な"], ["inevitable", "避けられない"], ["reluctant", "気が進まない、しぶしぶの"],
  ["allocate", "割り当てる"], ["advocate", "支持する、提唱する"], ["compelling", "説得力のある"],
  ["ambiguous", "曖昧な"], ["coherent", "首尾一貫した"], ["discrete", "別個の、個別の"],
  ["enhance", "高める、向上させる"], ["fluctuate", "変動する"], ["inherent", "固有の、本来備わっている"],
  ["mitigate", "和らげる、軽減する"], ["notion", "考え、概念"], ["preliminary", "予備の、事前の"],
  ["profound", "深い、重大な"], ["versatile", "多用途の、多才な"]
].map(([english, japanese]) => ({ english, japanese }));

class IndexedDbLibraryRepository implements LibraryRepository {
  async ensureInitialData() {
    const database = await db();
    if (await database.get("appState", "initial-data-v1")) return;
    const timestamp = now();
    const folder: Folder = { id: id(), name: "サンプル教材", createdAt: timestamp, updatedAt: timestamp };
    const wordSet: WordSet = { id: id(), folderId: folder.id, name: "Core Vocabulary", createdAt: timestamp, updatedAt: timestamp };
    const transaction = database.transaction(["folders", "wordSets", "cards", "appState"], "readwrite");
    await transaction.objectStore("folders").put(folder);
    await transaction.objectStore("wordSets").put(wordSet);
    await Promise.all(seedCards.map((card, index) => transaction.objectStore("cards").put({ id: id(), setId: wordSet.id, orderIndex: index + 1, ...card, note: "", partOfSpeech: "", createdAt: timestamp, updatedAt: timestamp })));
    await transaction.objectStore("appState").put({ key: "initial-data-v1", value: timestamp });
    await transaction.done;
  }

  async listFolders() { return (await (await db()).getAll("folders")).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
  async createFolder(name: string) { const timestamp = now(); const folder = { id: id(), name: validName(name, "フォルダ名"), createdAt: timestamp, updatedAt: timestamp }; await (await db()).put("folders", folder); return folder; }
  async updateFolder(folderId: string, name: string) { const database = await db(); const folder = await database.get("folders", folderId); if (!folder) throw new Error("フォルダが見つかりません。"); const updated = { ...folder, name: validName(name, "フォルダ名"), updatedAt: now() }; await database.put("folders", updated); return updated; }
  async deleteFolder(folderId: string) {
    const database = await db(); const sets = await database.getAllFromIndex("wordSets", "folderId", folderId); const transaction = database.transaction(["folders", "wordSets", "cards"], "readwrite");
    await transaction.objectStore("folders").delete(folderId); await Promise.all(sets.map(async (set) => { await transaction.objectStore("wordSets").delete(set.id); const cards = await transaction.objectStore("cards").index("setId").getAll(set.id); await Promise.all(cards.map((card) => transaction.objectStore("cards").delete(card.id))); })); await transaction.done;
  }
  async listWordSets(folderId: string) { const database = await db(); const sets = await database.getAllFromIndex("wordSets", "folderId", folderId); return Promise.all(sets.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(async (set) => ({ ...set, cardCount: (await database.countFromIndex("cards", "setId", set.id)) }))); }
  async getWordSet(setId: string) { return (await db()).get("wordSets", setId); }
  async createWordSet(folderId: string, name: string) { const database = await db(); if (!await database.get("folders", folderId)) throw new Error("フォルダが見つかりません。"); const timestamp = now(); const wordSet = { id: id(), folderId, name: validName(name, "セット名"), createdAt: timestamp, updatedAt: timestamp }; await database.put("wordSets", wordSet); return wordSet; }
  async updateWordSet(setId: string, name: string) { const database = await db(); const wordSet = await database.get("wordSets", setId); if (!wordSet) throw new Error("セットが見つかりません。"); const updated = { ...wordSet, name: validName(name, "セット名"), updatedAt: now() }; await database.put("wordSets", updated); return updated; }
  async duplicateWordSet(setId: string) { const database = await db(); const original = await database.get("wordSets", setId); if (!original) throw new Error("セットが見つかりません。"); const timestamp = now(); const copy = { ...original, id: id(), name: `${original.name} のコピー`, createdAt: timestamp, updatedAt: timestamp }; const cards = await cardsForSet(database, setId); const transaction = database.transaction(["wordSets", "cards"], "readwrite"); await transaction.objectStore("wordSets").put(copy); await Promise.all(cards.map((card) => transaction.objectStore("cards").put({ ...card, id: id(), setId: copy.id, createdAt: timestamp, updatedAt: timestamp }))); await transaction.done; return copy; }
  async deleteWordSet(setId: string) { const database = await db(); const cards = await cardsForSet(database, setId); const transaction = database.transaction(["wordSets", "cards"], "readwrite"); await transaction.objectStore("wordSets").delete(setId); await Promise.all(cards.map((card) => transaction.objectStore("cards").delete(card.id))); await transaction.done; }
  async listCards(setId: string, query = "") { const cards = await cardsForSet(await db(), setId); const keyword = query.trim().toLocaleLowerCase(); return keyword ? cards.filter((card) => `${card.english} ${card.japanese}`.toLocaleLowerCase().includes(keyword)) : cards; }
  async createCard(setId: string, draft: CardDraft) { const database = await db(); if (!await database.get("wordSets", setId)) throw new Error("セットが見つかりません。"); const timestamp = now(); const card = { id: id(), setId, orderIndex: (await cardsForSet(database, setId)).length + 1, ...validDraft(draft), createdAt: timestamp, updatedAt: timestamp }; await database.put("cards", card); return card; }
  async updateCard(cardId: string, draft: CardDraft) { const database = await db(); const card = await database.get("cards", cardId); if (!card) throw new Error("単語カードが見つかりません。"); const updated = { ...card, ...validDraft(draft), updatedAt: now() }; await database.put("cards", updated); return updated; }
  async deleteCard(cardId: string) { const database = await db(); const card = await database.get("cards", cardId); if (!card) return; await database.delete("cards", cardId); await normalizeOrders(database, card.setId); }
  async moveCard(setId: string, cardId: string, direction: "up" | "down") { const database = await db(); const cards = await cardsForSet(database, setId); const index = cards.findIndex((card) => card.id === cardId); const target = index + (direction === "up" ? -1 : 1); if (index < 0 || target < 0 || target >= cards.length) return; [cards[index], cards[target]] = [cards[target], cards[index]]; await normalizeOrders(database, setId, cards); }
  async bulkImportCards(setId: string, drafts: CardDraft[], strategy: DuplicateStrategy) {
    const database = await db();
    if (!await database.get("wordSets", setId)) throw new Error("単語セットが見つかりません。");
    const existing = await cardsForSet(database, setId);
    const plan = analyzeImport(drafts, existing, strategy);
    if (plan.errors.length) throw new Error("入力エラーを修正してから登録してください。");
    const timestamp = now();
    const transaction = database.transaction("cards", "readwrite");
    await Promise.all(plan.updates.map(async ({ id: cardId, draft }) => { const card = await transaction.store.get(cardId); if (card) await transaction.store.put({ ...card, ...validDraft(draft), updatedAt: timestamp }); }));
    await Promise.all(plan.creates.map((draft, index) => transaction.store.put({ id: id(), setId, orderIndex: existing.length + index + 1, ...validDraft(draft), createdAt: timestamp, updatedAt: timestamp })));
    await transaction.done;
    return { created: plan.creates.length, updated: plan.updates.length, skipped: plan.skipped, total: existing.length + plan.creates.length };
  }
}

export const libraryRepository: LibraryRepository = new IndexedDbLibraryRepository();

export async function closeDatabaseForTests() { if (dbPromise) { (await dbPromise).close(); dbPromise = undefined; } }
export async function resetDatabaseForTests() { if (dbPromise) { (await dbPromise).close(); dbPromise = undefined; } await deleteDB(DB_NAME); }
