import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, CheckSquare, ChevronLeft, ChevronRight, Clock, FileText, LayoutGrid, LogOut, Moon, PieChart, PlusCircle, Settings, ShieldCheck, Sun, Users } from 'lucide-react';
import Logo from '../components/Logo';
import CommandPalette from '../components/CommandPalette';
import TeamSelector from '../components/TeamSelector';
import LivePresence from '../components/LivePresence';
import ErrorBoundary from '../components/ErrorBoundary';
import Banner from '../components/Banner';
import ClaudeSkillModal from '../components/ClaudeSkillModal';
import DeleteMonthModal from '../components/DeleteMonthModal';
import AdminManager from '../components/AdminManager';
import MoveMemberDialog from '../components/MoveMemberDialog';
import Overview from '../pages/Overview';
import RosterPage from '../pages/RosterPage';
import ReportsPage from '../pages/ReportsPage';
import RequestsPage from '../pages/RequestsPage';
import ApprovalsPage from '../pages/ApprovalsPage';
import AutoBucketPage from '../pages/AutoBucketPage';
import TeamSettingsPage from '../pages/TeamSettingsPage';
import { useFeatures } from '../hooks/useFeatures';
import { useMe } from '../hooks/useMe';
import { useTeams } from '../hooks/useTeams';
import { useRoster } from '../hooks/useRoster';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useToast } from '../hooks/useToast';
import { deleteRoster, deleteRosterCell, getShiftConfigs, updateRosterEntry } from '../lib/api';
import { monthLabel } from '../lib/dates';
import { cx, initials } from '../lib/utils';

const NAV = [
    { id: 'dashboard', label: 'Overview', Icon: LayoutGrid },
    { id: 'roster', label: 'Roster', Icon: Calendar },
    { id: 'summary', label: 'Reports', Icon: PieChart },
];

export default function AuthenticatedApp({ onLogout }) {
    const toast = useToast();
    const featuresState = useFeatures();
    const features = featuresState.features;
    const { me, reload: reloadMe } = useMe(features, featuresState.loading);
    const { teams, loading: teamsLoading, reload: reloadTeams } = useTeams({ includeArchived: true });
    const activeTeams = useMemo(() => teams.filter((t) => !t.archived), [teams]);

    const [view, setView] = useState('dashboard');
    const [theme, setTheme] = useLocalStorage('theme', 'light');
    const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage('sidebar_collapsed', false);
    const [selectedTeams, setSelectedTeams] = useLocalStorage('roster_selected_teams', []);
    const [currentDate, setCurrentDate] = useState(() => new Date());
    const [adminMode, setAdminMode] = useState(false);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [showGenerator, setShowGenerator] = useState(false);
    const [showDelete, setShowDelete] = useState(false);
    const [showAdmins, setShowAdmins] = useState(false);
    const [moveTarget, setMoveTarget] = useState(null); // { name, team }
    const [deleting, setDeleting] = useState(false);
    const [shiftConfigs, setShiftConfigs] = useState([]);
    const [bannerDismissed, setBannerDismissed] = useState(false);

    const isAdmin = me.isAdmin && adminMode;
    const roster = useRoster(currentDate, selectedTeams);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    }, [theme]);

    useEffect(() => {
        const onKey = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((o) => !o); }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    useEffect(() => {
        if (!isAdmin) return undefined;
        let cancelled = false;
        getShiftConfigs().then((rows) => { if (!cancelled) setShiftConfigs(rows || []); }).catch(() => { /* shift options are optional */ });
        return () => { cancelled = true; };
    }, [isAdmin]);

    // Drop stale team names from the persisted filter once teams are known.
    useEffect(() => {
        if (teamsLoading || teams.length === 0 || selectedTeams.length === 0) return;
        const known = new Set(teams.map((t) => t.name));
        if (selectedTeams.some((n) => !known.has(n))) setSelectedTeams(selectedTeams.filter((n) => known.has(n)));
    }, [teams, teamsLoading, selectedTeams, setSelectedTeams]);

    const toggleAdminMode = () => {
        if (!me.isAdmin) return;
        // Side effects stay outside the state updater (StrictMode runs updaters twice).
        const next = !adminMode;
        setAdminMode(next);
        if (next) toast.success('Admin mode on — cells are editable');
    };

    const handleCellUpdate = useCallback(async (date, name, status, team) => {
        if (!isAdmin || !team) return;
        const previous = roster.rows.find((r) => r.Date === date && r.Name === name && (r.Team || '') === team)?.Status || '';
        roster.applyCell(date, name, status, team);
        try {
            if (!status) {
                if (features.cellDelete) await deleteRosterCell(date, name, team);
                else await updateRosterEntry(date, name, '-', team);
            } else {
                const res = await updateRosterEntry(date, name, status, team);
                if (res?.status && res.status !== status) roster.applyCell(date, name, res.status, team);
            }
        } catch (err) {
            roster.applyCell(date, name, previous, team);
            toast.error(err.message || 'Failed to update cell');
        }
    }, [isAdmin, roster, features.cellDelete, toast]);

    const handleDeleteMonth = async (teamName) => {
        if (!teamName) return;
        setDeleting(true);
        try {
            await deleteRoster(currentDate.getFullYear(), currentDate.getMonth() + 1, teamName);
            toast.success(`Roster for ${teamName} · ${monthLabel(currentDate.getFullYear(), currentDate.getMonth() + 1)} deleted`);
            setShowDelete(false);
            roster.reload();
        } catch (err) {
            toast.error(err.message || 'Failed to delete roster');
        } finally {
            setDeleting(false);
        }
    };

    const rowCountByTeam = useMemo(() => roster.rows.reduce((acc, r) => { acc[r.Team] = (acc[r.Team] || 0) + 1; return acc; }, {}), [roster.rows]);

    const headerFilter = (
        <div className="head-actions">
            <TeamSelector teams={activeTeams} selectedTeams={selectedTeams} setSelectedTeams={setSelectedTeams} />
        </div>
    );

    const navItem = (id, label, Icon, extraClass) => (
        <button key={id} type="button" className={cx('nav-item', view === id && 'active', extraClass)} onClick={() => setView(id)} title={label} aria-current={view === id ? 'page' : undefined}>
            <Icon size={20} aria-hidden="true" />{!sidebarCollapsed && <span>{label}</span>}
        </button>
    );

    return (
        <div className="app-layout">
            <CommandPalette
                isOpen={paletteOpen}
                onClose={() => setPaletteOpen(false)}
                onNavigate={setView}
                onAction={(a) => { if (a === 'toggle-theme') setTheme(theme === 'dark' ? 'light' : 'dark'); if (a === 'refresh') { roster.reload(); reloadTeams(); } }}
                darkMode={theme === 'dark'}
                isAdmin={isAdmin}
                canReview={me.isAdmin}
            />

            <aside className={cx('sidebar', sidebarCollapsed && 'sidebar-collapsed')}>
                <div className="sidebar-logo"><Logo collapsed={sidebarCollapsed} height="42px" /></div>
                <button type="button" className="sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
                    {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                </button>
                <nav className="sidebar-nav" aria-label="Main">
                    {NAV.map((n) => navItem(n.id, n.label, n.Icon))}
                    <div className="divider" />
                    {navItem('requests', 'Requests', FileText)}
                    {me.isAdmin && navItem('review', 'Approvals', CheckSquare)}
                    {isAdmin && navItem('auto-enablement', 'Auto Bucket Mgmt', Clock)}
                    {isAdmin && navItem('team-settings', 'Team Settings', Settings)}
                </nav>
                <div className="sidebar-footer">
                    {me.isAdmin && (
                        <button type="button" className={cx('nav-item', isAdmin && 'active')} onClick={toggleAdminMode} title={isAdmin ? 'Admin mode: on' : 'Admin mode'} aria-pressed={isAdmin}>
                            <ShieldCheck size={20} aria-hidden="true" />{!sidebarCollapsed && <span>{isAdmin ? 'Admin: on' : 'Admin mode'}</span>}
                        </button>
                    )}
                    {isAdmin && (
                        <button type="button" className="nav-item" onClick={() => setShowAdmins(true)} title="Manage admins">
                            <Users size={20} aria-hidden="true" />{!sidebarCollapsed && <span>Manage admins</span>}
                        </button>
                    )}
                    <button type="button" className="nav-item" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle theme">
                        {theme === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}{!sidebarCollapsed && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
                    </button>
                    <button type="button" className="nav-item text-danger" onClick={onLogout} title="Log out">
                        <LogOut size={20} aria-hidden="true" />{!sidebarCollapsed && <span>Log out</span>}
                    </button>
                    {!sidebarCollapsed && (
                        <div className="sidebar-user">
                            <span className="avatar" aria-hidden="true">{initials(me.name || me.email)}</span>
                            <div className="sidebar-user-text">
                                <span className="strong truncate">{me.name || me.email || 'User'}</span>
                                <span className="muted small">{me.isAdmin ? (isAdmin ? 'Admin · editing' : 'Admin') : 'Member'}</span>
                            </div>
                        </div>
                    )}
                </div>
            </aside>

            <main className="main-content">
                {me.isAdmin && !featuresState.loading && featuresState.apiVersion === 'v1' && !bannerDismissed && (
                    <Banner tone="warning" className="page-banner" onClose={() => setBannerDismissed(true)}>
                        The API worker hasn't been updated yet — moving members, clearing cells and in-app generation use the legacy behaviour until it is deployed.
                    </Banner>
                )}
                {roster.error && <Banner tone="danger" className="page-banner">Couldn't load the roster: {roster.error.message}. <button type="button" className="link" onClick={() => roster.reload()}>Retry</button></Banner>}

                <ErrorBoundary key={view}>
                    {view === 'dashboard' && (
                        <Overview
                            rows={roster.rows}
                            loading={roster.loading}
                            currentDate={currentDate}
                            headerAction={(
                                <div className="head-actions">
                                    <LivePresence currentUser={me.name || me.email} />
                                    {headerFilter}
                                    {isAdmin && <button type="button" className="btn btn-primary" onClick={() => setShowGenerator(true)}><PlusCircle size={16} aria-hidden="true" /> Generate roster</button>}
                                </div>
                            )}
                        />
                    )}
                    {view === 'roster' && (
                        <RosterPage
                            rows={roster.rows}
                            loading={roster.loading}
                            currentDate={currentDate}
                            onChangeDate={setCurrentDate}
                            isAdmin={isAdmin}
                            teams={teams}
                            features={features}
                            shiftConfigs={shiftConfigs}
                            currentUser={me.name || me.email}
                            onCellUpdate={handleCellUpdate}
                            onOpenGenerator={() => setShowGenerator(true)}
                            onOpenDelete={() => setShowDelete(true)}
                            onMoveMember={(name, team) => setMoveTarget({ name, team })}
                            headerAction={headerFilter}
                            selectedTeams={selectedTeams}
                        />
                    )}
                    {view === 'summary' && (
                        <ReportsPage currentDate={currentDate} teams={teams} selectedTeams={selectedTeams} headerAction={headerFilter} />
                    )}
                    {view === 'requests' && <RequestsPage me={me} />}
                    {view === 'review' && me.isAdmin && <ApprovalsPage onRefreshRoster={() => roster.reload({ silent: true })} />}
                    {view === 'auto-enablement' && isAdmin && <AutoBucketPage teams={teams} reloadTeams={reloadTeams} features={features} />}
                    {view === 'team-settings' && isAdmin && (
                        <TeamSettingsPage teams={teams} teamsLoading={teamsLoading} reloadTeams={reloadTeams} features={features} onMoveMember={(name, team) => setMoveTarget({ name, team })} />
                    )}
                    {((view === 'auto-enablement' || view === 'team-settings') && !isAdmin) && (
                        <div className="page"><div className="card empty-state-large"><ShieldCheck size={32} aria-hidden="true" /><p>Turn on admin mode to open this page.</p></div></div>
                    )}
                </ErrorBoundary>
            </main>

            <ClaudeSkillModal open={showGenerator} onClose={() => setShowGenerator(false)} me={me} features={features} />
            <DeleteMonthModal
                open={showDelete}
                teams={activeTeams}
                defaultTeam={selectedTeams.length === 1 ? selectedTeams[0] : ''}
                monthLabel={monthLabel(currentDate.getFullYear(), currentDate.getMonth() + 1)}
                rowCountByTeam={rowCountByTeam}
                busy={deleting}
                onClose={() => setShowDelete(false)}
                onConfirm={handleDeleteMonth}
            />
            <AdminManager open={showAdmins} onClose={() => { setShowAdmins(false); reloadMe(); }} currentEmail={me.email} />
            {moveTarget && (
                <MoveMemberDialog
                    open
                    name={moveTarget.name}
                    fromTeam={moveTarget.team}
                    teams={teams}
                    onClose={() => setMoveTarget(null)}
                    onMoved={() => { reloadTeams(); roster.reload({ silent: true }); }}
                />
            )}

            <nav className="mobile-nav" aria-label="Main">
                {NAV.map((n) => (
                    <button key={n.id} type="button" className={cx('mobile-nav-item', view === n.id && 'active')} onClick={() => setView(n.id)}><n.Icon size={20} aria-hidden="true" />{n.label}</button>
                ))}
                <button type="button" className={cx('mobile-nav-item', view === 'requests' && 'active')} onClick={() => setView('requests')}><FileText size={20} aria-hidden="true" />Requests</button>
                {me.isAdmin && <button type="button" className={cx('mobile-nav-item', view === 'review' && 'active')} onClick={() => setView('review')}><CheckSquare size={20} aria-hidden="true" />Approvals</button>}
            </nav>
        </div>
    );
}
