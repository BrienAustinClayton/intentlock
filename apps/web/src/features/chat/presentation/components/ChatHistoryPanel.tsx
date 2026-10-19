"use client";

import React from "react";
import Link from "next/link";
import { LayoutGrid, SquarePen, Trash2 } from "lucide-react";
import { ChatSummaryItem, HistoryPanelProps } from "../../componentTypes";
import { ChatHistorySkeleton } from "./ChatThreadSkeleton";
import ProfileMenu from "@/components/ProfileMenu";
import { Button } from "@/shared/presentation/components/Button";
import { ButtonVariantEnum } from "@/shared/enums";

export function ChatHistoryPanel({
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onOpenAppMenu,
  isLoading = false,
}: HistoryPanelProps) {
  const hasNoChats = !isLoading && chats.length === 0;

  return (
    <>
      <div className="flex items-center justify-between h-14 px-4">
        <Link href="/" className="pl-1 text-[15px] font-semibold tracking-tight text-fg">
          Sepilo
        </Link>
      </div>

      <div className="px-3 pb-3">
        <Button
          variant={ButtonVariantEnum.Outline}
          onClick={onNewChat}
          className="w-full"
        >
          <SquarePen className="w-4 h-4" strokeWidth={1.8} />
          New chat
        </Button>
      </div>

      <div className="px-4 pb-1 text-[11px] font-medium text-fg-dim">History</div>

      <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {isLoading && <ChatHistorySkeleton />}
        {hasNoChats && (
          <p className="px-2 py-3 text-xs text-fg-dim">Your conversations will appear here.</p>
        )}

        {chats.map((chat: ChatSummaryItem) => {
          const isActive = chat.id === activeChatId;

          return (
            <div
              key={chat.id}
              className={`group flex items-start gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition ${
                isActive ? "nav-item-active" : "hover:bg-fg/4"
              }`}
              onClick={() => onSelectChat(chat.id)}
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-fg truncate">{chat.title}</div>
                <div className="text-xs text-fg-dim truncate">{chat.preview}</div>
              </div>

              <button
                type="button"
                aria-label="Delete chat"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteChat(chat.id);
                }}
                className="lg:opacity-0 lg:group-hover:opacity-100 p-1 rounded-md text-fg-dim hover:text-rose-400 transition"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
              </button>
            </div>
          );
        })}
      </nav>

      <div className="p-3 space-y-1 sidebar-edge-top">
        <button
          type="button"
          onClick={onOpenAppMenu}
          className="w-full flex items-center gap-3 h-10 px-3 rounded-[10px] text-[13px] font-medium text-fg-muted hover:text-fg hover:bg-fg/4 transition"
        >
          <LayoutGrid className="w-4 h-4 text-fg-dim" strokeWidth={1.8} />
          App menu
        </button>
        <ProfileMenu collapsed={false} />
      </div>
    </>
  );
}
