"use client";

import { signOut } from "@/lib/useMe";

export default function AuthFrame({
  children,
  step,
  showSignOut = false,
  wide = false,
}: {
  children: React.ReactNode;
  step?: { current: number; total: number; label: string };
  showSignOut?: boolean;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between h-16 px-6 sm:px-10">
        <span className="text-[15px] font-semibold tracking-tight text-fg">IntentLock</span>
        {showSignOut && (
          <button type="button" onClick={signOut} className="text-[13px] text-fg-dim hover:text-fg transition">
            Sign out
          </button>
        )}
      </header>
      <main className="flex-1 flex items-start sm:items-center justify-center px-4 pb-16 pt-6">
        <div className={`w-full ${wide ? "max-w-xl" : "max-w-sm"}`}>
          {step && (
            <div className="mb-6">
              <div className="flex items-center justify-between text-xs text-fg-dim mb-2">
                <span>{step.label}</span>
                <span>
                  Step {step.current} of {step.total}
                </span>
              </div>
              <div className="h-1 rounded-full bg-fg/[0.07] overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${(step.current / step.total) * 100}%` }}
                />
              </div>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[13px] font-medium text-fg-2">{label}</span>
      {children}
      {hint && <span className="block text-xs text-fg-dim">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full h-11 rounded-xl bg-input border border-line px-3.5 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-blue-500/60 focus:ring-4 focus:ring-blue-500/10 transition";

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-[13px] text-rose-400">
      {message}
    </p>
  );
}

export function OptionCard({
  selected,
  onClick,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full text-left rounded-xl px-4 py-3 border transition ${
        selected
          ? "border-blue-500 bg-blue-500/[0.14] shadow-[0_0_0_3px_rgba(99,102,241,0.16)]"
          : "border-line bg-input hover:border-fg/20"
      }`}
    >
      <span className="block text-sm font-medium text-fg">{title}</span>
      {description && <span className="block mt-0.5 text-xs text-fg-muted">{description}</span>}
    </button>
  );
}

export function Chip({ selected, onClick, label }: { selected: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`h-9 px-3.5 rounded-[10px] text-[13px] font-medium border transition ${
        selected
          ? "border-blue-500 bg-blue-500/[0.2] text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          : "border-line bg-input text-fg-muted hover:text-fg hover:border-fg/20"
      }`}
    >
      {label}
    </button>
  );
}
