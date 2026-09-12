// ============================================================
//  Telegram Stars — دفع أصلي داخل تلغرام
//
//  العملة XTR. السعر بيتحدد بعدد النجوم مباشرة (مو بالسنتات).
//  ما في provider_token — تلغرام هو المعالج.
//
//  التدفق:
//    1. sendInvoice(currency: 'XTR')
//    2. pre_checkout_query  -> لازم نجاوب خلال 10 ثواني
//    3. successful_payment  -> نشحن الرصيد
//
//  الاسترجاع ممكن عبر refundStarPayment بـ charge_id.
// ============================================================
import { Snum, S } from '../lib/settings.js';

/** كم دولار بتساوي النجمة الوحدة (قابل للتعديل من لوحة التحكم) */
export const rate = () => Snum('stars_rate', 0.009);

export const starsToUsd = (stars) => round2(Number(stars) * rate());
export const usdToStars = (usd)   => Math.ceil(Number(usd) / rate());

/** الباقات الجاهزة — من الإعدادات، مثال: "50,100,250,500,1000" */
export function packs() {
  return String(S('stars_packs', '50,100,250,500,1000'))
    .split(',').map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export const limits = () => ({
  min: Snum('stars_min', 50),
  max: Snum('stars_max', 100000),
});

/**
 * إرسال فاتورة نجوم.
 * منستعمل api.raw حتى نمرّر الحقول صراحة بدون التباس بترتيب الوسائط.
 */
export function sendStarsInvoice(api, { chatId, stars, orderId, title, description }) {
  return api.raw.sendInvoice({
    chat_id: chatId,
    title,
    description,
    payload: orderId,          // بيرجعلنا بـ successful_payment
    currency: 'XTR',
    prices: [{ label: `${stars} ⭐️`, amount: stars }],
    // ما في provider_token مع النجوم
  });
}

/** استرجاع دفعة نجوم (للأدمن عند الحاجة) */
export const refund = (api, userId, chargeId) =>
  api.raw.refundStarPayment({ user_id: userId, telegram_payment_charge_id: chargeId });

const round2 = (n) => Math.round(Number(n) * 100) / 100;
