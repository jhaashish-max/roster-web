/**
 * Builds the downloadable roster-manager Claude skill bundle in the browser.
 * The skill files are served statically from `public/skill/`; the credentials file is
 * generated per user from `GET /api/skill/credentials` (v2 worker) so the zip is ready to use.
 */

const pad = (s) => s.padEnd(18, ' ');

/**
 * Renders references/credentials.md.
 * @param {{ api_url?: string, service_key?: string|null, supabase_url?: string|null, anon_key?: string|null }} values
 * @param {{ email?: string, date?: string, apiBase?: string }} meta
 */
export function renderCredentials(values = {}, meta = {}) {
    const date = meta.date || new Date().toISOString().slice(0, 10);
    const who = meta.email || 'unknown user';
    const ask = '# ask a roster admin';
    const line = (key, value) => `${pad(key)} = ${value ? value : ask}`;
    return [
        `# roster-manager credentials (generated from the Roster app on ${date} for ${who})`,
        '#',
        '# ROSTER_SERVICE_KEY lets the skill WRITE through the Roster API — treat this file like a password.',
        '# It is gitignored by the skill; never commit or share it.',
        '',
        line('ROSTER_API_URL', values.api_url || meta.apiBase || ''),
        line('ROSTER_SERVICE_KEY', values.service_key || null),
        line('SUPABASE_URL', values.supabase_url || null),
        line('SUPABASE_ANON_KEY', values.anon_key || null),
        '',
    ].join('\n');
}

/**
 * Loads the manifest and every listed file as text.
 * @param {string} baseUrl e.g. import.meta.env.BASE_URL ('/roster-web/')
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<{ manifest: object, files: Array<{ path: string, content: string }> }>}
 */
export async function loadSkillFiles(baseUrl, fetchFn = fetch) {
    const root = `${baseUrl.replace(/\/$/, '')}/skill/`;
    const manifestRes = await fetchFn(`${root}manifest.json`, { cache: 'no-cache' });
    if (!manifestRes.ok) throw new Error(`Skill manifest not found (${manifestRes.status})`);
    const manifest = await manifestRes.json();
    const paths = Array.isArray(manifest.files) ? manifest.files : [];
    const files = await Promise.all(paths.map(async (path) => {
        const res = await fetchFn(`${root}${path}`, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`Skill file missing: ${path} (${res.status})`);
        return { path, content: await res.text() };
    }));
    return { manifest, files };
}

/**
 * Assembles the zip. `JSZip` is passed in so the (large) library can be lazy-loaded by the caller.
 * @returns {Promise<Blob>}
 */
export async function buildSkillZip(JSZip, { files, credentialsPath, credentialsText }) {
    const zip = new JSZip();
    files.forEach((f) => zip.file(f.path, f.content));
    zip.file(credentialsPath, credentialsText);
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
