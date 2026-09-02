/**
 * Typed API client for the roster worker.
 *
 * - Every call returns parsed JSON or throws an ApiError { status, code, message, details }.
 * - Reads time out after 20s, writes after 60s (AbortController).
 * - GET requests are retried once on a network failure.
 * - Token refresh is single-flight; a 401 clears the session and reloads.
 * - Works against the v1 worker (legacy routes) and the v2 worker (see docs/API_CONTRACT.md).
 */

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'https://roster-api.jha-ashish.workers.dev').replace(/\/$/, '');

const SESSION_KEY = 'roster_session';
const READ_TIMEOUT_MS = 20_000;
const WRITE_TIMEOUT_MS = 60_000;

export class ApiError extends Error {
    constructor(message, { status = 0, code = 'UNKNOWN', details = null } = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.details = details;
    }
    get isNetwork() { return this.status === 0; }
    get isAuth() { return this.status === 401; }
    get isForbidden() { return this.status === 403; }
}

/** Map a fetch Response (already known to be !ok) plus its parsed body to an ApiError. */
export function errorFromResponse(res, body) {
    const message = (body && (body.error || body.message)) || `Request failed (${res.status})`;
    const code = (body && body.code) || defaultCodeFor(res.status);
    return new ApiError(message, { status: res.status, code, details: body && body.details ? body.details : body });
}

function defaultCodeFor(status) {
    if (status === 400) return 'VALIDATION';
    if (status === 401) return 'UNAUTHORIZED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NOT_FOUND';
    if (status === 409) return 'CONFLICT';
    if (status >= 500) return 'INTERNAL';
    return 'UNKNOWN';
}

// ─────────────────────────── session ───────────────────────────

export function getSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function saveSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getToken() {
    return getSession()?.access_token || null;
}

export function isLoggedIn() {
    return !!getToken();
}

export function getUserEmail() {
    return getSession()?.user?.email || null;
}

export function logout() {
    localStorage.removeItem(SESSION_KEY);
}

let sessionExpiredHandler = () => {
    logout();
    if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
        try { window.location.reload(); } catch { /* jsdom */ }
    }
};

/** Allows the app (or tests) to decide what happens when the session dies. */
export function setSessionExpiredHandler(fn) {
    sessionExpiredHandler = fn;
}

/** Google OAuth via the worker → Supabase. Redirects the browser. */
export async function signInWithGoogle() {
    const data = await request('/api/auth?action=google', {
        method: 'POST',
        body: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
        auth: false,
    });
    window.location.href = data.url;
}

/** Runs on page load: pulls the Supabase tokens out of the URL hash after OAuth. */
export function handleAuthCallback() {
    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token=')) return null;
    try {
        const params = new URLSearchParams(hash.substring(1));
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        const expires_in = params.get('expires_in');
        if (!access_token) return null;

        let email = null;
        try {
            const payload = JSON.parse(atob(access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            email = payload.email || null;
        } catch { /* unreadable token payload — worker will reject it if invalid */ }

        const session = {
            access_token,
            refresh_token,
            expires_at: Math.floor(Date.now() / 1000) + parseInt(expires_in || '3600', 10),
            user: { email },
        };
        saveSession(session);
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        return session;
    } catch (err) {
        console.error('Error processing auth callback', err);
        return null;
    }
}

let refreshPromise = null;

async function refreshSession(refreshToken) {
    if (!refreshPromise) {
        refreshPromise = (async () => {
            const data = await request('/api/auth?action=refresh', {
                method: 'POST',
                body: { refresh_token: refreshToken },
                auth: false,
            });
            saveSession(data);
            return data.access_token;
        })().finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
}

async function freshToken() {
    const session = getSession();
    if (!session?.access_token) throw new ApiError('Not authenticated', { status: 401, code: 'UNAUTHORIZED' });
    const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
    const expiringSoon = expiresAtMs > 0 && expiresAtMs - Date.now() < 5 * 60 * 1000;
    if (expiringSoon && session.refresh_token) {
        try {
            return await refreshSession(session.refresh_token);
        } catch (err) {
            if (err instanceof ApiError && err.status === 401) {
                sessionExpiredHandler();
                throw new ApiError('Session expired', { status: 401, code: 'UNAUTHORIZED' });
            }
            // network hiccup: keep using the current token, the server may still accept it
        }
    }
    return session.access_token;
}

// ─────────────────────────── core request ───────────────────────────

/**
 * @param {string} path
 * @param {{ method?: string, body?: any, auth?: boolean, timeout?: number, signal?: AbortSignal, retry?: boolean, raw?: boolean, headers?: object }} options
 */
export async function request(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const isRead = method === 'GET' || method === 'HEAD';
    const timeout = options.timeout ?? (isRead ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS);
    const retry = options.retry ?? isRead;
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.body !== undefined && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (options.auth !== false) headers.Authorization = `Bearer ${await freshToken()}`;

    const attempt = async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeout);
        const onOuterAbort = () => controller.abort(options.signal?.reason);
        if (options.signal) {
            if (options.signal.aborted) onOuterAbort();
            else options.signal.addEventListener('abort', onOuterAbort, { once: true });
        }
        try {
            const res = await fetch(`${API_BASE}${path}`, {
                method,
                headers,
                body: options.body === undefined ? undefined : (options.body instanceof FormData ? options.body : JSON.stringify(options.body)),
                signal: controller.signal,
            });
            if (options.raw) return res;
            const text = await res.text();
            let body = null;
            if (text) {
                try { body = JSON.parse(text); } catch { body = { error: text }; }
            }
            if (!res.ok) {
                if (res.status === 401 && options.auth !== false) sessionExpiredHandler();
                throw errorFromResponse(res, body);
            }
            return body;
        } finally {
            clearTimeout(timer);
            if (options.signal) options.signal.removeEventListener('abort', onOuterAbort);
        }
    };

    try {
        return await attempt();
    } catch (err) {
        if (err instanceof ApiError) throw err;
        if (err?.name === 'AbortError' && options.signal?.aborted) throw new ApiError('Cancelled', { status: 0, code: 'CANCELLED' });
        const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
        if (retry && !isTimeout) {
            try {
                return await attempt();
            } catch (err2) {
                if (err2 instanceof ApiError) throw err2;
                throw new ApiError(err2?.message || 'Network error', { status: 0, code: 'NETWORK' });
            }
        }
        throw new ApiError(isTimeout ? 'The request timed out' : (err?.message || 'Network error'), { status: 0, code: isTimeout ? 'TIMEOUT' : 'NETWORK' });
    }
}

const q = (params) => {
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') usp.set(k, String(v)); });
    const s = usp.toString();
    return s ? `?${s}` : '';
};

// ─────────────────────────── meta ───────────────────────────

/** Returns the health payload of the v2 worker, or null on the v1 worker (404). */
export async function getHealth() {
    try {
        return await request('/api/health', { auth: false, timeout: 8000, retry: false });
    } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
    }
}

export const getMe = () => request('/api/me');

/** v2: credentials for the downloadable Claude skill. `service_key` is only present for admins. 404 on the v1 worker. */
export const getSkillCredentials = () => request('/api/skill/credentials', { retry: false });

// ─────────────────────────── roster ───────────────────────────

export const fetchRoster = (year, month, team) => request(`/api/roster/fetch${q({ year, month, team })}`);
export const fetchAllTeamsRoster = (year, month) => request(`/api/roster/fetch-all${q({ year, month })}`);
export const checkRosterExists = async (year, month, team) => (await request(`/api/roster/exists${q({ year, month, team })}`)).exists;
export const deleteRoster = (year, month, team) => request(`/api/roster/delete${q({ year, month, team })}`, { method: 'DELETE' });
export const updateRosterEntry = (date, name, status, team) => request('/api/roster/update', { method: 'POST', body: { date, name, status, team } });
export const deleteRosterCell = (date, name, team) => request(`/api/roster/cell${q({ date, name, team })}`, { method: 'DELETE' });
export const bulkUpdateRosterEntries = (entries) => request('/api/roster/bulk-update', { method: 'POST', body: { entries } });

// ─────────────────────────── teams ───────────────────────────

export const getTeams = (includeArchived = false) => request(`/api/teams/list${q({ include_archived: includeArchived ? 1 : undefined })}`);
export const createTeam = (name, members, customPrompt = null) => request('/api/teams/create', { method: 'POST', body: { name, members, custom_prompt: customPrompt } });
export const updateTeam = (id, updates) => request(`/api/teams/update${q({ id })}`, {
    method: 'PUT',
    body: {
        name: updates.name,
        members: updates.members,
        custom_prompt: updates.customPrompt !== undefined ? updates.customPrompt : updates.custom_prompt,
    },
});
/** @param {'archive'|'purge'|undefined} mode v2 only */
export const deleteTeam = (id, mode) => request(`/api/teams/delete${q({ id, mode })}`, { method: 'DELETE' });
export const archiveTeam = (id) => request(`/api/teams/archive${q({ id })}`, { method: 'POST' });
export const unarchiveTeam = (id) => request(`/api/teams/unarchive${q({ id })}`, { method: 'POST' });
export const addTeamMember = (team_id, name, email) => request('/api/teams/add-member', { method: 'POST', body: { team_id, name, email: email || undefined } });
export const removeTeamMember = (team_id, name, mark_exit_from) => request('/api/teams/remove-member', { method: 'POST', body: { team_id, name, mark_exit_from } });
export const moveTeamMember = ({ name, from_team, to_team, effective_date }) => request('/api/teams/move-member', { method: 'POST', body: { name, from_team, to_team, effective_date } });

export const getTeamEmails = () => request('/api/teams/emails');
export const updateTeamEmails = (emails) => request('/api/teams/emails', { method: 'POST', body: { emails } });

export const getShiftConfigs = () => request('/api/teams/shift-configs');
export const saveShiftConfigs = (configs) => request('/api/teams/shift-configs', { method: 'POST', body: { configs } });
export const deleteShiftConfig = (id) => request(`/api/teams/shift-configs${q({ id })}`, { method: 'DELETE' });

// ─────────────────────────── admins ───────────────────────────

export const checkAdmin = async () => (await request('/api/admin?action=check')).isAdmin;
export const listAdmins = async () => (await request('/api/admin?action=list')).admins;
export const addAdmin = (email) => request('/api/admin?action=add', { method: 'POST', body: { email } });
export const removeAdmin = (email) => request('/api/admin?action=remove', { method: 'POST', body: { email } });

// ─────────────────────────── leave requests ───────────────────────────

export const whoAmI = () => request('/api/requests?action=whoami');
export const createLeaveRequest = ({ request_type, dates, reason }) => request('/api/requests?action=create', { method: 'POST', body: { request_type, dates, reason } });
export const getMyRequests = async () => (await request('/api/requests?action=my-requests')).requests;
export const getPendingRequests = async () => (await request('/api/requests?action=pending')).requests;
export const reviewRequest = (id, decision) => request('/api/requests?action=review', { method: 'POST', body: { id, decision } });

// ─────────────────────────── freshdesk / presence ───────────────────────────

export const getFreshdeskAvailability = (email) => request(`/api/freshdesk/availability${q({ email })}`, { retry: false });
export const toggleFreshdeskAvailability = (email, action) => request('/api/freshdesk/availability/toggle', { method: 'POST', body: { email, action } });
export const postPresenceActivity = (name) => request('/api/pusher/activity', { method: 'POST', body: { name }, timeout: 8000 });

// ─────────────────────────── audit (v2) ───────────────────────────

/** v2, admin only. Empty params are stripped by `q()`. → { entries, total, limit, offset, hasMore, actions } */
export const getAudit = (params = {}) => request(`/api/audit${q(params)}`, { retry: false });
