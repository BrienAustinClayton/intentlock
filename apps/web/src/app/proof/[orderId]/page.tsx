export const instant = false;

import { cookies } from "next/headers";
import { SESSION_COOKIE, callApi } from "@/lib/server/auth";
import type { GetProofResponse } from "@/lib/types";
import ProofClient from "./ProofClient";

export default async function ProofPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  let errorMessage: string | null = null;
  let proofData: GetProofResponse | null = null;

  // Proofs are private to the order's owner (the attack lab's demo orders are open), so ask as the signed-in user.
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const r = await callApi(`/orders/${encodeURIComponent(orderId)}/proof`, { token });
  if (r.status === 200) {
    proofData = r.data as unknown as GetProofResponse;
  } else if (r.status === 404) {
    errorMessage = "No proof to show: the order doesn't exist, isn't yours, or its proof isn't issued yet.";
  } else {
    errorMessage = `Failed to load proof: ${String(r.data.reason ?? r.status)}`;
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
