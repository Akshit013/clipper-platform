import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Extract Instagram shortcode from a Reel URL.
 * Supports:
 * - https://www.instagram.com/reel/ABC123/
 * - https://www.instagram.com/reels/ABC123/
 * - https://www.instagram.com/p/ABC123/
 * - https://instagram.com/reel/ABC123
 */
export function extractInstagramShortcode(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('instagram.com')) {
      return null;
    }
    const match = parsed.pathname.match(/\/(reel|reels|p)\/([A-Za-z0-9_-]+)/);
    return match ? match[2] : null;
  } catch {
    return null;
  }
}

/**
 * Validate an Instagram Reel URL format.
 */
export function isValidInstagramReelUrl(url: string): boolean {
  return extractInstagramShortcode(url) !== null;
}

/**
 * Format a number as currency (INR by default).
 */
export function formatCurrency(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat("en-IN", {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Format a large number with commas.
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

/**
 * Format a date for display.
 */
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

/**
 * Format a date with time for display.
 */
export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}
