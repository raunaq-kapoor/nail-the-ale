// The starting questions for a new log, and record ids.

export const DEFAULT_CONFIG = {
  questions: [
    {
      id: "stood_out",
      label: "What stood out?",
      type: "chips",
      options: ["too bitter", "too sweet", "too heavy", "watery", "great aroma", "refreshing", "complex", "boring", "cheap"],
    },
    { id: "note", label: "Note", type: "text" },
    { id: "first_had", label: "When did you first have it?", type: "year" },
  ],
};

export function newBeerId(now = new Date()) {
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6).padEnd(4, "0");
  return `b_${ymd}_${rand}`;
}
