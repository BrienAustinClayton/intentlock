export const instant = false;

import fs from "fs";
import path from "path";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CatalogProduct } from "@/lib/types";

// ---------------------------------------------------------------------------
// Merchant theme config
// ---------------------------------------------------------------------------

const MERCHANT_THEMES: Record<
  string,
  { label: string; color: string; headerBg: string; headerText: string }
> = {
  freshmart: {
    label: "FreshMart",
    color: "green",
    headerBg: "bg-green-600",
    headerText: "text-white",
  },
  gadgethub: {
    label: "GadgetHub",
    color: "blue",
    headerBg: "bg-blue-600",
    headerText: "text-white",
  },
  dealsdaily: {
    label: "DealsDaily",
    color: "orange",
    headerBg: "bg-orange-500",
    headerText: "text-white",
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
    // API unreachable — read from the local seed file at build/server time
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
  if (!MERCHANT_THEMES[merchant]) notFound();
  const theme = MERCHANT_THEMES[merchant];

  const products = await loadCatalog(merchant);

  return (
    <div className="min-h-screen">
      {/* Store header */}
      <header className={`${theme.headerBg} ${theme.headerText} py-10 px-6`}>
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-semibold uppercase tracking-widest opacity-80 mb-1">
            Demo Store
          </p>
          <h1 className="text-4xl font-bold">{theme.label}</h1>
          <p className="mt-1 text-sm opacity-75">
            {products.length} product{products.length !== 1 ? "s" : ""} available
          </p>
        </div>
      </header>

      {/* Product grid */}
      <div className="mx-auto max-w-7xl px-6 py-10">
        {products.length === 0 ? (
          <p className="text-center text-gray-500 py-20">
            No products found for this store.
          </p>
        ) : (
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <Link
                key={p.product_id}
                href={`/store/${encodeURIComponent(merchant)}/${encodeURIComponent(p.product_id)}`}
                className="group rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Product image */}
                <div className="relative aspect-square bg-gray-50 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.image_url}
                    alt={p.title}
                    className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-200"
                  />
                </div>

                {/* Product info */}
                <div className="p-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
                    {p.category}
                  </p>
                  <h2 className="text-sm font-semibold text-gray-800 line-clamp-2 leading-snug mb-2">
                    {p.title}
                  </h2>
                  <p className="text-lg font-bold text-gray-900">
                    {p.currency} {p.price.toFixed(2)}
                  </p>
                  {p.offers.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      +{p.offers.length} other offer{p.offers.length !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
