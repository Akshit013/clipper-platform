import { describe, it, expect } from 'vitest';

export function calculateEarnings(
  eligibleViews: number,
  ratePer1000: number
): number {
  if (eligibleViews <= 0 || ratePer1000 <= 0) return 0;
  return Number(((eligibleViews / 1000) * ratePer1000).toFixed(2));
}

export function computeAvailableBalance(
  approvedEarnings: number[],
  payoutRequests: { amount: number; status: 'pending' | 'approved' | 'paid' | 'rejected' }[]
): number {
  const totalEarned = approvedEarnings.reduce((acc, curr) => acc + curr, 0);
  const reserved = payoutRequests
    .filter((p) => p.status !== 'rejected')
    .reduce((acc, curr) => acc + curr.amount, 0);

  return Math.max(0, Number((totalEarned - reserved).toFixed(2)));
}

describe('Earnings Calculations', () => {
  it('calculates earnings accurately with campaign fixed rate', () => {
    // 10,000 views at $2.50 / 1k = $25.00
    expect(calculateEarnings(10000, 2.5)).toBe(25.0);

    // 1,500 views at $3.00 / 1k = $4.50
    expect(calculateEarnings(1500, 3.0)).toBe(4.5);

    // 250,000 views at $5.00 / 1k = $1,250.00
    expect(calculateEarnings(250000, 5.0)).toBe(1250.0);

    // 0 views gives $0.00
    expect(calculateEarnings(0, 4.0)).toBe(0);

    // Fractional views rounding
    expect(calculateEarnings(333, 2.5)).toBe(0.83);
  });
});

describe('Available Balance & Payout Reservations', () => {
  it('computes available balance with pending and paid requests', () => {
    const earnings = [50.0, 100.0, 75.0]; // Total = 225.00
    const payouts: { amount: number; status: 'pending' | 'approved' | 'paid' | 'rejected' }[] = [
      { amount: 50.0, status: 'paid' },
      { amount: 25.0, status: 'pending' },
      { amount: 40.0, status: 'rejected' }, // rejected should NOT deduct from available balance
    ];

    // 225 - 50 (paid) - 25 (pending) = 150.00
    const available = computeAvailableBalance(earnings, payouts);
    expect(available).toBe(150.0);
  });

  it('prevents negative available balance', () => {
    const earnings = [20.0];
    const payouts: { amount: number; status: 'pending' | 'approved' | 'paid' | 'rejected' }[] = [
      { amount: 30.0, status: 'paid' },
    ];

    expect(computeAvailableBalance(earnings, payouts)).toBe(0);
  });

  it('releases reserved funds when a payout request is rejected', () => {
    const earnings = [100.0];
    const payoutsBefore: { amount: number; status: 'pending' | 'approved' | 'paid' | 'rejected' }[] = [
      { amount: 60.0, status: 'pending' },
    ];
    expect(computeAvailableBalance(earnings, payoutsBefore)).toBe(40.0);

    // Admin rejects the payout
    const payoutsAfter: { amount: number; status: 'pending' | 'approved' | 'paid' | 'rejected' }[] = [
      { amount: 60.0, status: 'rejected' },
    ];
    expect(computeAvailableBalance(earnings, payoutsAfter)).toBe(100.0);
  });
});
