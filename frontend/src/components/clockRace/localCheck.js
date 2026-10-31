// Instant on-phone check for tap tasks, so the stars or the sad face show with no network wait.
// The server judges every answer again; Word Rush is judged by the server only.
export function localCheck(task, value, rosterIds = []) {
  switch (task?.type) {
    case 'odd': return value === task.odd;
    case 'memory': return value === task.answer;
    case 'stroop':
    case 'geo':
    case 'sock':
    case 'scale':
    case 'wallet':
    case 'shadow':
    case 'tile': return value === task.answer;
    case 'vote': return rosterIds.includes(value);
    case 'boss': return task.faces?.[value] === task.answer;
    default: return null; // not checkable here
  }
}

// Who is where in the race: clock fill as a fraction.
export const fraction = (done, total = 20) => Math.max(0, Math.min(1, done / total));

// A simulated player's tasks done at `elapsed` seconds after the start, from its schedule.
export const botDone = (schedule, elapsed) => (schedule || []).filter(t => t <= elapsed).length;
