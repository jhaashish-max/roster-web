import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Calendar,
  Users,
  Settings,
  PlusCircle,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
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
  CalendarDays
} from 'lucide-react';
import CellEditor from './components/CellEditor';
import Summary from './components/Summary';
import CommandPalette from './components/CommandPalette';
import LoginPage from './components/LoginPage';
import Logo from './components/Logo';
import { Sun, Moon, LogOut } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isWeekend, isAfter, isBefore, parseISO, startOfDay, isSameDay } from 'date-fns';
import { fetchRoster, fetchAllTeamsRoster, checkRosterExists, deleteRoster, updateRosterEntry, getTeams, createTeam, updateTeam, deleteTeam, isLoggedIn, getUserEmail, logout as authLogout, handleAuthCallback, checkAdmin, listAdmins, addAdmin, removeAdmin, whoAmI, createLeaveRequest, getMyRequests, getPendingRequests, reviewRequest, bulkUpdateRosterEntries } from './lib/api';
import { FileText, CheckSquare } from 'lucide-react';

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

// Team Selector Component
const TeamSelector = ({ teams, selectedTeam, viewMode, setViewMode, setSelectedTeam, showAllOption }) => (
  <div className="team-selector-inline">
    <label>Team:</label>
    <select
      value={viewMode === 'all' ? 'all-groups' : selectedTeam}
      onChange={(e) => {
        const val = e.target.value;
        if (val === 'all-groups') {
          setViewMode('all');
        } else {
          setViewMode('single');
          setSelectedTeam(val);
        }
      }}
      className="form-select"
    >
      {showAllOption && <option value="all-groups">All Groups</option>}
      {teams.map(t => (
        <option key={t.id} value={t.name}>{t.name}</option>
      ))}
    </select>
  </div>
);

// 1. DASHBOARD
// Helper for status classes
// Helper for status classes
const getStatusClass = (status, dateObj) => {
  if (!status || status === '-') return 'cell-empty';
  const s = status.toUpperCase();

  if (s === 'WO') return 'cell-wo';
  if (s === 'PL' || s === 'SL') return 'cell-leave';
  if (s === 'WL') return 'cell-wl';

  // Morning shift (07:00 or 09:00)
  if (s.includes('07:00') || s.includes('09:00') || s.includes('9:00') || s.includes('9 - 6')) {
    if (s.includes('07:00') && dateObj && isWeekend(dateObj)) {
      return 'cell-oncall';
    }
    return 'cell-morning';
  }

  // On-call / 10:00-22:00
  if (s.includes('10:00 - 22:00') || s.includes('ON CALL') || s.includes('ONCALL')) return 'cell-oncall';

  // Night shift
  if (s.includes('NIGHT') || s.startsWith('18:') || s.startsWith('19:') || s.startsWith('20:')) return 'cell-night';

  // Late shift / Afternoon (11:00 - 20:00 or 12:00 - 21:00)
  if (s.includes('11:00') || s.includes('11-8') || s.includes('11 - 8') || s.includes('12:00')) return 'cell-afternoon';

  // Holiday
  if (s.includes('HOLIDAY') || s === 'HL') return 'cell-holiday';

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
      morning: todayData.filter(d => d.Status === '09:00 - 18:00' || d.Status === '07:00 - 16:00').length,
      afternoon: todayData.filter(d => d.Status === '11:00 - 20:00' || d.Status === '10:00 - 19:00' || d.Status === '06:00 - 15:00' || d.Status === '12:00 - 21:00').length,
      night: todayData.filter(d => d.Status === '18:00 - 03:00').length,
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
      const dDate = parseISO(d.Date);
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
        <div className="empty-state-large">
          <Calendar size={48} />
          <h3>No Roster Found</h3>
          <p>Generate a new roster for {format(currentDate, 'MMMM yyyy')}</p>
        </div>
      ) : (
        <>



          {/* Hero Stats Cards */}
          <div className="stats-hero-grid">
            <div className="stat-card">
              <h3>Working</h3>
              <div className="stat-value">{stats.working}</div>
            </div>
            <div className="stat-card">
              <h3>Morning</h3>
              <div className="stat-value" style={{ color: 'var(--morning)' }}>{stats.morning}</div>
            </div>
            <div className="stat-card">
              <h3>Afternoon</h3>
              <div className="stat-value" style={{ color: 'var(--afternoon)' }}>{stats.afternoon}</div>
            </div>
            <div className="stat-card">
              <h3>Night</h3>
              <div className="stat-value" style={{ color: 'var(--night)' }}>{stats.night}</div>
            </div>
            <div className="stat-card">
              <h3>Leave</h3>
              <div className="stat-value" style={{ color: 'var(--leave)' }}>{stats.leave}</div>
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
            <div className="panel">
              <div className="panel-header">
                <Briefcase size={18} />
                <h3>Today's Schedule</h3>
              </div>
              <div className="shift-list">
                {workingAgents.length > 0 ? workingAgents.map((a, i) => (
                  <div key={i} className="shift-item">
                    <div className="agent-avatar" style={{ background: getAvatarColor(a.Name) }}>{a.Name.charAt(0)}</div>
                    <div className="agent-info">
                      <div className="agent-name-row">
                        <div className="agent-name">{a.Name}</div>
                        {a.Team && <span className="team-tag">{a.Team}</span>}
                      </div>
                      <div className={`shift-time ${getShiftClass(a.Status)}`}>{a.Status}</div>
                    </div>
                  </div>
                )) : <p className="empty-state">No agents scheduled for today.</p>}
              </div>
            </div>

            <div className="right-column-stack">
              <div className="panel">
                <div className="panel-header">
                  <UserX size={18} />
                  <h3>Not Available ({onLeave.length})</h3>
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

              <div className="panel" style={{ flex: 1 }}>
                <div className="panel-header">
                  <CalendarDays size={18} />
                  <h3>Upcoming Leaves</h3>
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
        </>
      )}
    </div>
  );
};

const getShiftClass = (status) => {
  if (status.includes('07:00') || status.includes('09:00')) return 'shift-morning';
  if (status.includes('10:00') || status.includes('11:00') || status.includes('12:00')) return 'shift-afternoon';
  if (status.includes('18:00')) return 'shift-night';
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
      const next = Math.max(0.4, Math.min(1.2, +(prev + delta).toFixed(2)));
      localStorage.setItem('roster_zoom', next);
      return next;
    });
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
    <div className="roster-page">
      <div className="roster-header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h1 className="dashboard-title">Monthly Roster</h1>
          {headerAction}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="zoom-controls">
            <button className="zoom-btn" onClick={() => handleZoom(-0.1)} title="Zoom out">−</button>
            <span className="zoom-level">{Math.round(zoom * 100)}%</span>
            <button className="zoom-btn" onClick={() => handleZoom(0.1)} title="Zoom in">+</button>
          </div>
          <div className="date-nav">
            <button className="date-nav-btn" onClick={() => onChangeDate(subMonths(currentDate, 1))}>
              <ChevronLeft size={20} />
            </button>
            <div className="date-display">
              <Calendar size={18} />
              {format(currentDate, 'MMMM yyyy')}
            </div>
            <button className="date-nav-btn" onClick={() => onChangeDate(addMonths(currentDate, 1))}>
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="legend-chips">
        <span className="legend-chip chip-morning">Morning</span>
        <span className="legend-chip chip-afternoon">Afternoon</span>
        <span className="legend-chip chip-oncall">On Call</span>
        <span className="legend-chip chip-night">Night</span>
        <span className="legend-chip chip-leave">PL</span>
        <span className="legend-chip chip-wo">WO</span>
        <span className="legend-chip chip-wl">WL</span>
        <span className="legend-chip chip-holiday">Holiday</span>
        <span className="legend-chip chip-wfh">WFH</span>
      </div>

      {loading ? (
        <div className="loading-state">
          <Loader2 size={32} className="spin" />
          <p>Loading roster data...</p>
        </div>
      ) : displayData.length === 0 ? (
        <div className="empty-state-large">
          <Calendar size={48} />
          <h3>No Roster Found</h3>
          <p>Generate a new roster for {format(currentDate, 'MMMM yyyy')}</p>
        </div>
      ) : (
        <div className="roster-all-groups" onClick={clearSelection} style={{ zoom: zoom }}>
          {teamGroups.map((group) => (
            <div key={group.team || 'single'} className="roster-team-section">
              {group.team && (
                <div className="team-section-header">
                  {group.team}
                </div>
              )}
              <div className="roster-table-wrapper">
                <table className="roster-table">
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
                          {agent}
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
      <div className="modal-content">
        <div className="modal-header">
          <Wand2 size={24} className="modal-icon" />
          <h2>Generate Roster</h2>
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

        <div className="modal-actions">
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
      <div className="modal-content modal-small">
        <div className="modal-header">
          <Users size={24} className="modal-icon" />
          <h2>Manage Admins</h2>
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
    const data = await getTeams();
    setTeams(data);
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
    setFormMembers(team.members.join('\n'));
    setFormPrompt(team.custom_prompt || '');
    setShowPromptEditor(!!team.custom_prompt);
    setEditingTeam(team);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formMembers.trim()) return;

    setSaving(true);
    const membersArray = formMembers.split('\n').map(m => m.trim()).filter(m => m);

    if (isCreating) {
      await createTeam(formName, membersArray, formPrompt || null);
    } else if (editingTeam) {
      await updateTeam(editingTeam.id, {
        name: formName,
        members: membersArray,
        custom_prompt: formPrompt || null
      });
    }

    await loadTeams();
    resetForm();
    setSaving(false);
    if (onTeamsChange) onTeamsChange();
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
      <div className="modal-content modal-large">
        <div className="modal-header">
          <Settings size={24} className="modal-icon" />
          <h2>Team Settings</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="team-settings-layout">
          {/* Teams List */}
          <div className="teams-list">
            <div className="teams-list-header">
              <h3>Teams</h3>
              <button className="btn btn-small btn-primary" onClick={startCreate}>
                <Plus size={14} /> New
              </button>
            </div>

            {loading ? (
              <div className="loading-small"><Loader2 size={20} className="spin" /></div>
            ) : teams.length === 0 ? (
              <p className="no-teams">No teams created yet</p>
            ) : (
              <div className="teams-items">
                {teams.map(team => (
                  <div
                    key={team.id}
                    className={`team-item ${editingTeam?.id === team.id ? 'active' : ''}`}
                    onClick={() => startEdit(team)}
                  >
                    <div className="team-item-info">
                      <span className="team-name">{team.name}</span>
                      <span className="team-count">{team.members.length} members</span>
                    </div>
                    <button
                      className="btn-icon btn-delete-small"
                      onClick={(e) => { e.stopPropagation(); handleDelete(team.id); }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Team Form */}
          <div className="team-form">
            {(isCreating || editingTeam) ? (
              <>
                <h3>{isCreating ? 'Create New Team' : 'Edit Team'}</h3>

                <div className="form-group">
                  <label>Team Name</label>
                  <input
                    type="text"
                    placeholder="e.g., Enterprise-VAS"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Team Members (one per line)</label>
                  <textarea
                    rows={8}
                    placeholder="John Doe&#10;Jane Smith&#10;..."
                    value={formMembers}
                    onChange={(e) => setFormMembers(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={showPromptEditor}
                      onChange={(e) => handleShowPromptChange(e.target.checked)}
                    />
                    Use Custom AI Prompt
                  </label>
                </div>

                {showPromptEditor && (
                  <div className={`form-group ${isPromptFullscreen ? 'prompt-fullscreen-container' : ''}`}>
                    <div className="prompt-header">
                      <label>Custom Prompt</label>
                      <button
                        type="button"
                        className="fullscreen-toggle"
                        onClick={() => setIsPromptFullscreen(!isPromptFullscreen)}
                      >
                        {isPromptFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                        {isPromptFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                      </button>
                    </div>
                    <p className="form-hint">
                      Use variables: {'{{TEAM_NAME}}'}, {'{{MONTH_NAME}}'}, {'{{YEAR}}'}, {'{{TEAM_MEMBERS}}'}, {'{{SLACK_REQUESTS}}'}, {'{{START_DATE}}'}, {'{{END_DATE}}'}, {'{{MONTH_PADDED}}'}, {'{{PREVIOUS_MONTH_DATA}}'}
                    </p>
                    <textarea
                      rows={isPromptFullscreen ? 30 : 10}
                      placeholder="Enter custom AI prompt..."
                      value={formPrompt}
                      onChange={(e) => setFormPrompt(e.target.value)}
                      className="mono-textarea"
                    />
                  </div>
                )}

                <div className="form-actions">
                  <button className="btn btn-secondary" onClick={resetForm} disabled={saving}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving || !formName.trim() || !formMembers.trim()}>
                    {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                    {saving ? 'Saving...' : 'Save Team'}
                  </button>
                </div>
              </>
            ) : (
              <div className="team-form-empty">
                <Users size={48} />
                <p>Select a team to edit or create a new one</p>
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
  const [selectedTeam, setSelectedTeam] = useState('');
  const [viewMode, setViewMode] = useState('all'); // 'single' or 'all'
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

  // Fetch roster data when month, team, or viewMode changes
  const loadRoster = useCallback(async () => {
    setLoading(true);
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;

    try {
      if (viewMode === 'all') {
        // In "all" mode, only fetch all teams data
        const allDataMap = await fetchAllTeamsRoster(year, month);
        const flatData = Object.values(allDataMap).flat();
        setAllTeamsData(flatData);
        setRosterData(flatData);
        setRosterExists(flatData.length > 0);
      } else if (selectedTeam) {
        // In "single" mode, fetch only selected team
        const data = await fetchRoster(year, month, selectedTeam);
        setRosterData(data);
        setRosterExists(data.length > 0);
      }
    } catch (error) {
      console.error('Error loading roster:', error);
      setToast({ message: 'Failed to load roster', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [currentDate, selectedTeam, viewMode]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  // Toggle Admin Mode (only available if user has admin role)
  const toggleAdminMode = () => {
    if (userIsAdminRole) {
      setIsAdmin(prev => {
        if (!prev) setToast({ message: 'Admin Access Granted 🔓', type: 'success' });
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

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', paddingLeft: sidebarCollapsed ? '0' : '12px' }}>
          <Logo collapsed={sidebarCollapsed} height="40px" />
        </div>

        <button className="sidebar-toggle" onClick={toggleSidebar} title={sidebarCollapsed ? 'Expand' : 'Collapse'}>
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${view === 'dashboard' ? 'active' : ''}`}
            onClick={() => setView('dashboard')}
            title="Dashboard"
          >
            <LayoutGrid size={20} /> {!sidebarCollapsed && 'Dashboard'}
          </button>
          <button
            className={`nav-item ${view === 'roster' ? 'active' : ''}`}
            onClick={() => setView('roster')}
            title="Roster View"
          >
            <TableIcon size={20} /> {!sidebarCollapsed && 'Roster View'}
          </button>
          <button
            className={`nav-item ${view === 'summary' ? 'active' : ''}`}
            onClick={() => setView('summary')}
            title="Summary"
          >
            <PieChart size={20} /> {!sidebarCollapsed && 'Summary'}
          </button>
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
              title="Review Requests"
            >
              <CheckSquare size={20} /> {!sidebarCollapsed && 'Review Requests'}
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          {isAdmin && !sidebarCollapsed && (
            <>
              <button className="btn btn-generate" onClick={() => setShowGenerator(true)}>
                <PlusCircle size={18} /> Generate New
              </button>

              {rosterExists && (
                <button className="btn btn-delete" onClick={() => setShowDeleteConfirm(true)}>
                  <Trash2 size={18} /> Delete Roster
                </button>
              )}

              <button className="btn btn-team-settings" onClick={() => setShowTeamSettings(true)}>
                <Users size={18} /> Team Settings
              </button>
            </>
          )}

          <button className="btn btn-secondary" onClick={toggleTheme} style={{ justifyContent: 'center' }} title="Toggle theme">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            {!sidebarCollapsed && (theme === 'dark' ? ' Light Mode' : ' Dark Mode')}
          </button>

          <button className="btn btn-refresh" onClick={loadRoster} title="Refresh">
            <RefreshCw size={18} /> {!sidebarCollapsed && 'Refresh'}
          </button>

          {userIsAdminRole && (
            <button
              className={`btn btn-admin ${isAdmin ? 'active' : ''}`}
              onClick={toggleAdminMode}
              title={isAdmin ? 'Admin Mode: ON' : 'Admin mode'}
            >
              <Settings size={18} /> {!sidebarCollapsed && (isAdmin ? 'Admin Mode: ON' : 'Admin mode')}
            </button>
          )}

          {userIsAdminRole && (
            <button
              className="btn btn-secondary"
              onClick={() => setShowAdminManager(true)}
              title="Manage Admins"
            >
              <Users size={18} /> {!sidebarCollapsed && 'Manage Admins'}
            </button>
          )}

          <button className="btn btn-logout" onClick={onLogout} title="Logout">
            <LogOut size={18} /> {!sidebarCollapsed && 'Logout'}
          </button>

          {!sidebarCollapsed && userProfile?.name && (
            <div style={{
              fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center',
              padding: '0.5rem 0', borderTop: '1px solid var(--border-color)', marginTop: '0.5rem'
            }}>
              Logged in as <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{userProfile.name}</span>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      {/* Main Content */}
      <main className="main-content">
        {view === 'dashboard' && (
          <Dashboard
            rosterData={viewMode === 'all' ? allTeamsData : rosterData}
            currentDate={currentDate}
            onChangeDate={handleDateChange}
            loading={loading}
            headerAction={
              <TeamSelector
                teams={teams}
                selectedTeam={selectedTeam}
                viewMode={viewMode}
                setViewMode={setViewMode}
                setSelectedTeam={setSelectedTeam}
                showAllOption={true}
              />
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
            viewMode={viewMode}
            allTeamsData={allTeamsData}
            headerAction={
              <TeamSelector
                teams={teams}
                selectedTeam={selectedTeam}
                viewMode={viewMode}
                setViewMode={setViewMode}
                setSelectedTeam={setSelectedTeam}
                showAllOption={true}
              />
            }
          />
        )}
        {view === 'summary' && (
          <Summary
            currentDate={currentDate}
            selectedTeam={selectedTeam}
            viewMode={viewMode}
            headerAction={
              <TeamSelector
                teams={teams}
                selectedTeam={selectedTeam}
                viewMode={viewMode}
                setViewMode={setViewMode}
                setSelectedTeam={setSelectedTeam}
                showAllOption={true}
              />
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
