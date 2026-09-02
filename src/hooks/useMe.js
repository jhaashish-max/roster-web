import { useCallback, useEffect, useState } from 'react';
import { checkAdmin, getMe, getUserEmail, whoAmI } from '../lib/api';

/**
 * Who is signed in. Uses `GET /api/me` on the v2 worker, the two legacy calls on v1.
 * @param {{ me?: boolean } | undefined} features
 */
export function useMe(features, featuresLoading) {
    const [me, setMe] = useState({ email: getUserEmail(), name: null, team: null, isAdmin: false });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const useV2 = !!features?.me;

    const load = useCallback(async () => {
        setError(null);
        try {
            if (useV2) {
                const data = await getMe();
                setMe({ email: data.email || getUserEmail(), name: data.name || null, team: data.team || null, isAdmin: !!data.isAdmin });
            } else {
                const [isAdmin, profile] = await Promise.all([
                    checkAdmin().catch(() => false),
                    whoAmI().catch(() => null),
                ]);
                setMe({ email: profile?.email || getUserEmail(), name: profile?.name || null, team: profile?.team || null, isAdmin: !!isAdmin });
            }
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [useV2]);

    useEffect(() => {
        if (featuresLoading) return;
        load();
    }, [load, featuresLoading]);

    return { me, loading: loading || !!featuresLoading, error, reload: load };
}
