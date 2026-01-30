import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  LineChart,
  Line,
} from "recharts";
import {
  Plus,
  Trash2,
  Pencil,
  Download,
  Upload,
  RefreshCcw,
  Flame,
  CheckCircle2,
  CalendarDays,
} from "lucide-react";

/**
 * Habit Tracker (Vite + React)
 * - Habits CRUD
 * - Daily check-ins
 * - Dashboard: daily/weekly/monthly charts
 * - Streaks + 30d completion rates
 * - localStorage persistence
 * - Export/Import JSON
 */

const LS_KEY = "habit_tracker_v1";

function pad2(n) { return String(n).padStart(2, "0"); }
function toISODate(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}
function parseISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function startOfWeek(date, weekStartsOn = 1) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfMonth(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function safeJSONParse(str, fallback) { try { return JSON.parse(str); } catch { return fallback; } }

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatShort(iso) {
  const d = parseISODate(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function formatMonthLabel(iso) {
  const d = parseISODate(iso);
  return d.toLocaleDateString(undefined, { year: "2-digit", month: "short" });
}

function defaultState() {
  const today = toISODate(new Date());
  return {
    version: 1,
    settings: { weekStartsOn: 1 },
    habits: [
      { id: uid(), name: "Drink water", targetPerWeek: 5, active: true, createdAtISO: today, notes: "Aim for 8 cups" },
      { id: uid(), name: "Walk 30 minutes", targetPerWeek: 4, active: true, createdAtISO: today, notes: "Any pace" },
      { id: uid(), name: "Read 10 pages", targetPerWeek: 6, active: true, createdAtISO: today, notes: "Fiction or non-fiction" },
    ],
    completions: {}
  };
}

function loadState() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return defaultState();
  const parsed = safeJSONParse(raw, null);
  if (!parsed || typeof parsed !== "object") return defaultState();
  if (!parsed.settings) parsed.settings = { weekStartsOn: 1 };
  if (!Array.isArray(parsed.habits)) parsed.habits = [];
  if (!parsed.completions || typeof parsed.completions !== "object") parsed.completions = {};
  return parsed;
}

function saveState(state) { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
function getActiveHabits(habits) { return habits.filter((h) => h.active); }
function isCompleted(completions, dateISO, habitId) { return !!(completions?.[dateISO]?.[habitId]); }

function toggleCompletion(completions, dateISO, habitId) {
  const day = { ...(completions[dateISO] || {}) };
  if (day[habitId]) delete day[habitId];
  else day[habitId] = true;
  const next = { ...completions, [dateISO]: day };
  if (Object.keys(next[dateISO]).length === 0) {
    const copy = { ...next };
    delete copy[dateISO];
    return copy;
  }
  return next;
}

function dateRangeInclusive(startISO, endISO) {
  const start = parseISODate(startISO);
  const end = parseISODate(endISO);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const out = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) out.push(toISODate(d));
  return out;
}

function lastNDays(n) {
  const end = new Date();
  const start = addDays(end, -(n - 1));
  return { startISO: toISODate(start), endISO: toISODate(end) };
}

function rollupDaily({ habits, completions, startISO, endISO }) {
  const active = getActiveHabits(habits);
  const days = dateRangeInclusive(startISO, endISO);
  return days.map((iso) => {
    const completedCount = active.reduce((acc, h) => acc + (isCompleted(completions, iso, h.id) ? 1 : 0), 0);
    return {
      dateISO: iso,
      label: formatShort(iso),
      completed: completedCount,
      total: active.length,
      rate: active.length ? Math.round((completedCount / active.length) * 100) : 0,
    };
  });
}

function rollupWeekly({ habits, completions, weeksBack = 12, weekStartsOn = 1 }) {
  const active = getActiveHabits(habits);
  const end = new Date();
  const thisWeekStart = startOfWeek(end, weekStartsOn);
  const weeks = [];

  for (let i = weeksBack - 1; i >= 0; i--) {
    const ws = addDays(thisWeekStart, -7 * i);
    const we = addDays(ws, 6);
    const wsISO = toISODate(ws);
    const weISO = toISODate(we);
    const days = dateRangeInclusive(wsISO, weISO);

    const perHabit = {};
    active.forEach((h) => (perHabit[h.id] = 0));
    days.forEach((dISO) => active.forEach((h) => { if (isCompleted(completions, dISO, h.id)) perHabit[h.id] += 1; }));

    const completedTotal = Object.values(perHabit).reduce((a, b) => a + b, 0);
    const totalPossible = active.length * 7;
    const rate = totalPossible ? Math.round((completedTotal / totalPossible) * 100) : 0;

    weeks.push({
      weekStartISO: wsISO,
      label: `${formatShort(wsISO)}–${formatShort(weISO)}`,
      completedTotal,
      totalPossible,
      rate,
      perHabit,
    });
  }
  return weeks;
}

function rollupMonthly({ habits, completions, monthsBack = 12 }) {
  const active = getActiveHabits(habits);
  const now = new Date();
  const cur = startOfMonth(now);
  const months = [];

  for (let i = monthsBack - 1; i >= 0; i--) {
    const mStart = new Date(cur);
    mStart.setMonth(cur.getMonth() - i);
    mStart.setDate(1);
    mStart.setHours(0, 0, 0, 0);

    const nextStart = new Date(mStart);
    nextStart.setMonth(mStart.getMonth() + 1);

    const startISO = toISODate(mStart);
    const endISO = toISODate(addDays(nextStart, -1));
    const days = dateRangeInclusive(startISO, endISO);

    const perHabit = {};
    active.forEach((h) => (perHabit[h.id] = 0));
    days.forEach((dISO) => active.forEach((h) => { if (isCompleted(completions, dISO, h.id)) perHabit[h.id] += 1; }));

    const completedTotal = Object.values(perHabit).reduce((a, b) => a + b, 0);
    const totalPossible = active.length * days.length;
    const rate = totalPossible ? Math.round((completedTotal / totalPossible) * 100) : 0;

    months.push({
      monthISO: startISO,
      label: formatMonthLabel(startISO),
      completedTotal,
      totalPossible,
      rate,
      daysInMonth: days.length,
      perHabit,
    });
  }
  return months;
}

function computeStreak({ habitId, completions }) {
  const todayISO = toISODate(new Date());
  let streak = 0;
  for (let i = 0; i < 3650; i++) {
    const dISO = toISODate(addDays(parseISODate(todayISO), -i));
    if (isCompleted(completions, dISO, habitId)) streak += 1;
    else break;
  }
  return streak;
}

function computeBestStreak({ habitId, completions }) {
  const dates = Object.keys(completions).sort();
  let best = 0, cur = 0, prev = null;
  for (const iso of dates) {
    if (!isCompleted(completions, iso, habitId)) continue;
    if (!prev) cur = 1;
    else {
      const nextExpected = toISODate(addDays(parseISODate(prev), 1));
      cur = iso === nextExpected ? cur + 1 : 1;
    }
    best = Math.max(best, cur);
    prev = iso;
  }
  return best;
}

function completionRateForHabit({ habitId, completions, startISO, endISO }) {
  const days = dateRangeInclusive(startISO, endISO);
  const done = days.reduce((acc, iso) => acc + (isCompleted(completions, iso, habitId) ? 1 : 0), 0);
  return days.length ? Math.round((done / days.length) * 100) : 0;
}

function getTodaySummary({ habits, completions, dateISO }) {
  const active = getActiveHabits(habits);
  const completed = active.filter((h) => isCompleted(completions, dateISO, h.id));
  return {
    total: active.length,
    completed: completed.length,
    remaining: active.length - completed.length,
    rate: active.length ? Math.round((completed.length / active.length) * 100) : 0,
  };
}

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div className="card">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <h3>{label}</h3>
          <div className="big">{value}</div>
          {sub ? <div className="small">{sub}</div> : null}
        </div>
        <div className="pill" style={{ borderRadius: 14 }}>
          <Icon size={16} />
        </div>
      </div>
    </div>
  );
}

function Tabs({ value, onChange }) {
  const items = [
    { key: "today", label: "Today" },
    { key: "dashboard", label: "Dashboard" },
    { key: "insights", label: "Insights" },
    { key: "habits", label: "Habits" },
  ];
  return (
    <div className="tabs">
      {items.map((t) => (
        <button
          key={t.key}
          className={"tab " + (value === t.key ? "active" : "")}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function DayPicker({ dateISO, setDateISO }) {
  const d = parseISODate(dateISO);
  const pretty = d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="card">
      <div className="row">
        <div style={{ flex: 1 }}>
          <div className="sub" style={{ marginTop: 0 }}>Selected day</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{pretty}</div>
        </div>

        <div className="row">
          <button className="btn" onClick={() => setDateISO(toISODate(addDays(d, -1)))}>Prev</button>
          <button className="btn" onClick={() => setDateISO(toISODate(new Date()))}>Today</button>
          <button className="btn" onClick={() => setDateISO(toISODate(addDays(d, 1)))}>Next</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState(() => loadState());
  const [selectedDateISO, setSelectedDateISO] = useState(() => toISODate(new Date()));
  const [tab, setTab] = useState("today");

  const fileInputRef = useRef(null);
  const weekStartsOn = state.settings?.weekStartsOn ?? 1;

  useEffect(() => { saveState(state); }, [state]);

  function upsertHabit(h) {
    setState((prev) => {
      const nowISO = toISODate(new Date());
      if (!h.id) {
        const created = {
          id: uid(),
          name: h.name.trim(),
          targetPerWeek: clamp(h.targetPerWeek || 5, 1, 7),
          active: h.active ?? true,
          createdAtISO: nowISO,
          notes: h.notes || "",
        };
        return { ...prev, habits: [created, ...prev.habits] };
      }
      return { ...prev, habits: prev.habits.map((x) => (x.id === h.id ? { ...x, ...h } : x)) };
    });
  }

  function deleteHabit(habitId) {
    setState((prev) => {
      const nextHabits = prev.habits.filter((h) => h.id !== habitId);
      const nextCompletions = {};
      for (const [dateISO, day] of Object.entries(prev.completions)) {
        const copy = { ...day };
        delete copy[habitId];
        if (Object.keys(copy).length > 0) nextCompletions[dateISO] = copy;
      }
      return { ...prev, habits: nextHabits, completions: nextCompletions };
    });
  }

  function toggleForDate(habitId, dateISO) {
    setState((prev) => ({ ...prev, completions: toggleCompletion(prev.completions, dateISO, habitId) }));
  }

  function resetAll() {
    const ok = window.confirm("Reset all habits and history? This cannot be undone.");
    if (!ok) return;
    setState(defaultState());
    setSelectedDateISO(toISODate(new Date()));
    setTab("today");
  }

  function exportData() {
    const payload = { ...state, exportedAtISO: new Date().toISOString() };
    downloadText(`habit-tracker-export-${toISODate(new Date())}.json`, JSON.stringify(payload, null, 2));
  }

  function importData(raw) {
    const parsed = safeJSONParse(raw, null);
    if (!parsed || typeof parsed !== "object" || !parsed.habits || !parsed.completions) {
      alert("That JSON doesn't look like a Habit Tracker export.");
      return;
    }
    const ok = window.confirm("Import will replace your current data. Continue?");
    if (!ok) return;
    const clean = {
      version: 1,
      settings: { weekStartsOn: parsed.settings?.weekStartsOn ?? 1 },
      habits: Array.isArray(parsed.habits) ? parsed.habits : [],
      completions: parsed.completions && typeof parsed.completions === "object" ? parsed.completions : {},
    };
    setState(clean);
    setSelectedDateISO(toISODate(new Date()));
  }

  const activeHabits = getActiveHabits(state.habits);
  const todayISO = toISODate(new Date());
  const todaySummary = getTodaySummary({ habits: state.habits, completions: state.completions, dateISO: todayISO });
  const selectedDaySummary = useMemo(
    () => getTodaySummary({ habits: state.habits, completions: state.completions, dateISO: selectedDateISO }),
    [state.habits, state.completions, selectedDateISO]
  );

  const dailyWindow = lastNDays(30);
  const daily = useMemo(() => rollupDaily({ habits: state.habits, completions: state.completions, ...dailyWindow }), [state, dailyWindow.startISO, dailyWindow.endISO]);
  const weekly = useMemo(() => rollupWeekly({ habits: state.habits, completions: state.completions, weeksBack: 12, weekStartsOn }), [state, weekStartsOn]);
  const monthly = useMemo(() => rollupMonthly({ habits: state.habits, completions: state.completions, monthsBack: 12 }), [state]);

  const bestDay = useMemo(() => daily.reduce((best, cur) => (cur.rate > best.rate ? cur : best), daily[0] || { rate: 0 }), [daily]);
  const avgRate30 = useMemo(() => (daily.length ? Math.round(daily.reduce((a, b) => a + b.rate, 0) / daily.length) : 0), [daily]);

  const thisWeek = weekly[weekly.length - 1];
  const lastWeek = weekly[weekly.length - 2];
  const deltaWeek = thisWeek && lastWeek ? Math.round(thisWeek.rate - lastWeek.rate) : 0;

  function promptAddHabit() {
    const name = prompt("Habit name?");
    if (!name || !name.trim()) return;
    const target = clamp(Number(prompt("Target days per week? (1–7)", "5") || 5), 1, 7);
    const notes = prompt("Notes (optional)", "") || "";
    upsertHabit({ name: name.trim(), targetPerWeek: target, notes, active: true });
  }

  function promptEditHabit(h) {
    const name = prompt("Habit name?", h.name) ?? h.name;
    if (!name.trim()) return;
    const target = clamp(Number(prompt("Target days per week? (1–7)", String(h.targetPerWeek || 5)) || (h.targetPerWeek || 5)), 1, 7);
    const notes = prompt("Notes (optional)", h.notes || "") ?? (h.notes || "");
    upsertHabit({ ...h, name: name.trim(), targetPerWeek: target, notes });
  }

  return (
    <div className="container">
      <div className="topbar">
        <div>
          <h1 className="h1">Habit Tracker</h1>
          <div className="sub">Track daily wins and watch your consistency compound.</div>
        </div>

        <div className="row">
          <span className="pill">
            <CalendarDays size={16} />
            Week starts:
            <select
              value={String(weekStartsOn)}
              onChange={(e) =>
                setState((prev) => ({
                  ...prev,
                  settings: { ...(prev.settings || {}), weekStartsOn: Number(e.target.value) },
                }))
              }
            >
              <option value="0">Sunday</option>
              <option value="1">Monday</option>
            </select>
          </span>

          <button className="btn" onClick={exportData}>
            <Download size={16} style={{ marginRight: 8 }} />
            Export
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                importData(String(reader.result || ""));
                if (fileInputRef.current) fileInputRef.current.value = "";
              };
              reader.readAsText(file);
            }}
          />
          <button className="btn" onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} style={{ marginRight: 8 }} />
            Import
          </button>

          <button className="btn danger" onClick={resetAll}>
            <RefreshCcw size={16} style={{ marginRight: 8 }} />
            Reset
          </button>
        </div>
      </div>

      <Tabs value={tab} onChange={setTab} />

      {tab === "today" && (
        <>
          <DayPicker dateISO={selectedDateISO} setDateISO={setSelectedDateISO} />

          <div className="grid-4" style={{ marginTop: 10 }}>
            <Stat icon={CheckCircle2} label="Completed" value={selectedDaySummary.completed} sub={`of ${selectedDaySummary.total} habits`} />
            <Stat icon={Flame} label="Completion" value={`${selectedDaySummary.rate}%`} sub={`${selectedDaySummary.remaining} remaining`} />
            <div className="card">
              <h3>Quick add</h3>
              <button className="btn primary" onClick={promptAddHabit} style={{ width: "100%" }}>
                <Plus size={16} style={{ marginRight: 8 }} /> Add habit
              </button>
              <div className="small">Add a new habit anytime—your history stays intact.</div>
            </div>
            <Stat icon={CalendarDays} label="Today (all habits)" value={`${todaySummary.completed}/${todaySummary.total}`} sub={`${todaySummary.rate}% complete`} />
          </div>

          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {activeHabits.length === 0 ? (
              <div className="card">No active habits. Add one to start tracking.</div>
            ) : (
              <AnimatePresence>
                {activeHabits.map((h) => {
                  const weekStart = startOfWeek(parseISODate(selectedDateISO), weekStartsOn);
                  const weekDays = Array.from({ length: 7 }, (_, i) => toISODate(addDays(weekStart, i)));
                  const doneWeek = weekDays.reduce((acc, dISO) => acc + (isCompleted(state.completions, dISO, h.id) ? 1 : 0), 0);
                  const target = clamp(h.targetPerWeek || 5, 1, 7);
                  const pct = clamp(Math.round((doneWeek / target) * 100), 0, 100);
                  const checked = isCompleted(state.completions, selectedDateISO, h.id);

                  return (
                    <motion.div key={h.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
                      <div className="habit">
                        <div className="left">
                          <button
                            className={"check " + (checked ? "on" : "")}
                            onClick={() => toggleForDate(h.id, selectedDateISO)}
                            title="Toggle completion"
                          >
                            {checked ? <CheckCircle2 size={16} /> : null}
                          </button>

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="name">{h.name}</div>
                            <div className="meta">{h.notes || `Target: ${target} days/week`}</div>

                            <div className="progress">
                              <div className="row" style={{ justifyContent: "space-between", color: "rgba(255,255,255,0.68)", fontSize: 12 }}>
                                <span>Weekly goal</span>
                                <span>{doneWeek}/{target} ({pct}%)</span>
                              </div>
                              <div className="line" style={{ marginTop: 6 }}>
                                <div className="fill" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="row">
                          <button className="btn" onClick={() => promptEditHabit(h)} title="Edit">
                            <Pencil size={16} />
                          </button>
                          <button
                            className="btn danger"
                            onClick={() => {
                              const ok = window.confirm(`Delete "${h.name}"? This removes its history too.`);
                              if (!ok) return;
                              deleteHabit(h.id);
                            }}
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </>
      )}

      {tab === "dashboard" && (
        <>
          {activeHabits.length === 0 ? (
            <div className="card">Add at least one active habit to see the dashboard.</div>
          ) : (
            <>
              <div className="grid-4">
                <Stat icon={CheckCircle2} label="Today" value={`${todaySummary.completed}/${todaySummary.total}`} sub={`${todaySummary.rate}% complete`} />
                <Stat icon={Flame} label="Average (30d)" value={`${avgRate30}%`} sub="Daily completion rate" />
                <Stat icon={CalendarDays} label="This week" value={`${thisWeek?.rate ?? 0}%`} sub={lastWeek ? `${deltaWeek >= 0 ? "+" : ""}${deltaWeek}% vs last week` : ""} />
                <Stat icon={Flame} label="Best day (30d)" value={`${bestDay?.rate ?? 0}%`} sub={bestDay?.label ?? ""} />
              </div>

              <div className="grid-2" style={{ marginTop: 10 }}>
                <div className="card">
                  <h3>Daily completion (30 days)</h3>
                  <div style={{ height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={daily}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={4} />
                        <YAxis tick={{ fontSize: 12 }} domain={[0, "dataMax + 1"]} />
                        <Tooltip />
                        <Area type="monotone" dataKey="completed" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card">
                  <h3>Weekly completion rate (12 weeks)</h3>
                  <div style={{ height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={weekly}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={1} />
                        <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                        <Tooltip />
                        <Line type="monotone" dataKey="rate" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginTop: 10 }}>
                <h3>Monthly completion (12 months)</h3>
                <div style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthly}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={0} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="completedTotal" name="Completions" />
                      <Bar dataKey="rate" name="Rate (%)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {tab === "insights" && (
        <>
          {activeHabits.length === 0 ? (
            <div className="card">Add or activate habits to see insights.</div>
          ) : (
            <Insights habits={state.habits} completions={state.completions} />
          )}
        </>
      )}

      {tab === "habits" && (
        <HabitsManager
          habits={state.habits}
          onAdd={promptAddHabit}
          onToggleActive={(habitId) =>
            setState((prev) => ({
              ...prev,
              habits: prev.habits.map((h) => (h.id === habitId ? { ...h, active: !h.active } : h)),
            }))
          }
          onEdit={promptEditHabit}
          onDelete={(h) => {
            const ok = window.confirm(`Delete "${h.name}"? This removes its history too.`);
            if (!ok) return;
            deleteHabit(h.id);
          }}
        />
      )}

      <div className="footer">
        Data is stored locally in your browser (localStorage). Use Export for backups.
      </div>
    </div>
  );
}

function HabitsManager({ habits, onAdd, onToggleActive, onEdit, onDelete }) {
  const activeCount = habits.filter((h) => h.active).length;
  return (
    <div className="card">
      <div className="row" style={{ alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Manage habits</div>
          <div className="sub">{activeCount} active · {habits.length} total</div>
        </div>
        <div className="spacer" />
        <button className="btn primary" onClick={onAdd}><Plus size={16} style={{ marginRight: 8 }} />Add habit</button>
      </div>

      <hr className="sep" />

      {habits.length === 0 ? (
        <div className="sub">No habits yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {habits
            .slice()
            .sort((a, b) => (a.active !== b.active ? (a.active ? -1 : 1) : a.name.localeCompare(b.name)))
            .map((h) => (
              <div key={h.id} className="habit">
                <div className="left">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="name">
                      {h.name}{" "}
                      <span style={{ fontSize: 12, color: h.active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.6)" }}>
                        · {h.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="meta">
                      Target {clamp(h.targetPerWeek || 5, 1, 7)} days/week{h.notes ? ` · ${h.notes}` : ""}
                    </div>
                  </div>
                </div>

                <div className="row">
                  <button className="btn" onClick={() => onToggleActive(h.id)}>{h.active ? "Deactivate" : "Activate"}</button>
                  <button className="btn" onClick={() => onEdit(h)} title="Edit"><Pencil size={16} /></button>
                  <button className="btn danger" onClick={() => onDelete(h)} title="Delete"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function Insights({ habits, completions }) {
  const active = habits.filter((h) => h.active);
  const { startISO, endISO } = lastNDays(30);

  const rows = useMemo(() => {
    return active
      .map((h) => ({
        id: h.id,
        name: h.name,
        targetPerWeek: h.targetPerWeek,
        currentStreak: computeStreak({ habitId: h.id, completions }),
        bestStreak: computeBestStreak({ habitId: h.id, completions }),
        rate30: completionRateForHabit({ habitId: h.id, completions, startISO, endISO }),
      }))
      .sort((a, b) => b.rate30 - a.rate30);
  }, [active, completions, startISO, endISO]);

  return (
    <div className="card">
      <div style={{ fontWeight: 800, fontSize: 16 }}>Habit insights (last 30 days)</div>
      <div className="sub">Streaks and completion rate per habit.</div>

      <hr className="sep" />

      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((r) => (
          <div key={r.id} className="habit" style={{ background: "rgba(255,255,255,0.05)" }}>
            <div className="left">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="name">{r.name}</div>
                <div className="meta">Target: {clamp(r.targetPerWeek || 5, 1, 7)} days/week</div>
              </div>
            </div>

            <div className="row" style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>
              <span className="pill">Current streak: {r.currentStreak}</span>
              <span className="pill">Best streak: {r.bestStreak}</span>
              <span className="pill">30d rate: {r.rate30}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
