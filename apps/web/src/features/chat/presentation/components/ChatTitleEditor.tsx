"use client";

import React, { useState } from "react";
import { useDoubleTap } from "@/shared/hooks/useDoubleTap";

interface ChatTitleEditorProps {
  title: string;
  editable: boolean;
  onRename: (title: string) => Promise<unknown>;
}

export function ChatTitleEditor({ title, editable, onRename }: ChatTitleEditorProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const startEditing = () => {
    if (editable) setDraft(title);
  };
  const doubleTap = useDoubleTap(startEditing);

  const finish = (save: boolean) => {
    const next = (draft ?? "").trim();
    setDraft(null);
    if (save && next && next !== title) onRename(next).catch(() => {});
  };

  if (draft !== null) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={120}
        aria-label="Chat name"
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          const end = e.target.value.length;
          e.target.setSelectionRange(end, end);
        }}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            finish(true);
          } else if (e.key === "Escape") {
            finish(false);
          }
        }}
        className="input-bare w-full min-w-0 bg-transparent p-0 text-sm font-semibold text-fg caret-blue-400 border-b border-blue-500/60"
      />
    );
  }

  return (
    <div
      {...doubleTap}
      title={editable ? "Double-tap to rename" : undefined}
      className={`text-sm font-semibold text-fg truncate select-none ${editable ? "cursor-text" : ""}`}
    >
      {title}
    </div>
  );
}
