import { useCallback, useEffect, useState } from 'react';
import { getTeams } from '../lib/api';

/** Loads the team list. `includeArchived` is honoured by the v2 worker only. */
export function useTeams({ includeArchived = false, enabled = true } = {}) {
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const reload = useCallback(async () => {
        setError(null);
        try {
            const data = await getTeams(includeArchived);
            const list = Array.isArray(data) ? data : [];
            setTeams(list.map((t) => ({ ...t, members: Array.isArray(t.members) ? t.members : [], archived: !!t.archived })));
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [includeArchived]);

    useEffect(() => {
        if (!enabled) return;
        reload();
    }, [reload, enabled]);

    return { teams, setTeams, loading, error, reload };
}
