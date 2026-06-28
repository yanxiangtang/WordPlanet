type FeedbackKind = "correct" | "wrong" | "complete";

function vibrate(pattern: number | number[]) {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  navigator.vibrate(pattern);
}

function playTone(frequency: number, duration: number, type: OscillatorType) {
  if (typeof window === "undefined") return;
  const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;

  const audio = new AudioContextCtor();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + duration);
  window.setTimeout(() => void audio.close(), Math.ceil((duration + 0.05) * 1000));
}

export function playFeedback(kind: FeedbackKind): void {
  try {
    if (kind === "correct") {
      vibrate(45);
      playTone(740, 0.14, "sine");
      return;
    }
    if (kind === "wrong") {
      vibrate([25, 30, 25]);
      playTone(220, 0.16, "triangle");
      return;
    }
    vibrate([35, 25, 60]);
    playTone(520, 0.12, "sine");
    window.setTimeout(() => playTone(820, 0.16, "sine"), 90);
  } catch {
    // Audio/vibration can be blocked by browser gesture policies.
  }
}
