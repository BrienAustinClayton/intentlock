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
    <div className="space-y-6">
      {/* Merchant Switcher Tabs */}
      <div className="flex items-center gap-1.5 border-b border-line pb-3 overflow-x-auto">
        {Object.entries(MERCHANTS).map(([key, m]) => {
          const isActive = key === merchant;
          return (
            <Link
              key={key}
              href={`/store/${key}`}
              className={`rounded-xl px-3.5 py-1.5 text-xs sm:text-sm font-medium transition shrink-0 ${
                isActive
                  ? "bg-raised text-fg font-semibold border border-fg/10 shadow-xs"
                  : "text-fg-muted hover:text-fg hover:bg-fg/5"
              }`}
            >
              {m.label}
            </Link>
          );
        })}
      </div>

      {/* Store Header */}
      <div className="saas-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-mono font-medium text-fg-muted uppercase tracking-wider block mb-1">
              {info.tag}
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-fg">
              {info.label}
            </h1>
            <p className="mt-1 text-sm text-fg-muted max-w-2xl">
              {info.description} Autonomous shopping agents browse this catalog to build checkout carts.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-fg-2 bg-fg/[0.04] px-3 py-1.5 rounded-xl border border-fg/10">
              {products.length} Products
            </span>
          </div>
        </div>
      </div>

      {/* Product Grid */}
      <div>
        {products.length === 0 ? (
          <div className="saas-card p-12 text-center text-fg-dim text-sm">
            No products loaded for this merchant store.
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
            {products.map((p) => (
              <Link
                key={p.product_id}
                href={`/store/${encodeURIComponent(merchant)}/${encodeURIComponent(p.product_id)}`}
                className="group saas-card overflow-hidden hover:border-fg/20 flex flex-col justify-between"
              >
                {/* Product image */}
                <div className="relative aspect-square bg-fg/[0.02] overflow-hidden flex items-center justify-center p-6 border-b border-fg/[0.06]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.image_url}
                    alt={p.title}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>

                {/* Product info */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] font-mono font-medium text-fg-muted uppercase tracking-wider block mb-1">
                      {p.category}
                    </span>
                    <h2 className="text-sm font-semibold text-fg line-clamp-2 leading-snug">
                      {p.title}
                    </h2>
                  </div>

                  <div className="mt-4 pt-3 border-t border-fg/[0.06] flex items-center justify-between">
                    <span className="text-sm font-bold font-mono text-fg">
                      ${p.price.toFixed(2)} <span className="text-xs font-normal text-fg-muted">{p.currency}</span>
                    </span>
                    {p.offers.length > 0 && (
                      <span className="text-[11px] text-blue-400 font-medium">
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
