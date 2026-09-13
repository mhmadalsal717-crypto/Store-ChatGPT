// ============================================================
//  تدفّق الشراء — قلب النظام
//
//  الترتيب إلزامي:
//   1. اخصم من الزبون + افتح طلب PENDING  (عملية ذرّية واحدة)
//   2. نادِ GGSoma بنفس الـ externalOrderId
//   3. نجح       -> COMPLETED + سلّم
//      فشل نهائي -> رجّع الرصيد + REFUNDED
//      فشل مؤقت  -> اتركه PENDING ولا ترجّع شي
//
//  ليش ما نرجّع الرصيد على الـ timeout؟
//  لأن الطلب ممكن يكون نجح فعلياً عندهم وانقطع الرد بس.
//  لو رجّعنا: نحنا دفعنا والزبون أخد فلوسه. المُصالح بيحسمها.
// ============================================================
import crypto from 'node:crypto';
import { gg, GGError } from '../lib/ggsoma.js';
import { db, rpc } from '../lib/db.js';
import { Snum } from '../lib/settings.js';
import { getProduct } from './catalog.js';
import { isHealthy } from './health.js';
import { finalPrice } from './pricing.js';
import { checkMargin } from './guard.js';

export const newExternalId = (tgId) =>
  `ax-${tgId}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;

/**
 * @returns {{state:'DELIVERED'|'PENDING'|'FAILED', ...}}
 */
export async function purchase({ tgId, slug, quantity = 1, user, notifyAdmin }) {
  // بوابة الصيانة — §16 بالوثائق: افحص /health قبل الطلبات.
  // منرفض من هون قبل أي خصم، بدل ما نخصم وبعدين نفشل ونرجّع.
  if (!isHealthy()) {
    return fail('الخدمة بصيانة مؤقتة عند المزوّد. جرّب بعد شوي — ما انخصم منك شي.');
  }

  const product = await getProduct(slug);
  if (!product || !product.visible || product.deleted_at)
                                                     return fail('المنتج مو متوفّر حالياً.');
  if (product.paused)                                return fail('البيع موقوف مؤقتاً على هالمنتج.');
  if (!product.in_stock || product.stock_count < quantity)
                                                     return fail('المنتج نفد من المخزون.');
  if (quantity < 1 || quantity > (product.max_quantity || 1))
                                                     return fail('الكمية غير صالحة.');

  // دفاع أخير: لا تبيع بخسارة حتى لو الحارس ما لحق يوقفه
  const m = checkMargin(product);
  if (!m.ok) {
    notifyAdmin?.(`⛔️ حاول زبون يشتري <b>${product.name}</b> بهامش ${m.marginPct.toFixed(1)}% — رفضنا.`);
    return fail('البيع موقوف مؤقتاً على هالمنتج.');
  }

  const unit   = finalPrice(product, user);
  const charge = round2(unit * quantity);
  const cost   = round2(Number(product.cost_price) * quantity);
  const ext    = newExternalId(tgId);

  // ---------- 1) خصم ذرّي ----------
  try {
    await rpc('debit_and_open_order', {
      p_tg_id: tgId, p_slug: slug, p_name: product.name,
      p_provider: product.provider_key, p_qty: quantity,
      p_charge: charge, p_cost: cost, p_ext: ext,
    });
  } catch (e) {
    if (e.code === 'INSUFFICIENT_BALANCE') {
      return { state: 'FAILED', code: 'INSUFFICIENT_BALANCE', required: charge,
               message: `رصيدك ما بيكفي. المطلوب ${charge.toFixed(2)}$` };
    }
    throw e;
  }

  // ---------- 2) نفّذ ----------
  return attemptFulfil({ ext, slug, quantity, charge, notifyAdmin });
}

/** آمنة للتكرار: نفس الـ externalOrderId => نفس الطلب بدون خصم تاني */
export async function attemptFulfil({ ext, slug, quantity, charge, notifyAdmin }) {
  const { data: cur } = await db.from('orders')
    .select('attempts').eq('external_order_id', ext).maybeSingle();

  await db.from('orders').update({
    attempts: (cur?.attempts ?? 0) + 1,
    last_attempt_at: new Date().toISOString(),
  }).eq('external_order_id', ext);

  let res;
  try {
    res = await gg.createOrder({ productSlug: slug, quantity, externalOrderId: ext });
  } catch (err) {
    const e = err instanceof GGError ? err : new GGError('UNKNOWN', String(err));

    // (أ) نهائي -> رجّع
    if (e.isTerminal) {
      await rpc('refund_order', { p_ext: ext, p_error_code: e.code });
      return { state: 'FAILED', code: e.code, message: humanError(e.code) };
    }

    // (ب) خلل بحسابنا عندهم -> رجّع + نبّه فوراً
    if (e.isAccount) {
      await rpc('refund_order', { p_ext: ext, p_error_code: e.code });
      notifyAdmin?.(`🚨 خلل بحساب GGSoma: <code>${e.code}</code>\n${e.message}\nreq: ${e.requestId || '—'}`);
      return { state: 'FAILED', code: e.code,
               message: 'خلل مؤقت بالنظام. رجّعنالك رصيدك، جرّب بعد شوي.' };
    }

    // (ج) مؤقت -> اتركه PENDING
    await db.from('orders')
      .update({ error_code: e.code, updated_at: new Date().toISOString() })
      .eq('external_order_id', ext).eq('status', 'PENDING');

    return { state: 'PENDING', code: e.code,
             message: 'طلبك قيد التنفيذ. رح يوصلك التسليم تلقائياً.' };
  }

  return finishOrder(ext, res, charge, notifyAdmin);
}

export async function finishOrder(ext, res, charge, notifyAdmin) {
  const actual = Number(res.totalCharged ?? 0);
  const unit   = Number(res.unitPrice ?? actual);

  if (charge != null && actual > Number(charge)) {
    notifyAdmin?.(
      `⚠️ <b>خسارة بالهامش</b>\nطلب: <code>${ext}</code>\n` +
      `📦 ${res.product?.name || res.product?.slug || '—'}\n` +
      `خصمنا من الزبون: ${Number(charge).toFixed(2)}$\n` +
      `GGSoma خصمت منّا: ${actual.toFixed(2)}$ (وحدة ${unit.toFixed(2)}$)\n` +
      `راجع التسعير — الحارس رح يوقف المنتج بالمزامنة الجاية.`
    );
  }

  // balanceAfter بيجي بأول POST ناجح فقط (§11) — بيوفّر علينا نداء /balance
  if (res.balanceAfter != null) {
    const left = Number(res.balanceAfter);
    const threshold = Snum('low_wallet_alert', 20);
    if (left < threshold) {
      notifyAdmin?.(
        `⚠️ <b>رصيدك عند GGSoma: ${left.toFixed(2)}$</b>\n` +
        `اشحن فوراً — لما يفضى بيوقف البيع لكل زبائنك.`
      );
    }
  }

  const delivery = res.lines?.length ? { lines: res.lines } : (res.delivery || null);

  await rpc('complete_order', {
    p_ext: ext,
    p_gg_code: res.orderCode || null,
    p_actual: actual,
    p_delivery: delivery,
    p_ref_pct: Snum('referral_pct', 0),
  });

  return { state: 'DELIVERED', order: res, delivery, deliveryType: res.deliveryType };
}

const fail = (message) => ({ state: 'FAILED', message });
const round2 = (n) => Math.round(Number(n) * 100) / 100;

function humanError(code) {
  return ({
    OUT_OF_STOCK:              'المنتج نفد من المخزون. رجّعنالك رصيدك.',
    PRODUCT_NOT_FOUND:         'المنتج ما عاد متوفّر. رجّعنالك رصيدك.',
    PRODUCT_UNAVAILABLE:       'المنتج معطّل مؤقتاً. رجّعنالك رصيدك.',
    PRODUCT_NOT_ALLOWED:       'المنتج غير متاح. رجّعنالك رصيدك.',
    INVALID_QUANTITY:          'الكمية غير صالحة. رجّعنالك رصيدك.',
    UNSUPPORTED_DELIVERY_TYPE: 'نوع التسليم غير مدعوم. رجّعنالك رصيدك.',
  }[code]) || 'صار خطأ بالطلب. رجّعنالك رصيدك كامل.';
}
