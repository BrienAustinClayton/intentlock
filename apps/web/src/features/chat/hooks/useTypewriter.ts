import { useEffect, useState } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

export function useTypewriter(text: string, enabled: boolean, charsPerTick = 3, tickMs = 16): { shown: string; done: boolean } {
  const [active] = useState(() => enabled && !prefersReducedMotion());
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      setCount((c) => {
        const next = Math.min(c + charsPerTick, text.length);
        if (next >= text.length) clearInterval(timer);
        return next;
      });
    }, tickMs);
    return () => clearInterval(timer);
  }, [active, text, charsPerTick, tickMs]);

  if (!active) return { shown: text, done: true };
  return { shown: text.slice(0, count), done: count >= text.length };
}
