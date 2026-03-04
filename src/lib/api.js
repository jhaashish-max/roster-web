const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://roster-api-bay.vercel.app';

/**
 * Get the stored auth token
 */
function getToken() {
    const session = getSession();
    return session?.access_token || null;
}

/**
 * Send OTP to a @razorpay.com email
 */
export async function sendOtp(email) {
    const res = await fetch(`${API_BASE}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send OTP');
    return data;
}

/**
 * Verify OTP and store session
 */
export async function verifyOtp(email, token) {
    const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to verify OTP');

    // Store session
    localStorage.setItem('roster_session', JSON.stringify(data));
    return data;
}

/**
 * Initiate Google OAuth login
 */
export async function signInWithGoogle() {
    const res = await fetch(`${API_BASE}/api/auth?action=google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirectTo: window.location.origin + import.meta.env.BASE_URL })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to initialize Google Login');

    // Redirect browser to the Supabase OAuth URL
    window.location.href = data.url;
}

/**
 * Handle OAuth callback from Supabase (runs on page load if access_token in URL hash)
 */
export function handleAuthCallback() {
    // Supabase OAuth callback puts access_token / refresh_token in the URL hash fragment
    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token=')) return null;

    try {
        const params = new URLSearchParams(hash.substring(1)); // remove #
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        const expires_in = params.get('expires_in');

        if (access_token) {
            // Decode JWT payload to get real user email
            let userEmail = 'unknown@razorpay.com';
            try {
                const payload = JSON.parse(atob(access_token.split('.')[1]));
                userEmail = payload.email || userEmail;
            } catch (e) { /* fallback to default */ }

            const sessionData = {
                access_token,
                refresh_token,
                expires_at: Math.floor(Date.now() / 1000) + parseInt(expires_in || '3600'),
                user: { email: userEmail }
            };
            localStorage.setItem('roster_session', JSON.stringify(sessionData));

            // Clean hash from URL for a cleaner appearance
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
            return sessionData;
        }
    } catch (err) {
        console.error("Error processing auth callback", err);
    }
    return null;
}

/**
 * Get stored session, or null if not logged in
 */
export function getSession() {
    const session = localStorage.getItem('roster_session');
    if (!session) return null;
    try {
        return JSON.parse(session);
    } catch {
        return null;
    }
}

/**
 * Check if the user is logged in
 */
export function isLoggedIn() {
    return !!getToken();
}

/**
 * Get logged-in user email
 */
export function getUserEmail() {
    const session = getSession();
    return session?.user?.email || null;
}

/**
 * Logout — clear session
 */
export function logout() {
    localStorage.removeItem('roster_session');
}

let isRefreshing = false;
let refreshPromise = null;

async function doTokenRefresh(refreshToken) {
    try {
        const res = await fetch(`${API_BASE}/api/auth?action=refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken })
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Refresh failed');

        localStorage.setItem('roster_session', JSON.stringify(data));
        return data.access_token;
    } catch (err) {
        logout();
        window.location.reload();
        throw err;
    }
}

/**
 * Make an authenticated API request
 */
async function authFetch(path, options = {}) {
    let session = getSession();

    if (!session || !session.access_token) {
        throw new Error('Not authenticated');
    }

    // Check if token is expiring in the next 5 minutes (300 seconds)
    // expires_at is typically seconds since epoch from Supabase
    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
    const isExpiringSoon = expiresAt > 0 && (expiresAt - Date.now() < 5 * 60 * 1000);

    if (isExpiringSoon && session.refresh_token) {
        if (!isRefreshing) {
            isRefreshing = true;
            refreshPromise = doTokenRefresh(session.refresh_token).finally(() => {
                isRefreshing = false;
                refreshPromise = null;
            });
        }

        try {
            await refreshPromise;
            // Get the newly saved token
            session = getSession();
        } catch (e) {
            // refresh failed, continue and maybe it works or returns 401
            console.error('Auto token refresh failed', e);
        }
    }

    const token = session?.access_token || null;
    if (!token) throw new Error('Not authenticated');

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

    if (res.status === 401) {
        logout();
        window.location.reload();
        throw new Error('Session expired');
    }

    return res;
}

// ==================== ROSTER FUNCTIONS ====================

export async function fetchRoster(year, month, team) {
    const res = await authFetch(`/api/roster/fetch?year=${year}&month=${month}&team=${encodeURIComponent(team)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function fetchAllTeamsRoster(year, month) {
    const res = await authFetch(`/api/roster/fetch-all?year=${year}&month=${month}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function checkRosterExists(year, month, team) {
    const res = await authFetch(`/api/roster/exists?year=${year}&month=${month}&team=${encodeURIComponent(team)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.exists;
}

export async function deleteRoster(year, month, team) {
    const res = await authFetch(`/api/roster/delete?year=${year}&month=${month}&team=${encodeURIComponent(team)}`, {
        method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.success;
}

export async function updateRosterEntry(date, name, status, team) {
    const res = await authFetch('/api/roster/update', {
        method: 'POST',
        body: JSON.stringify({ date, name, status, team })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.success;
}

export async function bulkUpdateRosterEntries(entries) {
    const res = await authFetch('/api/roster/bulk-update', {
        method: 'POST',
        body: JSON.stringify({ entries })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.success;
}

// ==================== TEAM FUNCTIONS ====================

export async function getTeams() {
    const res = await authFetch('/api/teams/list');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function createTeam(name, members, customPrompt = null) {
    const res = await authFetch('/api/teams/create', {
        method: 'POST',
        body: JSON.stringify({ name, members, custom_prompt: customPrompt })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function updateTeam(id, updates) {
    const res = await authFetch(`/api/teams/update?id=${id}`, {
        method: 'PUT',
        body: JSON.stringify({
            name: updates.name,
            members: updates.members,
            custom_prompt: updates.customPrompt !== undefined ? updates.customPrompt : updates.custom_prompt
        })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function deleteTeam(id) {
    const res = await authFetch(`/api/teams/delete?id=${id}`, {
        method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.success;
}

// ==================== ADMIN FUNCTIONS ====================

export async function checkAdmin() {
    const res = await authFetch('/api/admin?action=check');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.isAdmin;
}

export async function listAdmins() {
    const res = await authFetch('/api/admin?action=list');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.admins;
}

export async function addAdmin(email) {
    const res = await authFetch('/api/admin?action=add', {
        method: 'POST',
        body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function removeAdmin(email) {
    const res = await authFetch('/api/admin?action=remove', {
        method: 'POST',
        body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

// ==================== LEAVE REQUEST FUNCTIONS ====================

export async function whoAmI() {
    const res = await authFetch('/api/requests?action=whoami');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function createLeaveRequest({ request_type, dates, reason }) {
    const res = await authFetch('/api/requests?action=create', {
        method: 'POST',
        body: JSON.stringify({ request_type, dates, reason })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function getMyRequests() {
    const res = await authFetch('/api/requests?action=my-requests');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.requests;
}

export async function getPendingRequests() {
    const res = await authFetch('/api/requests?action=pending');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.requests;
}

export async function reviewRequest(id, decision) {
    const res = await authFetch('/api/requests?action=review', {
        method: 'POST',
        body: JSON.stringify({ id, decision })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}


// ==================== MEMBER EMAILS FUNCTIONS ====================

export async function getTeamEmails() {
    const res = await authFetch('/api/teams/emails');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function updateTeamEmails(emails) {
    const res = await authFetch('/api/teams/emails', {
        method: 'POST',
        body: JSON.stringify({ emails })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

// ==================== SHIFT CONFIGURATIONS FUNCTIONS ====================

export async function getShiftConfigs() {
    const res = await authFetch('/api/teams/shift-configs');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function saveShiftConfigs(configs) {
    const res = await authFetch('/api/teams/shift-configs', {
        method: 'POST',
        body: JSON.stringify({ configs })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function deleteShiftConfig(id) {
    const res = await authFetch(`/api/teams/shift-configs?id=${id}`, {
        method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}
