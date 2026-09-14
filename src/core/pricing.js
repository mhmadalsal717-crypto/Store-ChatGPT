// ============================================================
//  التسعير
//
//  وضعين، بينتبدّلوا من إعداد margin_mode:
//
//  flat (الافتراضي) — مبلغ ثابت بالدولار حسب شريحة التكلفة:
//      تكلفة أقل من 15$  ← +1.00$
//      من 15$ لـ 25$     ← +1.50$
//      فوق 25$           ← +2.00$
//    الشرائح بجدول margin_tiers وبتتعدّل من لوحة التحكم.
//
//  percent — الطريقة القديمة: تكلفتك × (1 + الهامش%)
//
//  ── تتبّع التكلفة ──
//  التكلفة بتنقرأ من GGSoma كل مزامنة والسعر بينحسب من جديد،
//  فبيتحرّك لوحده بالاتجاهين:
//      تكلفة 2.00$ ← بيعك 3.00$
//      ارتفعت 3.00$ ← بيعك 4.00$
//      نزلت  1.50$ ← بيعك 2.50$
//  الشي الوحيد يلي بيكسر التتبّع هو السعر اليدوي (price_override):
//  لما تحطه، المنتج بيوقف عن متابعة التكلفة لحد ما تشيله.
// ============================================================
import { S as Sraw, Snum, Sbool, tiers, margins } from '../lib/settings.js';

export const round2 = (n) => Math.round(Number(n) * 100) / 100;

/** أعلى خصم مستوى موجود — أسوأ حالة للهامش */
export const maxTierDiscount = () =>
  tiers().reduce((m, t) => Math.max(m, Number(t.discount_pct) || 0), 0);

/**
 * السعر الأساسي من التكلفة.
 *
 * مع «ضمان الهامش بعد الخصم» مفعّل، منرفع السعر بحيث الهامش
 * بيضل 40% حتى للزبون صاحب أعلى مستوى. بدونه، خصم المستوى
 * بياكل من هامشك.
 */
/**
 * المبلغ المضاف حسب شريحة التكلفة.
 *
 * up_to شامل: «حتى 14.99$» يعني 14.99 داخلة. هيك 15.00 بالضبط
 * بتوقع بالشريحة التانية و25.00 بالضبط بتضل فيها — يلي هو
 * المطلوب: أقل من 15 ← +1، من 15 لـ 25 ← +1.5، فوق 25 ← +2.
 *
 * الشريحة الأخيرة up_to = null يعني «كل ما فوق».
 */
export function flatAdd(cost) {
  const c = Number(cost) || 0;
  const list = margins();
  if (!list.length) return Snum('flat_add_default', 1);

  for (const m of list) {
    if (m.up_to == null || c <= Number(m.up_to)) return Number(m.add_usd) || 0;
  }
  return Number(list[list.length - 1].add_usd) || 0;
}

export function basePrice(cost, markupPct) {
  const step = Snum('round_to', 0) || 0.01;
  const floor = Snum('min_price', 0);
  const c = Number(cost) || 0;

  let raw = flatMode()
    ? c + flatAdd(c)
    : c * (1 + Number(markupPct) / 100);

  if (Sbool('margin_after_discount', false)) {
    const d = maxTierDiscount();
    if (d > 0 && d < 100) raw = raw / (1 - d / 100);
  }

  const rounded = step > 0 ? Math.ceil(raw / step) * step : raw;
  return round2(Math.max(rounded, floor));
}

/** الهامش الفعّال لمنتج: الخاص فيه أو العام */
/** وضع الهامش الحالي — flat افتراضياً */
export const flatMode = () => String(Sraw('margin_mode', 'flat')) !== 'percent';

/** الهامش الفعّال لمنتج: الخاص فيه أو العام */
export const effMarkup = (p) =>
  p?.markup_pct != null ? Number(p.markup_pct) : Snum('markup_pct', 40);

/** السعر المعروض: يدوي إن وُجد، وإلا المحسوب (يلي بيتحرّك مع التكلفة) */
export const listPrice = (p) =>
  p?.price_override != null ? Number(p.price_override) : Number(p?.sell_price || 0);

/** هل هالمنتج بيتابع التكلفة تلقائياً؟ */
export const isAutoPriced = (p) => p?.price_override == null;

/** مستوى المستخدم حسب إجمالي إنفاقه */
export function tierOf(totalSpent) {
  const list = tiers();
  if (!list.length) return null;
  const spent = Number(totalSpent || 0);
  let cur = list[0];
  for (const t of list) if (spent >= Number(t.min_spent)) cur = t;
  return cur;
}

export function nextTier(totalSpent) {
  const spent = Number(totalSpent || 0);
  return tiers().find((t) => Number(t.min_spent) > spent) || null;
}

/** السعر النهائي للزبون بعد خصم مستواه */
export function finalPrice(product, user) {
  const base = listPrice(product);
  const t = tierOf(user?.total_spent);
  const disc = t ? Number(t.discount_pct) : 0;
  return disc ? round2(base * (1 - disc / 100)) : round2(base);
}

/** تفصيل الهامش لمنتج — مستعمل بلوحة التحكم والحارس */
export function marginOf(product) {
  const cost = Number(product?.cost_price) || 0;
  const list = listPrice(product);
  const floor = round2(list * (1 - maxTierDiscount() / 100));

  return {
    cost,
    list,                                                    // سعر العرض
    floor,                                                   // أوطى سعر بيدفعه زبون
    profit: round2(list - cost),                             // ربحك بالسعر العادي
    minProfit: round2(floor - cost),                         // ربحك بأسوأ حالة
    pct:    cost > 0 ? ((list - cost) / cost) * 100 : 0,
    minPct: cost > 0 ? ((floor - cost) / cost) * 100 : 0,
    auto: isAutoPriced(product),
  };
}
