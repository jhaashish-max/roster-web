import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, errorFromResponse, request, setSessionExpiredHandler, getHealth } from '../api';

const session = { access_token: 'tok', refresh_token: 'ref', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: 'a@razorpay.com' } };

function mockFetch(status, body, ok = status < 400) {
    return vi.fn().mockResolvedValue({ ok, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
}

describe('api client', () => {
    beforeEach(() => {
        localStorage.setItem('roster_session', JSON.stringify(session));
        setSessionExpiredHandler(() => {});
    });
    afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

    it('maps server errors to ApiError with status, code and message', () => {
        const err = errorFromResponse({ status: 409 }, { error: 'Team has roster rows', code: 'HAS_ROSTER', details: { rows: 42 } });
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(409);
        expect(err.code).toBe('HAS_ROSTER');
        expect(err.message).toBe('Team has roster rows');
        expect(err.details.rows).toBe(42);
        expect(errorFromResponse({ status: 403 }, null).code).toBe('FORBIDDEN');
        expect(errorFromResponse({ status: 500 }, { error: 'boom' }).code).toBe('INTERNAL');
    });

    it('throws ApiError for non-OK responses and returns JSON otherwise', async () => {
        globalThis.fetch = mockFetch(400, { error: 'year is required' });
        await expect(request('/api/roster/fetch')).rejects.toMatchObject({ status: 400, code: 'VALIDATION', message: 'year is required' });
        globalThis.fetch = mockFetch(200, [{ Date: '2026-09-01' }]);
        await expect(request('/api/roster/fetch')).resolves.toEqual([{ Date: '2026-09-01' }]);
        expect(globalThis.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
    });

    it('treats a 404 on /api/health as the legacy worker', async () => {
        globalThis.fetch = mockFetch(404, { error: 'Not found' });
        await expect(getHealth()).resolves.toBeNull();
    });

    it('calls the session-expired handler on 401', async () => {
        const handler = vi.fn();
        setSessionExpiredHandler(handler);
        globalThis.fetch = mockFetch(401, { error: 'Unauthorized' });
        await expect(request('/api/teams/list')).rejects.toMatchObject({ status: 401 });
        expect(handler).toHaveBeenCalled();
    });

    it('retries a GET once on a network failure', async () => {
        globalThis.fetch = vi.fn()
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '{"ok":true}' });
        await expect(request('/api/teams/list')).resolves.toEqual({ ok: true });
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });
});
