"use client";

import React, { useState } from "react";
import { History } from "lucide-react";
import { shortRelativeTime } from "@/shared/utils/time";
import { ChatSummaryItem } from "../../componentTypes";

const DOTS = ["bg-violet-500", "bg-amber-400", "bg-sky-400", "bg-emerald-400", "bg-rose-400"];
const COLLAPSED = 3;
const EXPANDED = 10;

interface RecentConversationsProps {
  chats: ChatSummaryItem[];
  onOpen: (chatId: string) => void;
}

export function RecentConversations({ chats, onOpen }: RecentConversationsProps) {
  const [expanded, setExpanded] = useState(false);
  const started = chats.filter((chat) => Boolean(chat.preview));
  if (started.length === 0) return null;
  const shown = started.slice(0, expanded ? EXPANDED : COLLAPSED);

  return (
    <section className="w-full max-w-2xl mx-auto text-left">
      <h2 className="flex items-center gap-2.5 text-sm font-medium text-fg">
        <History className="w-4 h-4 text-fg-muted" strokeWidth={1.8} />
        Recent conversations
      </h2>
      <ul className="mt-3 ml-1.75 border-l border-line">
        {shown.map((chat, index) => (
          <li key={chat.id} className="relative">
            <span aria-hidden className="absolute left-0 top-1/2 h-px w-3 bg-line" />
            <button
              type="button"
              onClick={() => onOpen(chat.id)}
              className="group w-full flex items-center gap-3 pl-6 pr-2 py-2.5 rounded-lg text-left hover:bg-fg/4 transition"
            >
              <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOTS[index % DOTS.length]}`} />
              <span className="min-w-0 flex-1 truncate text-[15px] sm:text-sm text-fg-muted group-hover:text-fg transition">
                {chat.title}
              </span>
              <span className="shrink-0 text-xs text-fg-dim tabular-nums">{shortRelativeTime(chat.updated_at)}</span>
            </button>
          </li>
        ))}
      </ul>
      {started.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 ml-1.75 pl-4 text-[13px] font-medium text-fg-2 hover:text-fg transition"
        >
          {expanded ? "See less" : "See more…"}
        </button>
      )}
    </section>
  );
}
