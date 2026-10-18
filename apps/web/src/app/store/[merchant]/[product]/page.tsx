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
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-gray-400">
        <Link href={`/store/${encodeURIComponent(merchant)}`} className="hover:text-gray-700">
          {merchant}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-600 truncate">{p.title}</span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        {/* Image */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center p-8 aspect-square overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.image_url}
            alt={p.title}
            className="max-w-full max-h-full object-contain"
          />
        </div>

        {/* Details */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
            {p.category}
          </p>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">{p.title}</h1>

          {/* Price */}
          <p className="text-3xl font-bold text-gray-900 mb-5">
            {p.currency} {p.price.toFixed(2)}
          </p>

          {/* Variants */}
          {Object.keys(variantGroups).length > 0 && (
            <div className="mb-6 space-y-4">
              {Object.entries(variantGroups).map(([name, chips]) => (
                <div key={name}>
                  <p className="text-sm font-semibold text-gray-700 mb-2 capitalize">
                    {name}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {chips.map((chip) => (
                      <Link
                        key={chip.product_id}
                        href={`/store/${encodeURIComponent(merchant)}/${encodeURIComponent(chip.product_id)}`}
                        className={`inline-block rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          chip.product_id === productId
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-gray-300 text-gray-700 hover:border-blue-400 hover:text-blue-600"
                        }`}
                      >
                        {chip.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Description */}
          <p className="text-sm text-gray-600 leading-relaxed mb-6">
            {p.description}
          </p>

          {/* Key features */}
          {p.key_features && p.key_features.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-800 mb-2">Key Features</h2>
              <ul className="space-y-1">
                {p.key_features.map((feat, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-600">
                    <span className="mt-1 shrink-0 text-gray-400">&#8226;</span>
                    {feat}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Other offers */}
      {p.offers && p.offers.length > 0 && (
        <div className="mt-12">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Other Offers</h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 font-medium">Merchant</th>
                  <th className="px-4 py-3 font-medium text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {p.offers.map((offer, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{offer.merchant}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {p.currency} {offer.price.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
