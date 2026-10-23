import {ALPHABETS, nextPair} from './letters';

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
