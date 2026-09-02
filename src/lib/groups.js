/**
 * Groups roster rows by team for the grid: names with rows, members without rows,
 * and a name → date → status map. Teams with members but no rows this month still
 * get a group so admins can fill them in.
 */
export function buildGroups(rows, teams) {
    const byTeam = new Map();
    rows.forEach((r) => {
        const team = r.Team || 'Unknown';
        if (!byTeam.has(team)) byTeam.set(team, []);
        byTeam.get(team).push(r);
    });
    teams.forEach((t) => { if (!t.archived && !byTeam.has(t.name)) byTeam.set(t.name, []); });

    return Array.from(byTeam.keys()).sort((a, b) => a.localeCompare(b)).map((team) => {
        const items = byTeam.get(team);
        const map = {};
        items.forEach((r) => {
            if (!map[r.Name]) map[r.Name] = {};
            map[r.Name][r.Date] = r.Status;
        });
        const teamDef = teams.find((t) => t.name === team);
        const members = teamDef?.members || [];
        const agents = Object.keys(map).sort((a, b) => a.localeCompare(b));
        const unrostered = members.filter((m) => !map[m]).sort((a, b) => a.localeCompare(b));
        return { team, teamId: teamDef?.id, archived: !!teamDef?.archived, agents, unrostered, map };
    }).filter((g) => g.agents.length > 0 || g.unrostered.length > 0);
}
