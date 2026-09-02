import { useEffect, useState } from 'react';
import { getHealth } from '../lib/api';

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, value: null, promise: null };

const V1 = Object.freeze({ apiVersion: 'v1', version: null, features: Object.freeze({}) });

function toFeatures(health) {
    if (!health) return V1;
    const list = Array.isArray(health.features) ? health.features : [];
    const has = (f) => list.includes(f);
    return {
        apiVersion: 'v2',
        version: health.version || '2',
        features: Object.freeze({
            cellDelete: has('cell-delete'),
            moveMember: has('move-member'),
            skillCredentials: has('skill-credentials'),
            audit: has('audit'),
            archive: has('archive'),
            serviceKey: has('service-key'),
            me: true,
        }),
    };
}

/** Probes the API once (cached 5 minutes) and tells the app which capabilities exist. */
export async function probeFeatures(force = false) {
    const now = Date.now();
    if (!force && cache.value && now - cache.at < CACHE_TTL_MS) return cache.value;
    if (cache.promise) return cache.promise;
    cache.promise = getHealth()
        .then((health) => {
            const value = toFeatures(health);
            cache = { at: Date.now(), value, promise: null };
            return value;
        })
        .catch(() => {
            // network trouble: assume the legacy API so nothing is hidden by mistake, but do not cache
            cache = { at: 0, value: null, promise: null };
            return V1;
        });
    return cache.promise;
}

export function useFeatures() {
    const [state, setState] = useState(() => (cache.value ? { loading: false, ...cache.value } : { loading: true, ...V1 }));

    useEffect(() => {
        let cancelled = false;
        probeFeatures().then((value) => {
            if (!cancelled) setState({ loading: false, ...value });
        });
        return () => { cancelled = true; };
    }, []);

    return state;
}
