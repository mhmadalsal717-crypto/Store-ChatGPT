// ============================================================
//  Cryptomus — دفع بأي عملة رقمية وأي شبكة
//
//  التوقيع: md5( base64( json_body ) + API_KEY )   بهيدر merchant
//  الويبهوك: نفس الطريقة، بعد ما نشيل sign من الجسم،
//            وبمفتاح الدفع (payment key) مو مفتاح الـ payout.
//
//  ⚠️ لازم نوقّع نفس البايتات المُرسلة بالضبط — فمنعمل
//     JSON.stringify مرة وحدة ومنستعملها للتوقيع وللجسم.
// ============================================================
import crypto from 'node:crypto';
import { cfg } from '../config.js';

const BASE = 'https://api.cryptomus.com/v1';

const md5  = (s) => crypto.createHash('md5').update(s).digest('hex');
const sign = (bodyStr, key) => md5(Buffer.from(bodyStr).toString('base64') + key);

export const isConfigured = () => !!(cfg.cryptomus.merchant && cfg.cryptomus.apiKey);

async function post(path, data) {
  const body = JSON.stringify(data);          // وقّع نفس النص المُرسل
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: {
      merchant: cfg.cryptomus.merchant,
      sign: sign(body, cfg.cryptomus.apiKey),
      'Content-Type': 'application/json',
    },
    body,
  });

  const json = await res.json().catch(() => null);
  if (!json) throw new Error('CRYPTOMUS_BAD_RESPONSE');
  if (json.state !== 0) {
    const e = new Error(json.message || JSON.stringify(json.errors || json));
    e.code = 'CRYPTOMUS_ERROR';
    throw e;
  }
  return json.result;
}

/** إنشاء فاتورة → { uuid, url, order_id, expired_at } */
export const createInvoice = ({ orderId, amountUsd, callbackUrl, returnUrl, lifetimeSec = 3600 }) =>
  post('/payment', {
    amount: Number(amountUsd).toFixed(2),
    currency: 'USD',
    order_id: String(orderId),
    url_callback: callbackUrl,
    url_return: returnUrl,
    lifetime: lifetimeSec,
    is_payment_multiple: false,
  });

/** استعلام يدوي — احتياط لو الويبهوك ضاع */
export const getPayment = ({ orderId, uuid }) =>
  post('/payment/info', uuid ? { uuid } : { order_id: String(orderId) });

/**
 * تحقّق توقيع الويبهوك.
 * أي فشل هون = الطلب مو من Cryptomus ولازم ينرفض فوراً.
 */
export function verifyWebhook(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const received = payload.sign;
  if (!received) return false;

  const { sign: _drop, ...rest } = payload;
  const expected = sign(JSON.stringify(rest), cfg.cryptomus.paymentKey || cfg.cryptomus.apiKey);

  const a = Buffer.from(String(received));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** الفلوس وصلت */
export const PAID = new Set(['paid', 'paid_over']);
/** فشل نهائي */
export const FAILED = new Set(['fail', 'cancel', 'system_fail', 'wrong_amount']);
