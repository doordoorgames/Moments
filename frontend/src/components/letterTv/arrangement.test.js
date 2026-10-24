import {localArrangement, seededArrangement, shuffleArrangement, validArrangement} from './arrangement';
import {BUTTON, REF_HEIGHT, TV_IDS, TVS, centreHalfWidth, layoutSlots, letterSize} from './screens';

test('a shuffle uses each of the six TVs exactly once', () => {
  for (let i = 0; i < 200; i++) expect(validArrangement(shuffleArrangement())).toBe(true);
});

test('a new arrangement never repeats the previous one', () => {
  let prev = shuffleArrangement();
  for (let i = 0; i < 200; i++) {
    const next = shuffleArrangement(prev);
    expect(next).not.toEqual(prev);
    prev = next;
  }
});

test('rooms without a stored arrangement derive the same one from their code', () => {
  expect(seededArrangement('12345')).toEqual(seededArrangement('12345'));
  expect(validArrangement(seededArrangement('12345'))).toBe(true);
});

test('local arrangement survives a refresh of the same tab', () => {
  window.sessionStorage.clear(); window.localStorage.clear();
  const first = localArrangement();
  expect(localArrangement()).toEqual(first);
  window.sessionStorage.clear();          // a new tab/session
  expect(localArrangement()).not.toEqual(first);
});

test('all six TVs are full height and touch edge to edge, the middle pair on the centre line', () => {
  for (let i = 0; i < 200; i++) {
    const slots = layoutSlots(shuffleArrangement());
    expect(slots.map(s => s.role)).toEqual(['outer', 'outer', 'centre', 'centre', 'outer', 'outer']);
    slots.forEach(s => { expect(s.top).toBe(0); expect(s.height).toBe(REF_HEIGHT); });
    // The pair is centred as a whole.
    expect(Math.abs(slots[2].x + (slots[3].x + slots[3].width))).toBeLessThanOrEqual(1);
    for (let k = 1; k < 6; k++) expect(slots[k].x).toBe(slots[k - 1].x + slots[k - 1].width);
    expect(Math.abs(centreHalfWidth(slots) - (slots[2].width + slots[3].width) / 2)).toBeLessThanOrEqual(1);
    // Proportions are the art's own.
    slots.forEach(s => expect(Math.abs(s.width / s.height - TVS[s.id].width / TVS[s.id].height)).toBeLessThan(0.01));
    // NEXT sits below every central screen.
    slots.slice(2, 4).forEach(s => {
      const screenBottom = (TVS[s.id].screen.top + TVS[s.id].screen.height) / 100 * REF_HEIGHT;
      expect(REF_HEIGHT - BUTTON.bottom - BUTTON.height).toBeGreaterThan(screenBottom);
    });
    expect(letterSize(slots)).toBeGreaterThan(250);
  }
  expect(TV_IDS).toHaveLength(6);
});
