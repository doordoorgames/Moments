import {localArrangement, seededArrangement, shuffleArrangement, validArrangement} from './arrangement';
import {TV_IDS, TVS, layoutSlots, letterSize, BUTTON} from './screens';

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

test('central pair hugs the centre line and never overlaps the button or each other', () => {
  for (let i = 0; i < 200; i++) {
    const slots = layoutSlots(shuffleArrangement());
    const [fl, nl, cl, cr, nr, fr] = slots;
    expect(cl.role).toBe('centre'); expect(cr.role).toBe('centre');
    expect(cl.x + cl.width).toBeLessThan(0); expect(cr.x).toBeGreaterThan(0);
    // Both central TVs fit the narrowest width we guarantee (1440 units).
    expect(Math.max(-cl.x, cr.x + cr.width)).toBeLessThanOrEqual(720);
    expect(cl.top + cl.height).toBeLessThan(BUTTON.top);
    expect(BUTTON.top + BUTTON.height).toBeLessThanOrEqual(1080);
    // Outer TVs run outward without overlapping.
    expect(nl.x + nl.width).toBeLessThan(cl.x); expect(fl.x + fl.width).toBeLessThan(nl.x);
    expect(nr.x).toBeGreaterThan(cr.x + cr.width); expect(fr.x).toBeGreaterThan(nr.x + nr.width);
    // Proportions are the art's own.
    slots.forEach(s => expect(Math.abs(s.width / s.height - TVS[s.id].width / TVS[s.id].height)).toBeLessThan(0.01));
    expect(letterSize(slots)).toBeGreaterThan(150);
  }
  expect(TV_IDS).toHaveLength(6);
});
