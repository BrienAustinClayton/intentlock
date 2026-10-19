"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { SelectOption, SelectProps } from "@/shared/componentTypes";

const MENU_SPACE_PX = 280;

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
  searchable = false,
  className = "",
  buttonClassName = "h-10",
  ariaLabel,
  id,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();

  const selected = options.find((option) => option.value === value) ?? null;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((option) => option.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const openMenu = () => {
    if (disabled) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    setOpenUp(Boolean(rect && window.innerHeight - rect.bottom < MENU_SPACE_PX && rect.top > window.innerHeight - rect.bottom));
    setQuery("");
    setActive(Math.max(options.findIndex((option) => option.value === value), 0));
    setOpen(true);
  };

  const close = (focusButton = true) => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  };

  const choose = (option: SelectOption) => {
    onChange(option.value);
    close();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (searchable) searchRef.current?.focus();
    else listRef.current?.focus();
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, visible.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(visible.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = visible[active];
      if (option) choose(option);
    } else if (!searchable && event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      const now = event.timeStamp;
      typed.current = { text: now - typed.current.at < 700 ? typed.current.text + event.key.toLowerCase() : event.key.toLowerCase(), at: now };
      const match = visible.findIndex((option) => option.label.toLowerCase().startsWith(typed.current.text));
      if (match >= 0) setActive(match);
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => (open ? close(false) : openMenu())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        className={`saas-input ${buttonClassName} w-full flex items-center justify-between gap-2 text-left disabled:opacity-50 ${
          open ? "border-blue-500/60 ring-4 ring-blue-500/10" : ""
        }`}
      >
        <span className={`truncate ${selected ? "text-fg" : "text-fg-dim"}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-fg-dim transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={1.8} />
      </button>

      {open && (
        <div className={`popover absolute left-0 right-0 z-50 p-1.5 ${openUp ? "bottom-full mb-1.5" : "top-full mt-1.5"}`}>
          {searchable && (
            <div className="flex items-center gap-2 px-2.5 pb-1.5 mb-1 border-b border-line">
              <Search className="w-3.5 h-3.5 shrink-0 text-fg-dim" strokeWidth={1.8} />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                placeholder="Search…"
                aria-label="Search options"
                className="input-bare w-full bg-transparent py-1.5 text-[16px] sm:text-[13px] text-fg placeholder:text-fg-dim"
              />
            </div>
          )}
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={visible[active] ? `${listId}-${active}` : undefined}
            className="max-h-64 overflow-y-auto outline-none"
          >
            {visible.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <li
                  key={option.value}
                  id={`${listId}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(option)}
                  className={`flex items-start gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer text-[13px] transition ${
                    index === active ? "bg-fg/6 text-fg" : "text-fg-2"
                  }`}
                >
                  <Check className={`w-4 h-4 mt-px shrink-0 ${isSelected ? "text-blue-400" : "invisible"}`} strokeWidth={2} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{option.label}</span>
                    {option.description && <span className="block text-xs text-fg-dim">{option.description}</span>}
                  </span>
                </li>
              );
            })}
            {visible.length === 0 && <li className="px-2.5 py-2 text-xs text-fg-dim">No matches</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
