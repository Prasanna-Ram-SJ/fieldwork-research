export type SpeechResults = ArrayLike<{
  isFinal: boolean;
  [index: number]: { transcript: string };
}>;
export type BrowserRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { results: SpeechResults }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
export type RecognitionConstructor = new () => BrowserRecognition;
export function mergeDictation(base: string, results: SpeechResults): string {
  const parts: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const text = results[i]?.[0]?.transcript?.trim();
    if (text) parts.push(text);
  }
  return [base.trimEnd(), parts.join(" ")]
    .filter(Boolean)
    .join(" ")
    .slice(0, 1000);
}
export function dictationError(code: string): string {
  const messages: Record<string, string> = {
    "not-allowed":
      "Microphone permission was denied. Allow microphone access in your browser and try again.",
    "service-not-allowed":
      "Your browser does not allow its speech service here. You can still type the question.",
    "audio-capture":
      "No working microphone was found. Check your microphone and try again.",
    "no-speech": "No speech was detected. Try again or type your question.",
    network:
      "The browser’s speech service could not connect. Check your connection or type the question.",
    "language-not-supported":
      "Voice typing does not support your browser’s current language.",
  };
  return (
    messages[code] ||
    "Voice typing stopped. You can try again or type the question."
  );
}
