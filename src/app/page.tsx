"use client";

import { FormEvent, useEffect, useState } from "react";
import { Card, CardDraft, Folder, WordSetSummary, emptyCardDraft, isSetReady } from "@/domain/library";
import { libraryRepository } from "@/lib/repositories";
import { StudySession } from "@/features/study/StudySession";
import { BulkImportScreen } from "@/features/bulk/BulkImportScreen";

type View = "home" | "folder" | "set" | "bulk" | "study";
type Confirmation = { title: string; message: string; run: () => Promise<void> };

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [sets, setSets] = useState<WordSetSummary[]>([]);
  const [selectedSet, setSelectedSet] = useState<WordSetSummary | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [totalCardCount, setTotalCardCount] = useState(0);
  const [search, setSearch] = useState("");
  const [folderName, setFolderName] = useState("");
  const [setName, setSetName] = useState("");
  const [editingFolder, setEditingFolder] = useState(false);
  const [editingSet, setEditingSet] = useState(false);
  const [showCardEditor, setShowCardEditor] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [cardDraft, setCardDraft] = useState<CardDraft>(emptyCardDraft());
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const fail = (reason: unknown) => setError(reason instanceof Error ? reason.message : "保存中に問題が発生しました。もう一度お試しください。");
  const loadFolders = async () => setFolders(await libraryRepository.listFolders());
  const loadSets = async (folderId: string) => setSets(await libraryRepository.listWordSets(folderId));
  const loadCards = async (setId: string, query = "") => setCards(await libraryRepository.listCards(setId, query));

  useEffect(() => {
    void (async () => { try { await libraryRepository.ensureInitialData(); await loadFolders(); } catch (reason) { fail(reason); } finally { setReady(true); } })();
  }, []);

  const openFolder = async (folder: Folder) => { try { setError(""); setSelectedFolder(folder); setEditingFolder(false); setFolderName(folder.name); await loadSets(folder.id); setView("folder"); } catch (reason) { fail(reason); } };
  const openSet = async (wordSet: WordSetSummary) => { try { setError(""); setSelectedSet(wordSet); setEditingSet(false); setSetName(wordSet.name); setSearch(""); const latestCards = await libraryRepository.listCards(wordSet.id); setCards(latestCards); setTotalCardCount(latestCards.length); setView("set"); } catch (reason) { fail(reason); } };

  const submitFolder = async (event: FormEvent) => { event.preventDefault(); try { await libraryRepository.createFolder(folderName); setFolderName(""); await loadFolders(); } catch (reason) { fail(reason); } };
  const submitSet = async (event: FormEvent) => { event.preventDefault(); if (!selectedFolder) return; try { await libraryRepository.createWordSet(selectedFolder.id, setName); setSetName(""); await loadSets(selectedFolder.id); } catch (reason) { fail(reason); } };
  const saveCard = async (event: FormEvent) => { event.preventDefault(); if (!selectedSet) return; try { if (editingCardId) await libraryRepository.updateCard(editingCardId, cardDraft); else await libraryRepository.createCard(selectedSet.id, cardDraft); setEditingCardId(null); setShowCardEditor(false); setCardDraft(emptyCardDraft()); setTotalCardCount((await libraryRepository.listCards(selectedSet.id)).length); await loadCards(selectedSet.id, search); await loadSets(selectedSet.folderId); } catch (reason) { fail(reason); } };
  const updateCardDraft = (key: keyof CardDraft, value: string) => setCardDraft((draft) => ({ ...draft, [key]: value }));
  const confirm = async () => { if (!confirmation) return; try { await confirmation.run(); setConfirmation(null); } catch (reason) { fail(reason); } };

  if (view === "bulk" && selectedSet && selectedFolder) return <BulkImportScreen folderName={selectedFolder.name} wordSet={selectedSet} existingCards={cards} onBack={() => void openSet(selectedSet)} onStartStudy={() => void (async () => { try { setCards(await libraryRepository.listCards(selectedSet.id)); setView("study"); } catch (reason) { fail(reason); } })()} />;
  if (view === "study" && selectedSet) return <StudySession cards={cards} setName={selectedSet.name} onExit={() => setView("set")} />;
  if (!ready) return <main className="page centered"><p>教材を読み込んでいます…</p></main>;

  return <main className="page library-page">
    <header className="app-header"><button className="brand" onClick={() => setView("home")}>Instant Vocabulary</button>{view !== "home" && <button className="back-button" onClick={() => setView(view === "set" ? "folder" : "home")}>← 戻る</button>}</header>
    {error && <div className="error-notice" role="alert"><span>{error}</span><button onClick={() => setError("")}>閉じる</button></div>}

    {view === "home" && <section className="library-content"><div className="page-title"><p className="eyebrow">YOUR LIBRARY</p><h1>教材フォルダ</h1><p>単語セットをフォルダごとに整理できます。</p></div><form className="quick-form" onSubmit={submitFolder}><input value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="新しいフォルダ名" aria-label="新しいフォルダ名" /><button className="primary" type="submit">フォルダを作成</button></form>{folders.length ? <div className="folder-grid">{folders.map((folder) => <button className="library-card" key={folder.id} onClick={() => void openFolder(folder)}><span className="folder-icon">▰</span><strong>{folder.name}</strong><small>セットを開く →</small></button>)}</div> : <Empty title="フォルダがありません" message="上の入力欄から最初のフォルダを作成してください。" />}</section>}

    {view === "folder" && selectedFolder && <section className="library-content"><div className="page-title title-actions"><div><p className="eyebrow">FOLDER</p>{editingFolder ? <form className="inline-form" onSubmit={async (event) => { event.preventDefault(); try { const updated = await libraryRepository.updateFolder(selectedFolder.id, folderName); setSelectedFolder(updated); setEditingFolder(false); await loadFolders(); } catch (reason) { fail(reason); } }}><input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} /><button>保存</button></form> : <h1>{selectedFolder.name}</h1>}</div><div className="icon-actions"><button onClick={() => { setFolderName(selectedFolder.name); setEditingFolder(true); }}>名前を変更</button><button className="danger-text" onClick={() => setConfirmation({ title: "フォルダを削除しますか？", message: "中のセットと単語カードもすべて削除されます。", run: async () => { await libraryRepository.deleteFolder(selectedFolder.id); await loadFolders(); setView("home"); } })}>削除</button></div></div><form className="quick-form" onSubmit={submitSet}><input value={setName} onChange={(event) => setSetName(event.target.value)} placeholder="新しい単語セット名" aria-label="新しい単語セット名" /><button className="primary" type="submit">セットを作成</button></form>{sets.length ? <div className="list-stack">{sets.map((wordSet) => <article className="set-row" key={wordSet.id}><button className="set-main" onClick={() => void openSet(wordSet)}><strong>{wordSet.name}</strong><span>{wordSet.cardCount}語 {isSetReady(wordSet.cardCount) ? "" : "・100語未満/超過"}</span></button><button className="secondary" onClick={async () => { try { await libraryRepository.duplicateWordSet(wordSet.id); await loadSets(selectedFolder.id); } catch (reason) { fail(reason); } }}>複製</button></article>)}</div> : <Empty title="セットがありません" message="単語セットを作成して、カードを追加しましょう。" />}</section>}

    {view === "set" && selectedSet && <section className="library-content"><div className="page-title title-actions"><div><p className="eyebrow">WORD SET</p>{editingSet ? <form className="inline-form" onSubmit={async (event) => { event.preventDefault(); try { const updated = await libraryRepository.updateWordSet(selectedSet.id, setName); setSelectedSet({ ...selectedSet, ...updated }); setEditingSet(false); if (selectedFolder) await loadSets(selectedFolder.id); } catch (reason) { fail(reason); } }}><input autoFocus value={setName} onChange={(event) => setSetName(event.target.value)} /><button>保存</button></form> : <h1>{selectedSet.name}</h1>}<p>{totalCardCount}語 {isSetReady(totalCardCount) ? "" : "— 100語ではありませんが、保存・学習できます。"}</p></div><div className="icon-actions"><button onClick={() => { setSetName(selectedSet.name); setEditingSet(true); }}>名前を変更</button><button className="danger-text" onClick={() => setConfirmation({ title: "単語セットを削除しますか？", message: "中の単語カードもすべて削除されます。", run: async () => { await libraryRepository.deleteWordSet(selectedSet.id); if (selectedFolder) await loadSets(selectedFolder.id); setView("folder"); } })}>削除</button></div></div><div className="set-tools"><input value={search} onChange={(event) => { const value = event.target.value; setSearch(value); void loadCards(selectedSet.id, value).catch(fail); }} placeholder="英語または日本語で検索" aria-label="単語を検索" /><button className="secondary" onClick={() => void (async () => { try { setCards(await libraryRepository.listCards(selectedSet.id)); setSearch(""); setView("bulk"); } catch (reason) { fail(reason); } })()}>一括登録</button><button className="primary" onClick={() => { setEditingCardId(null); setCardDraft(emptyCardDraft()); setShowCardEditor(true); }}>単語を追加</button><button className="secondary" disabled={!totalCardCount} onClick={() => void (async () => { try { setCards(await libraryRepository.listCards(selectedSet.id)); setSearch(""); setView("study"); } catch (reason) { fail(reason); } })()}>学習開始</button></div>{showCardEditor && <CardEditor draft={cardDraft} editing={Boolean(editingCardId)} onChange={updateCardDraft} onSave={saveCard} onCancel={() => { setEditingCardId(null); setShowCardEditor(false); setCardDraft(emptyCardDraft()); }} />}{cards.length ? <div className="card-list">{cards.map((card, index) => <article className="word-row" key={card.id}><span className="order">{card.orderIndex}</span><button className="word-main" onClick={() => { setEditingCardId(card.id); setCardDraft({ english: card.english, japanese: card.japanese, note: card.note, partOfSpeech: card.partOfSpeech }); setShowCardEditor(true); }}><strong>{card.english}</strong><span>{card.japanese}</span></button><div className="row-actions"><button disabled={index === 0 || Boolean(search)} onClick={async () => { try { await libraryRepository.moveCard(selectedSet.id, card.id, "up"); await loadCards(selectedSet.id, search); } catch (reason) { fail(reason); } }}>↑</button><button disabled={index === cards.length - 1 || Boolean(search)} onClick={async () => { try { await libraryRepository.moveCard(selectedSet.id, card.id, "down"); await loadCards(selectedSet.id, search); } catch (reason) { fail(reason); } }}>↓</button><button className="danger-text" onClick={() => setConfirmation({ title: "この単語を削除しますか？", message: `${card.english} を単語セットから削除します。`, run: async () => { await libraryRepository.deleteCard(card.id); setTotalCardCount((await libraryRepository.listCards(selectedSet.id)).length); await loadCards(selectedSet.id, search); if (selectedFolder) await loadSets(selectedFolder.id); } })}>削除</button></div></article>)}</div> : <Empty title={search ? "一致する単語がありません" : "単語カードがありません"} message={search ? "別の検索語で試してください。" : "「単語を追加」から最初のカードを登録してください。"} />}</section>}

    {confirmation && <div className="modal-backdrop" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><h2 id="confirm-title">{confirmation.title}</h2><p>{confirmation.message}</p><div><button className="secondary" onClick={() => setConfirmation(null)}>キャンセル</button><button className="danger-button" onClick={() => void confirm()}>削除する</button></div></section></div>}
  </main>;
}

function CardEditor({ draft, editing, onChange, onSave, onCancel }: { draft: CardDraft; editing: boolean; onChange: (key: keyof CardDraft, value: string) => void; onSave: (event: FormEvent) => Promise<void>; onCancel: () => void }) {
  return <form className="card-editor" onSubmit={(event) => void onSave(event)}><h2>{editing ? "単語を編集" : "単語を追加"}</h2><label>英語<input required value={draft.english} onChange={(event) => onChange("english", event.target.value)} /></label><label>日本語の意味<input required value={draft.japanese} onChange={(event) => onChange("japanese", event.target.value)} /></label><label>品詞（任意）<input value={draft.partOfSpeech} onChange={(event) => onChange("partOfSpeech", event.target.value)} /></label><label>補足（任意）<textarea value={draft.note} onChange={(event) => onChange("note", event.target.value)} /></label><div><button type="button" className="secondary" onClick={onCancel}>キャンセル</button><button className="primary" type="submit">保存する</button></div></form>;
}

function Empty({ title, message }: { title: string; message: string }) { return <div className="empty-state"><strong>{title}</strong><p>{message}</p></div>; }
