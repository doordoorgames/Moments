// Keep in sync with WORD_RE and MARKS in backend/plot_twist.py.
// Arabic diacritics and tatweel never split a word or add one.
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
export const wordCount = text => (text.replace(MARKS, '').match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || []).length;
