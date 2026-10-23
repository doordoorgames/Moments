// Room codes are five-digit strings ("00412" stays "00412"). Arabic-Indic and
// Persian digits typed on Arabic keyboards become the ASCII digits the backend expects.
export const CODE_LENGTH = 5;

export function normalizeCode(value) {
  return String(value ?? '')
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .replace(/\D/g, '')
    .slice(0, CODE_LENGTH);
}

export const validRoomCode = value => /^\d{5}$/.test(value);
