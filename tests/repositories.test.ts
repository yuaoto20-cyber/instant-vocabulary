import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyCardDraft } from "@/domain/library";
import { closeDatabaseForTests, getStorageMode, libraryRepository, resetDatabaseForTests, setStorageMode } from "@/lib/repositories";

beforeEach(async () => { setStorageMode("local"); await resetDatabaseForTests(); });
afterEach(async () => { setStorageMode("local"); await resetDatabaseForTests(); });

describe("IndexedDB教材リポジトリ", () => {
  it("初回データは一度だけ作成される", async () => {
    await libraryRepository.ensureInitialData();
    await libraryRepository.ensureInitialData();
    const folders = await libraryRepository.listFolders();
    expect(folders).toHaveLength(1);
    const sets = await libraryRepository.listWordSets(folders[0].id);
    expect(sets[0].cardCount).toBe(20);
  });

  it("IndexedDB接続を開き直しても登録したデータを保持する", async () => {
    const folder = await libraryRepository.createFolder("再読み込み確認");
    const wordSet = await libraryRepository.createWordSet(folder.id, "保存セット");
    await libraryRepository.createCard(wordSet.id, { ...emptyCardDraft(), english: "reload", japanese: "再読み込み" });
    await closeDatabaseForTests();
    const folders = await libraryRepository.listFolders();
    expect(folders.some((item) => item.id === folder.id)).toBe(true);
    expect((await libraryRepository.listCards(wordSet.id))[0]).toMatchObject({ english: "reload", japanese: "再読み込み" });
  });

  it("保存先Facadeはローカルを維持し、未設定のクラウドでは安全に失敗する", async () => {
    await libraryRepository.createFolder("ローカル");
    expect(getStorageMode()).toBe("local");
    expect(await libraryRepository.listFolders()).toHaveLength(1);
    setStorageMode("cloud");
    await expect(libraryRepository.listFolders()).rejects.toThrow("Supabase接続情報");
  });

  it("フォルダ、セット、カードを作成・検索・並べ替えできる", async () => {
    const folder = await libraryRepository.createFolder("英検準1級");
    const wordSet = await libraryRepository.createWordSet(folder.id, "Set 01");
    const first = await libraryRepository.createCard(wordSet.id, { ...emptyCardDraft(), english: "alpha", japanese: "最初" });
    const second = await libraryRepository.createCard(wordSet.id, { ...emptyCardDraft(), english: "beta", japanese: "二番目", partOfSpeech: "noun" });
    await libraryRepository.moveCard(wordSet.id, second.id, "up");
    const ordered = await libraryRepository.listCards(wordSet.id);
    expect(ordered.map((card) => card.english)).toEqual(["beta", "alpha"]);
    expect((await libraryRepository.listCards(wordSet.id, "二番")).map((card) => card.id)).toEqual([second.id]);
    await libraryRepository.updateCard(first.id, { ...emptyCardDraft(), english: "alpha", japanese: "一番目" });
    expect((await libraryRepository.listCards(wordSet.id, "一番目"))[0].id).toBe(first.id);
  });

  it("セット複製と連鎖削除で孤立したカードを残さない", async () => {
    const folder = await libraryRepository.createFolder("TOEFL");
    const wordSet = await libraryRepository.createWordSet(folder.id, "Core");
    await libraryRepository.createCard(wordSet.id, { ...emptyCardDraft(), english: "persist", japanese: "持続する" });
    const copy = await libraryRepository.duplicateWordSet(wordSet.id);
    expect(await libraryRepository.listCards(copy.id)).toHaveLength(1);
    await libraryRepository.deleteWordSet(wordSet.id);
    expect(await libraryRepository.listCards(wordSet.id)).toHaveLength(0);
    await libraryRepository.deleteFolder(folder.id);
    expect(await libraryRepository.listWordSets(folder.id)).toHaveLength(0);
    expect(await libraryRepository.listCards(copy.id)).toHaveLength(0);
  });

  it("一括登録は重複方針を適用して1回の処理で保存する", async () => {
    const folder = await libraryRepository.createFolder("Bulk");
    const wordSet = await libraryRepository.createWordSet(folder.id, "Set");
    await libraryRepository.createCard(wordSet.id, { ...emptyCardDraft(), english: "Apple", japanese: "りんご" });
    const result = await libraryRepository.bulkImportCards(wordSet.id, [{ ...emptyCardDraft(), english: "apple", japanese: "林檎" }, { ...emptyCardDraft(), english: "banana", japanese: "バナナ" }], "overwrite");
    expect(result).toMatchObject({ created: 1, updated: 1, skipped: 0, total: 2 });
    expect((await libraryRepository.listCards(wordSet.id)).map((card) => card.japanese)).toEqual(["林檎", "バナナ"]);
  });
});
