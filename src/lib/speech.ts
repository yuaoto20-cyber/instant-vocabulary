export const SPEECH_SETTINGS_KEY = "instant-vocabulary-speech-settings";
export const SPEECH_RATES = [0.7, 0.8, 0.9, 1, 1.1] as const;

export type SpeechRate = (typeof SPEECH_RATES)[number];
export type SpeechSettings = { voiceURI: string; rate: SpeechRate };

export const defaultSpeechSettings: SpeechSettings = { voiceURI: "", rate: 0.9 };

export const isEnglishVoice = (voice: Pick<SpeechSynthesisVoice, "lang">) => /^en(?:[-_]|$)/i.test(voice.lang);

export const englishVoices = (voices: SpeechSynthesisVoice[]) => voices.filter(isEnglishVoice);

export function selectEnglishVoice(voices: SpeechSynthesisVoice[], voiceURI = "") {
  const candidates = englishVoices(voices);
  if (voiceURI) {
    const saved = candidates.find((voice) => voice.voiceURI === voiceURI);
    if (saved) return saved;
  }
  const preferences: Array<(voice: SpeechSynthesisVoice) => boolean> = [
    (voice) => voice.lang.toLowerCase() === "en-us" && voice.localService,
    (voice) => voice.lang.toLowerCase() === "en-us",
    (voice) => voice.lang.toLowerCase() === "en-gb" && voice.localService,
    (voice) => voice.lang.toLowerCase() === "en-gb",
    () => true
  ];
  return preferences.map((matches) => candidates.find(matches)).find(Boolean) ?? null;
}

export function readSpeechSettings(storage?: Storage): SpeechSettings {
  try {
    const raw = storage?.getItem(SPEECH_SETTINGS_KEY);
    if (!raw) return defaultSpeechSettings;
    const value = JSON.parse(raw) as Partial<SpeechSettings>;
    const rate = SPEECH_RATES.includes(value.rate as SpeechRate) ? value.rate as SpeechRate : defaultSpeechSettings.rate;
    return { voiceURI: typeof value.voiceURI === "string" ? value.voiceURI : "", rate };
  } catch { return defaultSpeechSettings; }
}

export function saveSpeechSettings(settings: SpeechSettings, storage?: Storage) {
  try { storage?.setItem(SPEECH_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Settings are optional. */ }
}

export function supportsSpeech() {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function cancelSpeech() {
  if (supportsSpeech()) window.speechSynthesis.cancel();
}

export function speakEnglish(text: string, settings: SpeechSettings, voices: SpeechSynthesisVoice[]) {
  if (!text.trim() || !supportsSpeech() || document.hidden) return false;
  try {
    const voice = selectEnglishVoice(voices, settings.voiceURI);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice?.lang || "en-US";
    utterance.rate = settings.rate;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch { return false; }
}
