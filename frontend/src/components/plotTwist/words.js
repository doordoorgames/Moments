// Keep in sync with WORD_RE in backend/plot_twist.py.
export const wordCount = text => (text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || []).length;
