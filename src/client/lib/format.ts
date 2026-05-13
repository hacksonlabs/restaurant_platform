export function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function isCurrentYear(date: Date) {
  return date.getFullYear() === new Date().getFullYear();
}

export function dateTime(value: string): string {
  const date = new Date(value);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(isCurrentYear(date) ? {} : { year: "numeric" as const }),
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function dateTimeOrFallback(value?: string | null, fallback = "Never"): string {
  if (!value) return fallback;
  return dateTime(value);
}
