// Where a Clock Race picture lives. Built-in pictures are files in public/clock-race/; pictures made in
// the studio (/admin/clock-race) arrive as full urls (Supabase Storage) or as /api/... paths on the backend.
import {BACKEND_URL} from '@/lib/api';
import {ART, ART_BASE} from './artManifest';

const absolute = u => (u.startsWith('/api/') ? `${BACKEND_URL}${u}` : u);
const isUrl = v => typeof v === 'string' && (/^https?:\/\//.test(v) || v.startsWith('/api/'));

export const artUrl = k => (isUrl(k) ? absolute(k) : ART[k] ? `${ART_BASE}${ART[k]}` : null);
export const photoUrl = pic => (isUrl(pic) ? absolute(pic) : `/clock-race/photos/${pic}.webp`);
export const priceUrl = o => (o.img ? absolute(o.img) : `${ART_BASE}prices/${o.key}.webp`);
export const tileUrls = task => (task.img
  ? [absolute(task.img), absolute(task.piece)]
  : [`/clock-race/tiles/${task.pic}.webp`, `/clock-race/tiles/${task.pic}-piece.webp`]);
export const anyUrl = u => (isUrl(u) ? absolute(u) : u);
