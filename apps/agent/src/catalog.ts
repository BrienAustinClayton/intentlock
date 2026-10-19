import { env } from "./config.ts";
import { publicGet } from "./intentlock.ts";

export interface Product {
  product_id: string;
  merchant: string;
  category: string;
  title: string;
  description?: string;
  key_features?: string[];
  price: string; // decimal string, 2 places
  currency: string;
  url: string | null; // public merchant page, or null
  page_candidates: string[]; // other public merchant pages (catalog offers) the scanner may be able to fetch
  variants: { name?: string; label?: string; product_id?: string }[];
  source: "catalog" | "channel3";
  brand?: string;
  category_title?: string;
  image?: string;
}

const MERCHANT_CATEGORY: Record<string, string> = {
  freshmart: "groceries",
  gadgethub: "electronics_accessories",
  dealsdaily: "gift_cards",
};

/** Display price (number or string) -> decimal string with 2 places. No float arithmetic on money. */
export function moneyString(v: unknown): string {
  const s = typeof v === "number" ? v.toFixed(2) : String(v).trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) throw new Error("bad price");
  const [w, f = ""] = s.split(".");
  return `${w}.${(f + "00").slice(0, 2)}`;
}

export const toCents = (m: string): number => {
  const [w, f] = m.split(".");
  return Number(w) * 100 + Number(f ?? 0);
};
export const fromCents = (c: number): string => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;

const PRIVATE_HOST = /^(localhost|.*\.localhost|.*\.local|.*\.internal|127\..*|10\..*|192\.168\..*|169\.254\..*|0\.0\.0\.0|\[?::1\]?)$/i;

/** The API only scans public http(s) pages (SSRF guard blocks localhost). */
export function isPublicHttpUrl(u: unknown): u is string {
  if (typeof u !== "string") return false;
  try {
    const x = new URL(u);
    if (x.protocol !== "http:" && x.protocol !== "https:") return false;
    return !PRIVATE_HOST.test(x.hostname) && x.hostname.includes(".");
  } catch {
    return false;
  }
}

/**
 * Local dev page for a product. The merchant storefront (localhost:3000) is not fetchable by the API, so the
 * checkout's page_urls use a real merchant URL from the catalog: the product `url` if present, else the home page of
 * the first offer's merchant domain (Channel3 offers[].merchant, e.g. "costco.com").
 */
export function productPageUrls(raw: { url?: unknown; offers?: { merchant?: string; url?: string }[] }): string[] {
  const out: string[] = [];
  if (isPublicHttpUrl(raw.url)) out.push(raw.url);
  for (const o of raw.offers ?? []) {
    if (isPublicHttpUrl(o.url)) out.push(o.url);
    else if (o.merchant && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(o.merchant)) out.push(`https://${o.merchant.toLowerCase()}/`);
  }
  return [...new Set(out)].slice(0, 4);
}

function fromCatalog(raw: any): Product | null {
  try {
    return {
      product_id: String(raw.product_id),
      merchant: String(raw.merchant),
      category: String(raw.category),
      title: String(raw.title ?? "").slice(0, 300),
      description: typeof raw.description === "string" ? raw.description : undefined,
      key_features: Array.isArray(raw.key_features) ? raw.key_features.map(String) : undefined,
      price: moneyString(raw.price),
      currency: String(raw.currency ?? "USD"),
      url: productPageUrls(raw)[0] ?? null,
      page_candidates: productPageUrls(raw),
      variants: Array.isArray(raw.variants) ? raw.variants : [],
      source: "catalog",
    };
  } catch {
    return null;
  }
}

let allCache: { at: number; items: Product[] } | undefined;

/** GET /catalog (cached Channel3 data, 60 s in-process). */
export async function catalogAll(): Promise<Product[]> {
  if (allCache && Date.now() - allCache.at < 60_000) return allCache.items;
  const raw = await publicGet<any[]>("/catalog");
  const items = raw.map(fromCatalog).filter((p): p is Product => p !== null);
  allCache = { at: Date.now(), items };
  return items;
}

export async function catalogSearch(query: string, merchant: string | undefined, limit: number): Promise<Product[]> {
  const qs = (q: string) => {
    const p = new URLSearchParams({ q });
    if (merchant) p.set("merchant", merchant.toLowerCase());
    return `/catalog?${p.toString()}`;
  };
  const seen = new Map<string, Product>();
  const add = (rows: any[]) => {
    for (const r of rows) {
      const p = fromCatalog(r);
      if (p && !seen.has(p.product_id)) seen.set(p.product_id, p);
    }
  };
  add(await publicGet<any[]>(qs(query)));
  if (seen.size === 0) {
    // Substring search can miss multi-word queries: fall back to each word.
    for (const w of query.split(/\s+/).filter((x) => x.length >= 3).slice(0, 4)) add(await publicGet<any[]>(qs(w)));
  }
  return [...seen.values()].slice(0, limit);
}

// ---- Channel3: the real product source ------------------------------------------------------------------------

const C3 = "https://api.trychannel3.com";

export const domainOf = (d: unknown): string | null => {
  if (typeof d !== "string") return null;
  const s = d.trim().toLowerCase().replace(/^www\./, "");
  return /^[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$/.test(s) ? s : null;
};

function fromChannel3(raw: any, merchant?: string): Product | null {
  try {
    const offer = raw.offers?.[0];
    const price = offer?.price?.price ?? raw.price?.price ?? raw.price;
    const domain = domainOf(offer?.domain);
    const path: any[] = Array.isArray(raw.category?.path) ? raw.category.path : [];
    const top = path[0] ?? raw.category;
    return {
      product_id: String(raw.id ?? raw.product_id),
      merchant: merchant ?? domain ?? "channel3",
      category: String(top?.slug ?? "other").slice(0, 64),
      category_title: typeof top?.title === "string" ? top.title : undefined,
      brand: typeof raw.brands?.[0]?.name === "string" ? raw.brands[0].name : undefined,
      image: isPublicHttpUrl(raw.images?.[0]?.url) ? raw.images[0].url : undefined,
      title: String(raw.title ?? "").slice(0, 300),
      description: typeof raw.description === "string" ? raw.description : undefined,
      key_features: Array.isArray(raw.key_features) ? raw.key_features.map(String) : undefined,
      price: moneyString(price),
      currency: String(offer?.price?.currency ?? raw.price?.currency ?? "USD"),
      url: isPublicHttpUrl(offer?.url) ? offer.url : isPublicHttpUrl(raw.url) ? raw.url : null,
      page_candidates: (raw.offers ?? []).map((o: any) => o?.url).filter(isPublicHttpUrl).slice(0, 4),
      variants: [],
      source: "channel3",
    };
  } catch {
    return null;
  }
}

export interface Channel3Filters {
  maxPrice?: number;
  minPrice?: number;
}

/** Live Channel3 search, in-stock offers only. Empty when no key is configured. */
export async function channel3Search(query: string, limit: number, merchant?: string, f: Channel3Filters = {}): Promise<Product[]> {
  const key = env("CHANNEL3_API_KEY");
  if (!key) return [];
  const filters: Record<string, unknown> = { availability: ["InStock"] };
  if (f.maxPrice !== undefined || f.minPrice !== undefined) {
    filters.price = { ...(f.minPrice !== undefined ? { min_price: f.minPrice } : {}), ...(f.maxPrice !== undefined ? { max_price: f.maxPrice } : {}) };
  }
  const res = await fetch(`${C3}/v1/search`, {
    method: "POST",
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit, filters }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Channel3 search failed (HTTP ${res.status})`);
  const j: any = await res.json();
  const rows: any[] = Array.isArray(j) ? j : (j.products ?? []);
  return rows.map((r) => fromChannel3(r, merchant)).filter((p): p is Product => p !== null && p.currency === "USD");
}

export async function channel3Get(productId: string, merchant?: string): Promise<Product | null> {
  const key = env("CHANNEL3_API_KEY");
  if (!key) return null;
  const res = await fetch(`${C3}/v1/products/${encodeURIComponent(productId)}`, {
    headers: { "x-api-key": key },
    signal: AbortSignal.timeout(30_000),
  });
  return res.ok ? fromChannel3(await res.json(), merchant) : null;
}
