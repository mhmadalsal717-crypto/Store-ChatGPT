Enter// ============================================================
//  مزامنة الكتالوج — التنسيق الكامل مع GGSoma
//
//  كل شي بيجي من عندهم تلقائياً:
//    الأسماء · الأوصاف · التعليمات · المخزون · المدة · الضمان
//    المزوّدين · الإيموجي · الترتيب · الحذف والإضافة
//
//  إنت بتتحكم بس بالسعر وشكل البوت.
// ============================================================
import { gg } from '../lib/ggsoma.js';
import { db } from '../lib/db.js';
import { Snum } from '../lib/settings.js';
import { sanitizeTgHtml } from '../lib/html.js';
import { basePrice } from './pricing.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function syncCatalog() {
  const globalMarkup = Snum('markup_pct', 25);

  // ---------- 1) المزوّدين ----------
  const provRes = await gg.providers();
  const providers = provRes.data || [];

  const { data: oldProv } = await db.from('providers').select('key, visible, custom_emoji_id');
  const pOld = Object.fromEntries((oldProv || []).map((r) => [r.key, r]));

  if (providers.length) {
    await db.from('providers').upsert(providers.map((p) => ({
      key: p.key,
      name: p.name,
      emoji: p.emoji?.normal || null,
      custom_emoji_id: pOld[p.key]?.custom_emoji_id ?? p.emoji?.customTelegramId ?? null,
      sort_order: p.sortOrder ?? 100,
      visible: pOld[p.key]?.visible ?? true,
      updated_at: new Date().toISOString(),
    })), { onConflict: 'key' });

    const liveKeys = new Set(providers.map((p) => p.key));
    const goneP = (oldProv || []).filter((r) => !liveKeys.has(r.key)).map((r) => r.key);
    if (goneP.length) await db.from('providers').update({ visible: false }).in('key', goneP);
  }

  // ---------- 2) المنتجات ----------
  const prodRes = await gg.products();
  const live = prodRes.data || [];

  const { data: before } = await db.from('products')
    .select('slug, in_stock, stock_count, markup_pct, price_override, visible, ' +
            'custom_emoji_id, deleted_at, details_synced_at');
  const old = Object.fromEntries((before || []).map((r) => [r.slug, r]));

  const rows = [], added = [], restocked = [], priceMoves = [];
  const minDelta = Snum('min_stock_delta', 1);
  const moveAlert = Snum('price_move_alert_pct', 10);

  for (const p of live) {
    const o = old[p.slug];
    const stock = p.stock?.count ?? 0;
    const inStock = !!p.stock?.inStock;
    const mk = o?.markup_pct ?? globalMarkup;

    // كشف التغيّر بالمخزون
    if (!o || o.deleted_at) {
      if (inStock && stock > 0) added.push({ slug: p.slug, delta: stock, stock });
    } else {
      const delta = stock - (o.stock_count ?? 0);
      // زيادة حقيقية فقط. النقصان طبيعي (مبيعات) وما بينبّه عليه.
      if (delta >= minDelta && inStock) restocked.push({ slug: p.slug, delta, stock });
    }

    // ---- كشف تغيّر التكلفة ----
    // السعر المحسوب بيتحرّك لحاله. الإشعار بس للعلم — خصوصاً لما
    // تنزل التكلفة، لأن ساعتها سعرك بينزل تلقائياً ويمكن تفضّل
    // تثبّت السعر وتاخد ربح أكبر.
    if (o && !o.deleted_at) {
      const oldCost = Number(o.cost_price) || 0;
      const newCost = Number(p.yourPrice) || 0;
      if (oldCost > 0 && newCost > 0 && oldCost !== newCost) {
        const movePct = ((newCost - oldCost) / oldCost) * 100;
        if (Math.abs(movePct) >= moveAlert) {
          priceMoves.push({
            slug: p.slug, name: p.name,
            oldCost, newCost, movePct,
            oldSell: Number(o.sell_price) || 0,
            newSell: basePrice(p.yourPrice, mk),
            manual: o.price_override != null,
          });
        }
      }
    }

    rows.push({
      slug: p.slug,
      product_code: p.productCode || null,
      name: p.name,
      provider_key: p.provider?.key || null,
      emoji: p.emoji?.normal || null,
      custom_emoji_id: o?.custom_emoji_id ?? p.emoji?.customTelegramId ?? null,
      delivery_type: p.deliveryType,
      cost_price: Number(p.yourPrice),
      catalog_price: p.catalogPrice != null ? Number(p.catalogPrice) : null,
      sell_price: basePrice(p.yourPrice, mk),
      duration_days: p.durationDays ?? null,
      warranty_days: p.warranty?.enabled ? p.warranty.days : null,
      in_stock: inStock,
      prev_stock: o?.stock_count ?? 0,
      stock_count: stock,
      max_quantity: p.stock?.maxQuantity ?? 1,
      has_instructions: !!p.flags?.hasInstructions,
      sensitive_delivery: !!p.flags?.sensitiveDelivery,
      sort_order: p.sortOrder ?? 100,
      visible: o?.visible ?? true,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    });
  }

  if (rows.length) await db.from('products').upsert(rows, { onConflict: 'slug' });

  // ---------- 3) المحذوف من كتالوجهم ----------
  const liveSet = new Set(rows.map((r) => r.slug));
  const removed = (before || [])
    .filter((r) => !liveSet.has(r.slug) && !r.deleted_at).map((r) => r.slug);

  if (removed.length) {
    await db.from('products').update({
      in_stock: false, stock_count: 0,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).in('slug', removed);
  }

  // ---------- 4) طابور التنبيهات ----------
  const alerts = [
    ...added.map((a)     => ({ slug: a.slug, kind: 'NEW',     delta: a.delta, stock_now: a.stock })),
    ...restocked.map((a) => ({ slug: a.slug, kind: 'RESTOCK', delta: a.delta, stock_now: a.stock })),
  ];
  if (alerts.length) await db.from('stock_alerts').insert(alerts);

  // ---------- 5) التفاصيل ----------
  const detailsPulled = await pullDetailsBatch(live);

  return {
    providers: providers.length, products: rows.length,
    added: added.length, restocked: restocked.length,
    removed: removed.length, detailsPulled, priceMoves,
  };
}

/**
 * سحب الأوصاف والتعليمات.
 *
 * مسار القائمة ما بيرجّع description/instructions — لازم نداء منفصل
 * لكل منتج، وحدّهم 60 نداء/دقيقة. فمنسحب دفعة صغيرة كل مزامنة:
 * الجديد أولاً (details_synced_at = null)، بعدين الأقدم تحديثاً.
 * خلال دورتين تلاتة بيكون كل الكتالوج مسحوب وبعدين بيتجدّد بالتناوب.
 */
async function pullDetailsBatch(live) {
  const perRun = Snum('details_per_sync', 15);
  if (perRun <= 0) return 0;

  const { data: need } = await db.from('products')
    .select('slug').is('deleted_at', null)
    .order('details_synced_at', { ascending: true, nullsFirst: true })
    .limit(perRun);

  if (!need?.length) return 0;

  const byslug = Object.fromEntries(live.map((p) => [p.slug, p]));
  let n = 0;

  for (const row of need) {
    try {
      const d = await gg.product(row.slug);
      const fmt = d.descriptionFormat || 'TEXT';

      await db.from('products').update({
        description: sanitizeTgHtml(d.description, fmt) || null,
        description_format: fmt,
        instructions: sanitizeTgHtml(d.instructions, fmt) || null,
        has_instructions: !!(d.instructions || byslug[row.slug]?.flags?.hasInstructions),
        gg_updated_at: d.updatedAt || null,
        details_synced_at: new Date().toISOString(),
      }).eq('slug', row.slug);
      n++;
    } catch (e) {
      // انحذف بين النداءين أو خطأ مؤقت — علّمه ونكمّل
      await db.from('products')
        .update({ details_synced_at: new Date().toISOString() }).eq('slug', row.slug);
      if (e.code === 'RATE_LIMIT_EXCEEDED') break;
    }
    await sleep(1100);   // ابقَ تحت 60 نداء/دقيقة
  }
  return n;
}

// ---------- قراءات ----------
export async function listProviders() {
  const { data } = await db.from('providers')
    .select('*').eq('visible', true).order('sort_order');
  return data || [];
}

export async function listProducts(providerKey) {
  const { data } = await db.from('products').select('*')
    .eq('provider_key', providerKey).eq('visible', true)
    .eq('paused', false).is('deleted_at', null)
    .order('sort_order').order('sell_price');
  return data || [];
}

export const getProduct = async (slug) => {
  const { data } = await db.from('products').select('*').eq('slug', slug).maybeSingle();
  return data;
};

/** النص المعروض: تجاوز الأدمن إن وُجد، وإلا يلي جاي من GGSoma */
export const productDesc  = (p) => p?.desc_override  || p?.description  || '';
export const productInstr = (p) => p?.instr_override || p?.instructions || '';
