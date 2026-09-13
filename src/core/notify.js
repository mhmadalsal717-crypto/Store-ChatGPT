// ============================================================
//  الإشعارات
//
//  إشعار المخزون مبني بنفس تنسيق GGSoma:
//
//    ┃ {إيموجي} تمت إضافة مخزون جديد!
//
//    تمت الإضافة: 250
//    المخزون الحالي: 524
//
//    ⚡ اسرع الآن لشراء الخدمة!
//
//    ┃ {إيموجي} اسم المنتج
//    [ {إيموجي} شراء الآن ]
// ============================================================
import { db } from '../lib/db.js';
import { esc } from '../lib/fmt.js';
import { Sbool, Snum } from '../lib/settings.js';
import { kb } from '../bot/kb.js';
import { to } from '../bot/nav.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  const { data } = await db.from('users')
    .select('tg_id').eq('banned', false).eq('notify_stock', true);
  return (data || []).map((u) => u.tg_id);
}

/**
 * بث بدفعات. تلغرام بيحدّ حوالي 30 رسالة/ثانية،
 * ومنتجاهل يلي حظر البوت بدل ما نوقف البث كله.
 */
export async function broadcast(api, text, ids, extra = {}) {
  let sent = 0, failed = 0;
  for (const id of ids) {
    try {
      await api.sendMessage(id, text, {
        parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra,
      });
      sent++;
    } catch (e) {
      failed++;
      // المستخدم حظر البوت -> اطفي إشعاراته حتى ما نضل نحاول
      if (/blocked|deactivated|chat not found/i.test(e.description || '')) {
        await db.from('users').update({ notify_stock: false }).eq('tg_id', id);
      }
    }
    if ((sent + failed) % 20 === 0) await sleep(1100);
  }
  return { sent, failed };
}

/** بناء نص الإشعار — نفس ترتيب بوت GGSoma */
export function stockAlertText(product, alert) {
  const emo = product.emoji || '📦';
  const head = alert.kind === 'NEW' ? 'تمت إضافة منتج جديد!' : 'تمت إضافة مخزون جديد!';

  return [
    `<blockquote>${emo} ${head}</blockquote>`,
    ``,
    `تمت الإضافة: ${alert.delta}`,
    `المخزون الحالي: ${alert.stock_now}`,
    ``,
    `⚡ اسرع الآن لشراء الخدمة!`,
    ``,
    `<blockquote>${emo} ${esc(product.name)}</blockquote>`,
  ].join('\n');
}

/**
 * معالجة طابور تنبيهات المخزون.
 * الطابور بينمسح من المزامنة — منعالجه هون بشكل منفصل
 * حتى البث ما يعطّل دورة المزامنة.
 */
export async function flushStockAlerts(api) {
  const maxPerRun = Snum('max_stock_alerts', 2);

  const { data: queued } = await db.from('stock_alerts')
    .select('*').eq('status', 'QUEUED').order('created_at').limit(maxPerRun);

  if (!queued?.length) return { alerts: 0, sent: 0 };

  const ids = await targets();
  let totalSent = 0, alerts = 0;

  for (const a of queued) {
    const { data: p } = await db.from('products')
      .select('slug, name, emoji, custom_emoji_id, visible, in_stock, provider_key')
      .eq('slug', a.slug).maybeSingle();

    const allowed = a.kind === 'NEW' ? Sbool('notify_new', true) : Sbool('notify_restock', true);

    // منتج مخفي أو نفد بينما كان بالطابور -> تخطّاه
    if (!p || !p.visible || !p.in_stock || !allowed) {
      await db.from('stock_alerts').update({ status: 'SKIPPED' }).eq('id', a.id);
      continue;
    }

    const markup = kb().add({
      text: `${p.emoji || ''} شراء الآن`.trim(),
      data: to('item', p.slug),
      style: 'primary',
      icon: p.custom_emoji_id || undefined,
    }).build();

    const r = await broadcast(api, stockAlertText(p, a), ids, { reply_markup: markup });

    await db.from('stock_alerts')
      .update({ status: 'SENT', sent: r.sent, failed: r.failed }).eq('id', a.id);

    totalSent += r.sent;
    alerts++;
    await sleep(4000);   // فاصل بين منتج ومنتج — يمنع وابل رسائل
  }

  return { alerts, sent: totalSent };
}
