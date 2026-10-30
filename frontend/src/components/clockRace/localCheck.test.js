import {fraction, localCheck} from './localCheck';

test('tap tasks are checked on the phone', () => {
  expect(localCheck({type: 'odd', odd: 7}, 7)).toBe(true);
  expect(localCheck({type: 'odd', odd: 7}, 6)).toBe(false);
  expect(localCheck({type: 'missing', answer: 'ج'}, 'ج')).toBe(true);
  expect(localCheck({type: 'missing', answer: 'ج'}, 'ح')).toBe(false);
  expect(localCheck({type: 'swap', answer: [4, 9]}, [9, 4])).toBe(true);
  expect(localCheck({type: 'swap', answer: [4, 9]}, [4, 4])).toBe(false);
  expect(localCheck({type: 'vote'}, 'me', ['me', 'you'])).toBe(true);
  expect(localCheck({type: 'vote'}, 'stranger', ['me', 'you'])).toBe(false);
  expect(localCheck({type: 'boss', faces: ['0-0-0', '1-1-1', '0-0-0'], answer: '0-0-0'}, 2)).toBe(true);
  expect(localCheck({type: 'boss', faces: ['0-0-0', '1-1-1', '0-0-0'], answer: '0-0-0'}, 1)).toBe(false);
  expect(localCheck({type: 'word'}, 'blue')).toBe(null);
});

test('clock fill is 5% a task', () => {
  expect(fraction(0)).toBe(0);
  expect(fraction(1)).toBe(0.05);
  expect(fraction(11)).toBe(0.55);
  expect(fraction(20)).toBe(1);
  expect(fraction(25)).toBe(1);
});
