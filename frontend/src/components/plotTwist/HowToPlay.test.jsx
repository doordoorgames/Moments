import {act} from 'react';
import {createRoot} from 'react-dom/client';
import HowToPlay, {TRAP_MIN, TRAP_MAX} from './HowToPlay';
import Avatar from './Avatar';
import {HOW_TO_PLAY} from './howToPlayContent';
import {wordCount} from './words';

jest.mock('@/lib/api', () => ({BACKEND_URL: 'https://backend.test'}));
global.IS_REACT_ACT_ENVIRONMENT = true;

// The same matching the server uses (backend/plot_twist.py: key, said, AR_PREFIXES): whole words,
// any case, Arabic spelling variants folded, and و ف ب ك ل or ال allowed in front of an Arabic word.
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const fold = w => w.replace(MARKS, '').toLowerCase().replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىئ]/g, 'ي').replace(/ؤ/g, 'و');
const tokens = text => new Set((text.replace(MARKS, '').match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).map(fold));
const PREFIXES = ['', 'ال', 'و', 'ف', 'ب', 'ك', 'ل', 'وال', 'فال', 'بال', 'كال', 'لل', 'ولل', 'فلل'];
// eslint-disable-next-line no-control-regex
const said = (word, text) => { const w = fold(word), t = tokens(text); return /^[\x00-\x7f]+$/.test(w) ? t.has(w) : PREFIXES.some(p => t.has(p + w)); };

let container, root;
const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));
beforeEach(() => {
  global.fetch = jest.fn(() => Promise.resolve({ok: true, json: () => Promise.resolve({count: 20, slots: ['abcdef0123456789abcd', ...Array(19).fill(null)]})}));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); delete global.fetch; });

describe.each(['en', 'ar'])('%s tutorial', lang => {
  const c = HOW_TO_PLAY[lang];
  const [p1, p2, p3, p4] = c.panels;
  const [you, friend] = c.players;
  const fresh = p3.after.find(w => !p3.before.includes(w));

  test('opens with its title, four illustrated panels and a visible close button', async () => {
    const onClose = jest.fn();
    await act(async () => root.render(<HowToPlay lang={lang} onClose={onClose}/>));
    await settle();
    expect(container.querySelector('#pt-howto-title').textContent).toBe(lang === 'en' ? 'How to Play' : 'طريقة اللعب');
    expect(container.querySelector('.pt-howto').getAttribute('dir')).toBe(lang === 'en' ? 'ltr' : 'rtl');
    const panels = container.querySelectorAll('.pt-howto-panel');
    expect(panels).toHaveLength(4);
    panels.forEach((panel, i) => {
      expect(panel.querySelector('h3').textContent).toBe(c.panels[i].title);
      expect(panel.querySelector('.pt-howto-art').children.length).toBeGreaterThan(0);
    });
    const close = container.querySelector('.pt-howto-close');
    expect(close.getAttribute('aria-label')).toBe(c.close);
    expect(document.activeElement).toBe(close);
    // Panel 1: two players, each with their own word. Panel 3: the new word is marked.
    expect([...panels[0].querySelectorAll('.pt-secret-words strong')].map(s => s.textContent)).toEqual(p1.words);
    expect(panels[2].querySelector('strong.is-new').textContent).toBe(fresh + c.newWord);
    // Panel 4: the trapped word is the friend's secret word, and the friend scores.
    expect(panels[3].querySelector('mark').textContent).toBe(p4.said);
    expect(panels[3].querySelector('.pt-ht-twist').textContent).toContain(friend.name);
    // Avatar slot 1 has a picture; slot 2 has none yet, so that player shows their initial.
    const [first, second] = panels[0].querySelectorAll('.pt-face');
    expect(first.querySelector('img').getAttribute('src')).toBe('https://backend.test/api/plot-twist/avatars/abcdef0123456789abcd.webp');
    expect(second.querySelector('img')).toBeNull();
    expect(second.textContent).toBe(Array.from(friend.name)[0].toUpperCase());
  });

  test('closes with X, Escape, the backdrop and the button, but not a click inside', async () => {
    const onClose = jest.fn();
    await act(async () => root.render(<HowToPlay lang={lang} onClose={onClose}/>));
    await act(async () => container.querySelector('.pt-howto-panel').click());
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => container.querySelector('.pt-howto-close').click());
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'})));
    await act(async () => container.querySelector('.pt-howto-modal').click());
    await act(async () => container.querySelector('.pt-howto-foot button').click());
    expect(onClose).toHaveBeenCalledTimes(4);
  });

  test('every example follows the real Word Trap rules', () => {
    const secrets = [p1.words[0], p1.words[1], fresh];
    for (const line of [p2.story, p2.typing, p4.safe, p4.trap]) {
      expect(wordCount(line)).toBeGreaterThanOrEqual(TRAP_MIN);
      expect(wordCount(line)).toBeLessThanOrEqual(TRAP_MAX);
    }
    expect(new Set(p1.words).size).toBe(2);
    // Sending a line adds exactly one new word on top of what you held.
    expect(p3.before).toEqual([p1.words[0]]);
    expect(p3.after).toEqual([...p3.before, fresh]);
    expect(secrets).toHaveLength(new Set(secrets).size);
    // Only the trap line contains a secret word, and it is the friend's: the friend scores.
    for (const line of [p2.story, p2.typing, p4.safe]) for (const w of secrets) expect(said(w, line)).toBe(false);
    expect(said(p1.words[1], p4.trap)).toBe(true);
    expect(said(p1.words[0], p4.trap) || said(fresh, p4.trap)).toBe(false);
    expect(p4.trap).toContain(p4.said);
    expect(said(p1.words[1], p4.said)).toBe(true);
    expect(you.name).not.toBe(friend.name);
  });
});

test('English and Arabic teach the same thing', () => {
  const shape = lang => HOW_TO_PLAY[lang].panels.map(p => Object.keys(p).sort().join()).join('|');
  expect(shape('ar')).toBe(shape('en'));
  for (const lang of ['en', 'ar']) {
    const c = HOW_TO_PLAY[lang];
    expect(c.players).toHaveLength(2);
    expect(c.panels[2].after.length).toBe(c.panels[2].before.length + 1);
    expect(c.panels.every(p => p.image === null)).toBe(true);
  }
  expect(HOW_TO_PLAY.en.players.map(p => [p.avatar, p.ink, p.mark])).toEqual(HOW_TO_PLAY.ar.players.map(p => [p.avatar, p.ink, p.mark]));
});

test('an avatar shows its slot picture, or the player initial when the slot is empty or broken', async () => {
  const list = [null, 'abcdef0123456789abcd'];
  await act(async () => root.render(<><Avatar slot={1} name="نور" list={list}/><Avatar slot={2} name="hamad" list={list} ring="#123456"/></>));
  const [empty, picture] = container.querySelectorAll('.pt-face');
  expect(empty.textContent).toBe('ن');
  expect(picture.querySelector('img').getAttribute('src')).toBe('https://backend.test/api/plot-twist/avatars/abcdef0123456789abcd.webp');
  await act(async () => picture.querySelector('img').dispatchEvent(new Event('error')));
  expect(picture.textContent).toBe('H');
});
