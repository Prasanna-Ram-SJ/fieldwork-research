"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  mergeDictation,
  dictationError,
  type BrowserRecognition,
  type RecognitionConstructor,
} from "@/lib/ui/dictation";
type SpeechWindow = Window & {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};
export function useDictation(onText: (text: string) => void) {
  const [supported, setSupported] = useState<boolean | null>(null),
    [listening, setListening] = useState(false),
    [message, setMessage] = useState("");
  const recognition = useRef<BrowserRecognition | null>(null),
    callback = useRef(onText),
    generation = useRef(0);
  callback.current = onText;
  const cancel = useCallback(() => {
    generation.current++;
    const current = recognition.current;
    recognition.current = null;
    if (current) {
      current.onstart =
        current.onresult =
        current.onerror =
        current.onend =
          null;
      try {
        current.abort();
      } catch {}
    }
    setListening(false);
  }, []);
  useEffect(() => {
    const w = window as SpeechWindow;
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    const hidden = () => {
      if (document.hidden) cancel();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      cancel();
    };
  }, [cancel]);
  const toggle = useCallback(
    (base: string) => {
      if (recognition.current) {
        const current = recognition.current;
        try {
          current.stop();
        } catch {
          cancel();
        }
        return;
      }
      const w = window as SpeechWindow,
        Constructor = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (!Constructor) {
        setMessage(
          "Voice typing is unavailable in this browser. You can still type your question.",
        );
        return;
      }
      const token = ++generation.current,
        current = new Constructor();
      recognition.current = current;
      current.lang = navigator.language || "en-US";
      current.continuous = true;
      current.interimResults = true;
      setMessage("Waiting for microphone access…");
      setListening(true);
      current.onstart = () => {
        if (token === generation.current)
          setMessage(
            "Listening… Speak your question, then press the microphone to stop.",
          );
      };
      current.onresult = (event) => {
        if (token !== generation.current) return;
        const text = mergeDictation(base, event.results);
        callback.current(text);
        if (text.length >= 1000) {
          cancel();
          setMessage(
            "The question reached its 1,000-character limit. Review it before sending.",
          );
        }
      };
      current.onerror = (event) => {
        if (token !== generation.current) return;
        cancel();
        setMessage(dictationError(event.error));
      };
      current.onend = () => {
        if (token !== generation.current) return;
        recognition.current = null;
        setListening(false);
        setMessage(
          "Voice typing stopped. Review your question before sending.",
        );
      };
      try {
        current.start();
      } catch {
        cancel();
        setMessage(
          "Voice typing could not start. Check microphone access and try again.",
        );
      }
    },
    [cancel],
  );
  return { supported, listening, message, setMessage, cancel, toggle };
}
