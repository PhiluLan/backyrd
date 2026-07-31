export function formatMoney(amount?: number, currency = 'CHF') {
  if (amount === undefined) return '–';
  return new Intl.NumberFormat('de-CH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date?: string) {
  if (!date) return '–';
  return new Intl.DateTimeFormat('de-CH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00`));
}

export function isDueSoon(date?: string) {
  if (!date) return false;
  const remaining = new Date(`${date}T23:59:59`).getTime() - Date.now();
  return remaining >= 0 && remaining <= 14 * 24 * 60 * 60 * 1000;
}
