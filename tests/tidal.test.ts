import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TidalService } from '../src/server/adapters/tidal.js';
import { requestJson } from '../src/server/http.js';
import { accessToken } from '../src/server/oauth.js';

vi.mock('../src/server/http.js', () => ({ requestJson: vi.fn() }));
vi.mock('../src/server/oauth.js', () => ({ accessToken: vi.fn() }));

const jsonApiHeaders = {
  authorization: 'Bearer tidal-test-token',
  accept: 'application/vnd.api+json',
  'content-type': 'application/vnd.api+json',
};

describe('TIDAL authenticated API compatibility', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(accessToken).mockResolvedValue('tidal-test-token');
  });

  it('uses the authenticated user country and current JSON:API media type when loading playlists', async () => {
    vi.mocked(requestJson)
      .mockResolvedValueOnce({ data: { type: 'users', id: '42', attributes: { country: 'BR' } } })
      .mockResolvedValueOnce({ data: [{ type: 'playlists', id: 'p1', attributes: { name: 'DJ set', numberOfTrackItems: 12 } }] });

    await expect(new TidalService().listPlaylists()).resolves.toEqual([
      { id: 'p1', service: 'tidal', name: 'DJ set', description: undefined, trackCount: 12, url: undefined },
    ]);
    expect(requestJson).toHaveBeenNthCalledWith(1, 'https://openapi.tidal.com/v2/users/me', { headers: jsonApiHeaders });
    const [playlistUrl, init] = vi.mocked(requestJson).mock.calls[1];
    const url = new URL(playlistUrl);
    expect(url.searchParams.get('filter[owners.id]')).toBe('me');
    expect(url.searchParams.get('countryCode')).toBe('BR');
    expect(url.searchParams.get('sort')).toBe('-lastModifiedAt');
    expect(init).toEqual({ headers: jsonApiHeaders });
    expect(accessToken).toHaveBeenCalledWith('tidal');
  });

  it('retains authorization and JSON:API headers when following playlist pagination', async () => {
    vi.mocked(requestJson)
      .mockResolvedValueOnce({ data: { type: 'users', id: '42', attributes: { country: 'DE' } } })
      .mockResolvedValueOnce({ data: [], links: { next: '/v2/playlists?page%5Bcursor%5D=next' } })
      .mockResolvedValueOnce({ data: [] });

    await expect(new TidalService().listPlaylists()).resolves.toEqual([]);
    expect(requestJson).toHaveBeenNthCalledWith(3, 'https://openapi.tidal.com/v2/playlists?page%5Bcursor%5D=next', { headers: jsonApiHeaders });
  });

  it('uses the same supported media type for playlist creation', async () => {
    vi.mocked(requestJson).mockResolvedValueOnce({ data: { type: 'playlists', id: 'new', attributes: { name: 'Set' } } });
    await new TidalService().createPlaylist('Set');
    expect(requestJson).toHaveBeenCalledWith('https://openapi.tidal.com/v2/playlists', expect.objectContaining({
      method: 'POST', headers: { ...jsonApiHeaders, 'idempotency-key': expect.any(String) },
    }));
  });

  it('propagates user lookup failures instead of pretending a playlist connection succeeded', async () => {
    vi.mocked(requestJson).mockRejectedValueOnce(new Error('TIDAL permission denied'));
    await expect(new TidalService().listPlaylists()).rejects.toThrow('TIDAL permission denied');
    expect(requestJson).toHaveBeenCalledTimes(1);
  });
});
