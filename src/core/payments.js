// ============================================================
//  طبقة الدفعات المشتركة
//  كل الطرق بتمرق من هون: إنشاء نية دفع -> شحن ذرّي عند التأكيد.
// ============================================================
import crypto from 'node:crypto';
import { db, rpc } from '../lib/db.js';
import { Snum } from '../lib/settings.js';

export const newOrderId = (method, tgId) =>
  `${method.toLowerCase()}-${tgId}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;

/** حدود الإيداع */
export const depositLimits = () => ({
  min: Snum('deposit_min', 1),
  max: Snum('deposit_max', 10000),
});

/** إنشاء نية دفع بحالة PENDING */
export async function openPayment({ tgId, method, amountUsd, stars = null, minutes = 60, extra = {} }) {
  const { data: u } = await db.from('users').select('id').eq('tg_id', tgId).single();
  const orderId = newOrderId(method, tgId);

  const { data, error } = await db.from('payments').insert({
    user_id: u.id, method, amount_usd: amountUsd, stars,
    order_id: orderId,
    expires_at: new Date(Date.now() + minutes * 60_000).toISOString(),
    payload: extra,
  }).select().single();

  if (error) throw error;
  return data;
}

export const setPayment = (orderId, patch) =>
  db.from('payments').update({ ...patch, updated_at: new Date().toISOString() })
    .eq('order_id', orderId);

export const getPaymentRow = async (orderId) => {
  const { data } = await db.from('payments')
    .select('*, users!inner(tg_id)').eq('order_id', orderId).maybeSingle();
  return data;
};

/**
 * شحن الرصيد. آمن للتكرار بالكامل:
 * الويبهوك ممكن يجي مرتين، والأدمن ممكن يضغط موافقة مرتين.
 * @returns {{credited, new_balance, amount}} credited=false يعني انشحنت من قبل
 */
export async function creditPayment(orderId, externalId = null) {
  const [row] = await rpc('credit_payment', { p_order_id: orderId, p_external: externalId });
  // أسماء المخرجات مسبوقة بـ out_ لتفادي التعارض مع أعمدة payments
  return {
    credited:    row?.out_credited === true,
    new_balance: Number(row?.out_balance ?? 0),
    amount:      Number(row?.out_amount ?? 0),
  };
}

/** تنظيف الجلسات المنتهية */
export async function expireStale() {
  // ⚠️ ما منلغي دفعة بايننس الزبون لصق فيها رقم العملية وهي بانتظار
  //    مراجعة الأدمن — وإلا بتختفي من طابور المراجعة والزبون بيضيع حقه.
  const { data } = await db.from('payments')
    .update({ status: 'EXPIRED', updated_at: new Date().toISOString() })
    .eq('status', 'PENDING')
    .lt('expires_at', new Date().toISOString())
    .is('external_id', null)
    .select('order_id');
  return data?.length || 0;
}
