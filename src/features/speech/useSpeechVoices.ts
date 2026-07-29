"use client";

import { useEffect, useState } from "react";
import { englishVoices, supportsSpeech } from "@/lib/speech";

export function useSpeechVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [loaded, setLoaded] = useState(() => !supportsSpeech());
  const [supported, setSupported] = useState(() => supportsSpeech());

  useEffect(() => {
    if (!supportsSpeech()) return;
    const synthesis = window.speechSynthesis;
    const refresh = () => { setSupported(true); setVoices(englishVoices(synthesis.getVoices())); setLoaded(true); };
    const initialRefresh = window.setTimeout(refresh, 0);
    synthesis.addEventListener("voiceschanged", refresh);
    return () => { window.clearTimeout(initialRefresh); synthesis.removeEventListener("voiceschanged", refresh); };
  }, []);

  return { voices, loaded, supported };
}
