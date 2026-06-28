type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

// Chrome silently wedges speechSynthesis when cancel() is called on an
// already-empty queue or before voices have loaded — subsequent speak() calls
// then queue an utterance that never fires. The helpers below cover the
// well-known footguns:
//
// 1. Only cancel() when something is actually pending/speaking. A no-op cancel
//    is what triggers the wedge.
// 2. resume() after cancel() (Chrome can leave the engine paused).
// 3. If getVoices() hasn't populated yet (Chrome loads voices async on the
//    first call), wait for the voiceschanged event before speaking.
function speakNow(synth: SpeechSynthesis, text: string, rate: number): void {
  if (synth.speaking || synth.pending) synth.cancel();
  if (synth.paused) synth.resume();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = rate;
  synth.speak(utterance);
}

export function speak(text: string, rate = 1): void {
  if (!("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;

  // First-call cold start: Chrome's getVoices() returns [] until the engine
  // boots. Speak() on a cold engine sometimes fires a silent utterance, so
  // wait one voiceschanged tick before speaking when needed.
  if (typeof synth.getVoices === "function" && synth.getVoices().length === 0) {
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      synth.removeEventListener?.("voiceschanged", fire);
      speakNow(synth, text, rate);
    };
    if (typeof synth.addEventListener === "function") {
      synth.addEventListener("voiceschanged", fire);
    }
    // Safety net: if voiceschanged never fires (some platforms don't dispatch
    // it after the first speak), try again after a short delay.
    setTimeout(fire, 250);
    return;
  }

  speakNow(synth, text, rate);
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
