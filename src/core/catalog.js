// ============================================================
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
  const globalMarkup = Snum('markup_pct', 40);

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
            'custom_emoji_id, deleted_at, details_synced_at, ' +
            'cost_price, sell_price, paused');
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
    //
    // ⚠️ منتج راجع من الحذف لازم يكون RESTOCK مو NEW. لو GGSoma
    // شالته دورة وحدة ورجّعته (يصير كتير)، بدون هالتفريق كان
    // بينحسب «منتج جديد» كل مرة ويطلع إشعار مكرّر.
    if (!o) {
      if (inStock && stock > 0) added.push({ slug: p.slug, delta: stock, stock });
    } else if (o.deleted_at) {
      if (inStock && stock > 0) restocked.push({ slug: p.slug, delta: stock, stock });
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

  // حارس: رد فاضي أو ناقص بشكل مريب = لا تحذف شي.
  // بدون هالفحص، خلل مؤقت عندهم بيمسح كتالوجك كله ويطلّع
  // عشرات إشعارات «منتج جديد» لما يرجع.
  const tooMany = before?.length && removed.length > before.length * 0.5;
  if (tooMany) {
    console.error(`[sync] رُفض حذف ${removed.length} من ${before.length} — رد مشبوه`);
  }

  if (removed.length && !tooMany) {
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
  if (alerts.length) {
    const fresh = await dedupeAlerts(alerts);
    if (fresh.length) await db.from('stock_alerts').insert(fresh);
  }

  // ---------- 5) التفاصيل ----------
  const detailsPulled = await pullDetailsBatch(live);

  return {
    providers: providers.length, products: rows.length,
    added: added.length, restocked: restocked.length,
    removed: removed.length, detailsPulled, priceMoves,
  };
}

/**
 * إزالة التكرار من طابور الإشعارات — سببين منفصلين:
 *
 *   أ) نفس المنتج لسه بالطابور من دورة سابقة ما انبعتت بعد.
 *      مع مزامنة كل دقيقة هاد بيصير كتير.
 *   ب) نفس المنتج انبعت له إشعار قريب. مخزون بيزيد على دفعات
 *      (10 هلق، 5 بعد دقيقتين) كان بيطلّع إشعار لكل دفعة.
 *      مهلة التهدئة بتجمعهم بإشعار واحد.
 */
async function dedupeAlerts(alerts) {
  const slugs = [...new Set(alerts.map((a) => a.slug))];
  const cooldownMin = Snum('alert_cooldown_min', 90);
  const since = new Date(Date.now() - cooldownMin * 60_000).toISOString();

  const { data: recent } = await db.from('stock_alerts')
    .select('slug, status, created_at')
    .in('slug', slugs)
    .or(`status.eq.QUEUED,created_at.gte.${since}`);

  const blocked = new Set((recent || []).map((r) => r.slug));

  // لو نفس المنتج إجا مرتين بنفس الدورة، خُد الأكبر دلتا
  const best = new Map();
  for (const a of alerts) {
    if (blocked.has(a.slug)) continue;
    const cur = best.get(a.slug);
    if (!cur || a.delta > cur.delta) best.set(a.slug, a);
  }
  return [...best.values()];
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
  const perRun     = Snum('details_per_sync', 15);
  const refreshHrs = Snum('details_refresh_hrs', 12);
  if (perRun <= 0) return 0;

  const nowIso = new Date().toISOString();

  // بس المنتجات يلي حان وقتها. details_next_try = null يعني «ما انسحبت أبداً»
  const { data: need } = await db.from('products')
    .select('slug, details_attempts').is('deleted_at', null)
    .or(`details_next_try.is.null,details_next_try.lte.${nowIso}`)
    .order('details_next_try', { ascending: true, nullsFirst: true })
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
        details_attempts: 0,
        details_next_try: new Date(Date.now() + refreshHrs * 3600_000).toISOString(),
      }).eq('slug', row.slug);
      n++;
    } catch (e) {
      // حد الطلبات مو ذنب المنتج — اوقف الدفعة بدون ما تعاقبه
      if (e.code === 'RATE_LIMIT_EXCEEDED') break;

      // ⚠️ الكود القديم كان يختم details_synced_at هون، فالمنتج
      // ينزل لآخر الطابور ويضل بلا وصف لساعات. هلق تراجع تصاعدي:
      // 2، 4، 8… دقيقة بحد أقصى ساعتين — بيرجع بسرعة بس ما بيعلّق الطابور.
      const att = (row.details_attempts || 0) + 1;
      const backoffMin = Math.min(2 ** att, 120);
      await db.from('products').update({
        details_attempts: att,
        details_next_try: new Date(Date.now() + backoffMin * 60_000).toISOString(),
      }).eq('slug', row.slug);
    }
    await sleep(1100);   // ابقَ تحت 60 نداء/دقيقة
  }
  return n;
}

// ---------- قراءات ----------
export async function listProviders() {
  // الترتيب الثاني بالاسم مقصود: sortOrder عندهم بيتكرّر كتير،
  // وبدون فاصل حاسم بيتبدّل ترتيب الأزرار كل مزامنة والزبون بيتوه.
  const { data } = await db.from('providers')
    .select('*').eq('visible', true)
    .order('sort_order').order('name');
  return data || [];
}

/** كل المزوّدين بما فيهم المخفيين — للوحة التحكم */
export async function listAllProviders() {
  const { data } = await db.from('providers')
    .select('*').order('sort_order').order('name');
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
