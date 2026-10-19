"use client";

import React, { useEffect, useState } from "react";
import { SHOPPING_WORDS, THINKING_GLYPHS } from "../../constants";
import { SepiloAvatar } from "./SepiloAvatar";

export function ChatThinking() {
  const [word, setWord] = useState(() => Math.floor(Math.random() * SHOPPING_WORDS.length));
  const [glyph, setGlyph] = useState(0);

  useEffect(() => {
    const g = setInterval(() => setGlyph((i) => (i + 1) % THINKING_GLYPHS.length), 120);
    const w = setInterval(() => setWord((i) => (i + 1 + Math.floor(Math.random() * 3)) % SHOPPING_WORDS.length), 2400);
    return () => {
      clearInterval(g);
      clearInterval(w);
    };
  }, []);

  return (
    <div className="flex gap-3">
      <SepiloAvatar />
      <div className="flex items-center gap-2 pt-1.5 text-sm" role="status" aria-label="Sepilo is searching stores">
        <span aria-hidden className="w-4 text-center text-base leading-none text-blue-400">
          {THINKING_GLYPHS[glyph]}
        </span>
        <span aria-hidden className="shimmer-text">{SHOPPING_WORDS[word]}…</span>
      </div>
    </div>
  );
}
