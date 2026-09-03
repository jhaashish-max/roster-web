/**
 * Groups roster rows by team for the grid: names with rows, members without rows,
 * and a name → date → status map. Teams with members but no rows this month only get a
 * group when `showEmptyTeams` is true (i.e. the user picked that team explicitly).
 */
/**
 * @param {Array} rows roster rows for the month (already limited to the selected teams by the API calls)
 * @param {Array} teams all teams
 * @param {{ showEmptyTeams?: boolean, onlyTeams?: string[] }} [opts]
 *   showEmptyTeams — include teams that have no rows (as "Not set" members)
 *   onlyTeams      — when non-empty, render only these team names (the user's filter)
 */
export function buildGroups(rows, teams, { showEmptyTeams = true, onlyTeams = [] } = {}) {
    const only = new Set(onlyTeams);
    const byTeam = new Map();
    rows.forEach((r) => {
        const team = r.Team || 'Unknown';
        if (!byTeam.has(team)) byTeam.set(team, []);
        byTeam.get(team).push(r);
    });
    teams.forEach((t) => { if (!t.archived && !byTeam.has(t.name) && (only.size === 0 || only.has(t.name))) byTeam.set(t.name, []); });

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
    }).filter((g) => (only.size === 0 || only.has(g.team)) && (g.agents.length > 0 || (showEmptyTeams && g.unrostered.length > 0)));
}
