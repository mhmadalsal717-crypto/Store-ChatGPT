// ============================================================
//  المُصالِح — بيحسم الطلبات العالقة
//  بدونه كل انقطاع شبكة بيصير زبون مخصوم وما تسلّم.
// ============================================================
import { gg, GGError } from '../lib/ggsoma.js';
import { db, rpc } from '../lib/db.js';
import { Snum } from '../lib/settings.js';
import { finishOrder } from './purchase.js';

const MAX_ATTEMPTS = 6;
const MIN_AGE_MS   = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function reconcileOnce({ notifyAdmin, notifyUser }) {
  const cutoff = new Date(Date.now() - MIN_AGE_MS).toISOString();
  const { data: stuck } = await db.from('orders')
    .select('*, users!inner(tg_id)')
    .eq('status', 'PENDING').lt('created_at', cutoff)
    .order('created_at').limit(20);

  if (!stuck?.length) return 0;

  let n = 0;
  for (const o of stuck) {
    try { await resolveOne(o, { notifyAdmin, notifyUser }); n++; }
    catch (e) { console.error('[reconciler]', o.external_order_id, e.message); }
    await sleep(1200);   // احترم حد الطلبات
  }
  return n;
}

async function resolveOne(o, { notifyAdmin, notifyUser }) {
  const ext  = o.external_order_id;
  const tgId = o.users.tg_id;

  // 1) موجود عندهم أصلاً؟
  try {
    const found = await gg.findByExternalId(ext);
    const row = found?.data?.[0];
    if (row?.orderCode) {
      const full = await gg.getOrder(row.orderCode);
      const done = await finishOrder(ext, full, o.charged_usd, notifyAdmin);
      await notifyUser?.(tgId, done);
      return;
    }
  } catch (e) {
    if (e instanceof GGError && (e.isAccount || e.code === 'MAINTENANCE')) return;
  }

  // 2) استنفد المحاولات -> مراجعة يدوية (بدون إرجاع تلقائي)
  if (o.attempts >= MAX_ATTEMPTS) {
    await db.from('orders')
      .update({ status: 'NEEDS_REVIEW', updated_at: new Date().toISOString() })
      .eq('external_order_id', ext);
    notifyAdmin?.(
      `🔴 <b>طلب عالق يحتاج مراجعة</b>\n<code>${ext}</code>\n` +
      `منتج: ${o.product_slug}\nمخصوم: ${Number(o.charged_usd).toFixed(2)}$\n` +
      `آخر خطأ: ${o.error_code || '—'}\n\nافحص لوحة GGSoma قبل ما ترجّع الرصيد.`
    );
    return;
  }

  // 3) أعد المحاولة بنفس الـ id
  await db.from('orders').update({
    attempts: o.attempts + 1, last_attempt_at: new Date().toISOString(),
  }).eq('external_order_id', ext);

  try {
    const res = await gg.createOrder({
      productSlug: o.product_slug, quantity: o.quantity, externalOrderId: ext,
    });
    const done = await finishOrder(ext, res, o.charged_usd, notifyAdmin);
    await notifyUser?.(tgId, done);
  } catch (err) {
    const e = err instanceof GGError ? err : new GGError('UNKNOWN', String(err));
    if (e.isTerminal || e.isAccount) {
      await rpc('refund_order', { p_ext: ext, p_error_code: e.code });
      await notifyUser?.(tgId, {
        state: 'FAILED', message: 'تعذّر تنفيذ طلبك — رجّعنالك رصيدك كامل.',
      });
      return;
    }
    await db.from('orders').update({ error_code: e.code }).eq('external_order_id', ext);
  }
}

/**
 * فحص صحة الخدمة — موصى فيه بقائمة التكامل (§16).
 * وضع الصيانة بيوقف كل المسارات المحمية بـ 503.
 */
export async function checkHealth({ notifyAdmin }) {
  try {
    const h = await gg.health();
    if (h.maintenance) {
      notifyAdmin?.('🛠 GGSoma بوضع الصيانة — الطلبات موقوفة مؤقتاً. المُصالح رح يكمّلها لما ترجع.');
      return false;
    }
    return true;
  } catch (e) {
    notifyAdmin?.(`⚠️ ما قدرنا نوصل لـ GGSoma: ${e.code || e.message}`);
    return false;
  }
}

/** مراقبة رصيدنا عند GGSoma */
export async function checkWallet({ notifyAdmin }) {
  const threshold = Snum('low_wallet_alert', 20);
  try {
    const b = await gg.balance();
    const bal = Number(b.balance);
    if (bal < threshold) {
      notifyAdmin?.(`⚠️ رصيدك عند GGSoma: <b>${bal.toFixed(2)}$</b>\nاشحن قبل ما يوقف البيع.`);
    }
    return bal;
  } catch (e) {
    notifyAdmin?.(`⚠️ ما قدرنا نقرأ رصيد GGSoma: ${e.code || e.message}`);
    return null;
  }
}
