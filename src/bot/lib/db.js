Enterimport { createClient } from '@supabase/supabase-js';
import { cfg } from '../config.js';

export const db = createClient(cfg.db.url, cfg.db.key, { auth: { persistSession: false } });

const KNOWN = /(INSUFFICIENT_BALANCE|USER_NOT_FOUND|ORDER_NOT_FOUND|VOUCHER_INVALID|NO_BINANCE_ID)/;

/** استدعاء دالة Postgres مع تحويل الاستثناء لكود نظيف */
export async function rpc(fn, args) {
  const { data, error } = await db.rpc(fn, args);
  if (error) {
    const m = KNOWN.exec(error.message || '');
    const e = new Error(m ? m[1] : error.message);
    e.code = m ? m[1] : 'DB_ERROR';
    throw e;
  }
  return data;
}

export async function ensureUser(from) {
  const { data } = await db.from('users').select('*').eq('tg_id', from.id).maybeSingle();
  if (data) return data;
  const { data: created, error } = await db.from('users').insert({
    tg_id: from.id,
    username: from.username || null,
    first_name: from.first_name || null,
    ref_code: 'r' + Number(from.id).toString(36),
  }).select().single();
  if (error) throw error;
  return created;
}
