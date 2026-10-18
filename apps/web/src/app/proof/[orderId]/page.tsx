export const instant = false;

import { getProof } from "@/lib/api";
import { ApiError } from "@/lib/api";
import ProofClient from "./ProofClient";

export default async function ProofPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  let errorMessage: string | null = null;
  let proofData = null;

  try {
    proofData = await getProof(orderId);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) {
        errorMessage = "Proof not issued yet for this order.";
      } else if (err.status === 0 && err.code === "config_error") {
        errorMessage = "API is not configured (NEXT_PUBLIC_API_URL missing).";
      } else {
        errorMessage = `Failed to load proof: ${err.message}`;
      }
    } else {
      errorMessage = "An unexpected error occurred.";
    }
  }

  if (errorMessage || !proofData) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-4" style={{ color: "var(--color-text)" }}>
          Proof of Intent
        </h1>
        <div
          role="alert"
          style={{
            padding: "1rem",
            borderRadius: "8px",
            border: "1px solid var(--color-danger-200)",
            background: "var(--color-danger-50)",
            color: "var(--color-status-voided)",
            fontSize: "0.9rem",
          }}
        >
          {errorMessage ?? "Proof not found."}
        </div>
        <p style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
          Order ID: <code>{orderId}</code>
        </p>
      </div>
    );
  }

  return <ProofClient proof={proofData} />;
}
