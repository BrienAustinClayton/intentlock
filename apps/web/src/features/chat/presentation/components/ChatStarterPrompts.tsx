import React from "react";

interface ChatStarterPromptsProps {
  prompts: string[];
  onPick: (prompt: string) => void;
}

export function ChatStarterPrompts({ prompts, onPick }: ChatStarterPromptsProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:flex-wrap justify-center gap-2 max-w-2xl mx-auto">
      {prompts.map((prompt) => (
        <button key={prompt} type="button" onClick={() => onPick(prompt)} className="intentlock-btn-outline btn-sm text-left sm:text-center">
          {prompt}
        </button>
      ))}
    </div>
  );
}
