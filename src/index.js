import express from 'express';
import { webhookCallback } from 'grammy';
import { cfg } from './config.js';
import { loadAll, Snum } from './lib/settings.js';
import { money, RULE, esc } from './lib/fmt.js';
import { bot, notifyAdmin, sendResult, setupBotUI } from './bot/index.js';
import { kb } from './bot/kb.js';
import { to } from './bot/nav.js';
import { syncCatalog } from './core/catalog.js';
import { enforceMargins } from './core/guard.js';
import { reconcileOnce, checkWallet } from './core/reconciler.js';
import { flushStockAlerts } from './core/notify.js';
import { expireStale } from './core/payments.js';
import { mountWebhooks } from './web/webhooks.js';

await loadAll(true);

const app = express();
app.get('/',       (_, res) => res.send('ok'));
app.get('/health', (_, res) => res.json({ ok: true, ts: Date.now() }));

// الويبهوك لازم يجي قبل express.json العام — بيستعمل parser خاص فيه
mountWebhooks(app, { bot, notifyAdmin, secret: cfg.bot.secret });
app.use(express.json());

// ---------- Webhook أو Long polling ----------
if (cfg.bot.webhookUrl) {
  app.use(`/tg/${cfg.bot.secret}`, webhookCallback(bot, 'express'));
  await bot.api.setWebhook(`${cfg.bot.webhookUrl}/tg/${cfg.bot.secret}`, {
    drop_pending_updates: true,
    allowed_updates: ['message', 'callback_query', 'pre_checkout_query'],
  });
  console.log('✔ webhook مضبوط');
} else {
  bot.start({ allowed_updates: ['message', 'callback_query', 'pre_checkout_query'] });
  console.log('✔ long polling');
}

app.listen(cfg.port, () => console.log('✔ يستمع على المنفذ', cfg.port));
await setupBotUI();

// ---------- المهام الدورية ----------
const notifyUser = (tgId, result) => sendResult(tgId, result);

// المُصالح: كل دقيقة — هو يلي بيمنع ضياع الطلبات
setInterval(() => {
  reconcileOnce({ notifyAdmin, notifyUser }).catch((e) => console.error('[recon]', e.message));
}, 60_000);

// مزامنة الكتالوج + حارس الهامش
async function sync() {
  try {
    const r = await syncCatalog();
    if (r.added || r.restocked || r.removed) {
      console.log(`[sync] جديد ${r.added} · مخزون ${r.restocked} · محذوف ${r.removed}`);
    }
    if (r.removed) {
      notifyAdmin(`🗑 <b>${r.removed}</b> منتج انحذف من كتالوج GGSoma وانخفى تلقائياً.`);
    }

    // ---- تحرّك التكلفة عندهم ----
    for (const m of (r.priceMoves || []).slice(0, 8)) {
      const up = m.movePct > 0;
      notifyAdmin(
        `${up ? '📈' : '📉'} <b>تغيّرت التكلفة عند GGSoma</b>\n${RULE}\n` +
        `📦 ${esc(m.name)}\n` +
        `💸 التكلفة: ${money(m.oldCost)} ← <b>${money(m.newCost)}</b> ` +
        `(${up ? '+' : ''}${m.movePct.toFixed(1)}%)\n` +
        (m.manual
          ? `⚠️ عندك <b>سعر يدوي</b> على هالمنتج — ما بيتحرّك لحاله.\n` +
            `السعر الحالي: ${money(m.oldSell)} · المحسوب: ${money(m.newSell)}`
          : `💵 سعرك تحرّك تلقائياً: ${money(m.oldSell)} ← <b>${money(m.newSell)}</b>`),
        kb().text('📦 تفاصيل المنتج', to('a_prod', m.slug)).build()
      );
    }

    // ---- حارس الهامش ----
    const g = await enforceMargins();
    for (const p of g.paused || []) {
      notifyAdmin(
        `⛔️ <b>وقّفنا البيع — الهامش انهار</b>\n${RULE}\n` +
        `📦 ${esc(p.name)}\n` +
        `💸 التكلفة: <b>${money(p.cost)}</b>\n` +
        `💵 أوطى سعر بيدفعه زبون: <b>${money(p.floor)}</b>\n` +
        `📉 الهامش: <b>${p.marginPct.toFixed(1)}%</b>\n\n` +
        `السبب: ${esc(p.reason)}\n\n` +
        `<i>عدّل السعر وبيرجع البيع تلقائياً.</i>`,
        kb().add({ text: '💵 عدّل السعر', data: to('a_pset', p.slug, 'price'), style: 'primary' }).row()
            .text('📦 تفاصيل المنتج', to('a_prod', p.slug)).row()
            .add({ text: '▶️ استئناف رغم ذلك', data: to('a_resume', p.slug), style: 'danger' })
            .build()
      );
    }
    for (const p of g.resumed || []) {
      notifyAdmin(`▶️ رجع البيع تلقائياً: <b>${esc(p.name)}</b> — الهامش صار سليم.`);
    }
  } catch (e) { console.error('[sync]', e.message); }
}
setInterval(sync, Math.max(5, Snum('sync_minutes', 10)) * 60_000);

// بث إشعارات المخزون — منفصل حتى ما يعطّل المزامنة
setInterval(async () => {
  try {
    const r = await flushStockAlerts(bot.api);
    if (r.alerts) notifyAdmin(`🔔 انبعت ${r.alerts} إشعار مخزون لـ ${r.sent} مستخدم.`);
  } catch (e) { console.error('[alerts]', e.message); }
}, 90_000);

// تنظيف جلسات الدفع المنتهية
setInterval(() => expireStale().catch(() => {}), 5 * 60_000);

// مراقبة رصيد GGSoma
setInterval(() => checkWallet({ notifyAdmin }).catch(() => {}), 3600_000);

sync().then(() => console.log('✔ الكتالوج متزامن'));
