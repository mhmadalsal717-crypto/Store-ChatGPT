// ============================================================
//  معالجة الرسائل النصّية الحرّة (حسب حالة الإدخال المطلوبة)
// ============================================================
import { db, rpc, ensureUser } from '../lib/db.js';
import { esc, money, RULE } from '../lib/fmt.js';
import { invalidate, Snum } from '../lib/settings.js';
import { go, to } from './nav.js';
import { take, ask } from './input.js';
import { broadcast } from '../core/notify.js';
import { startPayment, submitBinanceTx, startStars } from './payflow.js';
import { setPayment, getPaymentRow, creditPayment } from '../core/payments.js';
import crypto from 'node:crypto';

/** @returns {boolean} هل تم التعامل مع الرسالة؟ */
export async function handleInput(ctx, { notifyAdmin, bot }) {
  const p = take(ctx.from.id);
  if (!p) return false;

  const body = (ctx.message.text || ctx.message.caption || '').trim();
  const H = HANDLERS[p.kind];
  if (!H) return false;

  try { await H(ctx, body, p.payload || {}, { notifyAdmin, bot }); }
  catch (e) {
    console.error('[input]', p.kind, e.message);
    await ctx.reply(`❌ ${e.code === 'INSUFFICIENT_BALANCE' ? 'الرصيد غير كافٍ.' : 'صار خطأ، جرّب مرة تانية.'}`);
  }
  return true;
}

const num = (s) => { const n = Number(String(s).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const DASH = (s) => s === '-' || s === '—';

const HANDLERS = {
  // ---------- الدفع ----------
  async amount(ctx, body, { method }, { notifyAdmin }) {
    const amt = num(body.replace(/[^\d.,]/g, ''));
    if (amt === null || amt <= 0) {
      ask(ctx.from.id, 'amount', { method });
      return ctx.reply('❌ أرسل أرقامًا فقط، مثل <code>20</code>', { parse_mode: 'HTML' });
    }
    await startPayment(ctx, method, amt, { notifyAdmin });
  },

  async stars_amount(ctx, body) {
    const n = parseInt(String(body).replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(n) || n <= 0) {
      ask(ctx.from.id, 'stars_amount');
      return ctx.reply('❌ أرسل عدد النجوم كرقم، مثل <code>250</code>', { parse_mode: 'HTML' });
    }
    await startStars(ctx, n);
  },

  async binance_txid(ctx, body, { orderId }, { notifyAdmin }) {
    await submitBinanceTx(ctx, orderId, body.trim(), { notifyAdmin });
  },

  // ---------- المستخدم ----------
  async voucher(ctx, code) {
    try {
      const [row] = await rpc('redeem_voucher', { p_tg_id: ctx.from.id, p_code: code });
      await ctx.reply(`✅ تم شحن <b>${money(row.amount)}</b>\n💰 رصيدك: <b>${money(row.new_balance)}</b>`,
                      { parse_mode: 'HTML' });
    } catch (e) {
      await ctx.reply(e.code === 'VOUCHER_INVALID'
        ? '❌ الكود غير صالح أو مستعمل من قبل.' : '❌ صار خطأ، جرّب مرة تانية.');
    }
    await go(ctx, 'home', [], { forceNew: true });
  },


  async binance(ctx, body) {
    const id = body.replace(/\D/g, '');
    if (id.length < 5) return ctx.reply('❌ معرّف غير صالح.');
    await db.from('users').update({ binance_id: id }).eq('tg_id', ctx.from.id);
    await ctx.reply(`✅ تم حفظ Binance ID: <code>${id}</code>`, { parse_mode: 'HTML' });
    await go(ctx, 'wd_profile', [], { forceNew: true });
  },

  async withdraw(ctx, body, _p, { notifyAdmin }) {
    const amt = num(body);
    const min = Snum('min_withdraw', 5);
    if (amt === null || amt < min) return ctx.reply(`❌ أقل مبلغ سحب ${money(min)}`);

    try {
      const id = await rpc('open_withdrawal', { p_tg_id: ctx.from.id, p_amount: amt });
      notifyAdmin(`📤 <b>طلب سحب #${id}</b>\n👤 <code>${ctx.from.id}</code>\n💵 ${money(amt)}`);
      await ctx.reply(`✅ تم إنشاء طلب سحب بقيمة <b>${money(amt)}</b>.\nالمبلغ محجوز لحين المعالجة.`,
                      { parse_mode: 'HTML' });
    } catch (e) {
      await ctx.reply(e.code === 'INSUFFICIENT_BALANCE' ? '❌ رصيدك ما بيكفي.'
                    : e.code === 'NO_BINANCE_ID' ? '❌ احفظ Binance ID أولاً.' : '❌ صار خطأ.');
    }
    await go(ctx, 'profile', [], { forceNew: true });
  },

  // ---------- الأدمن ----------
  async setting(ctx, body, { key, grp }) {
    await db.from('settings').update({ value: body }).eq('key', key);
    invalidate();
    await ctx.reply(`✅ تم التحديث.`);
    await go(ctx, 'a_set', [grp], { forceNew: true });
  },

  async text(ctx, body, { key }) {
    await db.from('texts').update({ content: body }).eq('key', key);
    invalidate();
    await ctx.reply(`✅ تم حفظ النص.`);
    await go(ctx, 'a_texts', [], { forceNew: true });
  },

  async emoji(ctx, body, { key }) {
    const val = DASH(body) ? null : body.replace(/\D/g, '');
    await db.from('ui_emoji').update({ custom_id: val || null }).eq('key', key);
    invalidate();
    await ctx.reply(val ? `✅ تم ربط الإيموجي المخصص.` : `✅ تم حذف الإيموجي المخصص.`);
    await go(ctx, 'a_emoji', [], { forceNew: true });
  },

  async gate(ctx, body, { key }) {
    const v = String(body).trim();
    await db.from('texts').upsert(
      { key, content: v === '-' ? '' : v }, { onConflict: 'key' });
    invalidate();
    await go(ctx, 'a_gate', [], { forceNew: true });
  },

  async provider(ctx, body, { key, field }) {
    const v = String(body).trim();

    if (field === 'name') {
      // عمود منفصل عن قصد: المزامنة كل دقيقة بتكتب name من عندهم،
      // فلو حفظنا التعديل عليه بينمسح بعد دقيقة.
      const clear = v === '-' || v === '';
      if (!clear && v.length > 40) {
        ask(ctx.from.id, 'provider', { key, field });
        return ctx.reply('❌ الاسم طويل. 40 حرف كحد أقصى.');
      }
      await db.from('providers').update({ name_override: clear ? null : v }).eq('key', key);
    } else if (field === 'order') {
      const n = parseInt(v.replace(/[^\d-]/g, ''), 10);
      if (!Number.isFinite(n)) {
        ask(ctx.from.id, 'provider', { key, field });
        return ctx.reply('❌ أرسل رقم فقط، مثل <code>10</code>', { parse_mode: 'HTML' });
      }
      await db.from('providers').update({ sort_order: n }).eq('key', key);
    } else {
      // «-» بتمسح الإيموجي. غير هيك منقبل رمز قصير بس، حتى ما
      // ينحط اسم أو معرّف رقمي بالخطأ ويطلع بنص الزر.
      const clear = v === '-' || v === '';
      if (!clear && ([...v].length > 4 || /^[\x00-\x7F]+$/.test(v))) {
        ask(ctx.from.id, 'provider', { key, field });
        return ctx.reply('❌ أرسل إيموجي واحد، أو <code>-</code> للحذف.', { parse_mode: 'HTML' });
      }
      await db.from('providers').update({ emoji: clear ? null : v }).eq('key', key);
    }

    await go(ctx, 'a_prov', [key], { forceNew: true });
  },

  async product(ctx, body, { slug, field }) {
    const clear = DASH(body);
    const map = {
      price:  ['price_override',  clear ? null : num(body)],
      markup: ['markup_pct',      clear ? null : num(body)],
      desc:   ['desc_override',   clear ? null : body],
      instr:  ['instr_override',  clear ? null : body],
    };
    const [col, val] = map[field];
    if (['price', 'markup'].includes(field) && !clear && val === null)
      return ctx.reply('❌ لازم رقم.');

    await db.from('products').update({ [col]: val }).eq('slug', slug);

    // إعادة حساب سعر البيع لو تغيّر الهامش
    if (field === 'markup') {
      const { basePrice } = await import('../core/pricing.js');
      const { data: p } = await db.from('products').select('cost_price').eq('slug', slug).single();
      const mk = val ?? Snum('markup_pct', 40);
      await db.from('products').update({ sell_price: basePrice(p.cost_price, mk) }).eq('slug', slug);
    }

    await ctx.reply('✅ تم التحديث.');
    await go(ctx, 'a_prod', [slug], { forceNew: true });
  },


  async adj_balance(ctx, body, { tgId }, { bot }) {
    const amt = num(body);
    if (amt === null || amt === 0) return ctx.reply('❌ لازم رقم غير صفر.');
    try {
      const bal = await rpc('credit_user', {
        p_tg_id: Number(tgId), p_amount: amt, p_type: 'ADJUST', p_ref: 'admin',
      });
      bot.api.sendMessage(Number(tgId),
        amt > 0 ? `💰 تم شحن <b>${money(amt)}</b> لحسابك.`
                : `ℹ️ تم خصم <b>${money(-amt)}</b> من حسابك.`,
        { parse_mode: 'HTML' }).catch(() => {});
      await ctx.reply(`✅ الرصيد الجديد: ${money(bal)}`);
    } catch (e) {
      await ctx.reply(e.code === 'INSUFFICIENT_BALANCE' ? '❌ الخصم أكبر من رصيده.' : '❌ صار خطأ.');
    }
    await go(ctx, 'a_user', [String(tgId)], { forceNew: true });
  },

  async find_user(ctx, body) {
    const q = body.replace('@', '');
    const isNum = /^\d+$/.test(q);
    const { data } = isNum
      ? await db.from('users').select('tg_id').eq('tg_id', q).maybeSingle()
      : await db.from('users').select('tg_id').ilike('username', q).maybeSingle();

    if (!data) { await ctx.reply('❌ ما لقيت المستخدم.'); return go(ctx, 'admin', [], { forceNew: true }); }
    await go(ctx, 'a_user', [String(data.tg_id)], { forceNew: true });
  },

  async voucher_new(ctx, body) {
    const [aStr, cStr] = body.split(/\s+/);
    const amount = num(aStr), count = Math.min(50, Number(cStr) || 1);
    if (amount === null || amount <= 0) return ctx.reply('❌ صيغة غلط. مثال: <code>5 10</code>');

    const codes = Array.from({ length: count }, () =>
      'GC-' + crypto.randomBytes(4).toString('hex').toUpperCase());
    await db.from('vouchers').insert(codes.map((code) => ({ code, amount })));

    await ctx.reply(`🎟 <b>${count} قسيمة بقيمة ${money(amount)}</b>\n${RULE}\n` +
                    codes.map((c) => `<code>${c}</code>`).join('\n'),
                    { parse_mode: 'HTML' });
    await go(ctx, 'admin', [], { forceNew: true });
  },

  async broadcast(ctx, body, _p, { bot }) {
    const { data } = await db.from('users').select('tg_id').eq('banned', false);
    const ids = (data || []).map((u) => u.tg_id);
    await ctx.reply(`📣 جاري الإرسال لـ ${ids.length} مستخدم…`);
    const r = await broadcast(bot.api, body, ids);
    await ctx.reply(`✅ تم: ${r.sent} · فشل: ${r.failed}`);
    await go(ctx, 'admin', [], { forceNew: true });
  },
};
