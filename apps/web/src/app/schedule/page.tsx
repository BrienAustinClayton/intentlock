export default function SchedulePage() {
  return (
    <div
      className="mx-auto flex max-w-2xl flex-col items-center justify-center gap-4 px-6 py-24 text-center"
      style={{ color: "var(--color-text)" }}
    >
      <h1 className="text-2xl font-bold">Agent Schedule</h1>
      <p style={{ color: "var(--color-text-muted)", fontSize: "0.95rem", maxWidth: "32rem" }}>
        Coming soon — needs Bryntum Scheduler trial licence.
      </p>
      <p
        className="rounded-lg border px-4 py-3 text-sm"
        style={{
          borderColor: "var(--color-border)",
          background: "var(--color-surface)",
          color: "var(--color-text-muted)",
        }}
      >
        The Bryntum Scheduler component requires a trial key. Once the licence is
        configured, this page will show the agent mandate timeline and allow
        drag-to-reschedule.
      </p>
    </div>
  );
}
