// ============================================================
//  شاشات شحن الرصيد — ثلاث طرق
//    🟢 Binance Pay  ·  🔵 Cryptomus (أي شبكة)  ·  🟢 Telegram Stars
// ============================================================
import { screen, to } from '../nav.js';
import { kb } from '../kb.js';
import { db, ensureUser } from '../../lib/db.js';
import { E, T, Sbool } from '../../lib/settings.js';
import { esc, money, RULE, arDate, statusIcon } from '../../lib/fmt.js';
import { ask } from '../input.js';
import { depositLimits } from '../../core/payments.js';
import * as stars from '../../payments/stars.js';
import * as cmus from '../../payments/cryptomus.js';
import * as bpay from '../../payments/binancepay.js';

// ---------- اختيار طريقة الدفع ----------
screen('topup', async (ctx) => {
  const u = await ensureUser(ctx.from);
  const k = kb();

  if (bpay.isConfigured() && Sbool('pay_binance', true))
    k.add({ text: '🅱️ الدفع عبر Binance', data: to('pay_bp'), style: 'success' }).row();

  if (cmus.isConfigured() && Sbool('pay_cryptomus', true))
    k.add({ text: '🪙 الدفع بالعملات الرقمية · أي شبكة', data: to('pay_cm'), style: 'primary' }).row();

  if (Sbool('pay_stars', true))
    k.add({ text: '⭐️ الدفع عبر Telegram Stars', data: to('pay_st'), style: 'success' }).row();

  k.add({ text: '🔙 رجوع', data: to('home'), style: 'danger' }).row();

  const none = k.rows.length <= 1;

  return {
    text: `${E('balance')} <b>شحن رصيد</b>\n${RULE}\n` +
          `رصيدك الحالي: <b>${money(u.balance)}</b>\n\n` +
          (none ? '⚠️ ما في طرق دفع مفعّلة. تواصل مع الأدمن.'
                : 'اختر طريقة الدفع المناسبة لك:'),
    kb: k.build(),
  };
});

// ============================================================
//  Binance Pay
// ============================================================
screen('pay_bp', async (ctx) => {
  if (!bpay.isConfigured())
    return { text: '⚠️ Binance Pay مو مضبوط بعد.', kb: back() };

  const { min, max } = depositLimits();
  ask(ctx.from.id, 'amount', { method: 'BINANCE_PAY' });

  return { text: amountPrompt('Binance Pay', min, max), kb: cancel() };
});

// ============================================================
//  Cryptomus
// ============================================================
screen('pay_cm', async (ctx) => {
  if (!cmus.isConfigured())
    return { text: '⚠️ Cryptomus مو مضبوط بعد.', kb: back() };

  const { min, max } = depositLimits();
  ask(ctx.from.id, 'amount', { method: 'CRYPTOMUS' });

  return { text: amountPrompt('Cryptomus', min, max), kb: cancel() };
});

// ============================================================
//  Telegram Stars
// ============================================================
screen('pay_st', async () => {
  const rate = stars.rate();
  const { min, max } = stars.limits();
  const list = stars.packs();

  const k = kb();
  for (const n of list) {
    k.text(`${n} ⭐️ · +${stars.starsToUsd(n).toFixed(2)} USDT`, to('st_buy', String(n))).row();
  }
  k.text('✏️ إدخال كمية', to('st_custom')).row();
  k.add({ text: '🔙 رجوع', data: to('topup'), style: 'danger' }).row();

  return {
    text: [
      `⭐️ <b>Telegram Stars</b>`, RULE,
      `ادفع نجوماً في هذا البوت. تُحصَّل النجوم لبوت المتجر ويُضاف رصيدك بالـ USDT.`,
      ``,
      `المعدل: <b>1 ⭐️ = ${rate} USDT</b>`,
      `النطاق المسموح: ${min}–${max} نجمة`,
    ].join('\n'),
    kb: k.build(),
  };
});

screen('st_custom', async (ctx) => {
  const { min, max } = stars.limits();
  ask(ctx.from.id, 'stars_amount');
  return {
    text: `⭐️ <b>إدخال كمية</b>\n${RULE}\n` +
          `الحد الأدنى: ${min} نجمة\nالحد الأقصى: ${max} نجمة\n\n` +
          `أرسل عدد النجوم، مثل <code>250</code>`,
    kb: kb().add({ text: '❌ إلغاء', data: to('pay_st'), style: 'danger' }).build(),
  };
});

// ============================================================
//  سجل الدفعات
// ============================================================
screen('pay_log', async (ctx) => {
  const u = await ensureUser(ctx.from);
  const { data } = await db.from('payments')
    .select('method, amount_usd, stars, status, created_at')
    .eq('user_id', u.id).order('created_at', { ascending: false }).limit(10);

  const label = { CRYPTOMUS: '🪙 عملات رقمية', STARS: '⭐️ نجوم', BINANCE_PAY: '🅱️ Binance' };
  const body = data?.length
    ? data.map((p) =>
        `${statusIcon(p.status)} ${label[p.method] || p.method} · ${money(p.amount_usd)}` +
        (p.stars ? ` (${p.stars}⭐️)` : '') + `\n    <i>${arDate(p.created_at)}</i>`
      ).join('\n')
    : 'ما في دفعات بعد.';

  return { text: `🧾 <b>سجل الشحن</b>\n${RULE}\n${body}`,
           kb: kb().text('« رجوع', to('profile')).build() };
});

// ---------- أدوات ----------
const back   = () => kb().text('« رجوع', to('topup')).build();
const cancel = () => kb().add({ text: '❌ إلغاء', data: to('topup'), style: 'danger' }).build();

const amountPrompt = (name, min, max) => [
  `<b>أدخل مبلغ الإيداع (USD)</b>`,
  ``,
  `الحد الأدنى: USD ${min}`,
  `الحد الأقصى: USD ${max}`,
  ``,
  `أرسل أرقامًا فقط، مثل <code>20</code>`,
  ``,
  `<i>طريقة الدفع: ${esc(name)}</i>`,
].join('\n');
