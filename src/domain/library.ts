export type Timestamp = string;

export type Folder = { id: string; name: string; createdAt: Timestamp; updatedAt: Timestamp };
export type WordSet = { id: string; folderId: string; name: string; createdAt: Timestamp; updatedAt: Timestamp };
export type Card = {
  id: string;
  setId: string;
  orderIndex: number;
  english: string;
  japanese: string;
  note: string;
  partOfSpeech: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type WordSetSummary = WordSet & { cardCount: number };
export type CardDraft = Pick<Card, "english" | "japanese" | "note" | "partOfSpeech">;

export const emptyCardDraft = (): CardDraft => ({ english: "", japanese: "", note: "", partOfSpeech: "" });
export const isSetReady = (count: number) => count === 100;
