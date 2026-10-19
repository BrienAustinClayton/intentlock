"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  ExternalLink,
  Loader2,
  ShieldCheck,
  ImageOff,
  SquarePen,
  Trash2,
} from "lucide-react";
import { OrderStatusTag, Tag, categoryName, money, when } from "@/components/ui";
import { me, type ChatMessage, type ChatProduct, type ChatRule, type ChatSummary, type ChatThread } from "@/lib/me";

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

function promptsFor(rules: ChatRule[]): string[] {
  const out: string[] = [];
  for (const r of rules) for (const c of r.categories) for (const p of PROMPTS[c] ?? []) if (!out.includes(p)) out.push(p);
  return (out.length ? out : DEFAULT_PROMPTS).slice(0, 4);
}

function rulesLine(rules: ChatRule[]): string | null {
  if (!rules.length) return null;
  const cats = [...new Set(rules.flatMap((r) => r.categories))].map(categoryName);
  const anyStore = rules.some((r) => r.merchants.includes("*"));
  const left = rules.reduce((m, r) => Math.max(m, Number(r.remaining)), 0);
  const catText = cats.length > 2 ? `${cats.slice(0, 2).join(", ")} +${cats.length - 2}` : cats.join(", ");
  return `${catText} · ${anyStore ? "Any store" : "Selected stores"} · ${money(left, rules[0].currency)} left`;
}

function ProductCard({
  p,
  onBuy,
  busy,
  disabled,
}: {
  p: ChatProduct;
  onBuy: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  return (
    <div className="saas-card flex flex-col overflow-hidden">
      <div className="h-36 bg-white flex items-center justify-center p-3">
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain" />
        ) : (
          <ImageOff className="w-6 h-6 text-gray-300" strokeWidth={1.5} />
        )}
      </div>
      <div className="flex-1 flex flex-col gap-2 p-3">
        <div className="text-sm font-medium text-fg line-clamp-2 leading-snug">{p.title}</div>
        <div className="text-xs text-fg-dim truncate">
          {p.brand ? `${p.brand} · ` : ""}
          {p.merchant}
        </div>
        <div>
          <Tag>{p.category_title ?? categoryName(p.category)}</Tag>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="text-base font-semibold tabular-nums">{money(p.price, p.currency)}</span>
          <div className="flex items-center gap-1.5">
            {p.url && (
              <a href={p.url} target="_blank" rel="noreferrer" className="btn-ghost btn-sm" aria-label="View in store">
                <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.8} />
              </a>
            )}
            <button type="button" onClick={onBuy} disabled={disabled} className="intentlock-btn-primary btn-sm">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Buy
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

function Message({
  m,
  onBuy,
  buying,
}: {
  m: ChatMessage;
  onBuy: (m: ChatMessage, p: ChatProduct) => void;
  buying: string | null;
}) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-br-md bg-blue-600 px-4 py-2.5 text-sm text-white whitespace-pre-wrap">
          {m.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-[13px] font-semibold text-blue-400">
        S
      </span>
      <div className="min-w-0 flex-1 space-y-3 pt-1">
        {m.run ? (
          <PurchaseStatus m={m} />
        ) : (
          <p className="text-sm text-fg-2 leading-relaxed whitespace-pre-wrap">{m.content}</p>
        )}
        {m.products.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {m.products.map((p) => (
              <ProductCard
                key={p.product_id}
                p={p}
                busy={buying === `${m.id}:${p.product_id}`}
                disabled={buying !== null}
                onBuy={() => onBuy(m, p)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div className="flex gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-[13px] font-semibold text-blue-400">
        S
      </span>
      <div className="flex items-center gap-1 pt-3" aria-label="Secay is searching">
        {[0, 150, 300].map((d) => (
          <span key={d} className="h-1.5 w-1.5 rounded-full bg-fg-dim animate-bounce" style={{ animationDelay: `${d}ms` }} />
        ))}
        <span className="ml-2 text-xs text-fg-dim">Searching stores…</span>
      </div>
    </div>
  );
}

export default function ChatClient() {
  const router = useRouter();
  const params = useSearchParams();
  const activeId = params.get("c");

  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const tmpSeq = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const open = useCallback((id: string | null) => router.replace(id ? `/chat?c=${id}` : "/chat"), [router]);

  const [myRules, setMyRules] = useState<ChatRule[]>([]);

  useEffect(() => {
    me.chats().then(setChats, (e: Error) => setError(e.message));
    Promise.all([me.rules(), me.agents()]).then(
      ([rs, agents]) => {
        const hosted = new Set(agents.filter((a) => a.managed && !a.revoked_at).map((a) => a.id));
        setMyRules(
          rs
            .filter((r) => !r.revoked_at && hosted.has(r.agent_id))
            .map((r) => ({ id: r.id, categories: r.categories, merchants: r.merchants, budget: r.budget_amount,
                           remaining: r.budget_amount, period: r.budget_period, currency: r.currency })),
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

  const running = thread?.messages.some((m) => m.run?.status === "running") ?? false;
  useEffect(() => {
    if (!running || !thread) return;
    const t = setInterval(() => me.chat(thread.id).then(setThread, () => {}), 3000);
    return () => clearInterval(t);
  }, [running, thread]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread?.messages.length, sending]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    setDraft("");
    try {
      let chatId = activeId;
      let current = thread;
      if (!chatId) {
        const created = await me.createChat();
        chatId = created.id;
        setChats((cs) => [created, ...(cs ?? [])]);
        current = await me.chat(chatId);
        open(chatId);
      }
      const optimistic: ChatMessage = {
        id: `tmp-${++tmpSeq.current}`, role: "user", content, products: [], created_at: "", run: null,
      };
      setThread({ ...(current as ChatThread), messages: [...(current?.messages ?? []), optimistic] });
      const out = await me.send(chatId, content);
      setThread((t) => (t ? { ...t, title: out.title, messages: [...t.messages.filter((m) => m.id !== optimistic.id), ...out.messages] } : t));
      setChats((cs) => {
        const rest = (cs ?? []).filter((c) => c.id !== chatId);
        const prev = (cs ?? []).find((c) => c.id === chatId);
        return [{ id: chatId!, title: out.title, agent_id: current?.agent?.id ?? "", updated_at: out.messages[1]?.created_at ?? prev?.updated_at ?? "", preview: out.messages[1]?.content ?? "" }, ...rest];
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

  async function buy(m: ChatMessage, p: ChatProduct) {
    if (!thread || buying) return;
    setBuying(`${m.id}:${p.product_id}`);
    setError(null);
    try {
      const msg = await me.buy(thread.id, { message_id: m.id, product_id: p.product_id });
      setThread((t) => (t ? { ...t, messages: [...t.messages, msg] } : t));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuying(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this chat? Orders it placed stay in Orders.")) return;
    await me.deleteChat(id).catch(() => null);
    setChats((cs) => (cs ?? []).filter((c) => c.id !== id));
    if (id === activeId) open(null);
  }

  const view = activeId && thread?.id === activeId ? thread : null;
  const messages = view?.messages ?? [];
  const rules = view?.rules ?? myRules;
  const line = rulesLine(rules);

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0">
      <aside className="hidden lg:flex w-72 shrink-0 flex-col border-r border-line">
        <div className="p-3">
          <button type="button" onClick={() => open(null)} className="intentlock-btn-outline w-full">
            <SquarePen className="w-4 h-4" strokeWidth={1.8} />
            New chat
          </button>
        </div>
        <div className="px-3 pb-1 text-[11px] font-medium text-fg-dim">History</div>
        <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
          {chats?.length === 0 && <p className="px-2 py-3 text-xs text-fg-dim">Your conversations will appear here.</p>}
          {(chats ?? []).map((c) => (
            <div
              key={c.id}
              className={`group flex items-start gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition ${
                c.id === activeId ? "nav-item-active" : "hover:bg-fg/[0.04]"
              }`}
              onClick={() => open(c.id)}
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
                  remove(c.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-fg-dim hover:text-rose-400 transition"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
              </button>
            </div>
          ))}
        </nav>
      </aside>

      <section className="flex-1 min-w-0 flex flex-col">
        {view && (
          <div className="flex items-center justify-between gap-3 border-b border-line px-6 h-14 shrink-0">
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{view.title}</div>
              <div className="text-xs text-fg-dim truncate flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5" strokeWidth={1.8} />
                {view.agent?.name ?? "Agent"}
              </div>
            </div>
            <Link href="/rules" className="hidden sm:inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg transition" title="Spending rules">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.8} />
              {line ?? "No spending rule yet"}
            </Link>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="mx-auto w-full max-w-4xl px-6 py-8 space-y-6">
            {blocked ? (
              <div className="saas-card p-8 text-center space-y-3">
                <Bot className="w-6 h-6 mx-auto text-fg-muted" strokeWidth={1.8} />
                <h2 className="text-base font-semibold">Create your shopping agent first</h2>
                <p className="text-sm text-fg-muted">{blocked}</p>
                <Link href="/agents" className="intentlock-btn-primary">
                  Go to Agents
                </Link>
              </div>
            ) : messages.length === 0 && !sending ? (
              <div className="pt-10 text-center space-y-6">
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold tracking-tight">What should Secay buy for you?</h1>
                  <p className="text-sm text-fg-muted max-w-lg mx-auto">
                    I search real stores through Channel3 and only suggest what your spending rules allow. Every purchase is
                    checked before PayPal pays.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 max-w-2xl mx-auto">
                  {promptsFor(rules).map((p) => (
                    <button key={p} type="button" onClick={() => send(p)} className="intentlock-btn-outline btn-sm">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => <Message key={m.id} m={m} onBuy={buy} buying={buying} />)
            )}
            {sending && <Typing />}
            <div ref={endRef} />
          </div>
        </div>

        <div className="shrink-0 border-t border-line px-6 py-4">
          <form
            className="mx-auto w-full max-w-4xl"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            {error && <p role="alert" className="mb-2 text-sm text-rose-400">{error}</p>}
            <div className="flex items-end gap-2 rounded-2xl border border-line bg-input p-2 focus-within:border-blue-500/60 focus-within:ring-4 focus-within:ring-blue-500/10 transition">
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
                placeholder="Ask Secay to find something, e.g. a USB-C cable under $20"
                className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-fg placeholder:text-fg-dim focus:outline-none"
              />
              <button type="submit" disabled={sending || !draft.trim()} className="intentlock-btn-primary !p-2 !rounded-xl" aria-label="Send">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" strokeWidth={2} />}
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-fg-dim">
              Secay only buys within your spending rules. Enter to send, Shift+Enter for a new line.
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}
