"use client";

import React, { useState } from "react";
import { Check, Copy } from "lucide-react";
import { CopyAgentIdProps } from "../../componentTypes";

export function CopyAgentIdButton({ value }: CopyAgentIdProps) {
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setIsCopied(true);
      setTimeout(() => {
        setIsCopied(false);
      }, 1200);
    });
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 font-mono text-xs text-fg-2 hover:text-fg transition"
      title="Copy agent ID"
    >
      {value}
      {isCopied ? (
        <Check className="w-3.5 h-3.5 text-emerald-400" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-fg-dim" />
      )}
    </button>
  );
}
