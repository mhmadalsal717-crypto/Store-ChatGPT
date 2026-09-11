// ============================================================
//  حارس الهامش
//
//  المشكلة: GGSoma بترفع yourPrice وقت ما بدها. لو عندك سعر يدوي
//  أو زبون بمستوى عالي عنده خصم، ممكن تصير تبيع بخسارة وما تنتبه
//  إلا بعد ما تخسر عشر عمليات.
//
//  الحل: كل مزامنة منحسب أوطى سعر ممكن يدفعه أي زبون (بعد أعلى
//  خصم مستوى)، ومنقارنه بالتكلفة الجديدة. إذا الهامش نزل تحت الحد،
//  البيع بيوقف تلقائياً وبيوصلك إشعار.
// ============================================================
import { db } from '../lib/db.js';
import { Snum, Sbool } from '../lib/settings.js';
import { marginOf, maxTierDiscount } from './pricing.js';

export { maxTierDiscount };

/**
 * @returns {{ok, floor, cost, marginPct}}
 *  بيقيس على أوطى سعر ممكن يدفعه زبون (بعد أعلى خصم مستوى).
 */
export function checkMargin(product) {
  const m = marginOf(product);
  if (m.cost <= 0) return { ok: true, floor: m.floor, cost: m.cost, marginPct: 100 };
  return {
    ok: m.minPct >= Snum('min_margin_pct', 5),
    floor: m.floor, cost: m.cost, marginPct: m.minPct,
  };
}

/**
 * فحص كل الكتالوج بعد المزامنة.
 * @returns {Array} المنتجات يلي انوقفت هالدورة
 */
export async function enforceMargins() {
  const autoPause = Sbool('auto_pause_on_loss', true);

  const { data: products } = await db.from('products')
    .select('slug, name, cost_price, last_cost, sell_price, price_override, ' +
            'paused, paused_reason, visible')
    .is('deleted_at', null);

  if (!products?.length) return [];

  const paused = [], resumed = [];

  for (const p of products) {
    const m = checkMargin(p);
    const costRose = p.last_cost != null && Number(p.cost_price) > Number(p.last_cost);

    if (!m.ok && !p.paused && autoPause) {
      // وقّف البيع
      const reason = costRose
        ? `ارتفعت التكلفة من ${fmt(p.last_cost)} لـ ${fmt(p.cost_price)}`
        : `الهامش ${m.marginPct.toFixed(1)}% تحت الحد ${Snum('min_margin_pct', 5)}%`;

      await db.from('products')
        .update({ paused: true, paused_reason: reason, last_cost: p.cost_price })
        .eq('slug', p.slug);

      paused.push({ ...p, ...m, reason });
      continue;
    }

    if (m.ok && p.paused && p.paused_reason) {
      // الهامش رجع سليم (عدّلت السعر أو نزلت تكلفتهم) -> استأنف
      await db.from('products')
        .update({ paused: false, paused_reason: null, last_cost: p.cost_price })
        .eq('slug', p.slug);
      resumed.push(p);
      continue;
    }

    if (p.last_cost == null || Number(p.last_cost) !== Number(p.cost_price)) {
      await db.from('products').update({ last_cost: p.cost_price }).eq('slug', p.slug);
    }
  }

  return { paused, resumed };
}

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const fmt = (n) => `${Number(n || 0).toFixed(2)}$`;
