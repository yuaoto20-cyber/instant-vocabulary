import { describe, expect, it } from "vitest";
import { defaultSpeechSettings, englishVoices, readSpeechSettings, selectEnglishVoice } from "@/lib/speech";

const voice = (name: string, lang: string, options: Partial<SpeechSynthesisVoice> = {}) => ({ name, lang, voiceURI: `${name}-${lang}`, localService: false, default: false, ...options }) as SpeechSynthesisVoice;

describe("English voice selection", () => {
  it("filters out Japanese voices", () => {
    const voices = englishVoices([voice("Japanese", "ja-JP"), voice("English", "en-US")]);
    expect(voices.map((item) => item.lang)).toEqual(["en-US"]);
  });

  it("prefers a local en-US voice before other English voices", () => {
    const selected = selectEnglishVoice([voice("British", "en-GB", { localService: true }), voice("US network", "en-US"), voice("US local", "en-US", { localService: true })]);
    expect(selected?.name).toBe("US local");
  });

  it("restores an available saved voice and falls back to automatic selection when it is missing", () => {
    const british = voice("British", "en-GB");
    const american = voice("American", "en-US");
    expect(selectEnglishVoice([american, british], british.voiceURI)?.voiceURI).toBe(british.voiceURI);
    expect(selectEnglishVoice([american, british], "removed-voice")?.voiceURI).toBe(american.voiceURI);
  });

  it("keeps safe defaults when saved settings are malformed", () => {
    const storage = { getItem: () => "not-json" } as unknown as Storage;
    expect(readSpeechSettings(storage)).toEqual(defaultSpeechSettings);
  });
});
