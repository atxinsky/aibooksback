export function nowIso() {
  return new Date().toISOString();
}

export function daysFromNow(days: number) {
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

