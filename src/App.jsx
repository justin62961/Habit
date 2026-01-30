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
  MoreVertical,
  Download,
  Upload,
  RefreshCcw,
  Flame,
  CheckCircle2,
  CalendarDays,
  X,
} from "lucide-react";

/**
 * FULL Habit Tracker (Tailwind, no shadcn dependency)
 * - Habits CRUD
 * - Daily check-ins
 * - Targets (days/week)
 * - Dashboard: daily/weekly/monthly charts
 * - Streaks + completion rates
 * - LocalStorage persistence
 * - Export/Import JSON
 */

// ---------------- Utilities ----------------
const LS_KEY = "habit_tracker_v1";

const pad2 = (n) => String(n).padStart(2, "0");
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
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const safeJSONParse = (str, fallback) => {
  try { return JSON.parse(str); } catch { return fallback; }
};
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

// ---------------- Data Model ----------------
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
    completions: {},
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

// ---------------- Analytics ----------------
const getActiveHabits = (habits) => habits.filter((h) => h.active);
const isCompleted = (completions, dateISO, habitId) => !!(completions?.[dateISO]?.[habitId]);
function toggleCompletion(completions, dateISO, habitId) {
  const day = { ...(completions[dateISO] || {}) };
  if (day[habitId]) delete day[habitId]; else day[habitId] = true;
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

// ---------------- UI (Tailwind) ----------------
function cx(...a) { return a.filter(Boolean).join(" "); }

function Card({ className="", children }) {
  return <div className={cx("rounded-2xl border border-border bg-card text-card-foreground shadow-sm", className)}>{children}</div>;
}
function CardHeader({ className="", children }) {
  return <div className={cx("p-5 pb-0", className)}>{children}</div>;
}
function CardTitle({ className="", children }) {
  return <div className={cx("text-base font-semibold tracking-tight", className)}>{children}</div>;
}
function CardDescription({ className="", children }) {
  return <div className={cx("text-sm text-muted-foreground mt-1", className)}>{children}</div>;
}
function CardContent({ className="", children }) {
  return <div className={cx("p-5", className)}>{children}</div>;
}
function Button({ variant="default", className="", children, ...props }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition active:scale-[0.99]";
  const styles = {
    default: "bg-foreground text-background hover:opacity-90",
    outline: "border border-border bg-background hover:bg-muted",
    secondary: "bg-muted hover:opacity-90",
    destructive: "bg-red-600 text-white hover:opacity-90",
    ghost: "bg-transparent hover:bg-muted"
  };
  return <button className={cx(base, styles[variant] || styles.default, className)} {...props}>{children}</button>;
}
function Input({ className="", ...props }) {
  return <input className={cx("w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20", className)} {...props} />;
}
function Badge({ variant="default", className="", children }) {
  const styles = variant === "secondary"
    ? "bg-muted text-foreground"
    : "bg-foreground text-background";
  return <span className={cx("inline-flex items-center rounded-full px-3 py-1 text-xs", styles, className)}>{children}</span>;
}
function Separator({ className="" }) {
  return <div className={cx("h-px w-full bg-border", className)} />;
}
function Pill({ children }) {
  return <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs">{children}</span>;
}

function Modal({ open, onClose, title, desc, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl">
        <div className="p-5 border-b border-border flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold">{title}</div>
            {desc ? <div className="text-sm text-muted-foreground mt-1">{desc}</div> : null}
          </div>
          <button className="p-2 rounded-xl hover:bg-muted" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer ? <div className="p-5 pt-0 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="text-2xl font-semibold tracking-tight">{value}</div>
            {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
          </div>
          <div className="h-10 w-10 rounded-2xl border border-border bg-background flex items-center justify-center">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ title, desc, action }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-8 text-center">
      <div className="text-lg font-semibold">{title}</div>
      <div className="text-sm text-muted-foreground mt-1">{desc}</div>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

function DayPicker({ dateISO, setDateISO }) {
  const d = parseISODate(dateISO);
  const pretty = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm text-muted-foreground">Selected day</div>
            <div className="text-lg font-semibold tracking-tight">{pretty}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setDateISO(toISODate(addDays(d, -1)))}>Prev</Button>
            <Button variant="outline" onClick={() => setDateISO(toISODate(new Date()))}>Today</Button>
            <Button variant="outline" onClick={() => setDateISO(toISODate(addDays(d, 1)))}>Next</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HabitRow({ habit, checked, onToggle, onEdit, onDelete, weekProgress }) {
  const pct = weekProgress?.target ? Math.round((weekProgress.done / weekProgress.target) * 100) : 0;
  const pctClamped = clamp(pct, 0, 100);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="rounded-2xl border border-border bg-background p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <button type="button" onClick={onToggle} className="flex-1 text-left">
          <div className="flex items-center gap-3">
            <div className={cx("h-6 w-6 rounded-xl border border-border flex items-center justify-center transition active:scale-95", checked ? "bg-foreground text-background" : "bg-background")}>
              {checked ? <CheckCircle2 className="h-4 w-4" /> : null}
            </div>
            <div className="min-w-0">
              <div className="font-medium truncate">{habit.name}</div>
              <div className="text-xs text-muted-foreground truncate">{habit.notes || `Target: ${habit.targetPerWeek} days/week`}</div>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Weekly goal</span>
              <span>{weekProgress.done}/{weekProgress.target} ({pctClamped}%)</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-foreground" style={{ width: `${pctClamped}%` }} />
            </div>
          </div>
        </button>

        <div className="relative">
          <Button variant="ghost" onClick={() => setMenuOpen((v) => !v)}>
            <MoreVertical className="h-4 w-4" />
          </Button>
          {menuOpen ? (
            <div className="absolute right-0 mt-2 w-44 rounded-2xl border border-border bg-card shadow-lg overflow-hidden z-10">
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2" onClick={() => { setMenuOpen(false); onEdit(); }}>
                <Pencil className="h-4 w-4" /> Edit
              </button>
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-muted text-red-400 flex items-center gap-2" onClick={() => { setMenuOpen(false); onDelete(); }}>
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

function HabitGrid({ habits, completions, dateISO, onToggle, onEdit, onDelete, weekStartsOn }) {
  const active = getActiveHabits(habits);
  const weekStart = startOfWeek(parseISODate(dateISO), weekStartsOn);
  const weekDays = Array.from({ length: 7 }, (_, i) => toISODate(addDays(weekStart, i)));

  const weekProgressByHabit = useMemo(() => {
    const map = {};
    active.forEach((h) => {
      const done = weekDays.reduce((acc, dISO) => acc + (isCompleted(completions, dISO, h.id) ? 1 : 0), 0);
      map[h.id] = { done, target: clamp(h.targetPerWeek || 5, 1, 7) };
    });
    return map;
  }, [active, completions, weekDays]);

  if (active.length === 0) {
    return <EmptyState title="No active habits" desc="Add a habit, or re-activate one in the Habits tab." />;
  }

  return (
    <div className="grid gap-3">
      <AnimatePresence>
        {active.map((h) => (
          <HabitRow
            key={h.id}
            habit={h}
            checked={isCompleted(completions, dateISO, h.id)}
            onToggle={() => onToggle(h.id)}
            onEdit={() => onEdit(h)}
            onDelete={() => onDelete(h)}
            weekProgress={weekProgressByHabit[h.id]}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function Dashboard({ habits, completions, weekStartsOn }) {
  const active = getActiveHabits(habits);
  const todayISO = toISODate(new Date());
  const todaySummary = getTodaySummary({ habits, completions, dateISO: todayISO });

  const dailyWindow = lastNDays(30);
  const daily = useMemo(() => rollupDaily({ habits, completions, startISO: dailyWindow.startISO, endISO: dailyWindow.endISO }), [habits, completions, dailyWindow.startISO, dailyWindow.endISO]);
  const weekly = useMemo(() => rollupWeekly({ habits, completions, weeksBack: 12, weekStartsOn }), [habits, completions, weekStartsOn]);
  const monthly = useMemo(() => rollupMonthly({ habits, completions, monthsBack: 12 }), [habits, completions]);

  const bestDay = useMemo(() => daily.length ? daily.reduce((best, cur) => (cur.rate > best.rate ? cur : best), daily[0]) : null, [daily]);
  const avgRate30 = useMemo(() => daily.length ? Math.round(daily.reduce((a, b) => a + b.rate, 0) / daily.length) : 0, [daily]);

  const thisWeek = weekly[weekly.length - 1];
  const lastWeek = weekly[weekly.length - 2];
  const deltaWeek = thisWeek && lastWeek ? Math.round(thisWeek.rate - lastWeek.rate) : 0;

  if (active.length === 0) {
    return <EmptyState title="Your dashboard is ready" desc="Add at least one active habit to start seeing insights here." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Stat icon={CheckCircle2} label="Today" value={`${todaySummary.completed}/${todaySummary.total}`} sub={`${todaySummary.rate}% complete`} />
        <Stat icon={Flame} label="Average (30d)" value={`${avgRate30}%`} sub="Daily completion rate" />
        <Stat icon={CalendarDays} label="This week" value={`${thisWeek?.rate ?? 0}%`} sub={lastWeek ? `${deltaWeek >= 0 ? "+" : ""}${deltaWeek}% vs last week` : ""} />
        <Stat icon={Flame} label="Best day (30d)" value={bestDay ? `${bestDay.rate}%` : "—"} sub={bestDay ? bestDay.label : ""} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Daily completion (30 days)</CardTitle>
            <CardDescription>Completed habits per day out of your active list.</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={4} />
                <YAxis tick={{ fontSize: 12 }} domain={[0, "dataMax + 1"]} />
                <Tooltip />
                <Area type="monotone" dataKey="completed" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weekly completion rate (12 weeks)</CardTitle>
            <CardDescription>Overall rate across all active habits and days.</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weekly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={1} />
                <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="rate" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly completion (12 months)</CardTitle>
          <CardDescription>Total completions across all active habits.</CardDescription>
        </CardHeader>
        <CardContent className="h-[280px]">
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
        </CardContent>
      </Card>
    </div>
  );
}

function HabitInsights({ habits, completions }) {
  const active = getActiveHabits(habits);
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

  if (active.length === 0) {
    return <EmptyState title="No insights yet" desc="Add or activate habits to see streaks and rankings." />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Habit insights (last 30 days)</CardTitle>
        <CardDescription>Streaks and completion rate per habit.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="font-medium truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground">
                  Target: {clamp(r.targetPerWeek || 5, 1, 7)} days/week
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Current streak: {r.currentStreak}</Badge>
                <Badge variant="secondary">Best streak: {r.bestStreak}</Badge>
                <Badge>30d rate: {r.rate30}%</Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function HabitMatrix({ habits, completions, weekStartsOn }) {
  const active = getActiveHabits(habits);
  const daysBack = 28;
  const end = new Date();
  const endISO = toISODate(end);
  const startISO = toISODate(addDays(end, -(daysBack - 1)));
  const days = dateRangeInclusive(startISO, endISO);

  if (active.length === 0) {
    return <EmptyState title="Heatmap ready" desc="Add at least one active habit to see your consistency grid." />;
  }

  const start = startOfWeek(parseISODate(startISO), weekStartsOn);
  const endW = parseISODate(endISO);
  const weeks = [];
  for (let d = new Date(start); d <= endW; d = addDays(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => toISODate(addDays(d, i))));
  }

  const totalPossible = active.length * daysBack;
  const totalDone = days.reduce((acc, iso) => acc + active.reduce((a, h) => a + (isCompleted(completions, iso, h.id) ? 1 : 0), 0), 0);
  const rate = totalPossible ? Math.round((totalDone / totalPossible) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Consistency heatmap (28 days)</CardTitle>
        <CardDescription>Each square is a day. Filled means at least one habit completed.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            Overall: <span className="font-semibold">{rate}%</span>
            <span className="text-muted-foreground"> ({totalDone}/{totalPossible})</span>
          </div>
          <div className="text-xs text-muted-foreground">Last {daysBack} days</div>
        </div>

        <div className="mt-4 overflow-auto">
          <div className="inline-flex gap-2">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-2">
                {week.map((iso) => {
                  const inRange = iso >= startISO && iso <= endISO;
                  const anyDone = inRange && active.some((h) => isCompleted(completions, iso, h.id));
                  return (
                    <div key={iso} className={inRange ? "" : "opacity-30"} title={`${iso} — ${anyDone ? "Some done" : "None"}`}>
                      <button type="button" className={cx("h-4 w-4 rounded-sm border border-border active:scale-95", anyDone ? "bg-foreground" : "bg-background")} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <Separator className="my-4" />
        <div className="text-sm text-muted-foreground">Tip: Your goal is consistency, not perfection. Focus on showing up.</div>
      </CardContent>
    </Card>
  );
}

function HabitsManager({ habits, onAdd, onUpdate, onDelete }) {
  const activeCount = habits.filter((h) => h.active).length;

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>Manage habits</CardTitle>
          <CardDescription>{activeCount} active · {habits.length} total</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {habits.length === 0 ? (
              <EmptyState title="No habits yet" desc="Add your first habit to begin tracking." />
            ) : (
              habits
                .slice()
                .sort((a, b) => (a.active !== b.active ? (a.active ? -1 : 1) : a.name.localeCompare(b.name)))
                .map((h) => (
                  <div key={h.id} className="rounded-2xl border border-border p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-medium truncate">{h.name}</div>
                        {h.active ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        Target {clamp(h.targetPerWeek || 5, 1, 7)} days/week{h.notes ? ` · ${h.notes}` : ""}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => onUpdate({ ...h, active: !h.active })}>{h.active ? "Deactivate" : "Activate"}</Button>
                      <Button variant="outline" onClick={() => onUpdate(h, { openEditor: true })}><Pencil className="h-4 w-4" /> Edit</Button>
                      <Button variant="destructive" onClick={() => onDelete(h)}><Trash2 className="h-4 w-4" /> Delete</Button>
                    </div>
                  </div>
                ))
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onAdd}><Plus className="h-4 w-4" /> Add habit</Button>
      </div>
    </div>
  );
}

function HabitFormDialog({ open, setOpen, onSave, initial }) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name || "");
  const [targetPerWeek, setTargetPerWeek] = useState(String(initial?.targetPerWeek ?? 5));
  const [notes, setNotes] = useState(initial?.notes || "");
  const [active, setActive] = useState(initial?.active ?? true);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name || "");
    setTargetPerWeek(String(initial?.targetPerWeek ?? 5));
    setNotes(initial?.notes || "");
    setActive(initial?.active ?? true);
  }, [open, initial]);

  const canSave = name.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={isEdit ? "Edit habit" : "Add a habit"}
      desc="Keep it clear and measurable. You can always tweak targets later."
      footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!canSave}
            onClick={() => {
              const t = clamp(Number(targetPerWeek || 5), 1, 7);
              onSave({
                ...initial,
                name: name.trim(),
                targetPerWeek: t,
                notes: notes.trim(),
                active,
              });
              setOpen(false);
            }}
          >
            {isEdit ? "Save changes" : "Add habit"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-2">
          <label className="text-sm text-muted-foreground">Habit name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Stretch for 5 minutes" />
        </div>
        <div className="grid gap-2">
          <label className="text-sm text-muted-foreground">Target (days per week)</label>
          <Input type="number" min={1} max={7} value={targetPerWeek} onChange={(e) => setTargetPerWeek(e.target.value)} />
          <div className="text-xs text-muted-foreground">Used for weekly goal progress.</div>
        </div>
        <div className="grid gap-2">
          <label className="text-sm text-muted-foreground">Notes (optional)</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g., After lunch" />
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-border p-3">
          <div>
            <div className="text-sm font-medium">Active</div>
            <div className="text-xs text-muted-foreground">Inactive habits won’t count in dashboards.</div>
          </div>
          <button
            type="button"
            onClick={() => setActive((v) => !v)}
            className={cx("h-6 w-11 rounded-full border border-border p-1 transition", active ? "bg-foreground" : "bg-background")}
            aria-label="Toggle active"
          >
            <div className={cx("h-4 w-4 rounded-full bg-background transition", active ? "translate-x-5" : "translate-x-0")} />
          </button>
        </div>
      </div>
    </Modal>
  );
}

function TopBar({ onExport, onImport, onReset, weekStartsOn, setWeekStartsOn }) {
  const fileInputRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <div className="text-2xl font-semibold tracking-tight">Habit Tracker</div>
        <div className="text-sm text-muted-foreground">Track daily wins and watch your consistency compound.</div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Pill>
          <CalendarDays className="h-4 w-4" />
          <span className="text-muted-foreground">Week starts:</span>
          <select
            className="h-7 rounded-full border border-border bg-background px-2 text-xs"
            value={String(weekStartsOn)}
            onChange={(e) => setWeekStartsOn(Number(e.target.value))}
          >
            <option value="0">Sunday</option>
            <option value="1">Monday</option>
          </select>
        </Pill>

        <Button variant="outline" onClick={onExport}><Download className="h-4 w-4" /> Export</Button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              onImport(String(reader.result || ""));
              if (fileInputRef.current) fileInputRef.current.value = "";
            };
            reader.readAsText(file);
          }}
        />
        <Button variant="outline" onClick={() => fileInputRef.current?.click()}><Upload className="h-4 w-4" /> Import</Button>

        <div className="relative">
          <Button variant="secondary" onClick={() => setMenuOpen((v) => !v)}><MoreVertical className="h-4 w-4" /></Button>
          {menuOpen ? (
            <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-border bg-card shadow-lg overflow-hidden z-10">
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-muted text-red-400 flex items-center gap-2" onClick={() => { setMenuOpen(false); onReset(); }}>
                <RefreshCcw className="h-4 w-4" /> Reset all data
              </button>
            </div>
          ) : null}
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
    <div className="inline-flex rounded-2xl border border-border bg-background p-1">
      {items.map((t) => (
        <button
          key={t.key}
          className={cx("rounded-2xl px-4 py-2 text-sm", value === t.key ? "bg-muted" : "hover:bg-muted/60")}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------- Main App ----------------
export default function App() {
  const [state, setState] = useState(() => loadState());
  const [selectedDateISO, setSelectedDateISO] = useState(() => toISODate(new Date()));
  const [tab, setTab] = useState("today");
  const [habitDialogOpen, setHabitDialogOpen] = useState(false);
  const [habitEditing, setHabitEditing] = useState(null);

  const weekStartsOn = state.settings?.weekStartsOn ?? 1;

  useEffect(() => { saveState(state); }, [state]);

  function upsertHabit(h) {
    setState((prev) => {
      const nowISO = toISODate(new Date());
      if (!h.id) {
        const created = { id: uid(), name: h.name, targetPerWeek: clamp(h.targetPerWeek || 5, 1, 7), active: h.active ?? true, createdAtISO: nowISO, notes: h.notes || "" };
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
  }

  function exportData() {
    const payload = { ...state, exportedAtISO: new Date().toISOString() };
    downloadText(`habit-tracker-export-${toISODate(new Date())}.json`, JSON.stringify(payload, null, 2));
  }

  function importData(raw) {
    const parsed = safeJSONParse(raw, null);
    if (!parsed || typeof parsed !== "object") { alert("That file doesn't look like valid JSON."); return; }
    if (!parsed.habits || !parsed.completions) { alert("That JSON doesn't look like a Habit Tracker export."); return; }
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

  const selectedDaySummary = useMemo(
    () => getTodaySummary({ habits: state.habits, completions: state.completions, dateISO: selectedDateISO }),
    [state.habits, state.completions, selectedDateISO]
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-5">
        <TopBar
          onExport={exportData}
          onImport={importData}
          onReset={resetAll}
          weekStartsOn={weekStartsOn}
          setWeekStartsOn={(v) => setState((prev) => ({ ...prev, settings: { ...(prev.settings || {}), weekStartsOn: v } }))}
        />

        <Tabs value={tab} onChange={setTab} />

        {tab === "today" && (
          <div className="mt-4 space-y-4">
            <DayPicker dateISO={selectedDateISO} setDateISO={setSelectedDateISO} />

            <div className="grid gap-3 md:grid-cols-3">
              <Stat icon={CheckCircle2} label="Completed" value={selectedDaySummary.completed} sub={`of ${selectedDaySummary.total} habits`} />
              <Stat icon={Flame} label="Completion" value={`${selectedDaySummary.rate}%`} sub={`${selectedDaySummary.remaining} remaining`} />
              <Card>
                <CardContent className="p-5">
                  <div className="text-sm text-muted-foreground">Quick add</div>
                  <div className="mt-2">
                    <Button className="w-full" onClick={() => { setHabitEditing(null); setHabitDialogOpen(true); }}>
                      <Plus className="h-4 w-4" /> Add habit
                    </Button>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">Add a new habit anytime—your history stays intact.</div>
                </CardContent>
              </Card>
            </div>

            <HabitGrid
              habits={state.habits}
              completions={state.completions}
              dateISO={selectedDateISO}
              weekStartsOn={weekStartsOn}
              onToggle={(habitId) => toggleForDate(habitId, selectedDateISO)}
              onEdit={(habit) => { setHabitEditing(habit); setHabitDialogOpen(true); }}
              onDelete={(habit) => {
                const ok = window.confirm(`Delete "${habit.name}"? This removes its history too.`);
                if (!ok) return;
                deleteHabit(habit.id);
              }}
            />
          </div>
        )}

        {tab === "dashboard" && (
          <div className="mt-4">
            <Dashboard habits={state.habits} completions={state.completions} weekStartsOn={weekStartsOn} />
          </div>
        )}

        {tab === "insights" && (
          <div className="mt-4 space-y-4">
            <HabitInsights habits={state.habits} completions={state.completions} />
            <HabitMatrix habits={state.habits} completions={state.completions} weekStartsOn={weekStartsOn} />
          </div>
        )}

        {tab === "habits" && (
          <div className="mt-4">
            <HabitsManager
              habits={state.habits}
              onAdd={() => { setHabitEditing(null); setHabitDialogOpen(true); }}
              onUpdate={(habit, opts) => {
                if (opts?.openEditor) { setHabitEditing(habit); setHabitDialogOpen(true); return; }
                upsertHabit(habit);
              }}
              onDelete={(habit) => {
                const ok = window.confirm(`Delete "${habit.name}"? This removes its history too.`);
                if (!ok) return;
                deleteHabit(habit.id);
              }}
            />
          </div>
        )}

        <HabitFormDialog
          open={habitDialogOpen}
          setOpen={setHabitDialogOpen}
          initial={habitEditing}
          onSave={(habit) => upsertHabit(habit)}
        />

        <div className="py-6 text-center text-xs text-muted-foreground">
          Data is stored locally in your browser (localStorage). Use Export for backups.
        </div>
      </div>
    </div>
  );
}
