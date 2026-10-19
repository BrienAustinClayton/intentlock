export async function handleSignOut(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
  // Full reload on purpose: drops every bit of signed-in client state.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/login");
}

export async function signInAgainFor(next: string): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

export function sanitizeDigits(inputVal: string, maxDigits: number): string {
  const digitsOnly = inputVal.replace(/\D/g, "");
  return digitsOnly.slice(0, maxDigits);
}

export function toggleArrayItem<ItemType>(items: ItemType[], targetItem: ItemType): ItemType[] {
  const isIncluded = items.includes(targetItem);
  if (isIncluded) {
    return items.filter((element: ItemType) => element !== targetItem);
  }
  return [...items, targetItem];
}
