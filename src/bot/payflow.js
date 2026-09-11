// ============================================================
//  تنفيذ الدفعات — من إدخال المبلغ لحدّ الشحن
// ============================================================
import { db } from '../lib/db.js';
import { cfg } from '../config.js';
import { money, RULE, esc } from '../lib/fmt.js';
import { Snum } from '../lib/settings.js';
import { kb } from './kb.js';
import { to } from './nav.js';
import { ask } from './input.js';
import { openPayment, setPayment, getPaymentRow, creditPayment, depositLimits } from '../core/payments.js';
import * as cmus from '../payments/cryptomus.js';
import * as stars from '../payments/stars.js';
import * as bpay from '../payments/binancepay.js';

/** المبلغ انكتب -> افتح جلسة الدفع حسب الطريقة */
export async function startPayment(ctx, method, amountUsd, { notifyAdmin }) {
  const { min, max } = depositLimits();
  if (!(amountUsd >= min && amountUsd <= max)) {
    return ctx.reply(`❌ المبلغ لازم يكون بين ${money(min)} و ${money(max)}.`);
  }

  if (method === 'CRYPTOMUS')   return startCryptomus(ctx, amountUsd);
  if (method === 'BINANCE_PAY') return startBinance(ctx, amountUsd);
  return ctx.reply('❌ طريقة دفع غير معروفة.');
}

// ---------- Cryptomus ----------
async function startCryptomus(ctx, amountUsd) {
  // بدون WEBHOOK_URL ما في مسار يستقبل التأكيد -> الدفعة بتضيع
  if (!cfg.bot.webhookUrl) {
    console.error('[cryptomus] WEBHOOK_URL مفقود — لا تفعّل كريبتوموس بدونه');
    return ctx.reply('❌ الدفع بالعملات الرقمية مو متاح حالياً. جرّب طريقة تانية.');
  }

  const pay = await openPayment({
    tgId: ctx.from.id, method: 'CRYPTOMUS', amountUsd,
    minutes: Snum('cryptomus_lifetime_min', 60),
  });

  try {
    const inv = await cmus.createInvoice({
      orderId: pay.order_id,
      amountUsd,
      callbackUrl: `${cfg.bot.webhookUrl}/hooks/cryptomus/${cfg.bot.secret}`,
      returnUrl: `https://t.me/${(await ctx.api.getMe()).username}`,
      lifetimeSec: Snum('cryptomus_lifetime_min', 60) * 60,
    });

    await setPayment(pay.order_id, { external_id: inv.uuid, pay_url: inv.url, payload: inv });

    return ctx.reply(
      `ادفع <b>USD ${amountUsd.toFixed(2)}</b> عبر صفحة الدفع في Cryptomus.\n` +
      `افتح الرابط أدناه وأكمل الدفع على Cryptomus.\n\n` +
      `<i>الرصيد بينضاف تلقائياً بعد التأكيد على الشبكة.</i>`,
      {
        parse_mode: 'HTML',
        reply_markup: kb()
          .url('🔗 فتح صفحة الدفع', inv.url).row()
          .add({ text: '❌ إلغاء', data: to('pay_cancel', pay.order_id), style: 'danger' })
          .build(),
      }
    );
  } catch (e) {
    await setPayment(pay.order_id, { status: 'FAILED' });
    console.error('[cryptomus]', e.message);
    return ctx.reply('❌ تعذّر إنشاء صفحة الدفع. جرّب بعد شوي أو اختر طريقة تانية.');
  }
}

// ---------- Binance Pay ----------
async function startBinance(ctx, amountUsd) {
  const minutes = bpay.sessionMinutes();
  const pay = await openPayment({
    tgId: ctx.from.id, method: 'BINANCE_PAY', amountUsd, minutes,
  });

  // المهلة لازم تغطّي كل الجلسة + هامش
  ask(ctx.from.id, 'binance_txid', { orderId: pay.order_id }, (minutes + 5) * 60_000);

  return ctx.reply(bpay.instructions({ amountUsd, minutes }), {
    parse_mode: 'HTML',
    reply_markup: kb()
      .add({ text: '❌ إلغاء', data: to('pay_cancel', pay.order_id), style: 'danger' })
      .build(),
  });
}

/** الزبون لصق رقم العملية -> بطاقة مراجعة للأدمن */
export async function submitBinanceTx(ctx, orderId, txid, { notifyAdmin }) {
  if (!bpay.looksLikeTxId(txid)) {
    ask(ctx.from.id, 'binance_txid', { orderId }, 15 * 60_000);
    return ctx.reply('❌ رقم العملية مو بالشكل الصحيح. الصقه من إيصال Binance وجرّب مرة تانية.');
  }

  const row = await getPaymentRow(orderId);
  if (!row || row.status !== 'PENDING')
    return ctx.reply('❌ الجلسة انتهت. ابدأ عملية شحن جديدة.');

  // امنع نفس رقم العملية من الاستعمال مرتين
  const { data: dup } = await db.from('payments')
    .select('order_id').eq('external_id', txid).neq('order_id', orderId).maybeSingle();
  if (dup) return ctx.reply('❌ رقم العملية هذا مستعمل من قبل.');

  await setPayment(orderId, { external_id: txid, status: 'PENDING' });

  notifyAdmin?.(
    `🅱️ <b>تحويل Binance Pay بانتظار المراجعة</b>\n${RULE}\n` +
    `👤 ${esc(ctx.from.first_name || '')} · <code>${ctx.from.id}</code>\n` +
    `💵 المبلغ: <b>${money(row.amount_usd)}</b>\n` +
    `🔢 TxID: <code>${esc(txid)}</code>\n\n` +
    `تحقّق من وصول التحويل بحسابك قبل الموافقة.`,
    kb()
      .add({ text: `✅ موافقة · ${money(row.amount_usd)}`, data: to('a_payok', orderId), style: 'success' }).row()
      .add({ text: '❌ رفض', data: to('a_payno', orderId), style: 'danger' })
      .build()
  );

  return ctx.reply(
    `✅ وصلنا رقم العملية.\n${RULE}\n` +
    `💵 المبلغ: <b>${money(row.amount_usd)}</b>\n` +
    `🔢 <code>${esc(txid)}</code>\n\n` +
    `رح نتحقّق ونضيف الرصيد. عادة خلال دقائق.`,
    { parse_mode: 'HTML' }
  );
}

// ---------- Telegram Stars ----------
export async function startStars(ctx, starCount) {
  const { min, max } = stars.limits();
  if (!(starCount >= min && starCount <= max)) {
    return ctx.reply(`❌ عدد النجوم لازم يكون بين ${min} و ${max}.`);
  }

  const usd = stars.starsToUsd(starCount);
  const pay = await openPayment({
    tgId: ctx.from.id, method: 'STARS', amountUsd: usd, stars: starCount, minutes: 60,
  });

  try {
    await stars.sendStarsInvoice(ctx.api, {
      chatId: ctx.chat.id,
      stars: starCount,
      orderId: pay.order_id,
      title: 'شحن المحفظة',
      description: `${starCount} نجمة → ${usd.toFixed(2)} USDT رصيد محفظة`,
    });
  } catch (e) {
    await setPayment(pay.order_id, { status: 'FAILED' });
    console.error('[stars]', e.message);
    return ctx.reply('❌ تعذّر إنشاء فاتورة النجوم. جرّب مرة تانية.');
  }
}

/**
 * ربط أحداث النجوم على البوت.
 * pre_checkout لازم ينجاوب خلال 10 ثواني وإلا تلغرام بيلغي العملية.
 */
export function wireStars(bot, { notifyAdmin }) {
  bot.on('pre_checkout_query', async (ctx) => {
    try {
      const row = await getPaymentRow(ctx.preCheckoutQuery.invoice_payload);
      const ok = !!row && row.status === 'PENDING';
      await ctx.answerPreCheckoutQuery(ok, ok ? undefined : 'انتهت صلاحية الجلسة. ابدأ من جديد.');
    } catch {
      await ctx.answerPreCheckoutQuery(false, 'خطأ مؤقت، جرّب مرة تانية.').catch(() => {});
    }
  });

  bot.on('message:successful_payment', async (ctx) => {
    const sp = ctx.message.successful_payment;
    const orderId = sp.invoice_payload;

    try {
      const r = await creditPayment(orderId, sp.telegram_payment_charge_id);
      await setPayment(orderId, { payload: sp });
      if (!r.credited) return;   // انشحنت من قبل

      await ctx.reply(
        `✅ <b>تم الشحن</b>\n${RULE}\n` +
        `⭐️ ${sp.total_amount} نجمة → <b>${money(r.amount)}</b>\n` +
        `💰 رصيدك: <b>${money(r.new_balance)}</b>`,
        { parse_mode: 'HTML',
          reply_markup: kb().text('🛒 المنتجات', to('providers')).row()
                            .text('🏠 الرئيسية', to('home')).build() }
      );
      notifyAdmin?.(`⭐️ إيداع نجوم: ${money(r.amount)} · <code>${ctx.from.id}</code>\n` +
                    `charge: <code>${sp.telegram_payment_charge_id}</code>`);
    } catch (e) {
      console.error('[stars-paid]', e.message);
      notifyAdmin?.(`🔴 دفعة نجوم وصلت وما انشحنت!\norder: <code>${orderId}</code>\n` +
                    `charge: <code>${sp.telegram_payment_charge_id}</code>\n${e.message}`);
      await ctx.reply('⚠️ وصل الدفع بس صار خلل بالشحن. تواصل مع الدعم — فلوسك محفوظة.');
    }
  });
}
