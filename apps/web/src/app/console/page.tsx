export default function ConsolePage() {
  return (
    <div
      className="mx-auto flex max-w-2xl flex-col items-center justify-center gap-4 px-6 py-24 text-center"
      style={{ color: "var(--color-text)" }}
    >
      <h1 className="text-2xl font-bold">Trust Console</h1>
      <p style={{ color: "var(--color-text-muted)", fontSize: "0.95rem", maxWidth: "32rem" }}>
        Coming soon — needs AG Studio trial licence.
      </p>
      <p
        className="rounded-lg border px-4 py-3 text-sm"
        style={{
          borderColor: "var(--color-border)",
          background: "var(--color-surface)",
          color: "var(--color-text-muted)",
        }}
      >
        The AG Studio component requires a trial key. Once the licence is
        configured, this page will show live order decisions, risk histograms,
        flagged merchants, and the Risk Analyst agent.
      </p>
    </div>
  );
}
