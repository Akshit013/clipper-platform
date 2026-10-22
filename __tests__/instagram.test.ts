import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PublicInstagramAdapter,
  InstagramMetricService,
} from '@/lib/instagram';

describe('PublicInstagramAdapter', () => {
  let adapter: PublicInstagramAdapter;

  beforeEach(() => {
    adapter = new PublicInstagramAdapter();
    vi.restoreAllMocks();
  });

  it('marks metrics as unavailable when Instagram returns 404', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    } as Response);

    const result = await adapter.fetchMetrics('NONEXISTENT_SHORTCODE');
    expect(result.isAvailable).toBe(false);
    expect(result.observedViews).toBeNull();
    expect(result.error).toContain('not found');
  });

  it('marks metrics as stale when Instagram hits rate limit 429', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    } as Response);

    const result = await adapter.fetchMetrics('C123456');
    expect(result.isAvailable).toBe(false);
    expect(result.isStale).toBe(true);
    expect(result.error).toContain('rate limit');
  });

  it('extracts public feedback counts from valid embed HTML without inventing metrics', async () => {
    const mockEmbedHtml = `
      <div class="Feedback">
        <span>15,420 likes</span>
        <span>432 comments</span>
      </div>
    `;

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => mockEmbedHtml,
    } as Response);

    const result = await adapter.fetchMetrics('VALID_REEL_123');
    expect(result.isAvailable).toBe(true);
    expect(result.likeCount).toBe(15420);
    expect(result.commentCount).toBe(432);
    // Views are null unless explicitly present in embed; we never invent metrics
    expect(result.observedViews).toBeNull();
  });

  it('detects deleted or restricted profiles in embed response', async () => {
    const mockRestrictedHtml = `
      <div>Sorry, this page isn't available. Restricted profile.</div>
    `;

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => mockRestrictedHtml,
    } as Response);

    const result = await adapter.fetchMetrics('RESTRICTED_REEL');
    expect(result.isAvailable).toBe(false);
    expect(result.error).toContain('restricted');
  });
});

describe('InstagramMetricService', () => {
  it('returns structured validation error for invalid reel shortcode/URL', async () => {
    const service = new InstagramMetricService();
    const result = await service.getMetrics('https://invalid-domain.com/video');
    expect(result.isAvailable).toBe(false);
    expect(result.error).toContain('Invalid Instagram Reel URL');
  });
});
