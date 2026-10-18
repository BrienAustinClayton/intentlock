"use server";
import { verifyProof } from "@/lib/api";
import type { ProofBundle, VerifyProofResponse } from "@/lib/types";

export async function verifyProofAction(
  bundle: ProofBundle,
  signature: string
): Promise<VerifyProofResponse> {
  return verifyProof({ bundle, signature });
}
