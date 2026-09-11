// ============================================================
//  آلة حالة الإدخال النصّي
//  ask(userId, 'kind', payload) ثم أول رسالة نصية بتروح للمعالج.
// ============================================================
const pending = new Map();   // tgId -> { kind, payload, at, ttl }
const DEFAULT_TTL = 15 * 60_000;

/**
 * @param ttlMs مهلة مخصّصة. جلسة Binance 30 دقيقة، فلازم تكون أطول
 *              من الافتراضي وإلا الزبون بيلصق رقم العملية وما بينمسك.
 */
export const ask = (tgId, kind, payload = null, ttlMs = DEFAULT_TTL) =>
  pending.set(tgId, { kind, payload, at: Date.now(), ttl: ttlMs });

export const clear = (tgId) => pending.delete(tgId);

export function take(tgId) {
  const p = pending.get(tgId);
  if (!p) return null;
  pending.delete(tgId);
  if (Date.now() - p.at > (p.ttl ?? DEFAULT_TTL)) return null;
  return p;
}
