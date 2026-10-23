import {normalizeCode, validRoomCode} from './roomCode';

test.each([
  ['00412', '00412'],
  ['٠٠٤١٢', '00412'],
  ['۰۱۲۳۴', '01234'],
  ['Room code: 01 2-34', '01234'],
  ['1234567', '12345'],
  ['', ''],
  [null, ''],
  ['abc', ''],
])('normalizes %p to %p', (input, output) => expect(normalizeCode(input)).toBe(output));

test('only exactly five digits are valid', () => {
  expect(validRoomCode('00000')).toBe(true);
  expect(validRoomCode('0000')).toBe(false);
  expect(validRoomCode('000000')).toBe(false);
  expect(validRoomCode('12a45')).toBe(false);
});
