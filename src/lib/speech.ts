type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function speak(text: string, rate = 1): void {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = rate;
  window.speechSynthesis.speak(utterance);
}

export function speechRecognitionSupported(): boolean {
  return "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
}

export function listenForWord(target: string): Promise<{ transcript: string; matched: boolean }> {
  const SpeechRecognitionCtor =
    (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor })
      .SpeechRecognition ??
    (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor })
      .webkitSpeechRecognition;

  if (!SpeechRecognitionCtor) {
    return Promise.reject(new Error("Speech recognition is not supported in this browser"));
  }

  return new Promise((resolve, reject) => {
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.toLowerCase().trim() ?? "";
      resolve({ transcript, matched: transcript.includes(target.toLowerCase()) });
    };
    recognition.onerror = () => reject(new Error("Could not hear the word clearly"));
    recognition.start();
  });
}
