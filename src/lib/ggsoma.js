// ============================================================
//  عميل GGSoma Partner API
//  المفتاح بيضل بالسيرفر — أبداً ما بينعرض للزبون.
// ============================================================
import { cfg } from '../config.js';

const BASE = cfg.gg.baseUrl;
const KEY  = cfg.gg.apiKey;

// ============================================================
//  تصنيف الأخطاء — مأخوذ حرفياً من §14 بالوثائق
// ============================================================

/** نهائي: الطلب فشل خلص، الإعادة ما بتفيد. رجّع الرصيد فوراً. */
export const TERMINAL = new Set([
  'PRODUCT_NOT_FOUND',         // 404 مرجع منتج غير معروف
  'PRODUCT_NOT_ALLOWED',       // 400 منتج مخفي أو محجوب عنك
  'PRODUCT_UNAVAILABLE',       // 400 منتج أو مزوّد غير نشط
  'UNSUPPORTED_DELIVERY_TYPE', // 400 نوع تسليم غير مدعوم
  'OUT_OF_STOCK',              // 400 ما في مخزون
  'INVALID_QUANTITY',          // 400 كمية غير صالحة
  'VALIDATION_ERROR',          // 400 جسم طلب غير صالح
  'ORDER_NOT_FOUND',           // 404 طلب غير معروف (للاستعلامات)
]);

/** خلل بحسابنا نحنا عندهم: رجّع الرصيد + نبّه الأدمن فوراً. */
export const ACCOUNT = new Set([
  'INSUFFICIENT_BALANCE',   // 400 محفظتنا عندهم فاضية
  'INVALID_API_KEY',        // 401
  'API_KEY_EXPIRED',        // 401
  'USER_BLOCKED',           // 403
  'API_ACCESS_DISABLED',    // 403
  'PARTNER_SUSPENDED',      // 403
]);

/** مؤقت: لا ترجّع الرصيد، أعد المحاولة بنفس externalOrderId. */
export const RETRYABLE = new Set([
  'MAINTENANCE',            // 503 صيانة
  'RATE_LIMIT_EXCEEDED',    // 429 تجاوز الحد
  'NETWORK_ERROR',          // انقطاع أو مهلة
  'BAD_RESPONSE',
]);

export class GGError extends Error {
  constructor(code, message, { http, requestId, extra } = {}) {
    super(message || code);
    this.code = code; this.http = http; this.requestId = requestId; this.extra = extra || {};
  }

  /**
   * FAILED موثّق بـ 400/500 — «فشل طلب عام».
   * 400 = فشل مؤكّد ولا خصم صار  -> نهائي، رجّع الرصيد.
   * 500 = غامض، ممكن يكون نجح عندهم -> مؤقت، خلّي المُصالح يحسمها.
   */
  get isTerminal() {
    if (this.code === 'FAILED') return this.http === 400;
    return TERMINAL.has(this.code);
  }
  get isAccount()   { return ACCOUNT.has(this.code); }
  get isRetryable() { return !this.isTerminal && !this.isAccount; }

  /** موجودة على INSUFFICIENT_BALANCE فقط (§14) */
  get required() { return this.extra?.required; }
  get available() { return this.extra?.balance; }
}

const napFor = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * §15 بالوثائق: «Exponential backoff on 429».
 * منعيد المحاولة داخلياً لحد retries مرات مع مضاعفة الانتظار.
 * آمن لأن كل نداءاتنا إما قراءة، أو POST بـ externalOrderId ثابت
 * (idempotent حسب §11) — فالإعادة ما بتخصم مرتين.
 */
async function request(method, path, opts = {}) {
  const retries = opts.retries ?? 2;
  for (let i = 0; ; i++) {
    try {
      return await rawRequest(method, path, opts);
    } catch (e) {
      const worthRetry = e.code === 'RATE_LIMIT_EXCEEDED' || e.code === 'NETWORK_ERROR';
      if (!worthRetry || i >= retries) throw e;
      await napFor(1500 * 2 ** i);   // 1.5ث ثم 3ث
    }
  }
}

async function rawRequest(method, path, { body, auth = true, timeoutMs = 25000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(BASE + path, {
      method, signal: ctrl.signal,
      headers: {
        ...(auth ? { Authorization: `Bearer ${KEY}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new GGError('NETWORK_ERROR', e.message, { http: 0 });   // قابل للإعادة
  } finally { clearTimeout(t); }

  let json;
  try { json = await res.json(); }
  catch { throw new GGError('BAD_RESPONSE', 'رد غير JSON', { http: res.status }); }

  if (json && json.ok === false && json.error) {
    // /health وقت الصيانة بيرجّع error كنص: { ok:false, error:"maintenance" }
    // بينما باقي المسارات بترجّع كائن { code, message, requestId }
    if (typeof json.error === 'string') {
      throw new GGError(json.error.toUpperCase(), json.error, { http: res.status });
    }
    throw new GGError(json.error.code, json.error.message, {
      http: res.status, requestId: json.error.requestId, extra: json.error,
    });
  }
  if (!res.ok) throw new GGError('HTTP_' + res.status, 'حالة غير متوقعة', { http: res.status });
  return json;
}

export const gg = {
  /** بيرجّع {ok, maintenance} بدل ما يرمي — الصيانة حالة مو خطأ */
  health: async () => {
    try {
      const r = await request('GET', '/health', { auth: false, timeoutMs: 8000 });
      return { ok: true, maintenance: false, ...r };
    } catch (e) {
      if (e.code === 'MAINTENANCE') return { ok: false, maintenance: true };
      throw e;
    }
  },
  balance:   () => request('GET', '/balance'),
  usage:     () => request('GET', '/usage'),
  providers: () => request('GET', '/catalog/providers'),
  products:  (p) => request('GET', '/catalog/products' + (p ? `?provider=${encodeURIComponent(p)}` : '')),
  product:   (ref) => request('GET', `/catalog/products/${encodeURIComponent(ref)}`),

  createOrder: ({ productSlug, quantity = 1, externalOrderId }) =>
    request('POST', '/orders', {
      body: { productSlug, quantity, externalOrderId }, timeoutMs: 45000,
    }),

  getOrder: (code) => request('GET', `/orders/${encodeURIComponent(code)}`),
  findByExternalId: (ext) =>
    request('GET', `/orders?externalOrderId=${encodeURIComponent(ext)}&limit=1`),
};
