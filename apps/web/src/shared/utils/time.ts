const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function shortRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  const seconds = (Date.now() - date.getTime()) / 1000;
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  const now = new Date();
  if (sameDay(date, now)) return `${Math.floor(seconds / 3600)}h ago`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function messageTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return sameDay(date, new Date()) ? time : `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
}
