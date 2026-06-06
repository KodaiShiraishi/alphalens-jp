export function growthRate(previous: number | null, current: number | null): number | null {
  if (previous === null || current === null || previous === 0) return null;
  return (current - previous) / previous;
}

export function margin(profit: number | null, sales: number | null): number | null {
  if (profit === null || sales === null || sales === 0) return null;
  return profit / sales;
}

export function per(price: number | null, eps: number | null): number | null {
  if (price === null || eps === null || eps === 0) return null;
  return price / eps;
}

export function pbr(price: number | null, bps: number | null): number | null {
  if (price === null || bps === null || bps === 0) return null;
  return price / bps;
}
