import { describe, expect, it, vi } from 'vitest';
import { loadSkillFiles, renderCredentials } from '../skillBundle';

describe('renderCredentials', () => {
    it('writes every key for an admin', () => {
        const text = renderCredentials(
            { api_url: 'https://roster-api.example.workers.dev', service_key: 'svc_123', supabase_url: 'https://x.supabase.co', anon_key: 'anon_456' },
            { email: 'jha.ashish@razorpay.com', date: '2026-09-02' },
        );
        expect(text).toContain('# roster-manager credentials (generated from the Roster app on 2026-09-02 for jha.ashish@razorpay.com)');
        expect(text).toContain('ROSTER_API_URL     = https://roster-api.example.workers.dev');
        expect(text).toContain('ROSTER_SERVICE_KEY = svc_123');
        expect(text).toContain('SUPABASE_URL       = https://x.supabase.co');
        expect(text).toContain('SUPABASE_ANON_KEY  = anon_456');
    });

    it('falls back to the configured API base and comments the rest when the endpoint is missing', () => {
        const text = renderCredentials({}, { email: 'lead@razorpay.com', date: '2026-09-02', apiBase: 'https://roster-api.jha-ashish.workers.dev' });
        expect(text).toContain('ROSTER_API_URL     = https://roster-api.jha-ashish.workers.dev');
        expect(text).toContain('ROSTER_SERVICE_KEY = # ask a roster admin');
        expect(text).toContain('SUPABASE_URL       = # ask a roster admin');
        expect(text).toContain('SUPABASE_ANON_KEY  = # ask a roster admin');
        expect(text).not.toMatch(/=\s*$/m);
    });

    it('comments only the missing service key for a non-admin', () => {
        const text = renderCredentials({ api_url: 'https://api', service_key: null, supabase_url: 'https://s', anon_key: 'a' }, { date: '2026-09-02' });
        expect(text).toContain('ROSTER_SERVICE_KEY = # ask a roster admin');
        expect(text).toContain('SUPABASE_ANON_KEY  = a');
    });
});

describe('loadSkillFiles', () => {
    it('fetches the manifest and every listed file relative to the base URL', async () => {
        const manifest = { files: ['roster-manager/SKILL.md', 'roster-manager/assets/zscaler-root.crt'], credentials_file: 'roster-manager/references/credentials.md' };
        const fetchFn = vi.fn(async (url) => {
            if (url.endsWith('manifest.json')) return { ok: true, json: async () => manifest };
            return { ok: true, text: async () => `content of ${url}` };
        });
        const out = await loadSkillFiles('/roster-web/', fetchFn);
        expect(fetchFn).toHaveBeenCalledWith('/roster-web/skill/manifest.json', expect.anything());
        expect(out.files).toEqual([
            { path: 'roster-manager/SKILL.md', content: 'content of /roster-web/skill/roster-manager/SKILL.md' },
            { path: 'roster-manager/assets/zscaler-root.crt', content: 'content of /roster-web/skill/roster-manager/assets/zscaler-root.crt' },
        ]);
    });
});
