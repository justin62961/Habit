
import { useEffect, useState } from "react";
import { Plus, Check } from "lucide-react";

const KEY = "habit_simple";

export default function App() {
  const [habits, setHabits] = useState(() => {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  });
  const [text, setText] = useState("");

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(habits));
  }, [habits]);

  function addHabit() {
    if (!text.trim()) return;
    setHabits([{ id: Date.now(), name: text, done: false }, ...habits]);
    setText("");
  }

  function toggle(id) {
    setHabits(habits.map(h => h.id === id ? { ...h, done: !h.done } : h));
  }

  return (
    <div style={{ maxWidth: 600, margin: "40px auto" }}>
      <h1>Habit Tracker</h1>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="New habit"
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={addHabit}><Plus size={18} /></button>
      </div>

      {habits.map(h => (
        <div key={h.id} className="card" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{h.name}</span>
          <button onClick={() => toggle(h.id)}>
            {h.done ? <Check /> : "Mark"}
          </button>
        </div>
      ))}
    </div>
  );
}
