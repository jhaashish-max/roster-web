import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Calendar,
  Users,
  Settings,
  PlusCircle,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Menu,
  Shield,
  ShieldCheck,
  Table as TableIcon,
  Wand2,
  Clock,
  UserX,
  Briefcase,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Loader2,
  X,
  Edit,
  Plus,
  Save,
  Maximize2,
  Minimize2,
  PieChart,
  CalendarDays,
  Sun,
  Moon,
  LogOut,
  FileText,
  CheckSquare,
  SunMedium
} from 'lucide-react';
import CellEditor from './components/CellEditor';
import Summary from './components/Summary';
import CommandPalette from './components/CommandPalette';
import LoginPage from './components/LoginPage';
import Logo from './components/Logo';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isWeekend, isAfter, isBefore, parseISO, startOfDay, isSameDay } from 'date-fns';
import { fetchRoster, fetchAllTeamsRoster, checkRosterExists, deleteRoster, updateRosterEntry, getTeams, createTeam, updateTeam, deleteTeam, isLoggedIn, getUserEmail, logout as authLogout, handleAuthCallback, checkAdmin, listAdmins, addAdmin, removeAdmin, whoAmI, createLeaveRequest, getMyRequests, getPendingRequests, reviewRequest, bulkUpdateRosterEntries, getTeamEmails, updateTeamEmails } from './lib/api';

// N8n Webhook URL - Using Vite proxy to bypass CORS in Dev, Direct URL in Prod
const IS_DEV = import.meta.env.DEV;
const BASE_URL = IS_DEV ? '/api/n8n' : 'https://n8n-conc.razorpay.com';

const N8N_WEBHOOK_URL = `${BASE_URL}/webhook/8211a001-8f9e-4387-9289-1538db922fa9`;

// Default prompt template for roster generation
const DEFAULT_PROMPT = `You are a Roster Manager. Generate a JSON schedule for the '{{TEAM_NAME}}' team for {{MONTH_NAME}} {{YEAR}}.

### INPUT DATA
**Team List:** {{TEAM_MEMBERS}}
**Slack Requests:** """{{SLACK_REQUESTS}}"""

{{PREVIOUS_MONTH_DATA}}

### RULES (Strict Logic)
1. **Mapping:** Fuzzy match names from Slack to the Team List. 
   - "Sheesh" -> "Ashish"
   - "Bala" -> "Jetty Bala" (if in list)
2. **Codes:** - PL (Planned Leave)
   - OH (Optional Holiday)
   - WO (Week Off)
3. **Weekend Rules (Sat/Sun):** - REQUIRES exactly 3 people working per day.
   - Shifts: Two people on "10:00 - 19:00", One person on "18:00 - 03:00".
   - The *same* 3 people must work both Saturday and Sunday of that specific weekend.
   - These 3 people MUST get 2 compensatory WOs (one in the week before, one in the week after).
   - **MONTH BOUNDARY RULE:** If the 1st of the month is a Sunday, check the PREVIOUS MONTH DATA above and assign the same people who worked on the Saturday (last day of previous month).
4. **Weekday Rules (Mon-Fri):**
   - **CONSISTENCY RULE:** Each person must be assigned ONE primary shift type (either "09:00 - 18:00" or "11:00 - 20:00") for the entire month, UNLESS they are on the Night Shift rotation. Do not switch shifts between days for the same person unless explicitly requested.
   - **Team Split:** Assign approximately 50% of the team to the Morning shift ("09:00 - 18:00") and 50% to the Afternoon shift ("11:00 - 20:00").
   - Maximize availability: Ensure WOs are spread out; do not give everyone WO on the same day.
5. **Night Shift Rule ("18:00 - 03:00"):**
   - **Requirement:** Assign exactly ONE person to the Night Shift for the first 2 weeks (Days 1-14).
   - **Rotation:** Assign a DIFFERENT person to the Night Shift for the remainder of the month (Days 15-End).
   - **EXCLUSIONS:** The following people CANNOT do night shift: Aswin A, Ashish, Manoj, Panthi Kishorbhai Patel, Ayush S, Raj Vardhan, Shehjaar Manwati.
6. **Timeline:** Generate roster from {{START_DATE}} to {{END_DATE}}.

### OUTPUT FORMAT (JSON ONLY)
Return a flat array of objects. Do not use Markdown, do not include comments.
[
    { "Date": "{{YEAR}}-{{MONTH_PADDED}}-01", "Name": "Ayush S", "Status": "09:00 - 18:00" },
    { "Date": "{{YEAR}}-{{MONTH_PADDED}}-01", "Name": "Manoj", "Status": "PL" },
    ...
]`;

// --- COMPONENTS ---

// Generate consistent color from name (like Slack)
const getAvatarColor = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 65%, 55%)`;
};

// Toast Notification
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`toast toast-${type}`}>
      {type === 'success' && <CheckCircle size={18} />}
      {type === 'error' && <AlertCircle size={18} />}
      {type === 'loading' && <Loader2 size={18} className="spin" />}
      {message}
    </div>
  );
};

// Live Clock Component
const LiveClock = () => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="live-clock">
      <div className="clock-date">{format(now, 'EEEE, MMMM d, yyyy')}</div>
      <div className="clock-time">{format(now, 'HH:mm:ss')}</div>
    </div>
  );
};

// Multi-select Team Selector Component
const TeamSelector = ({ teams, selectedTeams, setSelectedTeams }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const allSelected = selectedTeams.length === 0;

  const toggleAll = () => setSelectedTeams([]);

  const toggleTeam = (name) => {
    setSelectedTeams(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const label = allSelected
    ? 'All Groups'
    : selectedTeams.length === 1
      ? selectedTeams[0]
      : `${selectedTeams.length} Teams`;

  return (
    <div className="team-selector-inline" ref={ref} style={{ position: 'relative' }}>
      <label>TEAM:</label>
      <div className="multi-team-btn" onClick={() => setOpen(o => !o)} title={selectedTeams.join(', ') || 'All Groups'}>
        {label} <span style={{ fontSize: '0.6rem', marginLeft: 4, color: 'var(--text-muted)' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="multi-team-dropdown">
          <label className="multi-team-option">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            <span>All Groups</span>
          </label>
          <div style={{ height: '1px', background: 'var(--border-color)', margin: '0.25rem 0' }} />
          {teams.map(t => (
            <label key={t.id} className="multi-team-option">
              <input
                type="checkbox"
                checked={selectedTeams.includes(t.name)}
                onChange={() => toggleTeam(t.name)}
              />
              <span>{t.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

// 1. DASHBOARD
// Helper for status classes
// Helper for status classes
const getStatusClass = (status, dateObj) => {
  if (!status || status === '-') return 'cell-empty';
  const s = status.toUpperCase();

  if (s === 'WO') return 'cell-wo';
  if (s === 'PL' || s === 'SL') return 'cell-leave';
  if (s === 'WL') return 'cell-wl';

  // Explicit string matches first
  if (s.includes('10:00 - 22:00') || s.includes('ON CALL') || s.includes('ONCALL')) return 'cell-oncall';
  if (s.includes('HOLIDAY') || s === 'HL' || s === 'AVAILABLE') return 'cell-holiday';
  if (s === 'WFH') return 'cell-wfh';

  // Parse time for Morning, Afternoon, Night by finding the first hour digits
  const timeMatch = s.match(/(\d{1,2}):/);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1], 10);

    // Any shift from 7 to 10:59 is Morning
    if (hour >= 7 && hour < 11) {
      if (hour === 7 && dateObj && isWeekend(dateObj)) {
        return 'cell-oncall';
      }
      return 'cell-morning';
    }

    // Any shift from 11 to 17:59 is Afternoon
    if (hour >= 11 && hour < 18) {
      return 'cell-afternoon';
    }

    // Any shift 18 or beyond is Night
    if (hour >= 18) {
      return 'cell-night';
    }
  }

  // Fallback for non-standard formats like "11-8" or "9 - 6"
  if (s.includes('9 - 6')) return 'cell-morning';
  if (s.includes('11-8') || s.includes('11 - 8')) return 'cell-afternoon';
  if (s.includes('NIGHT')) return 'cell-night';

  // Holiday / Available
  if (s.includes('HOLIDAY') || s === 'HL' || s === 'AVAILABLE') return 'cell-holiday';

  if (s === 'WFH') return 'cell-wfh';
  return 'cell-other';
};

const Dashboard = ({ rosterData, currentDate, onChangeDate, loading, headerAction }) => {
  const todayStr = format(currentDate, 'yyyy-MM-dd');
  const todayData = rosterData.filter(d => d.Date === todayStr);

  const stats = useMemo(() => {
    const working = todayData.filter(d => d.Status.includes(':') && d.Status !== 'WO');
    return {
      total: todayData.length,
      working: working.length,
      morning: todayData.filter(d => {
        const m = d.Status.match(/(\d{1,2}):/);
        if (!m) return false;
        const h = parseInt(m[1], 10);
        return h >= 7 && h <= 10;
      }).length,
      afternoon: todayData.filter(d => {
        const m = d.Status.match(/(\d{1,2}):/);
        if (!m) return false;
        const h = parseInt(m[1], 10);
        return h >= 11 && h <= 17;
      }).length,
      night: todayData.filter(d => {
        const m = d.Status.match(/(\d{1,2}):/);
        if (!m) return false;
        const h = parseInt(m[1], 10);
        return h >= 18;
      }).length,
      leave: todayData.filter(d => d.Status === 'PL' || d.Status === 'SL' || d.Status === 'WFH').length,
      wo: todayData.filter(d => d.Status === 'WO').length,
      wl: todayData.filter(d => d.Status === 'WL').length,
    };
  }, [todayData]);

  const onLeave = todayData.filter(d => ['PL', 'SL', 'WO', 'WFH'].includes(d.Status));
  const workingAgents = todayData.filter(d => d.Status.includes(':'));

  const upcomingLeaves = useMemo(() => {
    const today = startOfDay(new Date());
    const viewMonthEnd = endOfMonth(currentDate);

    return rosterData.filter(d => {
      // Construct Date in local timezone scope to prevent UTC translation
      const [year, month, day] = d.Date.split('-');
      const dDate = new Date(year, month - 1, day);
      if (isBefore(dDate, today) || isSameDay(dDate, today)) return false;
      if (isAfter(dDate, viewMonthEnd)) return false;

      if (d.Status.includes(':')) return false;
      if (d.Status === 'WO' && isWeekend(dDate)) return false;
      return true;
    }).sort((a, b) => a.Date.localeCompare(b.Date));
  }, [rosterData, currentDate]);

  const groupedLeaves = useMemo(() => {
    return upcomingLeaves.reduce((acc, curr) => {
      if (!acc[curr.Date]) acc[curr.Date] = [];
      acc[curr.Date].push(curr);
      return acc;
    }, {});
  }, [upcomingLeaves]);

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <LiveClock />

        {headerAction}
      </div>

      {loading ? (
        <div className="loading-state">
          <Loader2 size={32} className="spin" />
          <p>Loading roster data...</p>
        </div>
      ) : rosterData.length === 0 ? (
        <div className="empty-state-large" style={{ background: 'var(--bg-card)', border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '3rem' }}>
          <Calendar size={32} style={{ color: 'var(--text-muted)' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>No Roster Found</h3>
          <p style={{ fontSize: '0.85rem' }}>Generate a new roster for {format(currentDate, 'MMMM yyyy')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="stats-hero-grid">
            <div className="stat-card">
              <h3>Working</h3>
              <div className="stat-value">{stats.working}</div>
            </div>
            <div className="stat-card">
              <h3>Morning</h3>
              <div className="stat-value" style={{ color: 'var(--morning-text)' }}>{stats.morning}</div>
            </div>
            <div className="stat-card">
              <h3>Afternoon</h3>
              <div className="stat-value" style={{ color: 'var(--afternoon-text)' }}>{stats.afternoon}</div>
            </div>
            <div className="stat-card">
              <h3>Night</h3>
              <div className="stat-value" style={{ color: 'var(--night)' }}>{stats.night}</div>
            </div>
            <div className="stat-card">
              <h3>Leave</h3>
              <div className="stat-value" style={{ color: 'var(--leave-text)' }}>{stats.leave}</div>
            </div>
            <div className="stat-card">
              <h3>WO</h3>
              <div className="stat-value" style={{ color: 'var(--text-muted)' }}>{stats.wo}</div>
            </div>
            {stats.wl > 0 && (
              <div className="stat-card">
                <h3>WL</h3>
                <div className="stat-value" style={{ color: '#f59e0b' }}>{stats.wl}</div>
              </div>
            )}
          </div>

          <div className="panel-grid">
            <div className="panel" style={{ padding: '1.5rem 2rem' }}>
              <div className="panel-header" style={{ marginBottom: '1.5rem' }}>
                <Briefcase size={20} style={{ color: 'var(--accent-primary)' }} />
                <h3 style={{ fontSize: '1.1rem' }}>Today's Schedule</h3>
              </div>
              <div className="segmented-schedule">
                {/* Morning Block */}
                <div className="schedule-block block-morning">
                  <div className="block-header">
                    <Sun size={16} /> <span>Morning Shift</span>
                  </div>
                  <div className="block-list">
                    {workingAgents.filter(a => getShiftClass(a.Status) === 'shift-morning').length > 0 ? (
                      workingAgents.filter(a => getShiftClass(a.Status) === 'shift-morning').map((a, i) => (
                        <div key={i} className="shift-card">
                          <div className="agent-avatar" style={{ background: getAvatarColor(a.Name) }}>{a.Name.charAt(0)}</div>
                          <div className="agent-info">
                            <div className="agent-name-row">
                              <div className="agent-name">{a.Name}</div>
                              {a.Team && <span className="team-tag">{a.Team}</span>}
                            </div>
                            <div className="shift-time">{a.Status}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="empty-slot">No agents scheduled for Morning.</div>
                    )}
                  </div>
                </div>

                {/* Afternoon Block */}
                <div className="schedule-block block-afternoon">
                  <div className="block-header">
                    <SunMedium size={16} /> <span>Afternoon Shift</span>
                  </div>
                  <div className="block-list">
                    {workingAgents.filter(a => getShiftClass(a.Status) === 'shift-afternoon').length > 0 ? (
                      workingAgents.filter(a => getShiftClass(a.Status) === 'shift-afternoon').map((a, i) => (
                        <div key={i} className="shift-card">
                          <div className="agent-avatar" style={{ background: getAvatarColor(a.Name) }}>{a.Name.charAt(0)}</div>
                          <div className="agent-info">
                            <div className="agent-name-row">
                              <div className="agent-name">{a.Name}</div>
                              {a.Team && <span className="team-tag">{a.Team}</span>}
                            </div>
                            <div className="shift-time">{a.Status}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="empty-slot">No agents scheduled for Afternoon.</div>
                    )}
                  </div>
                </div>

                {/* Night Block */}
                <div className="schedule-block block-night">
                  <div className="block-header">
                    <Moon size={16} /> <span>Night Shift</span>
                  </div>
                  <div className="block-list">
                    {workingAgents.filter(a => getShiftClass(a.Status) === 'shift-night').length > 0 ? (
                      workingAgents.filter(a => getShiftClass(a.Status) === 'shift-night').map((a, i) => (
                        <div key={i} className="shift-card">
                          <div className="agent-avatar" style={{ background: getAvatarColor(a.Name) }}>{a.Name.charAt(0)}</div>
                          <div className="agent-info">
                            <div className="agent-name-row">
                              <div className="agent-name">{a.Name}</div>
                              {a.Team && <span className="team-tag">{a.Team}</span>}
                            </div>
                            <div className="shift-time">{a.Status}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="empty-slot">No agents scheduled for Night.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="right-column-stack" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="panel" style={{ padding: '1.5rem 2rem' }}>
                <div className="panel-header" style={{ marginBottom: '1.5rem' }}>
                  <UserX size={20} style={{ color: 'var(--accent-danger)' }} />
                  <h3 style={{ fontSize: '1.1rem' }}>Not Available ({onLeave.length})</h3>
                </div>
                {onLeave.length > 0 ? (
                  <div className="leave-list">
                    {onLeave.map((p, i) => (
                      <div key={i} className="leave-item">
                        <div className="agent-avatar" style={{ background: getAvatarColor(p.Name) }}>{p.Name.charAt(0)}</div>
                        <div className="agent-info">
                          <div className="agent-name-row">
                            <div className="agent-name">{p.Name}</div>
                            {p.Team && <span className="team-tag">{p.Team}</span>}
                          </div>
                          <div className={`shift-time ${getShiftClass(p.Status)}`}>{p.Status}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="empty-state">Everyone is available today.</p>}
              </div>

              <div className="panel" style={{ flex: 1, padding: '1.5rem 2rem' }}>
                <div className="panel-header" style={{ marginBottom: '1.5rem' }}>
                  <CalendarDays size={20} style={{ color: 'var(--text-secondary)' }} />
                  <h3 style={{ fontSize: '1.1rem' }}>Upcoming Leaves</h3>
                </div>
                {upcomingLeaves.length > 0 ? (
                  <div className="upcoming-list">
                    {Object.entries(groupedLeaves).map(([date, leaves]) => (
                      <div key={date} className="date-group">
                        <div className="date-header">{format(parseISO(date), 'EEE, MMM d')}</div>
                        <div className="date-leaves">
                          {leaves.map((l, i) => (
                            <div key={i} className="mini-leave-item">
                              <div className="mini-avatar" style={{ background: getAvatarColor(l.Name) }}>{l.Name.charAt(0)}</div>
                              <span className="mini-name">{l.Name}</span>
                              {l.Team && <span className="team-tag">{l.Team}</span>}
                              <span className={`mini-status ${getStatusClass(l.Status)}`}>{l.Status}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="empty-state">No upcoming leaves this month.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const getShiftClass = (status) => {
  const timeMatch = status.match(/(\d{1,2}):/);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1], 10);
    if (hour >= 7 && hour < 11) return 'shift-morning';
    if (hour >= 11 && hour < 18) return 'shift-afternoon';
    if (hour >= 18) return 'shift-night';
  }
  return '';
};

// 2. ROSTER TABLE
const RosterTable = ({ rosterData, currentDate, onChangeDate, isAdmin, loading, onCellUpdate, headerAction, viewMode, allTeamsData }) => {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const startDate = new Date(year, month - 1, 1);
  const endDate = endOfMonth(startDate);
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  // Zoom state persisted in localStorage
  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem('roster_zoom');
    return saved ? parseFloat(saved) : 1;
  });

  const handleZoom = (delta) => {
    setZoom(prev => {
      const next = Math.max(0.4, Math.min(1.5, +(prev + delta).toFixed(2)));
      localStorage.setItem('roster_zoom', next);
      return next;
    });
  };

  const handleZoomAbsolute = (val) => {
    setZoom(val);
    localStorage.setItem('roster_zoom', val);
  };

  // Determine which data to render
  const displayData = viewMode === 'all' && allTeamsData ? allTeamsData : rosterData;

  // Group data by team for "all" mode, or use flat list for single
  const teamGroups = useMemo(() => {
    if (viewMode !== 'all') {
      const agents = [...new Set(displayData.map(d => d.Name))];
      const map = {};
      displayData.forEach(d => {
        if (!map[d.Name]) map[d.Name] = {};
        map[d.Name][d.Date] = d.Status;
      });
      return [{ team: null, agents, map }];
    }

    // Group by Team field
    const teamMap = {};
    displayData.forEach(d => {
      const team = d.Team || 'Unknown';
      if (!teamMap[team]) teamMap[team] = [];
      teamMap[team].push(d);
    });

    return Object.keys(teamMap).sort().map(team => {
      const items = teamMap[team];
      const agents = [...new Set(items.map(d => d.Name))];
      const map = {};
      items.forEach(d => {
        if (!map[d.Name]) map[d.Name] = {};
        map[d.Name][d.Date] = d.Status;
      });
      return { team, agents, map };
    });
  }, [displayData, viewMode]);

  // Selection state
  const [selection, setSelection] = useState(null);

  const handleCellBlur = async (agent, dateStr, newValue) => {
    if (onCellUpdate) {
      onCellUpdate(dateStr, agent, newValue);
    }
  };

  const handleCellClick = (agent, dateStr, e) => {
    e.stopPropagation();
    setSelection({ type: 'cell', row: agent, col: dateStr });
  };

  const handleRowClick = (agent, e) => {
    e.stopPropagation();
    setSelection({ type: 'row', row: agent, col: null });
  };

  const handleColumnClick = (dateStr, e) => {
    e.stopPropagation();
    setSelection({ type: 'column', row: null, col: dateStr });
  };

  const clearSelection = () => setSelection(null);

  const isCellSelected = (agent, dateStr) => {
    if (!selection) return false;
    if (selection.type === 'cell') return selection.row === agent && selection.col === dateStr;
    if (selection.type === 'row') return selection.row === agent;
    if (selection.type === 'column') return selection.col === dateStr;
    return false;
  };

  const isRowSelected = (agent) => selection?.type === 'row' && selection.row === agent;
  const isColumnSelected = (dateStr) => selection?.type === 'column' && selection.col === dateStr;

  return (
    <div className="roster-page" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Controls Card */}
      <div className="roster-controls-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-card)', padding: '0.75rem 1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '1rem' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: 'min-content' }}>
          {headerAction}
        </div>

        <div className="date-nav" style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: '250px' }}>
          <button className="date-nav-btn" onClick={() => onChangeDate(subMonths(currentDate, 1))} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <ChevronLeft size={20} />
          </button>
          <div className="date-display" style={{ display: 'flex', alignItems: 'center', fontSize: '1.1rem', fontWeight: 600, minWidth: '160px', justifyContent: 'center', color: 'var(--text-primary)' }}>
            <Calendar size={18} style={{ marginRight: '8px' }} />
            {format(currentDate, 'MMMM yyyy')}
          </div>
          <button className="date-nav-btn" onClick={() => onChangeDate(addMonths(currentDate, 1))} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <ChevronRight size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, justifyContent: 'flex-end', minWidth: 'min-content' }}>
          <div className="zoom-slider-container" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>50%</span>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.05"
              value={zoom}
              onChange={(e) => handleZoomAbsolute(parseFloat(e.target.value))}
              style={{ width: '120px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '40px', textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>150%</span>
          </div>
        </div>
      </div>

      {/* Legend Card */}
      <div className="roster-legend-card" style={{ background: 'var(--bg-card)', padding: '1rem 1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>Shift Legend</h3>
        <div className="legend-chips" style={{ marginBottom: 0 }}>
          <span className="legend-chip chip-morning">Morning</span>
          <span className="legend-chip chip-afternoon">Afternoon</span>
          <span className="legend-chip chip-oncall">On Call</span>
          <span className="legend-chip chip-night" style={{ background: '#000000', color: '#fff' }}>Night</span>
          <span className="legend-chip chip-leave">PL</span>
          <span className="legend-chip chip-wo">WO</span>
          <span className="legend-chip chip-wl">WL</span>
          <span className="legend-chip chip-holiday">Holiday</span>
          <span className="legend-chip chip-wfh">WFH</span>
        </div>
      </div>

      {loading ? (
        <div className="loading-state" style={{ textAlign: 'center', padding: '3rem' }}>
          <Loader2 size={32} className="spin" style={{ margin: '0 auto', color: 'var(--accent-primary)' }} />
          <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Loading roster data...</p>
        </div>
      ) : displayData.length === 0 ? (
        <div className="empty-state-large" style={{ padding: '4rem 2rem', background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
          <TableIcon size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Roster Found</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Generate a new roster for {format(currentDate, 'MMMM yyyy')}</p>
        </div>
      ) : (
        <div className="roster-all-groups" onClick={clearSelection} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {teamGroups.map((group) => (
            <div key={group.team || 'single'} className="roster-team-card" style={{ background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
              {group.team && (
                <div className="team-section-header" style={{ background: 'transparent', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                  {group.team}
                </div>
              )}
              <div className="roster-table-wrapper" style={{ border: 'none', borderRadius: 0, overflowX: 'auto' }}>
                <table className="roster-table" style={{ zoom: zoom, width: '100%', borderCollapse: 'collapse', border: 'none' }}>
                  <thead>
                    <tr>
                      <th className="sticky-col corner-cell">Agent</th>
                      {days.map(day => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const todayStr = format(new Date(), 'yyyy-MM-dd');
                        const isToday = dateStr === todayStr;
                        return (
                          <th
                            key={day.toString()}
                            className={`${isWeekend(day) ? 'weekend-header' : ''} ${isColumnSelected(dateStr) ? 'selected-header' : ''} ${isToday ? 'today-col' : ''}`}
                            onClick={(e) => handleColumnClick(dateStr, e)}
                          >
                            <div className="day-num">{format(day, 'd')}</div>
                            <div className="day-name">{format(day, 'EEE')}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {group.agents.map(agent => (
                      <tr key={`${group.team}-${agent}`} className={isRowSelected(agent) ? 'selected-row' : ''}>
                        <td
                          className={`sticky-col agent-cell ${isRowSelected(agent) ? 'selected-header' : ''}`}
                          onClick={(e) => handleRowClick(agent, e)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {agent}
                          </div>
                        </td>
                        {days.map(day => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const status = group.map[agent]?.[dateStr] || '-';
                          const cellClass = getStatusClass(status, day);
                          const isSelected = isCellSelected(agent, dateStr);
                          return (
                            <td
                              key={dateStr}
                              className={`roster-cell ${cellClass} ${isWeekend(day) ? 'weekend-cell' : ''} ${isSelected ? 'selected-cell' : ''}`}
                              onClick={(e) => handleCellClick(agent, dateStr, e)}
                            >
                              {isAdmin ? (
                                <CellEditor
                                  value={status}
                                  onFinish={(newVal) => handleCellBlur(agent, dateStr, newVal)}
                                />
                              ) : (
                                <span className="cell-text">{status}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// 3. GENERATOR
const Generator = ({ onClose, onGenerate, currentDate, teams = [] }) => {
  const [slackThread, setSlackThread] = useState('');
  const [notes, setNotes] = useState('');
  const [generating, setGenerating] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedTeam, setSelectedTeam] = useState(teams[0]?.id || '');

  // Update selected team when teams load
  useEffect(() => {
    if (teams.length > 0 && !selectedTeam) {
      setSelectedTeam(teams[0].id);
    }
  }, [teams]);

  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ];

  const years = [2025, 2026, 2027, 2028];

  const handleGenerate = async () => {
    const team = teams.find(t => t.id === selectedTeam);
    if (!team) return;

    setGenerating(true);
    await onGenerate({
      slack_thread: slackThread,
      notes: notes,
      month: selectedMonth,
      year: selectedYear,
      team_name: team.name,
      team_members: team.members,
      custom_prompt: team.custom_prompt || null
    });
    setGenerating(false);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Wand2 size={20} className="modal-icon" />
              Generate Roster
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>AI-powered automated roster generation</p>
          </div>
        </div>

        {/* Team Selector */}
        <div className="form-group">
          <label>Team</label>
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="form-select"
          >
            {teams.length === 0 ? (
              <option value="">No teams available</option>
            ) : (
              teams.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.members.length} members)</option>
              ))
            )}
          </select>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="form-select"
            >
              {months.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="form-select"
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Slack Thread Content</label>
          <textarea
            rows={6}
            placeholder="Paste the Slack thread here..."
            value={slackThread}
            onChange={(e) => setSlackThread(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Special Notes / Instructions</label>
          <textarea
            rows={3}
            placeholder="E.g., Ashish is on leave Feb 5th..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="modal-actions" style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={generating}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={generating || !selectedTeam}>
            {generating ? <Loader2 size={16} className="spin" /> : <Wand2 size={16} />}
            {generating ? 'Generating...' : 'Generate with AI'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Delete Confirmation Modal
const DeleteConfirm = ({ onClose, onConfirm, currentDate, deleting, teams = [], selectedTeam, onTeamChange }) => {
  return (
    <div className="modal-overlay">
      <div className="modal-content modal-small">
        <div className="modal-header">
          <Trash2 size={24} className="modal-icon-danger" />
          <h2>Delete Roster</h2>
        </div>

        {teams.length > 0 && (
          <div className="form-group">
            <label>Select Team to Delete</label>
            <select
              value={selectedTeam || ''}
              onChange={(e) => onTeamChange(e.target.value)}
              className="form-select"
            >
              {teams.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        <p className="modal-text">
          Are you sure you want to delete the roster for <strong>{selectedTeam}</strong> for <strong>{format(currentDate, 'MMMM yyyy')}</strong>? This action cannot be undone.
        </p>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={deleting}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={deleting}>
            {deleting ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Admin Manager Modal
const AdminManager = ({ onClose }) => {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAdmins();
  }, []);

  const loadAdmins = async () => {
    setLoading(true);
    try {
      const data = await listAdmins();
      setAdmins(data);
    } catch (err) {
      setError('Failed to load admins');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setSaving(true);
    setError('');
    try {
      await addAdmin(newEmail.trim());
      setNewEmail('');
      await loadAdmins();
    } catch (err) {
      setError(err.message || 'Failed to add admin');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (email) => {
    if (!confirm(`Remove ${email} as admin?`)) return;
    try {
      await removeAdmin(email);
      await loadAdmins();
    } catch (err) {
      setError(err.message || 'Failed to remove admin');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-small" style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={20} className="modal-icon" />
              Manage Admins
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Grant or revoke administrator access</p>
          </div>
        </div>

        {error && (
          <div style={{ color: 'var(--accent-danger)', fontSize: '0.85rem', padding: '0 1.5rem', marginBottom: '0.5rem' }}>
            <AlertCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
            {error}
          </div>
        )}

        <div style={{ padding: '0 1.5rem 1rem' }}>
          <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="email@razorpay.com"
              className="form-input"
              style={{ flex: 1 }}
              disabled={saving}
            />
            <button type="submit" className="btn btn-primary" disabled={saving || !newEmail.trim()}>
              {saving ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
              Add
            </button>
          </form>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <Loader2 size={20} className="spin" />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {admins.map((admin) => (
                <div key={admin.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.6rem 0.75rem',
                  borderRadius: '8px',
                  background: 'var(--bg-hover)',
                  fontSize: '0.85rem'
                }}>
                  <div>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{admin.email}</span>
                    {admin.added_by && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                        added by {admin.added_by}
                      </span>
                    )}
                  </div>
                  <button
                    className="btn btn-icon"
                    onClick={() => handleRemove(admin.email)}
                    title="Remove admin"
                    style={{ padding: '0.25rem', background: 'transparent', color: 'var(--accent-danger)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

// 4. TEAM SETTINGS MODAL
const TeamSettings = ({ onClose, onTeamsChange }) => {
  const [teams, setTeams] = useState([]);
  const [memberEmails, setMemberEmails] = useState({});
  const [loading, setLoading] = useState(true);
  const [editingTeam, setEditingTeam] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isPromptFullscreen, setIsPromptFullscreen] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formMembers, setFormMembers] = useState('');
  const [formPrompt, setFormPrompt] = useState('');
  const [showPromptEditor, setShowPromptEditor] = useState(false);

  // Fetch teams on mount
  useEffect(() => {
    loadTeams();
  }, []);

  const loadTeams = async () => {
    setLoading(true);
    try {
      const [data, emailsData] = await Promise.all([getTeams(), getTeamEmails()]);
      setTeams(data);

      const emailMap = {};
      if (emailsData && Array.isArray(emailsData)) {
        emailsData.forEach(e => { emailMap[e.name] = e.email; });
      }
      setMemberEmails(emailMap);
    } catch (err) {
      console.error('Failed to load teams or emails:', err);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setFormName('');
    setFormMembers('');
    setFormPrompt('');
    setShowPromptEditor(false);
    setIsPromptFullscreen(false);
    setEditingTeam(null);
    setIsCreating(false);
  };

  const handleShowPromptChange = (checked) => {
    setShowPromptEditor(checked);
    // Load default prompt when enabling, unless there's already content
    if (checked && !formPrompt) {
      setFormPrompt(DEFAULT_PROMPT);
    }
  };

  const startCreate = () => {
    resetForm();
    setIsCreating(true);
  };

  const startEdit = (team) => {
    setFormName(team.name);

    // Map existing member emails if available
    const membersWithEmail = team.members.map(name => {
      const email = memberEmails[name] || '';
      return email ? `${name}, ${email}` : name;
    });

    setFormMembers(membersWithEmail.join('\n'));
    setFormPrompt(team.custom_prompt || '');
    setShowPromptEditor(!!team.custom_prompt);
    setEditingTeam(team);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formMembers.trim()) return;

    setSaving(true);

    const membersArray = [];
    const emailUpdates = [];

    formMembers.split('\n').filter(m => m.trim()).forEach(line => {
      const parts = line.split(',');
      const name = parts[0].trim();
      membersArray.push(name);

      if (parts[1]) {
        emailUpdates.push({ name, email: parts[1].trim() });
      }
    });

    try {
      if (isCreating) {
        await createTeam(formName, membersArray, formPrompt || null);
      } else if (editingTeam) {
        await updateTeam(editingTeam.id, {
          name: formName,
          members: membersArray,
          custom_prompt: formPrompt || null
        });
      }

      if (emailUpdates.length > 0) {
        await updateTeamEmails(emailUpdates);
      }

      await loadTeams();
      resetForm();
      if (onTeamsChange) onTeamsChange();
    } catch (err) {
      console.error('Error saving team:', err);
    }
    setSaving(false);
  };

  const handleDelete = async (teamId) => {
    if (window.confirm('Are you sure you want to delete this team?')) {
      await deleteTeam(teamId);
      await loadTeams();
      if (onTeamsChange) onTeamsChange();
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-large" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '85vh', maxHeight: '800px' }}>
        <div className="modal-header" style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <Settings size={20} className="modal-icon" />
              Team Settings
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Manage teams, members, and custom AI prompts</p>
          </div>
          <button className="modal-close" onClick={onClose} style={{ background: 'var(--bg-hover)', borderRadius: '8px', padding: '0.5rem' }}>
            <X size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        <div className="team-settings-layout" style={{ flex: 1, overflow: 'hidden' }}>
          {/* Teams List */}
          <div className="teams-list" style={{ borderRight: '1px solid var(--border-color)', background: 'var(--bg-secondary)', padding: '1rem', overflowY: 'auto' }}>
            <div className="teams-list-header" style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Teams</h3>
              <button className="btn btn-primary" onClick={startCreate} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                <Plus size={14} /> New
              </button>
            </div>

            {loading ? (
              <div className="loading-small"><Loader2 size={20} className="spin" /></div>
            ) : teams.length === 0 ? (
              <p className="no-teams" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 1rem' }}>No teams created yet</p>
            ) : (
              <div className="teams-items" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {teams.map(team => (
                  <div
                    key={team.id}
                    className={`team-item ${editingTeam?.id === team.id ? 'active' : ''}`}
                    onClick={() => startEdit(team)}
                    style={{
                      padding: '0.75rem 1rem',
                      borderRadius: '8px',
                      background: editingTeam?.id === team.id ? 'var(--bg-card)' : 'transparent',
                      border: editingTeam?.id === team.id ? '1px solid var(--accent-primary)' : '1px solid transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.2s ease',
                      boxShadow: editingTeam?.id === team.id ? 'var(--shadow-sm)' : 'none'
                    }}
                  >
                    <div className="team-item-info" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <span className="team-name" style={{ fontSize: '0.9rem', fontWeight: 600, color: editingTeam?.id === team.id ? 'var(--accent-primary)' : 'var(--text-primary)' }}>{team.name}</span>
                      <span className="team-count" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{team.members.length} members</span>
                    </div>
                    {editingTeam?.id !== team.id && (
                      <button
                        className="btn-icon btn-delete-small"
                        onClick={(e) => { e.stopPropagation(); handleDelete(team.id); }}
                        style={{ padding: '0.4rem', color: 'var(--text-muted)', opacity: 0.5, transition: 'opacity 0.2s', background: 'transparent', border: 'none', cursor: 'pointer' }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = 'var(--accent-danger)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = 0.5; e.currentTarget.style.color = 'var(--text-muted)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Team Form */}
          <div className="team-form" style={{ padding: '1.5rem', overflowY: 'auto', background: 'var(--bg-card)' }}>
            {(isCreating || editingTeam) ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>{isCreating ? 'Create New Team' : 'Edit Team'}</h3>
                  {editingTeam && (
                    <button className="btn btn-secondary" onClick={() => handleDelete(editingTeam.id)} style={{ color: 'var(--accent-danger)', borderColor: 'var(--accent-danger)', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                      <Trash2 size={14} /> Delete Team
                    </button>
                  )}
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem', display: 'block' }}>Team Name</label>
                  <input
                    type="text"
                    placeholder="e.g., Enterprise-VAS"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem', display: 'block' }}>Team Members</label>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Format: Name, Email (one per line)</p>
                  <textarea
                    rows={8}
                    className="form-textarea"
                    placeholder="John Doe, john@razorpay.com&#10;Jane Smith, jane@razorpay.com&#10;..."
                    value={formMembers}
                    onChange={(e) => setFormMembers(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ background: 'var(--bg-hover)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginTop: '2rem' }}>
                  <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={showPromptEditor}
                      onChange={(e) => handleShowPromptChange(e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
                    />
                    <div>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>Use Custom AI Prompt</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Override the default AI instructions for this specific team</span>
                    </div>
                  </label>
                </div>

                {showPromptEditor && (
                  <div className={`form-group ${isPromptFullscreen ? 'prompt-fullscreen-container' : ''}`} style={{ marginTop: '1rem' }}>
                    <div className="prompt-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Custom Prompt Configuration</label>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setIsPromptFullscreen(!isPromptFullscreen)}
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                      >
                        {isPromptFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        {isPromptFullscreen ? ' Exit Fullscreen' : ' Fullscreen'}
                      </button>
                    </div>
                    <p className="form-hint" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem', background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: '6px', fontFamily: 'JetBrains Mono' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Available Variables:</span> {'{{TEAM_NAME}}'}, {'{{MONTH_NAME}}'}, {'{{YEAR}}'}, {'{{TEAM_MEMBERS}}'}, {'{{SLACK_REQUESTS}}'}, {'{{START_DATE}}'}, {'{{END_DATE}}'}, {'{{MONTH_PADDED}}'}, {'{{PREVIOUS_MONTH_DATA}}'}
                    </p>
                    <textarea
                      rows={isPromptFullscreen ? 30 : 12}
                      placeholder="Enter custom AI prompt instructions here..."
                      value={formPrompt}
                      onChange={(e) => setFormPrompt(e.target.value)}
                      className="form-textarea"
                      style={{ fontFamily: 'JetBrains Mono', fontSize: '0.85rem', lineHeight: 1.5 }}
                    />
                  </div>
                )}

                <div className="form-actions" style={{ display: 'flex', gap: '1rem', marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)', justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary" onClick={resetForm} disabled={saving}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving || !formName.trim() || !formMembers.trim()}>
                    {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                    {saving ? 'Saving...' : 'Save Team Configuration'}
                  </button>
                </div>
              </>
            ) : (
              <div className="team-form-empty" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <Users size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Team Management</h3>
                <p style={{ fontSize: '0.85rem' }}>Select a team from the list to edit, or click 'New' to create one.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};


// --- MAIN APP ---
function App() {
  // Auth State
  const [authenticated, setAuthenticated] = useState(isLoggedIn());

  // Check for OAuth redirect hash on load
  useEffect(() => {
    const session = handleAuthCallback();
    if (session) {
      setAuthenticated(true);
    }
  }, []);

  const handleLogin = () => {
    setAuthenticated(true);
  };

  const handleLogout = () => {
    authLogout();
    setAuthenticated(false);
  };

  // Show login page if not authenticated
  if (!authenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return <AuthenticatedApp onLogout={handleLogout} />;
}

// ─── REQUESTS PAGE ───────────────────────────────────────────────
const RequestsPage = ({ userProfile }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [requestType, setRequestType] = useState('PL');
  const [datesList, setDatesList] = useState([]); // array of date strings
  const [dateInput, setDateInput] = useState(''); // current calendar value
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState(null);

  useEffect(() => { loadRequests(); }, []);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const data = await getMyRequests();
      setRequests(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const addDate = () => {
    if (dateInput && !datesList.includes(dateInput)) {
      setDatesList(prev => [...prev, dateInput].sort());
      setDateInput('');
    }
  };

  const removeDate = (d) => {
    setDatesList(prev => prev.filter(x => x !== d));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (datesList.length === 0) return;
    setSubmitting(true);
    try {
      await createLeaveRequest({ request_type: requestType, dates: datesList, reason });
      setToast({ message: 'Request submitted successfully!', type: 'success' });
      setDatesList([]);
      setReason('');
      await loadRequests();
    } catch (err) {
      setToast({ message: err.message || 'Failed to submit request', type: 'error' });
    } finally { setSubmitting(false); }
  };

  const getStatusBadge = (status) => {
    const colors = { pending: '#eab308', approved: '#22c55e', declined: '#ef4444' };
    return (
      <span style={{
        padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
        background: `${colors[status]}20`, color: colors[status], textTransform: 'uppercase'
      }}>{status}</span>
    );
  };

  return (
    <div className="view-container">
      <div className="view-header">
        <h2><FileText size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />Raise a Request</h2>
      </div>

      {toast && (
        <div className={`toast toast-${toast.type}`} style={{ margin: '0 0 1rem' }}>
          {toast.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
          {toast.message}
          <button onClick={() => setToast(null)}><X size={12} /></button>
        </div>
      )}

      {!userProfile?.name ? (
        <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <AlertCircle size={24} style={{ marginBottom: '0.5rem' }} />
          <p>Your email is not mapped to a team member yet. Contact your admin to map your email.</p>
        </div>
      ) : (
        <>
          <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid var(--border-color)' }}>
            <form onSubmit={handleSubmit}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', display: 'block', color: 'var(--text-secondary)' }}>Request Type</label>
                <select value={requestType} onChange={(e) => setRequestType(e.target.value)} className="form-input" style={{ padding: '0.6rem', maxWidth: '300px' }}>
                  <option value="PL">PL — Planned Leave</option>
                  <option value="WL">WL — Wellness Leave</option>
                  <option value="WFH">WFH — Work From Home</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', display: 'block', color: 'var(--text-secondary)' }}>Select Dates</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <input
                    type="date"
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    className="form-input"
                    style={{ maxWidth: '200px' }}
                  />
                  <button type="button" className="btn btn-secondary" onClick={addDate} disabled={!dateInput} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                    <Plus size={14} /> Add Date
                  </button>
                </div>
                {datesList.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {datesList.map(d => (
                      <span key={d} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                        padding: '0.25rem 0.6rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500,
                        background: 'rgba(0, 115, 255, 0.12)', color: 'var(--accent-primary)', border: '1px solid rgba(0, 115, 255, 0.25)'
                      }}>
                        <CalendarDays size={12} />
                        {d}
                        <button type="button" onClick={() => removeDate(d)} style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: '0', lineHeight: 1,
                          color: 'var(--accent-danger)', marginLeft: '2px'
                        }}>
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {datesList.length === 0 && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Pick dates from the calendar above</div>
                )}
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', display: 'block', color: 'var(--text-secondary)' }}>Reason <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Family function, doctor appointment, etc." className="form-input" />
              </div>
              <button type="submit" className="btn btn-primary" disabled={submitting || datesList.length === 0} style={{ minWidth: '140px' }}>
                {submitting ? <><Loader2 size={16} className="spin" /> Submitting...</> : <><Plus size={16} /> Submit Request</>}
              </button>
            </form>
          </div>

          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>My Requests</h3>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}><Loader2 size={20} className="spin" /></div>
          ) : requests.length === 0 ? (
            <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No requests yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {requests.map(r => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.75rem 1rem', borderRadius: '10px',
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent-primary)', minWidth: '40px' }}>{r.request_type}</span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{r.dates.join(', ')}</span>
                    {r.reason && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>— {r.reason}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {getStatusBadge(r.status)}
                    {r.reviewed_by && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>by {r.reviewed_by}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ─── REVIEW REQUESTS PAGE (Admin) ────────────────────────────────
const ReviewRequestsPage = ({ onRefreshRoster }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => { loadPending(); }, []);

  const loadPending = async () => {
    setLoading(true);
    try {
      const data = await getPendingRequests();
      setRequests(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleReview = async (id, decision) => {
    setProcessing(id);
    try {
      await reviewRequest(id, decision);
      setToast({ message: `Request ${decision}!`, type: 'success' });
      await loadPending();
      if (decision === 'approved' && onRefreshRoster) onRefreshRoster();
    } catch (err) {
      setToast({ message: err.message || 'Failed to review', type: 'error' });
    } finally { setProcessing(null); }
  };

  return (
    <div className="view-container">
      <div className="view-header">
        <h2><CheckSquare size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />Review Requests</h2>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{requests.length} pending</span>
      </div>

      {toast && (
        <div className={`toast toast-${toast.type}`} style={{ margin: '0 0 1rem' }}>
          {toast.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
          {toast.message}
          <button onClick={() => setToast(null)}><X size={12} /></button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}><Loader2 size={20} className="spin" /></div>
      ) : requests.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <CheckCircle size={32} style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
          <p>All caught up! No pending requests.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {requests.map(r => (
            <div key={r.id} style={{
              padding: '1rem 1.25rem', borderRadius: '12px',
              background: 'var(--bg-card)', border: '1px solid var(--border-color)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{r.requester_name}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{r.team}</span>
                </div>
                <span style={{
                  padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700,
                  background: 'rgba(0, 115, 255, 0.15)', color: 'var(--accent-primary)'
                }}>{r.request_type}</span>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                <CalendarDays size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                {r.dates.join(', ')}
              </div>
              {r.reason && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontStyle: 'italic' }}>"{r.reason}"</div>}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => handleReview(r.id, 'approved')}
                  disabled={processing === r.id}
                  style={{ fontSize: '0.8rem', padding: '0.4rem 1rem' }}
                >
                  {processing === r.id ? <Loader2 size={14} className="spin" /> : <><CheckCircle size={14} /> Approve</>}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleReview(r.id, 'declined')}
                  disabled={processing === r.id}
                  style={{ fontSize: '0.8rem', padding: '0.4rem 1rem', color: 'var(--accent-danger)' }}
                >
                  <X size={14} /> Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function AuthenticatedApp({ onLogout }) {
  const [view, setView] = useState('dashboard');
  const [isAdmin, setIsAdmin] = useState(false);
  const [userIsAdminRole, setUserIsAdminRole] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [showGenerator, setShowGenerator] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showTeamSettings, setShowTeamSettings] = useState(false);
  const [showAdminManager, setShowAdminManager] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());

  // Command Palette State
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // ⌘K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Theme State
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const [rosterData, setRosterData] = useState([]);
  const [rosterExists, setRosterExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Teams state
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(''); // kept for DeleteConfirm compat
  const [viewMode, setViewMode] = useState('all'); // always 'all' for multi-team grouping
  const [selectedTeams, setSelectedTeams] = useState([]); // [] = All Groups
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true');

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      localStorage.setItem('sidebar_collapsed', !prev);
      return !prev;
    });
  };
  const [allTeamsData, setAllTeamsData] = useState([]);

  // Load teams on mount + check admin status + fetch user profile
  useEffect(() => {
    loadTeams();
    checkAdmin().then(isAdminResult => {
      setUserIsAdminRole(isAdminResult);
    }).catch(() => setUserIsAdminRole(false));
    whoAmI().then(profile => {
      setUserProfile(profile);
    }).catch(() => setUserProfile(null));
  }, []);

  const loadTeams = async () => {
    const data = await getTeams();
    setTeams(data);
    if (data.length > 0 && !selectedTeam) {
      setSelectedTeam(data[0].name);
    }
  };

  // Fetch roster data when month or selected teams change
  const loadRoster = useCallback(async () => {
    setLoading(true);
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;

    try {
      if (selectedTeams.length === 0) {
        // No filter = load ALL teams
        const allDataMap = await fetchAllTeamsRoster(year, month);
        const flatData = Object.values(allDataMap).flat();
        setAllTeamsData(flatData);
        setRosterData(flatData);
        setRosterExists(flatData.length > 0);
      } else {
        // Parallel-fetch only the selected teams, then combine
        const results = await Promise.all(
          selectedTeams.map(teamName => fetchRoster(year, month, teamName).catch(() => []))
        );
        const flatData = results.flat();
        setAllTeamsData(flatData);
        setRosterData(flatData);
        setRosterExists(flatData.length > 0);
      }
    } catch (error) {
      console.error('Error loading roster:', error);
      setToast({ message: 'Failed to load roster', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [currentDate, selectedTeams]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  // Toggle Admin Mode (only available if user has admin role)
  const toggleAdminMode = () => {
    if (userIsAdminRole) {
      setIsAdmin(prev => {
        if (!prev) setToast({ message: 'Admin Access Granted', type: 'success' });
        return !prev;
      });
    }
  };

  // Handle month change
  const handleDateChange = (newDate) => {
    setCurrentDate(newDate);
  };

  // Handle generate
  const handleGenerate = async (payload) => {
    setToast({ message: 'Generating roster...', type: 'loading' });

    try {
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setToast({ message: 'Roster generated successfully!', type: 'success' });
        await loadRoster();
      } else {
        throw new Error('Generation failed');
      }
    } catch (error) {
      console.error('Error generating roster:', error);
      setToast({ message: 'Failed to generate roster. Check N8n webhook.', type: 'error' });
    }
  };

  // Handle delete
  const handleDelete = async () => {
    setDeleting(true);
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;

    try {
      const success = await deleteRoster(year, month, selectedTeam);
      if (success) {
        setToast({ message: `Roster for ${selectedTeam} deleted successfully`, type: 'success' });
        setRosterData([]);
        setRosterExists(false);
      }
    } catch (error) {
      setToast({ message: 'Failed to delete roster', type: 'error' });
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Handle cell update (admin mode)
  const handleCellUpdate = async (date, name, status) => {
    if (!isAdmin) return;

    // Find the agent's actual team from the data (critical for All Groups mode)
    let team = selectedTeam;
    if (viewMode === 'all' && allTeamsData.length > 0) {
      const agentEntry = allTeamsData.find(d => d.Name === name);
      if (agentEntry?.Team) team = agentEntry.Team;
    }

    if (!team) return;

    try {
      await updateRosterEntry(date, name, status, team);
      // Update local state
      setRosterData(prev => prev.map(row =>
        row.Date === date && row.Name === name ? { ...row, Status: status } : row
      ));
      setAllTeamsData(prev => prev.map(row =>
        row.Date === date && row.Name === name ? { ...row, Status: status } : row
      ));
    } catch (error) {
      setToast({ message: 'Failed to update cell', type: 'error' });
    }
  };

  // Topbar Notification mock state
  const [notifications] = useState([{ id: 1, text: 'New requests pending review' }]);

  return (
    <div className="app-layout">
      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Command Palette */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={(destination) => setView(destination)}
        onAction={(action) => {
          if (action === 'toggle-theme') toggleTheme();
          if (action === 'refresh') loadRoster();
        }}
        darkMode={theme === 'dark'}
      />

      {/* Sidebar - Clean SaaS style */}
      <aside className={`sidebar ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', paddingLeft: sidebarCollapsed ? '0' : '16px', paddingTop: '8px' }}>
          <Logo collapsed={sidebarCollapsed} height="36px" />
        </div>

        <button className="sidebar-toggle" onClick={toggleSidebar} title={sidebarCollapsed ? 'Expand' : 'Collapse'}>
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        <nav className="sidebar-nav" style={{ marginTop: '1rem' }}>
          <button
            className={`nav-item ${view === 'dashboard' ? 'active' : ''}`}
            onClick={() => setView('dashboard')}
            title="Dashboard"
          >
            <LayoutGrid size={20} /> {!sidebarCollapsed && 'Overview'}
          </button>
          <button
            className={`nav-item ${view === 'roster' ? 'active' : ''}`}
            onClick={() => setView('roster')}
            title="Roster"
          >
            <Calendar size={20} /> {!sidebarCollapsed && 'Roster'}
          </button>
          <button
            className={`nav-item ${view === 'summary' ? 'active' : ''}`}
            onClick={() => setView('summary')}
            title="Reports"
          >
            <PieChart size={20} /> {!sidebarCollapsed && 'Reports'}
          </button>

          <div style={{ height: '1px', background: 'var(--border-color)', margin: '1rem 0' }} />

          <button
            className={`nav-item ${view === 'requests' ? 'active' : ''}`}
            onClick={() => setView('requests')}
            title="Requests"
          >
            <FileText size={20} /> {!sidebarCollapsed && 'Requests'}
          </button>
          {userIsAdminRole && (
            <button
              className={`nav-item ${view === 'review' ? 'active' : ''}`}
              onClick={() => setView('review')}
              title="Review"
            >
              <CheckSquare size={20} /> {!sidebarCollapsed && 'Approvals'}
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          {userIsAdminRole && (
            <button
              className={`nav-item ${isAdmin ? 'active' : ''}`}
              onClick={toggleAdminMode}
              title={isAdmin ? 'Admin Mode: ON' : 'Admin Mode'}
              style={{ color: isAdmin ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
            >
              <ShieldCheck size={20} /> {!sidebarCollapsed && (isAdmin ? 'Admin: ON' : 'Admin Mode')}
            </button>
          )}

          {isAdmin && !sidebarCollapsed && (
            <button className="nav-item" onClick={() => setShowTeamSettings(true)} style={{ color: 'var(--text-secondary)' }}>
              <Settings size={20} /> Team Settings
            </button>
          )}

          <button className="nav-item" onClick={onLogout} style={{ color: 'var(--accent-danger)' }}>
            <LogOut size={20} /> {!sidebarCollapsed && 'Logout'}
          </button>

          {!sidebarCollapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', padding: '0.5rem', background: 'var(--bg-hover)', borderRadius: '8px' }}>
              <div style={{ width: 32, height: 32, borderRadius: 16, background: 'var(--accent-primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                {userProfile?.name?.charAt(0) || 'U'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{userProfile?.name || 'User'}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{isAdmin ? 'Admin' : 'Member'}</span>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area with Topbar */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

        {/* Main Content */}
        <main className="main-content" style={{ padding: '0', position: 'relative' }}>
          {view === 'dashboard' && (
            <Dashboard
              rosterData={allTeamsData}
              currentDate={currentDate}
              onChangeDate={handleDateChange}
              loading={loading}
              headerAction={
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <TeamSelector teams={teams} selectedTeams={selectedTeams} setSelectedTeams={setSelectedTeams} />
                  {isAdmin && (
                    <button className="btn btn-primary" onClick={() => setShowGenerator(true)}>
                      <PlusCircle size={16} /> Generate Roster
                    </button>
                  )}
                </div>
              }
            />
          )}
          {view === 'roster' && (
            <RosterTable
              rosterData={rosterData}
              currentDate={currentDate}
              onChangeDate={handleDateChange}
              isAdmin={isAdmin}
              loading={loading}
              onCellUpdate={handleCellUpdate}
              viewMode="all"
              allTeamsData={allTeamsData}
              headerAction={
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <TeamSelector teams={teams} selectedTeams={selectedTeams} setSelectedTeams={setSelectedTeams} />
                  {isAdmin && (
                    <button className="btn btn-primary" onClick={() => setShowGenerator(true)}>
                      <PlusCircle size={16} /> Generate
                    </button>
                  )}
                  {isAdmin && rosterExists && (
                    <button className="btn btn-secondary" style={{ color: 'var(--accent-danger)', borderColor: 'var(--accent-danger)' }} onClick={() => setShowDeleteConfirm(true)}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              }
            />
          )}
          {view === 'summary' && (
            <Summary
              currentDate={currentDate}
              selectedTeam={selectedTeams.length === 1 ? selectedTeams[0] : ''}
              viewMode={selectedTeams.length === 1 ? 'single' : 'all'}
              headerAction={
                <TeamSelector teams={teams} selectedTeams={selectedTeams} setSelectedTeams={setSelectedTeams} />
              }
            />
          )}
          {view === 'requests' && (
            <RequestsPage userProfile={userProfile} />
          )}
          {view === 'review' && userIsAdminRole && (
            <ReviewRequestsPage onRefreshRoster={loadRoster} />
          )}
        </main>
      </div>

      {/* Modals */}
      {showGenerator && (
        <Generator
          onClose={() => setShowGenerator(false)}
          onGenerate={handleGenerate}
          currentDate={currentDate}
          teams={teams}
        />
      )}
      {showDeleteConfirm && (
        <DeleteConfirm
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
          currentDate={currentDate}
          deleting={deleting}
          teams={teams}
          selectedTeam={selectedTeam}
          onTeamChange={setSelectedTeam}
        />
      )}
      {showTeamSettings && (
        <TeamSettings
          onClose={() => setShowTeamSettings(false)}
          onTeamsChange={loadTeams}
        />
      )}

      {showAdminManager && (
        <AdminManager
          onClose={() => setShowAdminManager(false)}
        />
      )}
    </div>
  );
}

export default App;
