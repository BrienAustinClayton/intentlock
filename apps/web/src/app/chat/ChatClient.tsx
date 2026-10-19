"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  ExternalLink,
  History,
  ImageOff,
  LayoutGrid,
  Loader2,
  Minus,
  Plus,
  ShieldCheck,
  ShieldPlus,
  ShoppingCart,
  SquarePen,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import ProfileMenu from "@/components/ProfileMenu";
import { NavDrawer } from "@/components/Sidebar";
import { OrderStatusTag, Tag, categoryName, money, when } from "@/components/ui";
import {
  me,
  type Cart,
  type ChatMessage,
  type ChatProduct,
  type ChatRule,
  type ChatSummary,
  type ChatThread,
} from "@/lib/me";

const PROMPTS: Record<string, string[]> = {
  electronics: ["A USB-C to USB-C cable, about 1 m, under $20", "Wireless earbuds under $50"],
  "home-garden": ["A stainless steel water bottle under $25", "Microfiber cleaning cloths, pack of 12"],
  "health-beauty": ["Unscented shampoo under $15", "SPF 50 sunscreen"],
  "baby-toddler": ["Unscented baby wipes", "A silicone baby bib set"],
  "animals-pet-supplies": ["Durable chew toys for a medium dog", "Cat litter under $20"],
  "office-supplies": ["Gel pens, pack of 12", "A4 notebooks, set of 3"],
  "toys-games": ["A 500-piece jigsaw puzzle", "A beginner LEGO set under $30"],
  "apparel-accessories": ["Running socks, 3 pairs", "A plain black cap"],
};
const DEFAULT_PROMPTS = ["A USB-C to USB-C cable under $20", "Wireless earbuds under $50", "A stainless steel water bottle"];
const EMPTY_CART: Cart = { items: [], total: "0.00", count: 0, currency: "USD", stores: 0, issues: [] };

function promptsFor(rules: ChatRule[]): string[] {
  const out: string[] = [];
  for (const r of rules) for (const c of r.categories) for (const p of PROMPTS[c] ?? []) if (!out.includes(p)) out.push(p);
  return (out.length ? out : DEFAULT_PROMPTS).slice(0, 4);
}

function ruleName(r: ChatRule): string {
  const cats = r.categories.map(categoryName);
  return cats.length > 2 ? `${cats.slice(0, 2).join(", ")} +${cats.length - 2}` : cats.join(", ");
}

const PERIOD_TEXT: Record<ChatRule["period"], string> = { month: "a month", week: "a week", once: "once" };

/** Picks the spending rule a chat shops under, like a model switcher; ends with a link to create a new rule. */
function RulePicker({
  options,
  selected,
  busy,
  onPick,
}: {
  options: ChatRule[];
  selected: string | null;
  busy: boolean;
  onPick: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.filter((r) => r.id === selected);
  const label = current.length
    ? ruleName(current[0])
    : options.length > 1
      ? "All spending rules"
      : options.length
        ? ruleName(options[0])
        : "No spending rule yet";
  const pick = (id: string | null) => {
    setOpen(false);
    if (id !== selected) onPick(id);
  };
  const item = "w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-fg/[0.06] transition";
  const tick = (on: boolean) => <Check className={`w-4 h-4 mt-0.5 shrink-0 ${on ? "text-blue-400" : "invisible"}`} strokeWidth={2} />;

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Spending rule"
        className={`flex items-center gap-1.5 max-w-[62vw] sm:max-w-sm h-9 px-3 rounded-full text-[13px] text-fg-2 hover:text-fg hover:bg-fg/[0.06] transition ${open ? "bg-fg/[0.06] text-fg" : ""}`}
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
        ) : (
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" strokeWidth={1.8} />
        )}
        <span className="truncate">{label}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-fg-dim" strokeWidth={1.8} />
      </button>
      {open && (
        <div role="menu" className="popover absolute left-0 bottom-full mb-2 w-80 max-w-[calc(100vw-2rem)] p-1.5 z-50">
          <div className="px-2.5 pt-2 pb-1.5 text-[11px] font-medium text-fg-dim">Shop under</div>
          <div className="max-h-[60vh] overflow-y-auto">
            {options.length > 1 && (
              <button type="button" role="menuitemradio" aria-checked={selected === null} onClick={() => pick(null)} className={item}>
                {tick(selected === null)}
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-fg">All spending rules</span>
                  <span className="block text-xs text-fg-dim">Any of your {options.length} rules can cover an order</span>
                </span>
              </button>
            )}
            {options.map((r) => (
              <button
                key={r.id}
                type="button"
                role="menuitemradio"
                aria-checked={r.id === selected || options.length === 1}
                onClick={() => pick(r.id)}
                className={item}
              >
                {tick(r.id === selected || options.length === 1)}
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-fg truncate">{ruleName(r)}</span>
                  <span className="block text-xs text-fg-dim">
                    {r.merchants.includes("*") ? "Any store" : r.merchants.join(", ")} · {money(r.remaining, r.currency)} left of{" "}
                    {money(r.budget, r.currency)} {PERIOD_TEXT[r.period]}
                  </span>
                </span>
              </button>
            ))}
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

function Thumb({ src, className }: { src: string | null; className: string }) {
  return (
    <div className={`bg-white flex items-center justify-center overflow-hidden ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain" />
      ) : (
        <ImageOff className="w-5 h-5 text-gray-300" strokeWidth={1.5} />
      )}
    </div>
  );
}

function ProductCard({
  p,
  inCart,
  adding,
  onAdd,
}: {
  p: ChatProduct;
  inCart: number;
  adding: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="saas-card flex sm:flex-col overflow-hidden">
      <Thumb src={p.image} className="w-24 shrink-0 sm:w-auto sm:h-36 p-2 sm:p-3" />
      <div className="flex-1 min-w-0 flex flex-col gap-1.5 sm:gap-2 p-3">
        <div className="text-sm font-medium text-fg line-clamp-2 leading-snug">{p.title}</div>
        <div className="text-xs text-fg-dim truncate">
          {p.brand ? `${p.brand} · ` : ""}
          {p.merchant}
        </div>
        <div className="hidden sm:block">
          <Tag>{p.category_title ?? categoryName(p.category)}</Tag>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1 min-w-0">
          <span className="text-[15px] sm:text-base font-semibold tabular-nums truncate">{money(p.price, p.currency)}</span>
          <div className="flex items-center gap-1 shrink-0">
            {p.url && (
              <a href={p.url} target="_blank" rel="noreferrer" className="btn-ghost btn-sm !px-2" aria-label="View in store">
                <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.8} />
              </a>
            )}
            <button
              type="button"
              onClick={onAdd}
              disabled={adding}
              aria-label={inCart ? `In cart, ${inCart}. Add one more` : "Add to cart"}
              className={`btn-sm whitespace-nowrap !px-2.5 sm:!px-3 ${inCart ? "intentlock-btn-outline" : "intentlock-btn-primary"}`}
            >
              {adding ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : inCart ? (
                <Check className="w-3.5 h-3.5" strokeWidth={2} />
              ) : (
                <ShoppingCart className="w-3.5 h-3.5" strokeWidth={1.8} />
              )}
              {inCart ? (
                <span className="tabular-nums">
                  <span className="hidden sm:inline">In cart · </span>
                  {inCart}
                </span>
              ) : (
                <span className="hidden sm:inline">Add to cart</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PurchaseStatus({ m }: { m: ChatMessage }) {
  const run = m.run!;
  return (
    <div className="saas-card px-4 py-3 space-y-2 max-w-xl">
      <div className="flex items-center gap-2 flex-wrap">
        {run.status === "running" ? (
          <Tag tone="brand">
            <Loader2 className="w-3 h-3 animate-spin" />
            Buying and checking
          </Tag>
        ) : run.status === "ordered" && run.order_status ? (
          <OrderStatusTag status={run.order_status} />
        ) : (
          <Tag tone="danger">Couldn&apos;t buy</Tag>
        )}
        {run.order_id && (
          <Link href={`/orders/${run.order_id}`} className="text-xs text-blue-400 hover:text-blue-300">
            View order
          </Link>
        )}
      </div>
      <p className="text-sm text-fg-2">{run.status === "running" ? m.content : run.summary ?? m.content}</p>
    </div>
  );
}

const Avatar = () => (
  <span className="hidden sm:flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-[13px] font-semibold text-blue-400">
    S
  </span>
);

function Message({
  m,
  cart,
  adding,
  onAdd,
}: {
  m: ChatMessage;
  cart: Cart;
  adding: string | null;
  onAdd: (m: ChatMessage, p: ChatProduct) => void;
}) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] sm:max-w-[75%] rounded-3xl bg-fg/[0.07] px-4 py-2.5 text-[15px] sm:text-sm leading-relaxed text-fg whitespace-pre-wrap break-words">
          {m.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <Avatar />
      <div className="min-w-0 flex-1 space-y-3 sm:pt-1">
        {m.run ? <PurchaseStatus m={m} /> : <p className="text-[15px] sm:text-sm text-fg-2 leading-relaxed whitespace-pre-wrap">{m.content}</p>}
        {m.products.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {m.products.map((p) => (
              <ProductCard
                key={p.product_id}
                p={p}
                inCart={cart.items.find((l) => l.product_id === p.product_id)?.qty ?? 0}
                adding={adding === `${m.id}:${p.product_id}`}
                onAdd={() => onAdd(m, p)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const SHOPPING_WORDS = [
  "Rummaging", "Window-shopping", "Haggling", "Bargain-hunting", "Combing the aisles", "Finagling",
  "Coupon-clipping", "Price-sleuthing", "Shelf-scouring", "Sniffing out deals", "Wrangling carts", "Whooping",
  "Squinting at price tags", "Checking your rules",
];
const GLYPHS = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];

function Typing() {
  const [word, setWord] = useState(() => Math.floor(Math.random() * SHOPPING_WORDS.length));
  const [glyph, setGlyph] = useState(0);
  useEffect(() => {
    const g = setInterval(() => setGlyph((i) => (i + 1) % GLYPHS.length), 120);
    const w = setInterval(() => setWord((i) => (i + 1 + Math.floor(Math.random() * 3)) % SHOPPING_WORDS.length), 2400);
    return () => {
      clearInterval(g);
      clearInterval(w);
    };
  }, []);
  return (
    <div className="flex gap-3">
      <Avatar />
      <div className="flex items-center gap-2 pt-1.5 text-sm" role="status" aria-label="Sepilo is searching stores">
        <span aria-hidden className="w-4 text-center text-base leading-none text-blue-400">
          {GLYPHS[glyph]}
        </span>
        <span aria-hidden className="shimmer-text">{SHOPPING_WORDS[word]}…</span>
      </div>
    </div>
  );
}

function HistoryPanel({
  chats,
  activeId,
  onOpen,
  onNew,
  onDelete,
  onMenu,
}: {
  chats: ChatSummary[] | null;
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onMenu: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between h-14 px-4">
        <Link href="/" className="pl-1 text-[15px] font-semibold tracking-tight text-fg">
          Sepilo
        </Link>
      </div>
      <div className="px-3 pb-3">
        <button type="button" onClick={onNew} className="intentlock-btn-outline w-full">
          <SquarePen className="w-4 h-4" strokeWidth={1.8} />
          New chat
        </button>
      </div>
      <div className="px-4 pb-1 text-[11px] font-medium text-fg-dim">History</div>
      <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {chats?.length === 0 && <p className="px-2 py-3 text-xs text-fg-dim">Your conversations will appear here.</p>}
        {(chats ?? []).map((c) => (
          <div
            key={c.id}
            className={`group flex items-start gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition ${
              c.id === activeId ? "nav-item-active" : "hover:bg-fg/[0.04]"
            }`}
            onClick={() => onOpen(c.id)}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-fg truncate">{c.title}</div>
              <div className="text-xs text-fg-dim truncate">{c.preview || when(c.updated_at)}</div>
            </div>
            <button
              type="button"
              aria-label="Delete chat"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(c.id);
              }}
              className="lg:opacity-0 lg:group-hover:opacity-100 p-1 rounded-md text-fg-dim hover:text-rose-400 transition"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
            </button>
          </div>
        ))}
      </nav>
      <div className="p-3 space-y-1 sidebar-edge-top">
        <button
          type="button"
          onClick={onMenu}
          className="w-full flex items-center gap-3 h-10 px-3 rounded-[10px] text-[13px] font-medium text-fg-muted hover:text-fg hover:bg-fg/[0.04] transition"
        >
          <LayoutGrid className="w-4 h-4 text-fg-dim" strokeWidth={1.8} />
          App menu
        </button>
        <ProfileMenu collapsed={false} />
      </div>
    </>
  );
}

function CartSheet({
  open,
  cart,
  busy,
  error,
  onClose,
  onQty,
  onApprove,
}: {
  open: boolean;
  cart: Cart;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onQty: (productId: string, qty: number) => void;
  onApprove: () => void;
}) {
  const stores = [...new Set(cart.items.map((l) => l.merchant))];
  const [drag, setDrag] = useState<{ start: number; dy: number } | null>(null);
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => setDrag({ start: e.touches[0].clientY, dy: 0 }),
    onTouchMove: (e: React.TouchEvent) => drag && setDrag({ ...drag, dy: Math.max(0, e.touches[0].clientY - drag.start) }),
    onTouchEnd: () => {
      if (drag && drag.dy > 90) onClose();
      setDrag(null);
    },
  };
  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <button
        type="button"
        aria-label="Close cart"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Cart"
        className={`popover !rounded-b-none sm:!rounded-none absolute inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[420px] flex flex-col transition-transform duration-200 ${
          open ? "translate-y-0 sm:translate-x-0" : "translate-y-full sm:translate-y-0 sm:translate-x-full"
        } ${drag?.dy ? "!transition-none" : ""}`}
        style={drag?.dy ? { transform: `translateY(${drag.dy}px)` } : undefined}
      >
        <div {...swipe} className="sm:hidden flex justify-center pt-2.5 pb-1 touch-none" aria-hidden>
          <span className="h-1.5 w-10 rounded-full bg-fg/20" />
        </div>
        <div {...swipe} className="flex items-center justify-between px-5 h-12 sm:h-14 border-b border-line shrink-0 touch-none sm:touch-auto">
          <div className="text-sm font-semibold">
            Cart <span className="text-fg-dim font-normal">· {cart.count} item{cart.count === 1 ? "" : "s"}</span>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-fg-dim hover:text-fg hover:bg-fg/5" aria-label="Close cart">
            <X className="w-4 h-4" strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {cart.items.length === 0 && (
            <div className="py-10 text-center text-sm text-fg-muted">
              <ShoppingCart className="w-6 h-6 mx-auto mb-3 text-fg-dim" strokeWidth={1.8} />
              Your cart is empty. Add products from the chat.
            </div>
          )}
          {stores.map((store) => (
            <div key={store} className="space-y-3">
              <div className="text-xs font-medium text-fg-dim">{store}</div>
              {cart.items
                .filter((l) => l.merchant === store)
                .map((l) => (
                  <div key={l.product_id} className="flex gap-3">
                    <Thumb src={l.image} className="h-16 w-16 shrink-0 rounded-lg p-1.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-fg line-clamp-2 leading-snug">{l.title}</div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <div className="inline-flex items-center rounded-lg border border-line">
                          <button
                            type="button"
                            onClick={() => onQty(l.product_id, l.qty - 1)}
                            disabled={busy}
                            className="p-1.5 text-fg-muted hover:text-fg disabled:opacity-50"
                            aria-label={l.qty === 1 ? "Remove" : "Decrease quantity"}
                          >
                            {l.qty === 1 ? <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} /> : <Minus className="w-3.5 h-3.5" strokeWidth={2} />}
                          </button>
                          <span className="min-w-6 text-center text-sm tabular-nums">{l.qty}</span>
                          <button
                            type="button"
                            onClick={() => onQty(l.product_id, l.qty + 1)}
                            disabled={busy || l.qty >= 20}
                            className="p-1.5 text-fg-muted hover:text-fg disabled:opacity-50"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                          </button>
                        </div>
                        <span className="text-sm font-medium tabular-nums">{money(Number(l.price) * l.qty, l.currency)}</span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          ))}
          {cart.issues.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-1.5">
              {cart.issues.map((i) => (
                <p key={i} className="flex gap-2 text-xs text-amber-400">
                  <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={1.8} />
                  {i}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-line px-5 py-4 space-y-3 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between">
            <span className="text-sm text-fg-muted">Total</span>
            <span className="text-lg font-semibold tabular-nums">{money(cart.total, cart.currency)}</span>
          </div>
          <p className="text-xs text-fg-dim">
            {cart.stores > 1 ? `Sepilo places one order per store (${cart.stores} stores). ` : ""}
            Each order is checked against what you asked for and your spending rules before PayPal pays.
          </p>
          {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="intentlock-btn-outline flex-1">
              Keep shopping
            </button>
            <button
              type="button"
              onClick={onApprove}
              disabled={busy || cart.items.length === 0 || cart.issues.length > 0}
              className="intentlock-btn-primary flex-[1.4]"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Approve and buy
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default function ChatClient() {
  const router = useRouter();
  const params = useSearchParams();
  const activeId = params.get("c");

  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [myRules, setMyRules] = useState<(ChatRule & { agent_id: string })[]>([]);
  const [pendingRule, setPendingRule] = useState<string | null>(null);
  const [ruleBusy, setRuleBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [history, setHistory] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartBusy, setCartBusy] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const tmpSeq = useRef(0);

  const open = useCallback(
    (id: string | null) => {
      setHistory(false);
      router.replace(id ? `/chat?c=${id}` : "/chat");
    },
    [router],
  );

  useEffect(() => {
    me.chats().then(setChats, (e: Error) => setError(e.message));
    Promise.all([me.rules(), me.agents()]).then(
      ([rs, agents]) => {
        const hosted = new Set(agents.filter((a) => a.managed && !a.revoked_at).map((a) => a.id));
        setMyRules(
          rs
            .filter((r) => !r.revoked_at && hosted.has(r.agent_id))
            .map((r) => ({
              id: r.id, agent_id: r.agent_id, categories: r.categories, merchants: r.merchants, budget: r.budget_amount,
              remaining: r.budget_amount, period: r.budget_period, currency: r.currency,
            })),
        );
      },
      () => {},
    );
  }, []);

  useEffect(() => {
    if (!activeId) return;
    let live = true;
    me.chat(activeId).then(
      (t) => live && setThread(t),
      () => live && open(null),
    );
    return () => {
      live = false;
    };
  }, [activeId, open]);

  const view = activeId && thread?.id === activeId ? thread : null;
  const messages = view?.messages ?? [];
  const ruleOptions: ChatRule[] = view?.rule_options ?? myRules;
  const ruleId = view ? view.rule_id : myRules.some((r) => r.id === pendingRule) ? pendingRule : null;
  const picked = myRules.filter((r) => r.id === ruleId);
  const rules = view?.rules ?? (picked.length ? picked : myRules);
  const cart = view?.cart ?? EMPTY_CART;

  const running = view?.messages.some((m) => m.run?.status === "running") ?? false;
  useEffect(() => {
    if (!running || !view) return;
    const t = setInterval(() => me.chat(view.id).then(setThread, () => {}), 3000);
    return () => clearInterval(t);
  }, [running, view]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    setDraft("");
    try {
      let chatId = activeId;
      let current = view;
      if (!chatId || !current) {
        if (!chatId) {
          const created = await me.createChat(myRules.find((r) => r.id === ruleId)?.agent_id, ruleId ?? undefined);
          chatId = created.id;
          setChats((cs) => [created, ...(cs ?? [])]);
        }
        current = await me.chat(chatId);
        open(chatId);
      }
      const optimistic: ChatMessage = {
        id: `tmp-${++tmpSeq.current}`, role: "user", content, products: [], created_at: "", run: null,
      };
      setThread({ ...current, messages: [...current.messages, optimistic] });
      const out = await me.send(chatId, content);
      setThread((t) => (t ? { ...t, title: out.title, messages: [...t.messages.filter((m) => m.id !== optimistic.id), ...out.messages] } : t));
      setChats((cs) => {
        const prev = (cs ?? []).find((c) => c.id === chatId);
        const rest = (cs ?? []).filter((c) => c.id !== chatId);
        return [
          { id: chatId!, title: out.title, agent_id: current?.agent?.id ?? "", updated_at: out.messages[1]?.created_at ?? prev?.updated_at ?? "", preview: out.messages[1]?.content ?? "" },
          ...rest,
        ];
      });
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "no_hosted_agent") setBlocked(err.message);
      else setError(err.message);
      setDraft(content);
      if (activeId) me.chat(activeId).then(setThread, () => {});
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function pickRule(id: string | null) {
    if (!view) return setPendingRule(id);
    setRuleBusy(true);
    setError(null);
    try {
      setThread(await me.setChatRule(view.id, id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRuleBusy(false);
    }
  }

  async function addToCart(m: ChatMessage, p: ChatProduct) {
    if (!view || adding) return;
    setAdding(`${m.id}:${p.product_id}`);
    setError(null);
    try {
      const c = await me.addToCart(view.id, { message_id: m.id, product_id: p.product_id });
      setThread((t) => (t ? { ...t, cart: c } : t));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(null);
    }
  }

  async function setQty(productId: string, qty: number) {
    if (!view) return;
    setCartBusy(true);
    setCartError(null);
    try {
      const c = await me.setCartQty(view.id, productId, Math.max(0, qty));
      setThread((t) => (t ? { ...t, cart: c } : t));
    } catch (e) {
      setCartError((e as Error).message);
    } finally {
      setCartBusy(false);
    }
  }

  async function approve() {
    if (!view) return;
    setCartBusy(true);
    setCartError(null);
    try {
      const out = await me.checkout(view.id);
      setThread((t) => (t ? { ...t, cart: out.cart, messages: [...t.messages, ...out.messages] } : t));
      setCartOpen(false);
    } catch (e) {
      setCartError((e as Error).message);
    } finally {
      setCartBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this chat? Orders it placed stay in Orders.")) return;
    await me.deleteChat(id).catch(() => null);
    setChats((cs) => (cs ?? []).filter((c) => c.id !== id));
    if (id === activeId) open(null);
  }

  const historyProps = {
    chats,
    activeId,
    onOpen: open,
    onNew: () => open(null),
    onDelete: remove,
    onMenu: () => {
      setHistory(false);
      setMenu(true);
    },
  };

  return (
    <div className="flex h-[100dvh] min-h-0">
      <NavDrawer open={menu} onClose={() => setMenu(false)} />

      <aside className="sidebar-edge hidden lg:flex w-72 shrink-0 flex-col bg-sidebar">
        <HistoryPanel {...historyProps} />
      </aside>

      <div className={`lg:hidden fixed inset-0 z-40 ${history ? "" : "pointer-events-none"}`} aria-hidden={!history}>
        <button
          type="button"
          aria-label="Close history"
          tabIndex={history ? 0 : -1}
          onClick={() => setHistory(false)}
          className={`absolute inset-0 bg-black/50 transition-opacity ${history ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          className={`sidebar-edge absolute inset-y-0 left-0 w-80 max-w-[85vw] flex flex-col bg-sidebar transition-transform duration-200 ${
            history ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <HistoryPanel {...historyProps} />
        </aside>
      </div>

      <section className="flex-1 min-w-0 flex flex-col">
        <header className="header-edge flex items-center gap-2 px-3 sm:px-6 h-14 shrink-0">
          <button type="button" onClick={() => setHistory(true)} className="lg:hidden p-2 -ml-1 rounded-lg text-fg-muted hover:text-fg hover:bg-fg/5" aria-label="Chats">
            <History className="w-5 h-5" strokeWidth={1.8} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate">{view?.title ?? "New chat"}</div>
            <div className="text-xs text-fg-dim truncate flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
              <span className="truncate">{view?.agent?.name ?? "Your shopping agent"}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            disabled={!view}
            className="intentlock-btn-outline btn-sm relative ml-1"
            aria-label={`Cart, ${cart.count} items`}
          >
            <ShoppingCart className="w-4 h-4" strokeWidth={1.8} />
            <span className="hidden sm:inline">Cart</span>
            {cart.count > 0 && (
              <span className="min-w-5 h-5 px-1 rounded-full bg-blue-600 text-[11px] font-semibold text-white flex items-center justify-center">
                {cart.count}
              </span>
            )}
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-6 sm:py-8 space-y-6">
            {blocked ? (
              <div className="saas-card p-6 sm:p-8 text-center space-y-3">
                <Bot className="w-6 h-6 mx-auto text-fg-muted" strokeWidth={1.8} />
                <h2 className="text-base font-semibold">Create your shopping agent first</h2>
                <p className="text-sm text-fg-muted">{blocked}</p>
                <Link href="/agents" className="intentlock-btn-primary">
                  Go to Agents
                </Link>
              </div>
            ) : messages.length === 0 && !sending ? (
              <div className="pt-6 sm:pt-12 text-center space-y-6">
                <div className="space-y-2">
                  <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">What should Sepilo buy for you?</h1>
                  <p className="text-sm text-fg-muted max-w-lg mx-auto">
                    I search real stores through Channel3 and only suggest what your spending rules allow. Add what you like to
                    your cart; nothing is bought until you approve it.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row sm:flex-wrap justify-center gap-2 max-w-2xl mx-auto">
                  {promptsFor(rules).map((p) => (
                    <button key={p} type="button" onClick={() => send(p)} className="intentlock-btn-outline btn-sm">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => <Message key={m.id} m={m} cart={cart} adding={adding} onAdd={addToCart} />)
            )}
            {sending && <Typing />}
            <div ref={endRef} />
          </div>
        </div>

        <div className="shrink-0 border-t border-line px-3 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <form
            className="mx-auto w-full max-w-4xl"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            {error && <p role="alert" className="mb-2 text-sm text-rose-400">{error}</p>}
            {cart.count > 0 && (
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="mb-2 w-full flex items-center gap-3 rounded-2xl border border-line bg-input px-2.5 py-2 text-left hover:border-blue-500/40 transition"
              >
                <span className="flex -space-x-2 shrink-0">
                  {cart.items.slice(0, 3).map((l) => (
                    <Thumb key={l.product_id} src={l.image} className="h-9 w-9 rounded-lg p-1 ring-2 ring-input" />
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-fg truncate">
                    {cart.count} item{cart.count === 1 ? "" : "s"} · {money(cart.total, cart.currency)}
                  </span>
                  <span className={`block text-xs truncate ${cart.issues.length ? "text-amber-400" : "text-fg-dim"}`}>
                    {cart.issues.length ? "Needs a look before you approve" : "Nothing is bought until you approve"}
                  </span>
                </span>
                <span className="intentlock-btn-primary btn-sm shrink-0">Review</span>
              </button>
            )}
            <div className="rounded-3xl border border-line bg-input p-2 focus-within:border-blue-500/60 focus-within:ring-4 focus-within:ring-blue-500/10 transition">
              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                maxLength={1000}
                onChange={(e) => {
                  setDraft(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
                placeholder="Ask Sepilo to find something…"
                className="input-bare block w-full resize-none bg-transparent px-2.5 pt-1.5 pb-2 text-[16px] sm:text-sm text-fg placeholder:text-fg-dim"
              />
              <div className="flex items-center justify-between gap-2">
                <RulePicker options={ruleOptions} selected={ruleId} busy={ruleBusy} onPick={pickRule} />
                <button type="submit" disabled={sending || !draft.trim()} className="intentlock-btn-primary !p-0 w-9 h-9 !rounded-full shrink-0" aria-label="Send">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" strokeWidth={2} />}
                </button>
              </div>
            </div>
            <p className="mt-2 hidden sm:block text-center text-[11px] text-fg-dim">
              Sepilo only suggests what your spending rules allow, and buys nothing until you approve your cart.
            </p>
          </form>
        </div>
      </section>

      <CartSheet
        open={cartOpen}
        cart={cart}
        busy={cartBusy}
        error={cartError}
        onClose={() => setCartOpen(false)}
        onQty={setQty}
        onApprove={approve}
      />
    </div>
  );
}
