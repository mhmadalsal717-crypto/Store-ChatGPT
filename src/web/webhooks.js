Enter// ============================================================
//  مستقبلات الويبهوك
// ============================================================
import express from 'express';
import { money } from '../lib/fmt.js';
import { creditPayment, getPaymentRow, setPayment } from '../core/payments.js';
import * as cm from '../payments/cryptomus.js';

export function mountWebhooks(app, { bot, notifyAdmin, secret }) {
  const r = express.Router();

  // ---------- Cryptomus ----------
  // المسار فيه سر حتى ما ينقصف عشوائياً، والتوقيع هو الحماية الفعلية.
  r.post(`/cryptomus/${secret}`, express.json({ limit: '256kb' }), async (req, res) => {
    // ردّ 200 فوراً — كريبتوموس بتعيد المحاولة لو تأخّرنا
    res.status(200).json({ ok: true });

    try {
      const body = req.body || {};

      if (!cm.verifyWebhook(body)) {
        console.warn('[cryptomus] توقيع غير صالح', body.order_id);
        notifyAdmin?.('⚠️ وصل ويبهوك Cryptomus بتوقيع غير صالح — تجاهلناه.');
        return;
      }

      const orderId = String(body.order_id || '');
      const status  = String(body.status || '');
      const row = await getPaymentRow(orderId);
      if (!row) return console.warn('[cryptomus] طلب غير معروف', orderId);

      if (cm.PAID.has(status)) {
        // تأكّد إن المدفوع فعلاً يغطّي المطلوب
        const paid = Number(body.payment_amount_usd ?? body.merchant_amount ?? body.amount ?? 0);
        if (paid > 0 && paid < Number(row.amount_usd) * 0.98) {
          await setPayment(orderId, { status: 'FAILED', payload: body });
          notifyAdmin?.(`⚠️ دفعة ناقصة: <code>${orderId}</code>\n` +
                        `المطلوب ${money(row.amount_usd)} · المدفوع ${money(paid)}`);
          bot.api.sendMessage(row.users.tg_id,
            '⚠️ المبلغ المستلم أقل من المطلوب. تواصل مع الدعم.').catch(() => {});
          return;
        }

        const r2 = await creditPayment(orderId, body.uuid);
        await setPayment(orderId, { payload: body });
        if (!r2.credited) return;   // انشحنت من قبل — لا تبعت إشعار مرتين

        bot.api.sendMessage(row.users.tg_id,
          `✅ تم شحن <b>${money(r2.amount)}</b> لحسابك.\n💰 رصيدك: <b>${money(r2.new_balance)}</b>`,
          { parse_mode: 'HTML' }).catch(() => {});
        notifyAdmin?.(`💰 إيداع Cryptomus: ${money(r2.amount)} · <code>${row.users.tg_id}</code>`);
        return;
      }

      if (cm.FAILED.has(status)) {
        await setPayment(orderId, { status: 'FAILED', payload: body });
        bot.api.sendMessage(row.users.tg_id,
          '❌ فشلت عملية الدفع أو انتهت مهلتها.').catch(() => {});
      }
      // confirm_check وغيرها -> لسّه بالطريق، ما منعمل شي
    } catch (e) {
      console.error('[cryptomus]', e.message);
    }
  });

  app.use('/hooks', r);
}
