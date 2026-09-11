Enter// ============================================================
//  Binance Pay — تحويل يدوي بمعرّف الدفع
//
//  ليش يدوي؟ التحقق الآلي بدّه حساب تاجر (Binance Merchant) مع
//  عقد ومراجعة. المتاح لأي حد هو التحويل الداخلي المجاني عبر
//  Binance Pay ID — وهاد يلي بيستعمله GGSoma بالضبط.
//
//  التدفق:
//    1. منعرض معرّف الدفع + المبلغ + جلسة بتنتهي بعد 30 دقيقة
//    2. الزبون بيحوّل وبيلصق رقم العملية (TxID / Order ID)
//    3. بيوصلك بطاقة بلوحة التحكم فيها كل التفاصيل + زر موافقة/رفض
//
//  الموافقة بتشحن الرصيد ذرّياً عبر credit_payment، فحتى لو
//  ضغطت مرتين ما بينشحن مرتين.
// ============================================================
import { T, Snum } from '../lib/settings.js';

export const payId       = () => T('binance_pay_id', '').trim();
export const isConfigured = () => !!payId();
export const sessionMinutes = () => Snum('binance_session_min', 30);

/** فحص شكل رقم العملية — بايننس بيعطي أرقام أو hex طويل */
export const looksLikeTxId = (s) => /^[A-Za-z0-9_-]{8,80}$/.test(String(s || '').trim());

export function instructions({ amountUsd, minutes }) {
  return [
    `<b>Binance Pay</b>`,
    ``,
    `1) افتح Binance ← Pay ← تحويل`,
    `2) أرسل <b>${Number(amountUsd).toFixed(2)} USDT</b> إلى معرّف Binance Pay هذا`,
    `3) انسخ رقم العملية (TxID) من الإيصال`,
    `4) الصق رقم العملية هنا`,
    ``,
    `<b>معرّف Binance Pay</b>`,
    `<code>${payId()}</code>`,
    ``,
    `الصق رقم عملية Binance (TxID) الآن.`,
    `تجده في Binance ← Pay ← سجل العمليات ← افتح التحويل ← انسخ Transaction ID / Order ID.`,
    ``,
    `<i>تنتهي هذه الجلسة خلال ${minutes} دقيقة.</i>`,
  ].join('\n');
}
