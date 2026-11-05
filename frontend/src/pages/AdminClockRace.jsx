import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import axios from 'axios';
import {BACKEND_URL, apiErrorMessage} from '@/lib/api';
import {TASK_VIEWS} from '@/components/clockRace/Tasks';
import {picturePrompt} from '@/components/clockRace/PictureTasks';
import {TEXT} from '@/components/clockRace/text';
import {ARCADE, ARCADE_VARS} from '@/components/clockRace/theme';
import {artUrl, anyUrl} from '@/components/clockRace/assetUrls';
import '@/components/clockRace/clockRace.css';
import '@/components/clockRace/arcade.css';
import './AdminClockRace.css';

// Clock Race studio: review, edit, approve and publish every Clock Race question and its pictures.
// Everything here talks to /api/admin/clock-race (server-checked sign-in); nothing is decided in the browser.

const TOKEN_KEY = 'clock-race-studio-token';
const PAGE = 24;
const PICTURE_KINDS = ['belong', 'older', 'compare', 'which'];
const OPTION_COUNT = {belong: 4, older: 2, compare: 2, which: 2};
const FLIPS = [['none', 'Not mirrored'], ['H', 'Mirror L-R'], ['V', 'Mirror T-B']];
const STATUS_TABS = [
  ['all', 'All'], ['review', 'Needs review'], ['approved', 'Approved'], ['rejected', 'Rejected'],
  ['unpublished', 'Unpublished'], ['errors', 'Errors'], ['missing', 'Missing pictures'], ['broken', 'Broken pictures'],
];

function call(method, path, body, opts = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  return axios({method, url: `${BACKEND_URL}/api/admin/clock-race${path}`, data: body,
    headers: token ? {Authorization: `Bearer ${token}`} : {}, ...opts}).then(r => r.data);
}

// A picture reference (art key, asset:<id>, file path or url) -> something an <img> can show.
function useResolver(assets) {
  return useCallback(ref => {
    if (!ref) return null;
    if (ref.startsWith('asset:')) {
      const a = assets?.[ref];
      return a ? anyUrl(a.thumb || a.url) : null;
    }
    if (ref.startsWith('@art:')) return artUrl(ref.slice(5));
    if (ref.startsWith('/clock-race/') || /^https?:\/\//.test(ref) || ref.startsWith('/api/')) return anyUrl(ref);
    return artUrl(ref);
  }, [assets]);
}
const fullUrl = (ref, assets) => {
  if (!ref) return null;
  if (ref.startsWith('asset:')) return assets?.[ref] ? anyUrl(assets[ref].url) : null;
  return artUrl(ref);
};

const clone = v => JSON.parse(JSON.stringify(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ================================================================== root

export default function AdminClockRace() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [me, setMe] = useState('');
  useEffect(() => {
    if (!token) return;
    call('get', '/me').then(r => setMe(r.name)).catch(() => { localStorage.removeItem(TOKEN_KEY); setToken(null); });
  }, [token]);
  if (!token) return <Login onIn={t => { localStorage.setItem(TOKEN_KEY, t); setToken(t); }}/>;
  if (!me) return <div className="crs crs-center"><p>Loading…</p></div>;
  return <Studio me={me} onOut={() => { localStorage.removeItem(TOKEN_KEY); setToken(null); setMe(''); }}/>;
}

function Login({onIn}) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { onIn((await call('post', '/login', {password: pw})).token); }
    catch (x) { setErr(apiErrorMessage(x, 'Sign-in failed.')); }
    finally { setBusy(false); }
  };
  return <div className="crs crs-center">
    <form className="crs-login" onSubmit={submit}>
      <h1>Clock Race studio</h1>
      <p className="crs-muted">Private. Sign in with the studio password set on the server.</p>
      <input type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Password" autoFocus/>
      <button className="crs-btn is-primary" disabled={busy || !pw}>{busy ? 'Signing in…' : 'Sign in'}</button>
      {err && <p className="crs-error" role="alert">{err}</p>}
    </form>
  </div>;
}

// ================================================================== studio

function Studio({me, onOut}) {
  const [lib, setLib] = useState(null);
  const [error, setError] = useState('');
  const [type, setType] = useState('all');
  const [tab, setTab] = useState('review');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState(() => new Set());
  const [open, setOpen] = useState(null);           // id of the question being edited
  const [dirty, setDirty] = useState(false);        // the editor has unsaved changes
  const [modal, setModal] = useState(null);         // 'publish' | 'history' | 'pictures' | 'new' | 'generated'
  const [broken, setBroken] = useState(() => new Set());
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try { setLib(await call('get', '/library')); setError(''); }
    catch (x) {
      if (x?.response?.status === 401) { onOut(); return; }
      setError(apiErrorMessage(x, 'Could not load the questions.'));
    }
  }, [onOut]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const warn = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const resolve = useResolver(lib?.assets);
  const rows = useMemo(() => {
    if (!lib) return [];
    const needle = q.trim().toLowerCase();
    return lib.items.filter(r => (type === 'all' || r.type === type)
      && (tab === 'all' || (tab === 'review' && r.status === 'draft') || r.status === tab
        || (tab === 'unpublished' && r.dirty) || (tab === 'errors' && r.errors) || (tab === 'missing' && r.missing_image)
        || (tab === 'broken' && broken.has(r.id)))
      && (!needle || r.id.toLowerCase().includes(needle) || (r.title || '').toLowerCase().includes(needle)));
  }, [lib, type, tab, q, broken]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  useEffect(() => { setPage(0); }, [type, tab, q]);

  const leave = () => !dirty || window.confirm('You have unsaved changes. Leave without saving?');
  const openItem = id => { if (id === open || leave()) { setDirty(false); setOpen(id); } };
  const next = () => {
    const i = rows.findIndex(r => r.id === open);
    const n = rows[i + 1] || rows.find(r => r.id !== open && r.status === 'draft');
    if (n) openItem(n.id); else setToast('No more questions in this list.');
  };
  const markBroken = useCallback(id => setBroken(b => (b.has(id) ? b : new Set(b).add(id))), []);

  const bulkApprove = async () => {
    try {
      const r = await call('post', '/bulk-approve', {ids: [...picked]});
      setToast(`Approved ${r.approved.length}${r.skipped.length ? `, skipped ${r.skipped.length} with problems` : ''}.`);
      if (r.skipped.length) setError(r.skipped.slice(0, 5).map(s => `${s.id}: ${s.reason}`).join(' • '));
      setPicked(new Set());
      load();
    } catch (x) { setError(apiErrorMessage(x)); }
  };

  if (!lib) return <div className="crs crs-center">{error ? <p className="crs-error">{error}</p> : <p>Loading…</p>}</div>;
  const c = lib.counts;
  return <div className="crs">
    <header className="crs-top">
      <div className="crs-brand"><b>Clock Race studio</b><span className="crs-muted">Signed in as {me}</span></div>
      <div className="crs-top-actions">
        <button className="crs-btn" onClick={() => setModal('pictures')}>Pictures</button>
        <button className="crs-btn" onClick={() => setModal('new')}>New question</button>
        <button className="crs-btn" onClick={() => setModal('history')}>History</button>
        <button className="crs-btn is-primary" disabled={!lib.pending.length} onClick={() => setModal('publish')}>
          Publish approved changes{lib.pending.length ? ` (${lib.pending.length})` : ''}</button>
        <button className="crs-btn is-ghost" onClick={() => leave() && onOut()}>Sign out</button>
      </div>
    </header>

    <section className="crs-dash" aria-label="Summary">
      {[['Total', c.total, 'all'], ['Needs review', c.needs_review, 'review'], ['Approved', c.approved, 'approved'],
        ['Rejected', c.rejected, 'rejected'], ['Unpublished', c.unpublished, 'unpublished'],
        ['Missing pictures', c.missing_images, 'missing'], ['Validation errors', c.errors, 'errors'],
        ['Broken pictures', broken.size, 'broken']].map(([label, n, t]) =>
        <button key={label} className={`crs-stat ${tab === t ? 'is-on' : ''} ${(t === 'errors' || t === 'missing' || t === 'broken') && n ? 'is-bad' : ''}`} onClick={() => setTab(t)}>
          <b>{n}</b><span>{label}</span></button>)}
      <p className="crs-muted crs-dash-note">Live now: {c.live} reviewed, {c.legacy} original (not reviewed yet, still playing).{!lib.art_check && ' Picture keys could not be checked on this server.'}</p>
    </section>

    {error && <p className="crs-error crs-banner" role="alert" onClick={() => setError('')}>{error}</p>}

    <div className={`crs-main ${open ? 'has-editor' : ''}`}>
      <section className="crs-library">
        <div className="crs-filters">
          <select value={type} onChange={e => setType(e.target.value)} aria-label="Challenge type">
            <option value="all">All types</option>
            {Object.entries(lib.types).map(([k, label]) => <option key={k} value={k}>{label} ({lib.items.filter(r => r.type === k).length})</option>)}
          </select>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search id or text"/>
          <button className="crs-btn is-small" onClick={() => setModal('generated')}>Generated challenges</button>
        </div>
        <div className="crs-tabs" role="tablist">
          {STATUS_TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{label}</button>)}
        </div>
        <div className="crs-bulk">
          <label><input type="checkbox" checked={shown.length > 0 && shown.every(r => picked.has(r.id))}
            onChange={e => setPicked(p => { const n = new Set(p); shown.forEach(r => (e.target.checked ? n.add(r.id) : n.delete(r.id))); return n; })}/> Select page</label>
          <span className="crs-muted">{rows.length} shown{picked.size ? `, ${picked.size} selected` : ''}</span>
          {picked.size > 0 && <><button className="crs-btn is-small is-good" onClick={bulkApprove}>Approve selected</button>
            <button className="crs-btn is-small is-ghost" onClick={() => setPicked(new Set())}>Clear</button></>}
        </div>
        <ul className="crs-grid">
          {shown.map(r => <Card key={r.id} r={r} label={lib.types[r.type]} thumb={resolve(r.thumb)} on={open === r.id}
            picked={picked.has(r.id)} onPick={v => setPicked(p => { const n = new Set(p); v ? n.add(r.id) : n.delete(r.id); return n; })}
            onOpen={() => openItem(r.id)} onBroken={markBroken}/>)}
        </ul>
        {!shown.length && <p className="crs-muted crs-empty">Nothing here.</p>}
        {pages > 1 && <nav className="crs-pager">
          <button className="crs-btn is-small" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span>Page {page + 1} of {pages}</span>
          <button className="crs-btn is-small" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>Next</button>
        </nav>}
      </section>

      {open && <Editor key={open} id={open} lib={lib} onDirty={setDirty} onChanged={load} onNext={next}
        onClose={() => { if (leave()) { setDirty(false); setOpen(null); } }} onToast={setToast}/>}
    </div>

    {modal === 'publish' && <PublishModal onClose={() => setModal(null)} onDone={msg => { setModal(null); setToast(msg); load(); }} types={lib.types}/>}
    {modal === 'history' && <HistoryModal lib={lib} onClose={() => setModal(null)} onDone={msg => { setModal(null); setToast(msg); load(); }}/>}
    {modal === 'pictures' && <PicturesModal onClose={() => { setModal(null); load(); }}/>}
    {modal === 'generated' && <Modal title="Generated challenges" onClose={() => setModal(null)}>
      <p className="crs-muted">These are drawn fresh by the server every round from fixed rules, so there is no question list to review. They keep playing as they are.</p>
      <ul className="crs-list">{Object.entries(lib.generated).map(([k, v]) => <li key={k}><b>{k}</b> {v}</li>)}</ul>
    </Modal>}
    {modal === 'new' && <NewModal types={lib.types} onClose={() => setModal(null)} onMade={id => { setModal(null); load(); openItem(id); }}/>}
    {toast && <div className="crs-toast" role="status">{toast}</div>}
  </div>;
}

function Card({r, label, thumb, on, picked, onPick, onOpen, onBroken}) {
  const [bad, setBad] = useState(false);
  return <li className={`crs-card ${on ? 'is-open' : ''} ${bad ? 'is-broken' : ''}`}>
    <input type="checkbox" className="crs-card-check" checked={picked} onChange={e => onPick(e.target.checked)} aria-label={`Select ${r.id}`}/>
    <button className="crs-card-body" onClick={onOpen}>
      <span className="crs-thumb">{thumb && !bad
        ? <img src={thumb} alt="" loading="lazy" onError={() => { setBad(true); onBroken(r.id); }}/>
        : <span className="crs-thumb-none">{bad ? 'Broken picture' : r.type === 'vote' ? 'Text only' : 'No picture'}</span>}</span>
      <span className="crs-card-text">
        <span className="crs-card-id">{r.id} · {label}</span>
        <span className="crs-card-title" dir="auto">{r.title}</span>
        <span className="crs-pills">
          <Pill kind={r.status}>{r.status === 'draft' ? 'Draft' : r.status === 'approved' ? 'Approved' : 'Rejected'}</Pill>
          <Pill kind={`live-${r.live}`}>{r.live === 'live' ? 'Live' : r.live === 'legacy' ? 'Live (original)' : 'Not live'}</Pill>
          {r.dirty && <Pill kind="pending">To publish</Pill>}
          {r.errors > 0 && <Pill kind="error">{r.errors} error{r.errors > 1 ? 's' : ''}</Pill>}
        </span>
      </span>
    </button>
  </li>;
}

const Pill = ({kind, children}) => <span className={`crs-pill is-${kind}`}>{children}</span>;

// ================================================================== editor

function Editor({id, lib, onDirty, onChanged, onNext, onClose, onToast}) {
  const [item, setItem] = useState(null);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState(false);
  const [picker, setPicker] = useState(null);   // callback(ref) for the picture picker
  const dirty = item && data && !same(data, item.draft);
  useEffect(() => { onDirty(Boolean(dirty)); }, [dirty, onDirty]);

  const take = useCallback(it => { setItem(it); setData(clone(it.draft)); }, []);
  useEffect(() => {
    call('get', `/items/${encodeURIComponent(id)}`).then(take).catch(x => setErr(apiErrorMessage(x)));
  }, [id, take]);

  const refs = useMemo(() => ({...(lib.assets || {}), ...(item?.refs || {})}), [lib.assets, item]);
  const resolve = useResolver(refs);

  const run = async (fn, msg) => {
    setBusy(true); setErr('');
    try {
      const it = await fn();
      if (it && it.draft) take(it);
      if (msg) onToast(msg);
      onChanged();
      return it;
    } catch (x) {
      setErr(apiErrorMessage(x));
      return null;
    } finally { setBusy(false); }
  };
  const save = () => run(() => call('put', `/items/${encodeURIComponent(id)}`, {data, base: item.updated_at ?? null}), 'Saved as draft.');
  const status = async s => {
    if (dirty && !(await save())) return;
    run(() => call('post', `/items/${encodeURIComponent(id)}/status`, {status: s}),
      s === 'approved' ? 'Approved. It goes live when you publish.' : s === 'rejected' ? 'Rejected. It leaves the game when you publish.' : 'Back to draft.');
  };
  const tile = body => run(() => call('post', `/items/${encodeURIComponent(id)}/tile`, body));

  if (err && !item) return <aside className="crs-editor"><p className="crs-error">{err}</p><button className="crs-btn" onClick={onClose}>Close</button></aside>;
  if (!item || !data) return <aside className="crs-editor"><p>Loading…</p></aside>;
  const problems = dirty ? null : item.problems;
  const errors = (problems || []).filter(p => p.level === 'error');
  const Form = FORMS[item.type];
  return <aside className="crs-editor" aria-label={`Edit ${id}`}>
    <div className="crs-editor-head">
      <div>
        <h2>{item.label}</h2>
        <p className="crs-muted">{id} · {item.origin === 'builtin' ? 'original question' : 'made in the studio'}
          {item.approved_by && ` · approved by ${item.approved_by}`}{item.published_by && ` · published by ${item.published_by} ${(item.published_at || '').slice(0, 10)}`}</p>
        <span className="crs-pills">
          <Pill kind={item.status}>{item.status}</Pill>
          <Pill kind={`live-${item.live}`}>{item.live === 'live' ? 'Live' : item.live === 'legacy' ? 'Live (original)' : 'Not live'}</Pill>
          {item.dirty && <Pill kind="pending">Waiting to publish</Pill>}
          {dirty && <Pill kind="error">Unsaved changes</Pill>}
        </span>
      </div>
      <button className="crs-btn is-ghost" onClick={onClose} aria-label="Close editor">Close</button>
    </div>

    <div className="crs-actions">
      <button className="crs-btn is-good" disabled={busy} onClick={() => status('approved')}>Approve</button>
      <button className="crs-btn is-bad" disabled={busy} onClick={() => status('rejected')}>Reject</button>
      <button className="crs-btn" disabled={busy || !dirty} onClick={save}>Save draft</button>
      <button className="crs-btn" disabled={busy} onClick={() => setPreview(p => !p)}>{preview ? 'Hide preview' : 'Play preview'}</button>
      {dirty && <button className="crs-btn is-ghost" onClick={() => setData(clone(item.draft))}>Undo changes</button>}
      {!dirty && item.status !== 'approved' && (item.approved || item.live_data) && !same(item.draft, item.approved || item.live_data)
        && <button className="crs-btn is-ghost" disabled={busy} onClick={() => run(() => call('post', `/items/${encodeURIComponent(id)}/discard`), 'Back to the last approved version.')}>Discard edits</button>}
      <button className="crs-btn" onClick={onNext}>Next question</button>
    </div>
    {err && <p className="crs-error" role="alert">{err}</p>}
    {item.status === 'draft' && item.live !== 'off' && item.approved == null && item.origin === 'builtin' &&
      <p className="crs-note">This original question is still playing as it is. Approve it to mark it reviewed, or reject it to take it out.</p>}
    {item.live === 'live' && !same(item.draft, item.live_data) && <p className="crs-note">Players still see the published version until you approve and publish this edit.</p>}

    {problems && problems.length > 0 && <ul className="crs-problems">
      {problems.map((p, i) => <li key={i} className={`is-${p.level}`}>{p.level === 'error' ? 'Error' : 'Check'}: {p.msg}</li>)}
    </ul>}
    {problems && !problems.length && <p className="crs-ok">No problems found.</p>}
    {dirty && <p className="crs-muted">Save to re-check this question.</p>}

    {preview && <PlayPreview id={id} type={item.type} stamp={JSON.stringify(item.draft)} dirty={dirty}/>}

    <Form data={data} setData={setData} item={item} resolve={resolve} refs={refs} busy={busy}
      pick={cb => setPicker(() => cb)} tile={tile} errors={errors}/>

    {item.history?.length > 0 && <details className="crs-history">
      <summary>History ({item.history.length})</summary>
      <ul>{[...item.history].reverse().map((h, i) => <li key={i}>{h.at.replace('T', ' ').slice(0, 16)} · {h.by} · {h.action}{h.note ? ` (${h.note})` : ''}</li>)}</ul>
    </details>}
    {picker && <PicturePicker onClose={() => setPicker(null)} onPick={ref => { picker(ref); setPicker(null); }}/>}
  </aside>;
}

// ------------------------------------------------------------------ forms per type

const Field = ({label, children, wide}) => <label className={`crs-field ${wide ? 'is-wide' : ''}`}><span>{label}</span>{children}</label>;
const Ar = props => <input dir="rtl" lang="ar" {...props}/>;

function PicSlot({src, refValue, onPick, onKey, label = 'Change picture'}) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  return <div className="crs-picslot">
    <span className={`crs-thumb is-small ${bad || !src ? 'is-missing' : ''}`}>{src && !bad ? <img src={src} alt="" onError={() => setBad(true)}/> : <span className="crs-thumb-none">{bad ? 'Broken' : 'Missing'}</span>}</span>
    <div className="crs-picslot-side">
      <button type="button" className="crs-btn is-small" onClick={onPick}>{label}</button>
      {onKey && <input className="crs-key" value={refValue || ''} onChange={e => onKey(e.target.value)} aria-label="Picture key" title="Picture key or asset reference"/>}
    </div>
  </div>;
}

function QuestionText({data, set}) {
  return <div className="crs-row2">
    <Field label="Question (Arabic)"><Ar value={data.ar || ''} onChange={e => set({...data, ar: e.target.value})}/></Field>
    <Field label="Question (English)"><input value={data.en || ''} onChange={e => set({...data, en: e.target.value})}/></Field>
  </div>;
}

function PictureForm({data, setData, item, resolve, pick}) {
  const need = OPTION_COUNT[item.type];
  const opts = data.options || [];
  const setOpt = (i, v) => setData({...data, options: opts.map((o, j) => (j === i ? v : o))});
  const move = (i, d) => { const o = [...opts]; [o[i], o[i + d]] = [o[i + d], o[i]]; setData({...data, options: o}); };
  return <div className="crs-form">
    <QuestionText data={data} set={setData}/>
    <h3>Answers <span className="crs-muted">(the first one is the correct answer; the game shuffles them)</span></h3>
    {opts.map((o, i) => <div key={i} className={`crs-option ${i === 0 ? 'is-right' : ''}`}>
      <span className="crs-option-tag">{i === 0 ? 'Correct' : `Wrong ${i}`}</span>
      <PicSlot src={resolve(o[0])} refValue={o[0]} onPick={() => pick(ref => setOpt(i, [ref, o[1], o[2]]))} onKey={v => setOpt(i, [v, o[1], o[2]])}/>
      <Field label="Arabic"><Ar value={o[1]} onChange={e => setOpt(i, [o[0], e.target.value, o[2]])}/></Field>
      <Field label="English"><input value={o[2]} onChange={e => setOpt(i, [o[0], o[1], e.target.value])}/></Field>
      <div className="crs-option-move">
        {i > 0 && <button type="button" className="crs-btn is-small" onClick={() => move(i, -1)} title="Move up (up to the top makes it the correct answer)">Up</button>}
        {i < opts.length - 1 && <button type="button" className="crs-btn is-small" onClick={() => move(i, 1)}>Down</button>}
        {opts.length > need && <button type="button" className="crs-btn is-small is-ghost" onClick={() => setData({...data, options: opts.filter((_, j) => j !== i)})}>Remove</button>}
      </div>
    </div>)}
    {opts.length < need && <button type="button" className="crs-btn" onClick={() => setData({...data, options: [...opts, ['', '', '']]})}>Add answer</button>}
    <div className="crs-row2">
      <Field label="Difficulty"><select value={data.difficulty || 'medium'} onChange={e => setData({...data, difficulty: e.target.value})}>
        <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></Field>
      <Field label="Source note"><input value={data.source || ''} onChange={e => setData({...data, source: e.target.value})}/></Field>
    </div>
    <Field label="Fact (explanation, not shown before the answer)" wide><textarea rows={2} value={data.fact || ''} onChange={e => setData({...data, fact: e.target.value})}/></Field>
  </div>;
}

function PriceForm({data, setData, resolve, pick}) {
  const opts = data.options || [];
  const setOpt = (i, patch) => setData({...data, options: opts.map((o, j) => (j === i ? {...o, ...patch} : o))});
  const best = opts.length ? opts.reduce((b, o, i) => ((o.unit_usd || 0) * (o.quantity || 1) > (opts[b].unit_usd || 0) * (opts[b].quantity || 1) ? i : b), 0) : -1;
  return <div className="crs-form">
    <p className="crs-muted">2 or 3 items. The most expensive total (price × quantity) is the right answer.</p>
    {opts.map((o, i) => <div key={i} className={`crs-option ${i === best ? 'is-right' : ''}`}>
      <span className="crs-option-tag">{i === best ? 'Correct (most expensive)' : `Item ${i + 1}`}</span>
      <PicSlot src={o.image ? resolve(o.image) : `/clock-race/art/prices/${o.key}.webp`} onPick={() => pick(ref => setOpt(i, {image: ref}))}/>
      {o.image && <button type="button" className="crs-btn is-small is-ghost" onClick={() => setOpt(i, {image: ''})}>Use the original picture</button>}
      <Field label="Key"><input value={o.key || ''} onChange={e => setOpt(i, {key: e.target.value})}/></Field>
      <Field label="Arabic"><Ar value={o.ar || ''} onChange={e => setOpt(i, {ar: e.target.value})}/></Field>
      <Field label="English"><input value={o.en || ''} onChange={e => setOpt(i, {en: e.target.value})}/></Field>
      <Field label="Price (USD, each)"><input type="number" min="0" value={o.unit_usd ?? ''} onChange={e => setOpt(i, {unit_usd: Number(e.target.value)})}/></Field>
      <Field label="Quantity"><input type="number" min="1" value={o.quantity ?? 1} onChange={e => setOpt(i, {quantity: Number(e.target.value)})}/></Field>
      <Field label="Price basis"><input value={o.price_basis || ''} onChange={e => setOpt(i, {price_basis: e.target.value})}/></Field>
      <Field label="Source"><input value={o.source || ''} onChange={e => setOpt(i, {source: e.target.value})}/></Field>
      <Field label="Checked on"><input value={o.checked || ''} placeholder="YYYY-MM-DD" onChange={e => setOpt(i, {checked: e.target.value})}/></Field>
      {opts.length > 2 && <button type="button" className="crs-btn is-small is-ghost" onClick={() => setData({...data, options: opts.filter((_, j) => j !== i)})}>Remove item</button>}
    </div>)}
    {opts.length < 3 && <button type="button" className="crs-btn" onClick={() => setData({...data, options: [...opts, {key: '', ar: '', en: '', unit_usd: 0, quantity: 1}]})}>Add item</button>}
  </div>;
}

function PhotoForm({data, setData, refs, pick}) {
  const opts = data.options || [];
  const setOpt = (i, v) => setData({...data, options: opts.map((o, j) => (j === i ? v : o))});
  const src = data.pic?.startsWith('asset:') ? fullUrl(data.pic, refs) : data.pic ? `/clock-race/photos/${data.pic}.webp` : null;
  return <div className="crs-form">
    <div className="crs-photo-big">{src ? <img src={src} alt=""/> : <span className="crs-thumb-none">No photo</span>}</div>
    <button type="button" className="crs-btn" onClick={() => pick(ref => setData({...data, pic: ref}))}>Replace photo</button>
    <Field label="Mode"><select value={data.mode || 'ask'} onChange={e => setData({...data, mode: e.target.value})}>
      <option value="ask">Photo with the question</option><option value="recall">Remember the photo, then answer</option></select></Field>
    <QuestionText data={data} set={setData}/>
    <h3>Answers <span className="crs-muted">(the first is correct)</span></h3>
    {opts.map((o, i) => <div key={i} className={`crs-option is-text ${i === 0 ? 'is-right' : ''}`}>
      <span className="crs-option-tag">{i === 0 ? 'Correct' : `Wrong ${i}`}</span>
      <Field label="Arabic"><Ar value={o[0]} onChange={e => setOpt(i, [e.target.value, o[1]])}/></Field>
      <Field label="English"><input value={o[1]} onChange={e => setOpt(i, [o[0], e.target.value])}/></Field>
      {opts.length > 2 && <button type="button" className="crs-btn is-small is-ghost" onClick={() => setData({...data, options: opts.filter((_, j) => j !== i)})}>Remove</button>}
    </div>)}
    {opts.length < 4 && <button type="button" className="crs-btn" onClick={() => setData({...data, options: [...opts, ['', '']]})}>Add answer</button>}
  </div>;
}

function AnimalForm({data, setData, resolve, pick}) {
  return <div className="crs-form">
    <PicSlot src={resolve(data.key)} refValue={data.key} onPick={() => pick(ref => setData({...data, key: ref}))} onKey={v => setData({...data, key: v})}/>
    <div className="crs-row2">
      <Field label="Animal (Arabic)"><Ar value={data.ar || ''} onChange={e => setData({...data, ar: e.target.value})}/></Field>
      <Field label="Animal (English)"><input value={data.en || ''} onChange={e => setData({...data, en: e.target.value})}/></Field>
    </div>
  </div>;
}

function VoteForm({data, setData}) {
  return <div className="crs-form"><QuestionText data={data} set={setData}/>
    <p className="crs-muted">Friend questions have no right answer: everyone picks a friend.</p></div>;
}

// ------------------------------------------------------------------ jigsaw editor

const pieceLook = ([flip, deg]) => `rotate(${deg}deg)${flip === 'H' ? ' scaleX(-1)' : flip === 'V' ? ' scaleY(-1)' : ''}`;

function TileForm({data, setData, item, refs, busy, pick, tile}) {
  const grid = data.grid || 3;
  const r = data.rendered || {};
  const legacy = !!data.pic && !r.img;
  const puzzleUrl = legacy ? `/clock-race/tiles/${data.pic}.webp` : fullUrl(r.img, refs);
  const pieceUrl = legacy ? `/clock-race/tiles/${data.pic}-piece.webp` : fullUrl(r.piece, refs);
  const sourceUrl = data.source ? fullUrl(data.source, refs) : null;
  const sourceInfo = data.source ? refs[data.source] : null;
  const [crop, setCrop] = useState(data.crop);
  const [nat, setNat] = useState(null);           // source natural size
  const [making, setMaking] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { setCrop(data.crop); }, [data.crop]);
  const changed = crop && !same(crop, data.crop);

  // The original square of a hand-made puzzle: the picture with its piece put back.
  const useLegacyAsSource = async () => {
    setMaking(true); setErr('');
    try {
      const load = src => new Promise((ok, no) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => ok(im); im.onerror = no; im.src = src; });
      const [a, b] = await Promise.all([load(puzzleUrl), load(pieceUrl)]);
      const cv = document.createElement('canvas');
      cv.width = a.naturalWidth; cv.height = a.naturalHeight;
      const g = cv.getContext('2d');
      g.drawImage(a, 0, 0);
      g.drawImage(b, cv.width - b.naturalWidth, cv.height - b.naturalHeight);
      const blob = await new Promise(ok => cv.toBlob(ok, 'image/png'));
      const form = new FormData();
      form.append('files', blob, `${item.id}-original.png`);
      form.append('note', `Original square of puzzle ${item.id}`);
      const up = await call('post', '/assets', form);
      if (!up.saved.length) throw new Error(up.failed[0]?.reason || 'Upload failed');
      await tile({source: up.saved[0].ref, crop: {x: 0, y: 0, size: cv.width}});
    } catch (x) { setErr(apiErrorMessage(x, x?.message || 'Could not rebuild the original.')); }
    finally { setMaking(false); }
  };
  const right = (data.opts || []).findIndex(o => o[0] === 'none');
  const setOpt = (i, o) => tile({opts: data.opts.map((x, j) => (j === i ? o : x))});

  return <div className="crs-form crs-tile">
    <div className="crs-row2">
      <div>
        <h3>Puzzle as players see it</h3>
        <div className="crs-tile-show">
          {puzzleUrl ? <img src={puzzleUrl} alt=""/> : <span className="crs-thumb-none">Not cut yet</span>}
          {puzzleUrl && <i className="crs-tile-hole" style={{'--g': grid}}/>}
        </div>
      </div>
      <div>
        <h3>The four pieces</h3>
        <div className="crs-pieces">
          {(data.opts || []).map((o, i) => <div key={i} className={`crs-piece ${i === right ? 'is-right' : ''}`}>
            <span className="crs-piece-img">{pieceUrl && <img src={pieceUrl} alt="" style={{transform: pieceLook(o)}}/>}</span>
            <span className="crs-option-tag">{i === right ? 'Correct' : 'Decoy'}</span>
            <select value={o[0]} disabled={busy} onChange={e => setOpt(i, [e.target.value, o[1]])} aria-label="Mirror">
              {FLIPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <button type="button" className="crs-btn is-small" disabled={busy} onClick={() => setOpt(i, [o[0], (o[1] + 90) % 360])}>Turned {o[1]}° · turn</button>
          </div>)}
        </div>
        <button type="button" className="crs-btn" disabled={busy} onClick={() => tile({regenerate: true})}>Regenerate decoys</button>
        <p className="crs-muted">Rule: the correct piece is the real corner, only turned. Decoys are the same corner mirrored and turned.</p>
      </div>
    </div>

    <Field label="Puzzle name (studio only)"><input value={data.title || ''} onChange={e => setData({...data, title: e.target.value})}/></Field>

    <h3>Source photo and square crop</h3>
    {!sourceUrl && legacy && <div className="crs-note">
      This is one of the original hand-made puzzles; only its square is kept. To re-crop it, rebuild the square as a source photo, or replace the photo.
      <div className="crs-actions"><button type="button" className="crs-btn" disabled={making || busy} onClick={useLegacyAsSource}>{making ? 'Rebuilding…' : 'Rebuild square as source'}</button></div>
    </div>}
    <div className="crs-actions">
      <button type="button" className="crs-btn" disabled={busy} onClick={() => pick(ref => tile({source: ref, crop: null}))}>{sourceUrl ? 'Replace source photo' : 'Choose source photo'}</button>
      <label className="crs-inline">Missing piece
        <select value={grid} disabled={busy || !data.source} onChange={e => tile({grid: Number(e.target.value), crop: crop || undefined})}>
          <option value={3}>Bottom-right third (current puzzles)</option><option value={2}>Bottom-right quarter</option></select></label>
    </div>
    {sourceInfo?.credit && Object.keys(sourceInfo.credit).length > 0 && <p className="crs-muted">Credit: {Object.values(sourceInfo.credit).join(' · ')}</p>}
    {sourceUrl && <>
      <CropBox url={sourceUrl} crop={crop} grid={grid} onCrop={setCrop} onSize={setNat}/>
      {nat && crop && <CropPreview url={sourceUrl} crop={crop} nat={nat} grid={grid}/>}
      <div className="crs-actions">
        <button type="button" className="crs-btn is-primary" disabled={busy || !changed} onClick={() => tile({crop})}>Save crop and cut puzzle</button>
        {changed && <button type="button" className="crs-btn is-ghost" onClick={() => setCrop(data.crop)}>Reset crop</button>}
      </div>
    </>}
    {err && <p className="crs-error">{err}</p>}
  </div>;
}

// Square crop over the source photo: drag to move, slider or pinch-free buttons to zoom.
function CropBox({url, crop, grid, onCrop, onSize}) {
  const box = useRef(null);
  const [nat, setNat] = useState(null);
  const drag = useRef(null);
  const loaded = e => {
    const n = {w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight};
    setNat(n); onSize(n);
    if (!crop || crop.size > Math.min(n.w, n.h)) {
      const s = Math.min(n.w, n.h);
      onCrop({x: Math.round((n.w - s) / 2), y: Math.round((n.h - s) / 2), size: s});
    }
  };
  if (!url) return null;
  const c = crop && nat ? crop : null;
  const scale = () => (box.current && nat ? box.current.clientWidth / nat.w : 1);
  const clamp = v => ({...v, x: Math.max(0, Math.min(nat.w - v.size, Math.round(v.x))), y: Math.max(0, Math.min(nat.h - v.size, Math.round(v.y)))});
  const down = e => {
    if (!c) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {sx: e.clientX, sy: e.clientY, x: c.x, y: c.y};
  };
  const moveP = e => {
    if (!drag.current || !c) return;
    const k = scale();
    onCrop(clamp({...c, x: drag.current.x + (e.clientX - drag.current.sx) / k, y: drag.current.y + (e.clientY - drag.current.sy) / k}));
  };
  const up = () => { drag.current = null; };
  const zoom = size => {
    if (!c) return;
    const s = Math.max(150, Math.min(Math.min(nat.w, nat.h), Math.round(size)));
    const cx = c.x + c.size / 2, cy = c.y + c.size / 2;
    onCrop(clamp({x: cx - s / 2, y: cy - s / 2, size: s}));
  };
  const max = nat ? Math.min(nat.w, nat.h) : 1;
  return <div className="crs-crop">
    <div className="crs-crop-stage" ref={box}>
      <img src={url} alt="" onLoad={loaded} draggable="false"/>
      {c && <div className="crs-crop-square" onPointerDown={down} onPointerMove={moveP} onPointerUp={up} onPointerCancel={up}
        style={{left: `${(c.x / nat.w) * 100}%`, top: `${(c.y / nat.h) * 100}%`, width: `${(c.size / nat.w) * 100}%`, height: `${(c.size / nat.h) * 100}%`, '--g': grid}}>
        <i className="crs-crop-cell"/>
      </div>}
    </div>
    {c && <div className="crs-crop-zoom">
      <button type="button" className="crs-btn is-small" onClick={() => zoom(c.size * 1.1)}>Zoom out</button>
      <input type="range" min={150} max={max} value={max - c.size + 150} onChange={e => zoom(max - Number(e.target.value) + 150)} aria-label="Zoom"/>
      <button type="button" className="crs-btn is-small" onClick={() => zoom(c.size / 1.1)}>Zoom in</button>
      <span className="crs-muted">{c.size}px square{c.size < 600 ? ' (small: the puzzle may look soft)' : ''}</span>
    </div>}
  </div>;
}

function CropPreview({url, crop, nat, grid}) {
  const k = 100 / crop.size; // % of the square per source px
  const style = {backgroundImage: `url(${url})`, backgroundSize: `${nat.w * k}% ${nat.h * k}%`,
    backgroundPosition: `${nat.w === crop.size ? 0 : (crop.x / (nat.w - crop.size)) * 100}% ${nat.h === crop.size ? 0 : (crop.y / (nat.h - crop.size)) * 100}%`};
  return <div className="crs-crop-preview">
    <span className="crs-muted">Before saving:</span>
    <div className="crs-tile-show is-small" style={style}><i className="crs-tile-hole" style={{'--g': grid}}/></div>
  </div>;
}

const FORMS = {belong: PictureForm, older: PictureForm, compare: PictureForm, which: PictureForm, price: PriceForm,
  photo: PhotoForm, tile: TileForm, animal: AnimalForm, vote: VoteForm};

// ------------------------------------------------------------------ play preview (the real game screen)

function PlayPreview({id, type, stamp, dirty}) {
  const [lang, setLang] = useState('ar');
  const [task, setTask] = useState(null);
  const [which, setWhich] = useState('draft');
  const [picked, setPicked] = useState(null);
  const [err, setErr] = useState('');
  const [reveal, setReveal] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    setTask(null); setPicked(null); setErr('');
    call('get', `/items/${encodeURIComponent(id)}/preview?which=${which}`).then(setTask).catch(x => setErr(apiErrorMessage(x)));
  }, [id, which, stamp, n]);
  const t = TEXT[lang];
  const View = task && TASK_VIEWS[task.type];
  const prompt = !task || task.type === 'photo' ? null : task.type === 'vote' ? task.text[lang === 'ar' ? 0 : 1]
    : PICTURE_KINDS.includes(task.type) ? picturePrompt(task, lang)
    : task.type === 'animal' ? t.animal(lang === 'ar' ? task.target[1] : task.target[2]) : t.prompts[task.type];
  const roster = [{id: 'p1', name: 'Noor'}, {id: 'p2', name: 'Hamad'}, {id: 'p3', name: 'Sara'}];
  return <section className="crs-preview">
    <div className="crs-actions">
      <select value={lang} onChange={e => setLang(e.target.value)} aria-label="Language"><option value="ar">العربية</option><option value="en">English</option></select>
      <select value={which} onChange={e => setWhich(e.target.value)} aria-label="Version"><option value="draft">Saved draft</option><option value="live">Live version</option></select>
      <button type="button" className="crs-btn is-small" onClick={() => setN(x => x + 1)}>Shuffle again</button>
      <label className="crs-inline"><input type="checkbox" checked={reveal} onChange={e => setReveal(e.target.checked)}/> Show answer</label>
    </div>
    {dirty && <p className="crs-muted">Preview shows the last saved draft.</p>}
    {err && <p className="crs-error">{err}</p>}
    {task && View && <main className={`cr-app ${ARCADE ? 'cr-arcade' : ''} cr-race crs-phone`} style={ARCADE ? ARCADE_VARS : undefined} dir={t.dir} lang={lang} data-typography-ignore>
      {ARCADE ? <div className="cr-backdrop is-arcade" aria-hidden="true"><i className="cr-room"/><i className="cr-room-light"/><i className="cr-room-wash"/></div>
        : <div className="cr-backdrop" aria-hidden="true"/>}
      <section className={`cr-stage ${ARCADE ? 'cr-open' : ''} cr-stage-${task.type}`}>
        <div className={ARCADE ? 'cr-open-body' : ''}>
          <div className="cr-play">
            {prompt && <h2 className="cr-prompt" dir="auto">{prompt}</h2>}
            <div className="cr-task-body">
              <View task={task} t={t} lang={lang} onPick={i => setPicked(i)} onWord={() => {}} inputRef={{current: null}}
                roster={roster} players={roster} me="p0" index={0}/>
            </div>
          </div>
        </div>
      </section>
      {picked !== null && task.type !== 'vote' && <div className={`crs-verdict ${picked === task.answer ? 'is-right' : 'is-wrong'}`} onClick={() => setPicked(null)}>
        {picked === task.answer ? 'Right' : `Wrong (answer: ${task.answer + 1})`}</div>}
    </main>}
    {task && reveal && task.answer != null && <p className="crs-muted">Correct answer: option {task.answer + 1} in this shuffled order.</p>}
  </section>;
}

// ================================================================== pictures

function Uploader({onDone, compact}) {
  const [files, setFiles] = useState([]);
  const [credit, setCredit] = useState({source: '', license: '', author: ''});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const send = async () => {
    setBusy(true); setMsg('');
    try {
      const form = new FormData();
      files.forEach(f => form.append('files', f));
      Object.entries(credit).forEach(([k, v]) => form.append(k, v));
      const r = await call('post', '/assets', form);
      setMsg(`${r.saved.length} uploaded${r.failed.length ? `; ${r.failed.map(f => `${f.name}: ${f.reason}`).join(' • ')}` : ''}`);
      setFiles([]);
      onDone(r.saved);
    } catch (x) { setMsg(apiErrorMessage(x, 'Upload failed.')); }
    finally { setBusy(false); }
  };
  return <div className={`crs-upload ${compact ? 'is-compact' : ''}`}>
    <input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={e => setFiles([...e.target.files].slice(0, 20))}/>
    <div className="crs-row3">
      <input placeholder="Source (link or where it's from)" value={credit.source} onChange={e => setCredit({...credit, source: e.target.value})}/>
      <input placeholder="License (e.g. CC BY-SA 4.0, owned)" value={credit.license} onChange={e => setCredit({...credit, license: e.target.value})}/>
      <input placeholder="Author / photographer" value={credit.author} onChange={e => setCredit({...credit, author: e.target.value})}/>
    </div>
    <button className="crs-btn is-primary" disabled={busy || !files.length} onClick={send}>{busy ? 'Uploading…' : `Upload ${files.length || ''} picture${files.length === 1 ? '' : 's'}`}</button>
    <span className="crs-muted">JPG, PNG or WebP, up to 12 MB, at least 200px. Originals are kept.</span>
    {msg && <p className="crs-muted" role="status">{msg}</p>}
  </div>;
}

function useAssets() {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => call('get', '/assets').then(r => setList(r.assets)).catch(x => setErr(apiErrorMessage(x))), []);
  useEffect(() => { load(); }, [load]);
  return [list, load, err];
}

function PicturePicker({onPick, onClose}) {
  const [list, load, err] = useAssets();
  const [q, setQ] = useState('');
  const shown = (list || []).filter(a => !q || `${a.name} ${a.id} ${JSON.stringify(a.credit || {})}`.toLowerCase().includes(q.toLowerCase()));
  return <Modal title="Choose a picture" onClose={onClose}>
    <Uploader compact onDone={saved => { load(); if (saved.length === 1) onPick(saved[0].ref); }}/>
    <input type="search" placeholder="Search pictures" value={q} onChange={e => setQ(e.target.value)}/>
    {err && <p className="crs-error">{err}</p>}
    <ul className="crs-assets">{shown.filter(a => a.kind === 'upload' || !a.kind).map(a => <li key={a.id}>
      <button onClick={() => onPick(a.ref)}><img src={anyUrl(a.thumb || a.url)} alt="" loading="lazy"/><span>{a.name || a.id}</span></button>
    </li>)}</ul>
    {list && !shown.length && <p className="crs-muted">No uploaded pictures yet. Upload one above.</p>}
  </Modal>;
}

function PicturesModal({onClose}) {
  const [list, load, err] = useAssets();
  const [edit, setEdit] = useState(null);
  const saveCredit = async () => {
    try { await call('patch', `/assets/${edit.id}`, edit.credit); setEdit(null); load(); } catch (x) { window.alert(apiErrorMessage(x)); }
  };
  return <Modal title="Pictures" onClose={onClose} wide>
    <Uploader onDone={load}/>
    {err && <p className="crs-error">{err}</p>}
    <ul className="crs-assets is-detail">{(list || []).map(a => <li key={a.id}>
      <img src={anyUrl(a.thumb || a.url)} alt="" loading="lazy" onError={e => { e.currentTarget.classList.add('is-broken'); }}/>
      <div>
        <b>{a.name || a.id}</b>
        <span className="crs-muted">{a.w}×{a.h} · {a.kind || 'upload'} · {a.uploaded_by} {(a.uploaded_at || '').slice(0, 10)}</span>
        <span className="crs-muted">{a.used_by.length ? `Used by ${a.used_by.join(', ')}` : 'Not used'}</span>
        {edit?.id === a.id ? <div className="crs-row3">
          {['source', 'license', 'author'].map(k => <input key={k} placeholder={k} value={edit.credit[k] || ''} onChange={e => setEdit({...edit, credit: {...edit.credit, [k]: e.target.value}})}/>)}
          <button className="crs-btn is-small" onClick={saveCredit}>Save credit</button>
        </div> : <span className="crs-muted">{Object.values(a.credit || {}).join(' · ') || 'No credit recorded'} <button className="crs-link" onClick={() => setEdit({id: a.id, credit: {...(a.credit || {})}})}>edit</button></span>}
        {a.original && <a className="crs-link" href={anyUrl(a.original)} target="_blank" rel="noreferrer">Original</a>}
      </div>
    </li>)}</ul>
  </Modal>;
}

// ================================================================== publishing

function PublishModal({onClose, onDone, types}) {
  const [p, setP] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { call('get', '/pending').then(setP).catch(x => setErr(apiErrorMessage(x))); }, []);
  const go = async () => {
    setBusy(true); setErr('');
    try { const r = await call('post', '/publish', {rev: p.rev}); onDone(`Published ${r.changes.length} change${r.changes.length === 1 ? '' : 's'}. New rounds use them now.`); }
    catch (x) { setErr(apiErrorMessage(x)); }
    finally { setBusy(false); }
  };
  const groups = (p?.changes || []).reduce((g, c) => { (g[c.what] = g[c.what] || []).push(c); return g; }, {});
  return <Modal title="Publish approved changes" onClose={onClose}>
    {!p && !err && <p>Loading…</p>}
    {p && <>
      <p>These changes go into new rounds as soon as you confirm. Rounds already being played keep their questions.</p>
      {Object.entries(groups).map(([what, list]) => <div key={what}><h3>{{new: 'New questions', updated: 'Updated questions', removed: 'Taken out (rejected)', 'back live': 'Back in the game'}[what] || what} ({list.length})</h3>
        <ul className="crs-list">{list.map(c => <li key={c.id}>{c.id} <span className="crs-muted">{types[c.type]}</span></li>)}</ul></div>)}
      {!p.changes.length && <p className="crs-muted">Nothing waiting.</p>}
    </>}
    {err && <p className="crs-error">{err}</p>}
    <div className="crs-actions">
      <button className="crs-btn is-primary" disabled={busy || !p?.changes.length} onClick={go}>{busy ? 'Publishing…' : 'Confirm and publish'}</button>
      <button className="crs-btn is-ghost" onClick={onClose}>Cancel</button>
    </div>
  </Modal>;
}

function HistoryModal({lib, onClose, onDone}) {
  const [err, setErr] = useState('');
  const revert = async rev => {
    if (!window.confirm(`Undo publish #${rev}? The questions it changed go back to what was live before.`)) return;
    try { await call('post', `/publish/${rev}/revert`); onDone(`Publish #${rev} reverted.`); }
    catch (x) { setErr(apiErrorMessage(x)); }
  };
  return <Modal title="Publish history" onClose={onClose}>
    {err && <p className="crs-error">{err}</p>}
    {!lib.publishes.length && <p className="crs-muted">Nothing published from the studio yet.</p>}
    <ul className="crs-list">{lib.publishes.map(p => <li key={p.rev} className="crs-pub">
      <div><b>#{p.rev}</b> {p.kind === 'revert' ? `undid #${p.of}` : 'publish'} · {p.by} · {p.at.replace('T', ' ').slice(0, 16)} UTC
        <span className="crs-muted"> · {p.changes.length} change{p.changes.length === 1 ? '' : 's'}: {p.changes.slice(0, 6).map(c => c.id).join(', ')}{p.changes.length > 6 ? '…' : ''}</span></div>
      {p.kind === 'publish' && !p.reverted_by_rev && <button className="crs-btn is-small" onClick={() => revert(p.rev)}>Revert</button>}
      {p.reverted_by_rev && <span className="crs-muted">reverted in #{p.reverted_by_rev}</span>}
    </li>)}</ul>
  </Modal>;
}

function NewModal({types, onClose, onMade}) {
  const [type, setType] = useState('tile');
  const [err, setErr] = useState('');
  const blank = {
    tile: {title: ''}, photo: {mode: 'ask', ar: '', en: '', options: [['', ''], ['', ''], ['', ''], ['', '']]},
    price: {options: [{key: '', ar: '', en: '', unit_usd: 0, quantity: 1}, {key: '', ar: '', en: '', unit_usd: 0, quantity: 1}]},
    animal: {key: '', ar: '', en: ''}, vote: {ar: '', en: ''},
  };
  const make = async () => {
    try {
      const data = blank[type] || {ar: '', en: '', options: Array.from({length: OPTION_COUNT[type]}, () => ['', '', '']), difficulty: 'medium'};
      const r = await call('post', '/items', {type, data});
      onMade(r.id);
    } catch (x) { setErr(apiErrorMessage(x)); }
  };
  return <Modal title="New question" onClose={onClose}>
    <Field label="Type"><select value={type} onChange={e => setType(e.target.value)}>
      {Object.entries(types).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
    <p className="crs-muted">It starts as a draft and only reaches players after you approve and publish it.</p>
    {err && <p className="crs-error">{err}</p>}
    <div className="crs-actions"><button className="crs-btn is-primary" onClick={make}>Create draft</button></div>
  </Modal>;
}

function Modal({title, children, onClose, wide}) {
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return <div className="crs-modal-back" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`crs-modal ${wide ? 'is-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="crs-modal-head"><h2>{title}</h2><button className="crs-btn is-ghost" onClick={onClose}>Close</button></div>
      {children}
    </div>
  </div>;
}
