// Instant on-phone check for tap tasks, so the right/wrong feedback needs no network wait.
// The server judges every answer again; Word Rush is judged by the server only.
export function localCheck(task, value, rosterIds = []) {
  switch (task?.type) {
    case 'odd': return value === task.odd;
    case 'missing': return value === task.answer;
    case 'vote': return rosterIds.includes(value);
    case 'boss': return task.faces?.[value] === task.answer;
    case 'stroop': return Number.isInteger(value) && task.choices?.[value]?.[task.variant] === task.target;
    case 'geo': return value === task.answer && task.items?.[value]?.cat === task.variant;
    case 'sock': return value === task.answer;
    case 'memory': return value === task.answer;
    default: return null; // not checkable here
  }
}

// Who is where in the race, for 1-12 players: clock fill as a fraction.
export const fraction = (done, total = 20) => Math.max(0, Math.min(1, done / total));
