"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CircleCheck, CreditCard, LockKeyhole, ShieldCheck, Undo2 } from "lucide-react";
import { ErrorNote, PageHeader, Panel, Tag } from "@/components/ui";
import { me } from "@/lib/me";

const RETURN_MSG: Record<string, string> = {
  cancelled: "You cancelled on PayPal. Nothing was saved.",
  paypal_error: "PayPal couldn't save the payment method. Try again.",
};

const HOW = [
  { icon: LockKeyhole, title: "Held, not charged", body: "When your agent checks out, the amount is authorised on your PayPal account but not taken." },
  { icon: ShieldCheck, title: "Checked first", body: "Sepilo compares the order with your request and rules, and scans the store page for hidden instructions." },
  { icon: Undo2, title: "Paid or released", body: "If everything matches, the payment is captured. If not, the hold is released or you're asked to decide." },
];

export default function PaymentClient() {
  const params = useSearchParams();
  const vaulted = params.get("vaulted");
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    vaulted === "0" ? (RETURN_MSG[params.get("reason") ?? ""] ?? "PayPal setup didn't finish. Try again.") : null,
  );

  useEffect(() => {
    me.payment().then((p) => setConnected(p.connected), (e: Error) => setError(e.message));
  }, []);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const { approve_url } = await me.paymentSetup();
      window.location.assign(approve_url);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Payment method"
        description="The account Sepilo uses when your agent checks out. Payments are only captured after every check passes."
      />

      <Panel className="mb-5">
        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-fg/[0.05] text-fg-muted">
              <CreditCard className="w-5 h-5" strokeWidth={1.8} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">PayPal</span>
                {connected === null ? null : connected ? (
                  <Tag tone="success" dot>
                    Connected
                  </Tag>
                ) : (
                  <Tag tone="neutral">Not connected</Tag>
                )}
              </div>
              <p className="text-xs text-fg-muted">
                {connected
                  ? "Saved securely with PayPal. Sepilo never sees your card details."
                  : "You'll approve once on PayPal. Sepilo stores only a token, never card details."}
              </p>
            </div>
          </div>
          {connected === false && (
            <button type="button" onClick={connect} disabled={busy} className="intentlock-btn-primary">
              {busy ? "Opening PayPal…" : "Connect PayPal"}
            </button>
          )}
          {connected && vaulted === "1" && (
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
              <CircleCheck className="w-4 h-4" strokeWidth={1.8} />
              Saved
            </span>
          )}
        </div>
        {error && (
          <div className="px-5 pb-4">
            <ErrorNote message={error} />
          </div>
        )}
      </Panel>

      <h2 className="text-sm font-semibold mb-3">How payments work</h2>
      <div className="grid sm:grid-cols-3 gap-3">
        {HOW.map(({ icon: Icon, title, body }) => (
          <div key={title} className="saas-card p-4">
            <Icon className="w-4 h-4 text-blue-400 mb-2" strokeWidth={1.8} />
            <div className="text-sm font-medium">{title}</div>
            <p className="mt-1 text-xs text-fg-muted leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
