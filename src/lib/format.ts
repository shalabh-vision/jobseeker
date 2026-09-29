const dateTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const dateOnly = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

export function formatDate(value: Date | null | undefined): string {
  return value ? dateOnly.format(value) : "—";
}

export function formatDateTime(value: Date | null | undefined): string {
  return value ? dateTime.format(value) : "—";
}
