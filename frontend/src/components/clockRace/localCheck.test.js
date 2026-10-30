import {botDone, fraction, localCheck} from './localCheck';

test('tap tasks are checked on the phone', () => {
  expect(localCheck({type: 'odd', odd: 7}, 7)).toBe(true);
  expect(localCheck({type: 'odd', odd: 7}, 6)).toBe(false);
  expect(localCheck({type: 'memory', answer: 'ج'}, 'ج')).toBe(true);
  expect(localCheck({type: 'memory', answer: 'ج'}, 'ح')).toBe(false);
  expect(localCheck({type: 'missing', answer: 'ج'}, 'ج')).toBe(null); // removed task type
  expect(localCheck({type: 'stroop', answer: 2}, 2)).toBe(true);
  expect(localCheck({type: 'geo', answer: 0}, 3)).toBe(false);
  expect(localCheck({type: 'sock', answer: 4}, 4)).toBe(true);
  expect(localCheck({type: 'vote'}, 'me', ['me', 'you'])).toBe(true);
  expect(localCheck({type: 'vote'}, 'stranger', ['me', 'you'])).toBe(false);
  expect(localCheck({type: 'boss', faces: ['0-0-0', '1-1-1', '0-0-0'], answer: '0-0-0'}, 2)).toBe(true);
  expect(localCheck({type: 'boss', faces: ['0-0-0', '1-1-1', '0-0-0'], answer: '0-0-0'}, 1)).toBe(false);
  expect(localCheck({type: 'word'}, 'blue')).toBe(null);
  expect(localCheck({type: 'swap', answer: [1, 2]}, [1, 2])).toBe(null); // removed task type
});

test('clock fill is 5% a task', () => {
  expect(fraction(0)).toBe(0);
  expect(fraction(1)).toBe(0.05);
  expect(fraction(11)).toBe(0.55);
  expect(fraction(20)).toBe(1);
});

test('a bot clock follows its schedule', () => {
  const plan = [2.1, 4.9, 7.2];
  expect(botDone(plan, 0)).toBe(0);
  expect(botDone(plan, 5)).toBe(2);
  expect(botDone(plan, 100)).toBe(3);
  expect(botDone(undefined, 5)).toBe(0);
});
