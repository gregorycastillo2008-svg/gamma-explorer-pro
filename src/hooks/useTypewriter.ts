import { useEffect, useState } from "react";

/**
 * Typewriter that loops through `words`, typing then deleting.
 * Use as a placeholder for inputs to keep them visually alive.
 */
export function useTypewriter(words: string[], opts?: { typeMs?: number; deleteMs?: number; pauseMs?: number }) {
  const typeMs = opts?.typeMs ?? 90;
  const deleteMs = opts?.deleteMs ?? 45;
  const pauseMs = opts?.pauseMs ?? 1400;
  const [text, setText] = useState("");
  const [wordIdx, setWordIdx] = useState(0);
  const [phase, setPhase] = useState<"typing" | "pause" | "deleting">("typing");

  useEffect(() => {
    const word = words[wordIdx % words.length];
    let timeout: ReturnType<typeof setTimeout>;

    if (phase === "typing") {
      if (text.length < word.length) {
        timeout = setTimeout(() => setText(word.slice(0, text.length + 1)), typeMs);
      } else {
        timeout = setTimeout(() => setPhase("deleting"), pauseMs);
      }
    } else if (phase === "deleting") {
      if (text.length > 0) {
        timeout = setTimeout(() => setText(word.slice(0, text.length - 1)), deleteMs);
      } else {
        setWordIdx((i) => (i + 1) % words.length);
        setPhase("typing");
      }
    }
    return () => clearTimeout(timeout);
  }, [text, phase, wordIdx, words, typeMs, deleteMs, pauseMs]);

  return text;
}
