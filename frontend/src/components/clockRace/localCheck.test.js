import {fraction, localCheck} from './localCheck';

test('tap tasks are checked on the phone', () => {
  expect(localCheck({type: 'odd', odd: 7}, 7)).toBe(true);
  expect(localCheck({type: 'odd', odd: 7}, 6)).toBe(false);
  expect(localCheck({type: 'missing', answer: 'ج'}, 'ج')).toBe(true);
  expect(localCheck({type: 'missing', answer: 'ج'}, 'ح')).toBe(false);
  expect(localCheck({type: 'vote'}, 'me', ['me', 'you'])).toBe(true);
  expect(localCheck({type: 'vote'}, 'stranger', ['me', 'you'])).toBe(false);
  expect(localCheck({type: 'boss', faces: ['0-0-0', '1-1-1', '0-0-0'], answer: '0-0-0'}, 2)).toBe(true);
  expect(localCheck({type: 'boss', faces: ['0-0-0', '1-1-1', '0-0-0'], answer: '0-0-0'}, 1)).toBe(false);
  expect(localCheck({type: 'word'}, 'blue')).toBe(null);
  expect(localCheck({type: 'swap', answer: [1, 2]}, [1, 2])).toBe(null);
});

test('stroop: the asked dimension decides, never the other one', () => {
  const choices = [{word: 0, ink: 1}, {word: 1, ink: 0}, {word: 2, ink: 3}, {word: 3, ink: 2}];
  const byWord = {type: 'stroop', variant: 'word', target: 0, choices, answer: 0};
  expect(localCheck(byWord, 0)).toBe(true);
  expect(localCheck(byWord, 1)).toBe(false);   // printed in red, says blue
  const byInk = {type: 'stroop', variant: 'ink', target: 0, choices, answer: 1};
  expect(localCheck(byInk, 1)).toBe(true);
  expect(localCheck(byInk, 0)).toBe(false);    // says red, printed in blue
});

test('geography, socks and memory', () => {
  const geo = {type: 'geo', variant: 'city', answer: 2,
    items: [{key: 'italy', cat: 'country'}, {key: 'texas', cat: 'state'}, {key: 'paris', cat: 'city'}, {key: 'asia', cat: 'continent'}]};
  expect(localCheck(geo, 2)).toBe(true);
  expect(localCheck(geo, 0)).toBe(false);
  expect(localCheck({type: 'sock', answer: 4}, 4)).toBe(true);
  expect(localCheck({type: 'sock', answer: 4}, 3)).toBe(false);
  expect(localCheck({type: 'memory', answer: 'K'}, 'K')).toBe(true);
  expect(localCheck({type: 'memory', answer: 'K'}, 'M')).toBe(false);
});

test('clock fill is 5% a task', () => {
  expect(fraction(0)).toBe(0);
  expect(fraction(1)).toBe(0.05);
  expect(fraction(11)).toBe(0.55);
  expect(fraction(20)).toBe(1);
  expect(fraction(25)).toBe(1);
});
