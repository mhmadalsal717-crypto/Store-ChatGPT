// ============================================================
//  شاشات المحفظة: الشحن / القسائم / السحب / معلومات
// ============================================================
import { screen, to } from '../nav.js';
import { kb } from '../kb.js';
import { db, ensureUser } from '../../lib/db.js';
import { E, T, S, Snum } from '../../lib/settings.js';
import { esc, money, RULE, arDate, statusIcon } from '../../lib/fmt.js';
import { ask } from '../input.js';
import { t } from '../../lib/i18n.js';

// ---------- شحن رصيد ----------
// ---------- شحن بكود ----------
screen('voucher', async (ctx) => {
  ask(ctx.from.id, 'voucher');
  const su = (T('support_user', '@XBLLT') || '').replace(/^@/, '');

  const k = kb();
  if (su) k.url('💬 ' + t(ctx, 'vou.request'), `https://t.me/${su}`).row();
  k.text(t(ctx, 'btn.close'), to('close'));

  return {
    text: `<blockquote>${E('card')} <b>${t(ctx, 'vou.title')}</b></blockquote>\n\n` +
          t(ctx, 'vou.prompt'),
    kb: k.build(),
  };
});

// ---------- ملف السحب (Binance ID) ----------
screen('wd_profile', async (ctx) => {
  const u = await ensureUser(ctx.from);
  const text = u.binance_id
    ? `🧾 <b>ملف السحب</b>\n${RULE}\nBinance ID: <code>${esc(u.binance_id)}</code>`
    : `🧾 <b>ملف السحب</b>\n${RULE}\nلا يوجد ملف سحب محفوظ بعد.\nاحفظ Binance ID قبل إنشاء طلب سحب.`;

  return { text, kb: kb()
    .text('✏️ تعديل Binance ID', to('wd_edit')).row()
    .text('« رجوع', to('profile')).build() };
});

screen('wd_edit', async (ctx) => {
  ask(ctx.from.id, 'binance');
  return { text: `✏️ ابعت Binance ID تبعك (أرقام فقط):`,
           kb: kb().text('« رجوع', to('wd_profile')).build() };
});

// ---------- طلب سحب ----------
screen('wd_new', async (ctx) => {
  const u   = await ensureUser(ctx.from);
  const min = Snum('min_withdraw', 5);

  if (!u.binance_id) {
    return { text: `لا يوجد ملف سحب محفوظ بعد.\nالرجاء حفظ Binance ID قبل إنشاء طلب سحب.`,
             kb: kb().text('✏️ تعديل Binance ID', to('wd_edit')).row()
                     .text('« رجوع', to('profile')).build() };
  }
  if (Number(u.balance) < min) {
    return { text: `💰 <b>طلب سحب</b>\n${RULE}\nأقل مبلغ سحب: <b>${money(min)}</b>\n` +
                   `رصيدك الحالي: ${money(u.balance)}`,
             kb: kb().text('« رجوع', to('profile')).build() };
  }

  ask(ctx.from.id, 'withdraw');
  return { text: `💰 <b>طلب سحب</b>\n${RULE}\n` +
                 `رصيدك: <b>${money(u.balance)}</b>\nأقل مبلغ: ${money(min)}\n\n` +
                 `ابعت المبلغ يلي بدك تسحبه:`,
           kb: kb().text('« رجوع', to('profile')).build() };
});

screen('wd_list', async (ctx) => {
  const u = await ensureUser(ctx.from);
  const { data } = await db.from('withdrawals')
    .select('*').eq('user_id', u.id).order('created_at', { ascending: false }).limit(10);

  const body = data?.length
    ? data.map((w) => `${statusIcon(w.status)} ${money(w.amount)} · ${arDate(w.created_at)}` +
                      (w.admin_note ? `\n    <i>${esc(w.admin_note)}</i>` : '')).join('\n')
    : 'لا توجد طلبات سحب حتى الآن.';

  return { text: `📄 <b>طلبات السحب</b>\n${RULE}\n${body}`,
           kb: kb().text('« رجوع', to('profile')).build() };
});

// ---------- الإشعارات ----------
screen('notif', async (ctx) => {
  const u = await ensureUser(ctx.from);
  await db.from('users').update({ notify_stock: !u.notify_stock }).eq('id', u.id);
  return { text: !u.notify_stock
      ? `🔔 تم تفعيل إشعارات توفّر المنتجات.`
      : `🔕 تم إيقاف إشعارات توفّر المنتجات.`,
    kb: kb().text('« الملف الشخصي', to('profile')).build() };
});

// ---------- معلومات ----------
screen('help', async () => {
  const su = S('support_username');
  const k = kb();
  if (su) k.url('💬 تواصل مع الدعم', `https://t.me/${su}`).row();
  k.text('« الرئيسية', to('home'));
  return { text: `${E('help')} <b>الدعم والمساعدة</b>\n${RULE}\n${T('help')}`, kb: k.build() };
});

screen('policy', async () => ({
  text: `${E('policy')} <b>سياسة البوت</b>\n${RULE}\n${T('policy')}`,
  kb: kb().text('« الرئيسية', to('home')).build(),
}));
