// Instant on-phone check for tap tasks, so a right tap moves on with no network wait.
// The server judges every answer again; Word Rush is judged by the server only.
export function localCheck(task, value, rosterIds = []) {
  switch (task?.type) {
    case 'odd': return value === task.odd;
    case 'missing': return value === task.answer;
    case 'swap': return Array.isArray(value) && value.length === 2 && value[0] !== value[1]
      && [...value].sort((a, b) => a - b).join() === [...task.answer].sort((a, b) => a - b).join();
    case 'vote': return rosterIds.includes(value);
    case 'boss': return task.faces?.[value] === task.answer;
    default: return null; // not checkable here
  }
}

export const isSwapped = (task, index) => task.answer.includes(index);

// Who is where in the race, for 1-12 players: clock fill as a fraction.
export const fraction = (done, total = 20) => Math.max(0, Math.min(1, done / total));
