"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { CreditCard, LockKeyhole, ShieldCheck, Undo2 } from "lucide-react";
import { usePaymentConnection } from "../../hooks/usePaymentConnection";
import { Button } from "@/shared/presentation/components/Button";
import { ButtonVariantEnum } from "@/shared/enums";

const SETUP_ERRORS: Record<string, string> = {
  cancelled: "You cancelled on PayPal. Nothing was saved.",
  paypal_error: "PayPal couldn't save the payment method. Try again.",
};

export function PaymentPage() {
  const searchParams = useSearchParams();
  const vaulted = searchParams.get("vaulted");
  const setupError =
    vaulted === "0" ? SETUP_ERRORS[searchParams.get("reason") ?? ""] ?? "PayPal setup didn't finish. Try again." : null;
  const { isConnected, isLoadingStatus, setupPayment, isSettingUp } = usePaymentConnection();

  const handleConnect = () => {
    setupPayment().then((res) => {
      if (res && res.approve_url) {
        window.location.assign(res.approve_url);
      }
    });
  };

  const infoCards = [
    {
      icon: LockKeyhole,
      title: "Held, not charged",
      body: "When your agent checks out, the amount is authorized on your PayPal account but not taken.",
    },
    {
      icon: ShieldCheck,
      title: "Checked first",
      body: "Sepilo compares the order with your request and rules, and scans the store page for hidden instructions.",
    },
    {
      icon: Undo2,
      title: "Paid or released",
      body: "If everything matches, the payment is captured. If not, the hold is released or you're asked to decide.",
    },
  ];

  return (
    <div className="max-w-3xl">
      <div className="mb-6 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Payment Method</h1>
        <p className="text-sm text-fg-muted max-w-2xl">
          The account Sepilo uses when your agent checks out. Payments are only captured after every check passes.
        </p>
      </div>

      <div className="saas-card overflow-hidden mb-6 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fg/5 text-fg-muted">
            <CreditCard className="w-5 h-5" strokeWidth={1.8} />
          </span>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-fg">PayPal</span>
              {!isLoadingStatus && (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    isConnected
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-neutral-500/10 text-neutral-400 border border-neutral-500/20"
                  }`}
                >
                  {isConnected ? "Connected" : "Not connected"}
                </span>
              )}
            </div>
            <p className="text-xs text-fg-muted mt-0.5">
              {isConnected
                ? "Saved securely with PayPal. Sepilo never sees your card details."
                : "Connect your PayPal wallet to allow your shopping agents to check out safely."}
            </p>
          </div>
        </div>

        {!isConnected && !isLoadingStatus && (
          <Button
            variant={ButtonVariantEnum.Primary}
            isLoading={isSettingUp}
            onClick={handleConnect}
          >
            Connect PayPal
          </Button>
        )}

        {setupError && !isConnected && (
          <span role="alert" className="text-sm text-rose-400">
            {setupError}
          </span>
        )}

        {isConnected && vaulted === "1" && (
          <span className="text-sm text-emerald-400 font-medium">
            Saved successfully
          </span>
        )}
      </div>

      <h2 className="text-sm font-semibold text-fg mb-3">How payments work</h2>
      <div className="grid sm:grid-cols-3 gap-3">
        {infoCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="saas-card p-4">
              <Icon className="w-4 h-4 text-blue-400 mb-2" strokeWidth={1.8} />
              <div className="text-sm font-medium text-fg">{card.title}</div>
              <p className="mt-1 text-xs text-fg-muted leading-relaxed">{card.body}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
