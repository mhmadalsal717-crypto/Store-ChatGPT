// ============================================================
//  حالة صحة GGSoma
//
//  ملف مستقل عن قصد. لو حطينا الحالة بـ reconciler.js بيصير
//  استيراد دائري: purchase ← reconciler ← purchase. الدوائر
//  بتشتغل بالصدفة مع ESM وبتنكسر لما يتغيّر ترتيب الاستيراد.
//
//  ليش نحفظ الحالة أصلاً:
//    · purchase.js بيقراها قبل ما يخصم من الزبون
//    · التنبيه بينبعت عند تغيّر الحالة بس، مو كل دورة فحص
// ============================================================
let healthy = true;
let reason  = null;

export const isHealthy    = () => healthy;
export const healthReason = () => reason;

/** بترجّع الحالة السابقة حتى المستدعي يعرف إذا في تغيّر */
export function setHealth(ok, why = null) {
  const was = healthy;
  healthy = !!ok;
  reason  = ok ? null : why;
  return was;
}

