export const instant = false;

import fs from "fs";
import path from "path";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CatalogProduct } from "@/lib/types";

// ---------------------------------------------------------------------------
// Merchant config
// ---------------------------------------------------------------------------

const MERCHANTS: Record<
  string,
  { label: string; tag: string; description: string }
> = {
  freshmart: {
    label: "FreshMart",
    tag: "Groceries & Nutrition",
    description: "Everyday essentials, fresh produce, and toddler nutrition products.",
  },
  gadgethub: {
    label: "GadgetHub",
    tag: "Consumer Electronics",
    description: "Premium computer accessories, audio gear, and office tech.",
  },
  dealsdaily: {
    label: "DealsDaily",
    tag: "Discounts & Bundles",
    description: "High-volume consumer goods, clearance items, and gift merchandise.",
  },
};

// ---------------------------------------------------------------------------
// Catalog loader (API → local fallback)
// ---------------------------------------------------------------------------

async function loadCatalog(merchant: string): Promise<CatalogProduct[]> {
  try {
    const { getCatalog } = await import("@/lib/api");
    const data = await getCatalog({ merchant });
    return data ?? [];
  } catch {
    const seedPath = path.join(
      process.cwd(),
      "../../data/seed/catalog.json"
    );
    const raw = fs.readFileSync(seedPath, "utf-8");
    const all: CatalogProduct[] = JSON.parse(raw);
    return merchant ? all.filter((p) => p.merchant === merchant) : all;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function StoreMerchantPage({
  params,
}: {
  params: Promise<{ merchant: string }>;
}) {
  const { merchant } = await params;
  if (!MERCHANTS[merchant]) notFound();
  const info = MERCHANTS[merchant];

  const products = await loadCatalog(merchant);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Merchant Switcher Tabs */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-3 overflow-x-auto">
        {Object.entries(MERCHANTS).map(([key, m]) => {
          const isActive = key === merchant;
          return (
            <Link
              key={key}
              href={`/store/${key}`}
              className={`rounded-lg px-3.5 py-1.5 text-xs sm:text-sm font-medium transition shrink-0 ${
                isActive
                  ? "bg-slate-200/80 text-slate-900 font-semibold dark:bg-slate-800 dark:text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200"
              }`}
            >
              {m.label}
            </Link>
          );
        })}
      </div>

      {/* Store Header */}
      <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-6 sm:p-8 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-2">
              <span>{info.tag}</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {info.label}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
              {info.description} Autonomous shopping agents browse this catalog to build checkout carts.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
              {products.length} Products in Catalog
            </span>
          </div>
        </div>
      </div>

      {/* Product Grid */}
      <div>
        {products.length === 0 ? (
          <div className="saas-card p-12 text-center text-slate-500">
            No products loaded for this merchant store.
          </div>
        ) : (
          <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <Link
                key={p.product_id}
                href={`/store/${encodeURIComponent(merchant)}/${encodeURIComponent(p.product_id)}`}
                className="group saas-card overflow-hidden transition-all duration-200 hover:border-indigo-500/40 flex flex-col justify-between"
              >
                {/* Product image */}
                <div className="relative aspect-square bg-slate-50 dark:bg-slate-950/60 overflow-hidden flex items-center justify-center p-6 border-b border-slate-100 dark:border-slate-800/80">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.image_url}
                    alt={p.title}
                    className="max-h-full max-w-full object-contain transition-transform duration-200 group-hover:scale-105"
                  />
                </div>

                {/* Product info */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      {p.category}
                    </span>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug">
                      {p.title}
                    </h2>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                    <span className="text-base font-bold font-mono text-slate-900 dark:text-white">
                      ${p.price.toFixed(2)} <span className="text-xs font-normal text-slate-400">{p.currency}</span>
                    </span>
                    {p.offers.length > 0 && (
                      <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                        +{p.offers.length} offer{p.offers.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
