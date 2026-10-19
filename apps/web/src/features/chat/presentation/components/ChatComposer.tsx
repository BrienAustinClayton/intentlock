"use client";

import React, { useEffect } from "react";
import { ArrowUp, ImageOff, Loader2 } from "lucide-react";
import { ChatCartState, ChatRuleOption } from "../../types";
import { ChatRulePicker } from "./ChatRulePicker";

interface ChatComposerProps {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isSending: boolean;
  notice: { tone: "error" | "info"; text: string } | null;
  cart: ChatCartState;
  onOpenCart: () => void;
  ruleOptions: ChatRuleOption[];
  ruleId: string | null;
  isSettingRule: boolean;
  onPickRule: (ruleId: string | null) => void;
}

const MAX_INPUT_HEIGHT = 140;

function Thumb({ src }: { src: string | null }) {
  return (
    <div className="h-9 w-9 rounded-lg p-1 ring-2 ring-input bg-white flex items-center justify-center overflow-hidden">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain" />
      ) : (
        <ImageOff className="w-4 h-4 text-gray-300" strokeWidth={1.5} />
      )}
    </div>
  );
}

export function ChatComposer(props: ChatComposerProps) {
  const { inputRef, value, onChange, onSend, isSending, notice, cart, onOpenCart } = props;

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [value, inputRef]);

  const canSend = Boolean(value.trim()) && !isSending;
  const money = `${cart.currency === "USD" ? "$" : `${cart.currency} `}${Number(cart.total).toFixed(2)}`;

  return (
    <div className="shrink-0 border-t border-line bg-canvas px-3 sm:px-6 pt-2 sm:pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <form
        className="mx-auto w-full max-w-4xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) onSend();
        }}
      >
        {notice && (
          <p role={notice.tone === "error" ? "alert" : "status"} className={`mb-2 text-sm ${notice.tone === "error" ? "text-rose-400" : "text-amber-400"}`}>
            {notice.text}
          </p>
        )}
        {cart.count > 0 && (
          <button
            type="button"
            onClick={onOpenCart}
            className="mb-2 w-full flex items-center gap-3 rounded-2xl border border-line bg-input px-2.5 py-1.5 sm:py-2 text-left hover:border-blue-500/40 transition"
          >
            <span className="flex -space-x-2 shrink-0">
              {cart.items.slice(0, 3).map((line) => (
                <Thumb key={line.product_id} src={line.image} />
              ))}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-fg truncate">
                {cart.count} item{cart.count === 1 ? "" : "s"} · {money}
              </span>
              <span className={`block text-xs truncate ${cart.issues.length ? "text-amber-400" : "text-fg-dim"}`}>
                {cart.issues.length ? "Needs a look before you approve" : "Nothing is bought until you approve"}
              </span>
            </span>
            <span className="intentlock-btn-primary btn-sm shrink-0">Review</span>
          </button>
        )}
        <div className="rounded-3xl border border-line bg-input p-1.5 sm:p-2 focus-within:border-blue-500/60 focus-within:ring-4 focus-within:ring-blue-500/10 transition">
          <textarea
            ref={inputRef}
            rows={1}
            value={value}
            maxLength={1000}
            enterKeyHint="send"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (canSend) onSend();
              }
            }}
            placeholder="Ask Sepilo to find something…"
            className="input-bare block w-full resize-none bg-transparent px-2.5 pt-1.5 pb-1.5 text-[16px] sm:text-sm text-fg placeholder:text-fg-dim"
          />
          <div className="flex items-center justify-between gap-2">
            <ChatRulePicker options={props.ruleOptions} selected={props.ruleId} busy={props.isSettingRule} onPick={props.onPickRule} />
            <button
              type="submit"
              disabled={!canSend}
              className="intentlock-btn-primary p-0! w-9 h-9 rounded-full! shrink-0"
              aria-label={isSending ? "Sending" : "Send"}
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" strokeWidth={2} />}
            </button>
          </div>
        </div>
        <p className="mt-2 hidden sm:block text-center text-[11px] text-fg-dim">
          Sepilo only suggests what your spending rules allow, and buys nothing until you approve your cart.
        </p>
      </form>
    </div>
  );
}
