import { describe, it, expect } from 'vitest';
import {
  extractInstagramShortcode,
  isValidInstagramReelUrl,
  formatCurrency,
  formatNumber,
} from '@/lib/utils';

describe('Instagram URL & Shortcode Parser', () => {
  it('extracts shortcode from standard reel URL', () => {
    const url = 'https://www.instagram.com/reel/C3bXyZ8p_12/';
    expect(extractInstagramShortcode(url)).toBe('C3bXyZ8p_12');
    expect(isValidInstagramReelUrl(url)).toBe(true);
  });

  it('extracts shortcode without trailing slash', () => {
    const url = 'https://www.instagram.com/reel/DA123456';
    expect(extractInstagramShortcode(url)).toBe('DA123456');
    expect(isValidInstagramReelUrl(url)).toBe(true);
  });

  it('extracts shortcode with query parameters', () => {
    const url =
      'https://www.instagram.com/reel/C4defgh_9/?igsh=MzRlODBiNWFlZA==&utm_source=qr';
    expect(extractInstagramShortcode(url)).toBe('C4defgh_9');
    expect(isValidInstagramReelUrl(url)).toBe(true);
  });

  it('extracts shortcode from /p/ post URL', () => {
    const url = 'https://instagram.com/p/B987654321/';
    expect(extractInstagramShortcode(url)).toBe('B987654321');
    expect(isValidInstagramReelUrl(url)).toBe(true);
  });

  it('extracts shortcode from /reels/ URL', () => {
    const url = 'https://www.instagram.com/reels/XYZ123ABC/';
    expect(extractInstagramShortcode(url)).toBe('XYZ123ABC');
    expect(isValidInstagramReelUrl(url)).toBe(true);
  });

  it('rejects invalid or non-Instagram URLs', () => {
    expect(extractInstagramShortcode('https://tiktok.com/@user/video/123')).toBeNull();
    expect(isValidInstagramReelUrl('https://tiktok.com/@user/video/123')).toBe(false);
    expect(extractInstagramShortcode('https://youtube.com/shorts/12345')).toBeNull();
    expect(extractInstagramShortcode('not-a-url')).toBeNull();
    expect(extractInstagramShortcode('https://instagram.com/direct/inbox')).toBeNull();
  });
});

describe('Formatting Utilities', () => {
  it('formats currency correctly', () => {
    expect(formatCurrency(25)).toBe('$25.00');
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('formats large numbers with commas', () => {
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(1500000)).toBe('1,500,000');
    expect(formatNumber(0)).toBe('0');
  });
});
