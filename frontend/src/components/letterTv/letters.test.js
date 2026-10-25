import {ALPHABETS, END_LETTERS, START_LETTERS, nextPair} from './letters';

test('pairs are two uppercase A–Z letters', () => {
  for (let i = 0; i < 200; i++) {
    const pair = nextPair(null);
    expect(pair).toHaveLength(2);
    pair.forEach(l => expect(ALPHABETS.en).toContain(l));
  }
});

test('never repeats the exact previous pair', () => {
  const seq = ['A', 'B', 'A', 'B', 'C', 'D'];
  let i = 0;
  expect(nextPair(['A', 'B'], 'en', () => seq[i++])).toEqual(['C', 'D']);
});

test('X and Z never appear; Q only ever starts a pair', () => {
  expect(START_LETTERS.en).toContain('Q');
  ['X', 'Z'].forEach(l => expect(START_LETTERS.en).not.toContain(l));
  ['X', 'Z', 'Q'].forEach(l => expect(END_LETTERS.en).not.toContain(l));
  const firsts = new Set();
  let pair = null;
  for (let i = 0; i < 4000; i++) {
    pair = nextPair(pair);
    expect('XZ').not.toContain(pair[0]);
    expect('XZQ').not.toContain(pair[1]);
    firsts.add(pair[0]);
  }
  expect(firsts.has('Q')).toBe(true);
});
