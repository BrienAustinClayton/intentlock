export const instant = false;

import fs from "fs";
import path from "path";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CatalogProduct, CatalogProductVariant } from "@/lib/types";

// ---------------------------------------------------------------------------
// Catalog loader (API → local fallback)
// ---------------------------------------------------------------------------

async function loadProduct(
  merchant: string,
  productId: string
): Promise<CatalogProduct | null> {
  let products: CatalogProduct[] = [];

  try {
    const { getCatalog } = await import("@/lib/api");
    products = (await getCatalog({ merchant })) ?? [];
  } catch {
    const seedPath = path.join(
      process.cwd(),
      "../../data/seed/catalog.json"
    );
    const raw = fs.readFileSync(seedPath, "utf-8");
    const all: CatalogProduct[] = JSON.parse(raw);
    products = merchant ? all.filter((p) => p.merchant === merchant) : all;
  }

  return products.find((p) => p.product_id === productId) ?? null;
}

// ---------------------------------------------------------------------------
// Variant chips grouped by name
// ---------------------------------------------------------------------------

function groupVariants(
  variants: CatalogProductVariant[]
): Record<string, CatalogProductVariant[]> {
  const groups: Record<string, CatalogProductVariant[]> = {};
  for (const v of variants) {
    if (!groups[v.name]) groups[v.name] = [];
    groups[v.name].push(v);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function StoreProductPage({
  params,
}: {
  params: Promise<{ merchant: string; product: string }>;
}) {
  const { merchant, product: productId } = await params;

  const KNOWN_MERCHANTS = new Set(["freshmart", "gadgethub", "dealsdaily"]);
  if (!KNOWN_MERCHANTS.has(merchant)) notFound();

  const p = await loadProduct(merchant, productId);
  if (!p) notFound();

  const variantGroups = groupVariants(p.variants ?? []);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-fg-dim font-medium">
        <Link href="/store/freshmart" className="hover:text-fg">
          Stores
        </Link>
        <span>/</span>
        <Link href={`/store/${encodeURIComponent(merchant)}`} className="capitalize hover:text-fg">
          {merchant}
        </Link>
        <span>/</span>
        <span className="text-fg truncate">{p.title}</span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* Product Image */}
        <div className="saas-card flex items-center justify-center p-8 aspect-square overflow-hidden bg-fg/2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.image_url}
            alt={p.title}
            className="max-w-full max-h-full object-contain"
          />
        </div>

        {/* Product Details */}
        <div className="space-y-6">
          <div>
            <span className="text-[11px] font-mono font-medium text-fg-muted uppercase tracking-wider block mb-1">
              {p.category}
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-fg mt-1">
              {p.title}
            </h1>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-fg">
                ${p.price.toFixed(2)}
              </span>
              <span className="text-xs text-fg-muted font-mono">{p.currency}</span>
            </div>
          </div>

          {/* Variants */}
          {Object.keys(variantGroups).length > 0 && (
            <div className="space-y-3 pt-2">
              {Object.entries(variantGroups).map(([name, chips]) => (
                <div key={name}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-fg-dim mb-2">
                    {name}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {chips.map((chip) => {
                      const isSelected = chip.product_id === productId;
                      return (
                        <Link
                          key={chip.product_id}
                          href={`/store/${encodeURIComponent(merchant)}/${encodeURIComponent(chip.product_id)}`}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium border transition ${
                            isSelected
                              ? "border-gray-900 bg-gray-900 text-fg"
                              : "border-gray-300 bg-white text-fg-faint hover:bg-gray-50"
                          }`}
                        >
                          {chip.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Description */}
          <div className="text-sm text-fg-faint leading-relaxed border-t border-gray-100 pt-4">
            {p.description}
          </div>

          {/* Key Features */}
          {p.key_features && p.key_features.length > 0 && (
            <div className="border-t border-gray-100 pt-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-dim mb-2">Key Specifications</h2>
              <ul className="space-y-1.5 text-xs text-fg-faint">
                {p.key_features.map((feat, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-fg-muted">•</span>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Other Offers Comparison */}
      {p.offers && p.offers.length > 0 && (
        <div className="saas-card p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Merchant Offer Comparison (Channel3)</h2>
          <div className="divide-y divide-gray-100">
            {p.offers.map((offer, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 text-xs">
                <span className="font-medium text-fg-faint capitalize">{offer.merchant}</span>
                <span className="font-mono font-semibold text-gray-900">
                  ${offer.price.toFixed(2)} {p.currency}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
