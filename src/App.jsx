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
  Minimize2
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isWeekend } from 'date-fns';
import { supabase, fetchRoster, fetchAllTeamsRoster, checkRosterExists, deleteRoster, updateRosterEntry, getTeams, createTeam, updateTeam, deleteTeam } from './lib/supabase';

// N8n Webhook URL - Using Vite proxy to bypass CORS
// N8n Webhook URL - Using Vite proxy to bypass CORS
const N8N_WEBHOOK_URL = '/api/n8n/webhook/8211a001-8f9e-4387-9289-1538db922fa9';
const N8N_AUTH_WEBHOOK_URL = '/api/n8n/webhook/cd0f5c69-c0fc-4272-a662-7a0e33698c7b';

// Default prompt template for roster generation
const DEFAULT_PROMPT = `You are a Roster Manager. Generate a JSON schedule for the '{{TEAM_NAME}}' team for {{MONTH_NAME}} {{YEAR}}.

### INPUT DATA
**Team List:** {{TEAM_MEMBERS}}
**Slack Requests:** """{{SLACK_REQUESTS}}"""

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

// 1. DASHBOARD
const Dashboard = ({ rosterData, currentDate, onChangeDate, loading }) => {
  const todayStr = format(currentDate, 'yyyy-MM-dd');
  const todayData = rosterData.filter(d => d.Date === todayStr);

  const stats = useMemo(() => {
    const working = todayData.filter(d => d.Status.includes(':') && d.Status !== 'WO');
    return {
      total: todayData.length,
      working: working.length,
      morning: todayData.filter(d => d.Status === '09:00 - 18:00').length,
      afternoon: todayData.filter(d => d.Status === '11:00 - 20:00' || d.Status === '10:00 - 19:00' || d.Status === '06:00 - 15:00').length,
      night: todayData.filter(d => d.Status === '18:00 - 03:00').length,
      leave: todayData.filter(d => d.Status === 'PL' || d.Status === 'SL' || d.Status === 'WFH').length,
      wo: todayData.filter(d => d.Status === 'WO').length,
    };
  }, [todayData]);

  const onLeave = todayData.filter(d => ['PL', 'SL', 'WO', 'WFH'].includes(d.Status));
  const workingAgents = todayData.filter(d => d.Status.includes(':'));

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Dashboard</h1>
          <p className="dashboard-subtitle">Enterprise + VAS Team Overview</p>
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
          <div className="stats-grid">
            <div className="stat-card stat-card-primary">
              <div className="stat-icon"><Users size={24} /></div>
              <div className="stat-content">
                <div className="stat-value">{stats.working}</div>
                <div className="stat-label">Working Today</div>
              </div>
            </div>
            <div className="stat-card stat-card-morning">
              <div className="stat-icon"><Clock size={24} /></div>
              <div className="stat-content">
                <div className="stat-value">{stats.morning}</div>
                <div className="stat-label">Morning (09:00)</div>
              </div>
            </div>
            <div className="stat-card stat-card-afternoon">
              <div className="stat-icon"><Clock size={24} /></div>
              <div className="stat-content">
                <div className="stat-value">{stats.afternoon}</div>
                <div className="stat-label">Afternoon (11:00)</div>
              </div>
            </div>
            <div className="stat-card stat-card-night">
              <div className="stat-icon"><Clock size={24} /></div>
              <div className="stat-content">
                <div className="stat-value">{stats.night}</div>
                <div className="stat-label">Night (18:00)</div>
              </div>
            </div>
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
                    <div className="agent-avatar">{a.Name.charAt(0)}</div>
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

            <div className="panel">
              <div className="panel-header">
                <UserX size={18} />
                <h3>Not Available ({onLeave.length})</h3>
              </div>
              {onLeave.length > 0 ? (
                <div className="leave-list">
                  {onLeave.map((p, i) => (
                    <div key={i} className="leave-item">
                      <div className="agent-avatar leave-avatar">{p.Name.charAt(0)}</div>
                      <div className="agent-info">
                        <div className="agent-name-row">
                          <div className="agent-name">{p.Name}</div>
                          {p.Team && <span className="team-tag">{p.Team}</span>}
                        </div>
                        <div className="leave-type">{p.Status}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state">Everyone is available today! 🎉</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const getShiftClass = (status) => {
  if (status.includes('09:00')) return 'shift-morning';
  if (status.includes('10:00') || status.includes('11:00')) return 'shift-afternoon';
  if (status.includes('18:00')) return 'shift-night';
  return '';
};

// 2. ROSTER TABLE
const RosterTable = ({ rosterData, currentDate, onChangeDate, isAdmin, loading, onCellUpdate }) => {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const startDate = new Date(year, month - 1, 1);
  const endDate = endOfMonth(startDate);
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const agents = [...new Set(rosterData.map(d => d.Name))];
  const rosterMap = useMemo(() => {
    const map = {};
    rosterData.forEach(d => {
      if (!map[d.Name]) map[d.Name] = {};
      map[d.Name][d.Date] = d.Status;
    });
    return map;
  }, [rosterData]);

  // Selection state: { type: 'cell' | 'row' | 'column', row: string, col: string }
  const [selection, setSelection] = useState(null);

  const getStatusClass = (status) => {
    if (!status || status === '-') return 'cell-empty';
    if (status.includes('09:00')) return 'cell-morning';
    if (status.includes('10:00') || status.includes('11:00')) return 'cell-afternoon';
    if (status.includes('18:00')) return 'cell-night';
    if (status === 'PL' || status === 'SL') return 'cell-leave';
    if (status === 'WO') return 'cell-wo';
    if (status === 'WFH') return 'cell-wfh';
    return 'cell-other';
  };

  const handleCellBlur = async (agent, dateStr, newValue) => {
    if (onCellUpdate) {
      onCellUpdate(dateStr, agent, newValue);
    }
  };

  // Selection handlers
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

  const clearSelection = () => {
    setSelection(null);
  };

  const isCellSelected = (agent, dateStr) => {
    if (!selection) return false;
    if (selection.type === 'cell') {
      return selection.row === agent && selection.col === dateStr;
    }
    if (selection.type === 'row') {
      return selection.row === agent;
    }
    if (selection.type === 'column') {
      return selection.col === dateStr;
    }
    return false;
  };

  const isRowSelected = (agent) => {
    return selection?.type === 'row' && selection.row === agent;
  };

  const isColumnSelected = (dateStr) => {
    return selection?.type === 'column' && selection.col === dateStr;
  };

  return (
    <div className="roster-page">
      <div className="roster-header">
        <div>
          <h1 className="dashboard-title">Monthly Roster</h1>
          <p className="dashboard-subtitle">Enterprise + VAS Team</p>
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

      <div className="legend">
        <div className="legend-item"><span className="legend-dot cell-morning"></span> Morning</div>
        <div className="legend-item"><span className="legend-dot cell-afternoon"></span> Afternoon</div>
        <div className="legend-item"><span className="legend-dot cell-night"></span> Night</div>
        <div className="legend-item"><span className="legend-dot cell-leave"></span> Leave</div>
        <div className="legend-item"><span className="legend-dot cell-wo"></span> Week Off</div>
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
        <div className="roster-table-wrapper" onClick={clearSelection}>
          <table className="roster-table">
            <thead>
              <tr>
                <th className="sticky-col corner-cell">Agent</th>
                {days.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  return (
                    <th
                      key={day.toString()}
                      className={`${isWeekend(day) ? 'weekend-header' : ''} ${isColumnSelected(dateStr) ? 'selected-header' : ''}`}
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
              {agents.map(agent => (
                <tr key={agent} className={isRowSelected(agent) ? 'selected-row' : ''}>
                  <td
                    className={`sticky-col agent-cell ${isRowSelected(agent) ? 'selected-header' : ''}`}
                    onClick={(e) => handleRowClick(agent, e)}
                  >
                    {agent}
                  </td>
                  {days.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const status = rosterMap[agent]?.[dateStr] || '-';
                    const cellClass = getStatusClass(status);
                    const isSelected = isCellSelected(agent, dateStr);
                    return (
                      <td
                        key={dateStr}
                        className={`roster-cell ${cellClass} ${isWeekend(day) ? 'weekend-cell' : ''} ${isSelected ? 'selected-cell' : ''}`}
                        onClick={(e) => handleCellClick(agent, dateStr, e)}
                      >
                        {isAdmin ? (
                          <input
                            className="cell-input"
                            defaultValue={status}
                            onBlur={(e) => handleCellBlur(agent, dateStr, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
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

// Admin Login Modal
const AdminLoginModal = ({ onClose, onLogin, loggingIn }) => {
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(password);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-small">
        <div className="modal-header">
          <Settings size={24} className="modal-icon" />
          <h2>Admin Access</h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Enter Admin Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              className="form-input"
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loggingIn}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loggingIn || !password}>
              {loggingIn ? <Loader2 size={16} className="spin" /> : 'Unlock'}
            </button>
          </div>
        </form>
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
                      Use variables: {'{{TEAM_NAME}}'}, {'{{MONTH_NAME}}'}, {'{{YEAR}}'}, {'{{TEAM_MEMBERS}}'}, {'{{SLACK_REQUESTS}}'}, {'{{START_DATE}}'}, {'{{END_DATE}}'}, {'{{MONTH_PADDED}}'}
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
  const [view, setView] = useState('dashboard');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showTeamSettings, setShowTeamSettings] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());

  // Admin Auth State
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  const [rosterData, setRosterData] = useState([]);
  const [rosterExists, setRosterExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Teams state
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [viewMode, setViewMode] = useState('single'); // 'single' or 'all'
  const [allTeamsData, setAllTeamsData] = useState([]);

  // Load teams on mount
  useEffect(() => {
    loadTeams();
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
      // Always Fetch single team roster (for Roster View)
      const data = await fetchRoster(year, month, selectedTeam || undefined);
      setRosterData(data);
      setRosterExists(data.length > 0);

      // If 'all' mode, also fetch all teams data for dashboard
      if (viewMode === 'all') {
        const allDataMap = await fetchAllTeamsRoster(year, month);
        const flatData = Object.values(allDataMap).flat();
        setAllTeamsData(flatData);
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

  // Handle Admin Login
  const handleAdminLogin = async (password) => {
    setLoggingIn(true);
    try {
      const response = await fetch(N8N_AUTH_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const result = await response.json();

      if (result.success) {
        setIsAdmin(true);
        setPasswordModalOpen(false);
        setToast({ message: 'Admin mode enabled', type: 'success' });
      } else {
        setToast({ message: result.message || 'Invalid password', type: 'error' });
      }
    } catch (error) {
      console.error('Auth error:', error);
      setToast({ message: 'Authentication failed', type: 'error' });
    } finally {
      setLoggingIn(false);
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
    try {
      await updateRosterEntry(date, name, status);
      // Update local state
      setRosterData(prev => prev.map(row =>
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

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">R</div>
          <span>Roster.AI</span>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${view === 'dashboard' ? 'active' : ''}`}
            onClick={() => setView('dashboard')}
          >
            <LayoutGrid size={20} /> Dashboard
          </button>
          <button
            className={`nav-item ${view === 'roster' ? 'active' : ''}`}
            onClick={() => setView('roster')}
          >
            <TableIcon size={20} /> Roster View
          </button>
        </nav>

        <div className="sidebar-footer">
          {isAdmin && (
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

          <button className="btn btn-refresh" onClick={loadRoster}>
            <RefreshCw size={18} /> Refresh
          </button>

          {!isAdmin ? (
            <button
              className="btn btn-admin"
              onClick={() => setPasswordModalOpen(true)}
            >
              <Settings size={18} /> Empower Admin
            </button>
          ) : (
            <button
              className="btn btn-admin active"
              onClick={() => setIsAdmin(false)}
            >
              <Settings size={18} /> Admin Mode: ON
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Team Selector Bar */}
        {teams.length > 0 && (
          <div className="team-bar">
            <div className="team-selector">
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
                {/* Only Show All Groups option in Dashboard view */}
                {view === 'dashboard' && <option value="all-groups">All Groups</option>}

                {teams.map(t => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
            {/* Toggle removed as requested */}
          </div>
        )}

        {view === 'dashboard' && (
          <Dashboard
            rosterData={viewMode === 'all' ? allTeamsData : rosterData}
            currentDate={currentDate}
            onChangeDate={handleDateChange}
            loading={loading}
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
          />
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

      {passwordModalOpen && (
        <AdminLoginModal
          onClose={() => setPasswordModalOpen(false)}
          onLogin={handleAdminLogin}
          loggingIn={loggingIn}
        />
      )}
    </div>
  );
}

export default App;
