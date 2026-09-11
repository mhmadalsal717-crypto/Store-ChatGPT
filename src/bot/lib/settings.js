// ============================================================
//  الإعدادات والنصوص والإيموجي — مكاشّة بالذاكرة
//  كل شي هون بيتعدّل من لوحة الأدمن بدون لمس الكود.
// ============================================================
import { db } from './db.js';

let cache = { settings: {}, texts: {}, emoji: {}, tiers: [], at: 0 };
const TTL = 60_000;

export async function loadAll(force = false) {
  if (!force && Date.now() - cache.at < TTL) return cache;

  const [s, t, e, ti] = await Promise.all([
    db.from('settings').select('key, value'),
    db.from('texts').select('key, content'),
    db.from('ui_emoji').select('key, fallback, custom_id'),
    db.from('tiers').select('*').order('sort_order'),
  ]);

  cache = {
    settings: Object.fromEntries((s.data || []).map((r) => [r.key, r.value])),
    texts:    Object.fromEntries((t.data || []).map((r) => [r.key, r.content])),
    emoji:    Object.fromEntries((e.data || []).map((r) => [r.key, r])),
    tiers:    ti.data || [],
    at: Date.now(),
  };
  return cache;
}

/** استدعِها بعد أي تعديل من لوحة الأدمن */
export const invalidate = () => { cache.at = 0; };

export const S    = (k, d = '')  => cache.settings[k] ?? d;
export const Snum = (k, d = 0)   => { const v = Number(cache.settings[k]); return Number.isFinite(v) ? v : d; };
export const Sbool= (k, d = false) => {
  const v = cache.settings[k];
  return v === undefined ? d : (v === 'on' || v === 'true' || v === '1');
};
export const T = (k, d = '') => cache.texts[k] ?? d;
export const tiers = () => cache.tiers;

/**
 * إيموجي: بيرجع الوسم المخصص إذا البريميوم مفعّل وفي custom_id،
 * وإلا بيرجع الإيموجي العادي. الوسم بيتضمن الإيموجي العادي كبديل
 * فما بينكسر عند المستخدمين العاديين.
 */
export function E(key) {
  const row = cache.emoji[key];
  if (!row) return '';
  if (Sbool('premium_emoji') && row.custom_id) {
    return `<tg-emoji emoji-id="${row.custom_id}">${row.fallback}</tg-emoji>`;
  }
  return row.fallback;
}

export async function setSetting(key, value) {
  await db.from('settings').update({ value: String(value) }).eq('key', key);
  invalidate();
}
export async function setText(key, content) {
  await db.from('texts').upsert({ key, content }, { onConflict: 'key' });
  invalidate();
}
export async function setEmoji(key, customId) {
  await db.from('ui_emoji').update({ custom_id: customId || null }).eq('key', key);
  invalidate();
}
