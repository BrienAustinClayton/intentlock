"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Loader2, ShieldPlus } from "lucide-react";
import { PERIOD_TEXT, ruleName } from "../../constants";
import { ChatRuleOption } from "../../types";

const money = (v: string, currency: string) => `${currency === "USD" ? "$" : `${currency} `}${Number(v).toFixed(2)}`;

interface ChatRulePickerProps {
  options: ChatRuleOption[];
  selected: string | null;
  busy: boolean;
  onPick: (ruleId: string | null) => void;
}

export function ChatRulePicker({ options, selected, busy, onPick }: ChatRulePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((r) => r.id === selected);
  const label = current
    ? ruleName(current)
    : options.length > 1
    ? "All spending rules"
    : options.length
    ? ruleName(options[0])
    : "No spending rule yet";
  const pick = (id: string | null) => {
    setOpen(false);
    if (id !== selected) onPick(id);
  };
  const item = "w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-fg/6 transition";
  const tick = (on: boolean) => <Check className={`w-4 h-4 mt-0.5 shrink-0 ${on ? "text-blue-400" : "invisible"}`} strokeWidth={2} />;

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Spending rule"
        className={`flex items-center gap-1 max-w-[60vw] sm:max-w-sm h-8 pl-3.5 pr-2.5 rounded-full text-[13px] font-medium text-fg-2 hover:text-fg transition ${
          open ? "bg-fg/12 text-fg" : "bg-fg/7 hover:bg-fg/10"
        }`}
      >
        <span className="truncate">{label}</span>
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-fg-dim" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 shrink-0 text-fg-dim" strokeWidth={1.8} />
        )}
      </button>
      {open && (
        <div role="menu" className="popover absolute left-0 bottom-full mb-2 w-80 max-w-[calc(100vw-2rem)] p-1.5 z-50">
          <div className="px-2.5 pt-2 pb-1.5 text-[11px] font-medium text-fg-dim">Shop under</div>
          <div className="max-h-[50vh] overflow-y-auto">
            {options.length > 1 && (
              <button type="button" role="menuitemradio" aria-checked={selected === null} onClick={() => pick(null)} className={item}>
                {tick(selected === null)}
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-fg">All spending rules</span>
                  <span className="block text-xs text-fg-dim">Any of your {options.length} rules can cover an order</span>
                </span>
              </button>
            )}
            {options.map((r) => {
              const on = r.id === selected || options.length === 1;
              return (
                <button key={r.id} type="button" role="menuitemradio" aria-checked={on} onClick={() => pick(r.id)} className={item}>
                  {tick(on)}
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-fg truncate">{ruleName(r)}</span>
                    <span className="block text-xs text-fg-dim">
                      {r.merchants.includes("*") ? "Any store" : r.merchants.join(", ")} · {money(r.remaining, r.currency)} left of{" "}
                      {money(r.budget, r.currency)} {PERIOD_TEXT[r.period] ?? ""}
                    </span>
                  </span>
                </button>
              );
            })}
            {options.length === 0 && <p className="px-2.5 py-2 text-xs text-fg-dim">You have no active spending rule yet.</p>}
          </div>
          <div className="h-px bg-line mx-1 my-1" />
          <Link href="/rules?new=1" role="menuitem" onClick={() => setOpen(false)} className={`${item} items-center text-[13px] text-fg-2 hover:text-fg`}>
            <ShieldPlus className="w-4 h-4 text-fg-dim" strokeWidth={1.8} />
            Create spending rule
          </Link>
        </div>
      )}
    </div>
  );
}
