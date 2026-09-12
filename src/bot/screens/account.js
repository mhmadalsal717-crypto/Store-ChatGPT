// ============================================================
//  شاشات الحساب: ملفي / حالتي / طلباتي / كشف المحفظة / السحب / الدعوات
// ============================================================
import { screen, to } from '../nav.js';
import { kb } from '../kb.js';
import { db, ensureUser } from '../../lib/db.js';
import { E, Snum } from '../../lib/settings.js';
import { esc, money, RULE, bar, arDate, arTime, statusIcon, trim } from '../../lib/fmt.js';
import { tierOf, nextTier } from '../../core/pricing.js';
import { renderDelivery } from '../delivery.js';

// ---------- ملفي ----------
screen('profile', async (ctx) => {
  const u = await ensureUser(ctx.from);
  const t = tierOf(u.total_spent);

  const [{ count: done }, { count: pend }] = await Promise.all([
    db.from('orders').select('id', { count: 'exact', head: true })
      .eq('user_id', u.id).eq('status', 'COMPLETED'),
    db.from('orders').select('id', { count: 'exact', head: true })
      .eq('user_id', u.id).eq('status', 'PENDING'),
  ]);

  const text = [
    `${E('profile')} <b>ملفي</b>`,
    RULE,
    `🆔 معرّفك: <code>${ctx.from.id}</code>`,
    `👤 الاسم: ${esc(u.first_name || '—')}`,
    `${E('balance')} الرصيد: <b>${money(u.balance)}</b>`,
    t ? `${t.emoji} المستوى: <b>${esc(t.name)}</b> · خصم ${t.discount_pct}%` : null,
    `🛒 إجمالي المشتريات: <b>${done ?? 0}</b>`,
    (pend ?? 0) > 0 ? `⏳ قيد التنفيذ: <b>${pend}</b>` : null,
    `💸 المصروف: <b>${money(u.total_spent)}</b>`,
    `🎁 أرباح الإحالة: <b>${money(u.ref_earned)}</b>`,
    `📅 تاريخ التسجيل: ${arDate(u.created_at)}`,
  ].filter(Boolean).join('\n');

  const k = kb()
    .text('📋 طلباتي', to('orders', '1')).text('🏅 حالتي', to('tier')).row()
    .text('🏦 كشف المحفظة', to('ledger', '1')).text('🧾 سجل الشحن', to('pay_log')).row()
    .text('💰 طلب سحب', to('wd_new')).text('📄 طلبات السحب', to('wd_list')).row()
    .text('🧾 ملف السحب', to('wd_profile')).text('💰 شحن رصيد', to('topup')).row()
    .text(u.notify_stock ? '🔔 الإشعارات: مفعّلة' : '🔕 الإشعارات: مطفأة', to('notif')).row()
    .text('« الرئيسية', to('home'));

  return { text, kb: k.build() };
});

// ---------- حالتي (المستويات) ----------
screen('tier', async (ctx) => {
  const u    = await ensureUser(ctx.from);
  const cur  = tierOf(u.total_spent);
  const next = nextTier(u.total_spent);
  const spent = Number(u.total_spent || 0);

  let progress = '';
  if (next) {
    const from = Number(cur?.min_spent || 0);
    const need = Number(next.min_spent);
    const pct  = Math.min(100, ((spent - from) / (need - from)) * 100);
    progress = [
      ``, `<b>التقدّم للمستوى التالي:</b>`,
      `${bar(pct)} ${pct.toFixed(0)}%`,
      `${money(spent)} / ${money(need)}`,
      `المتبقّي: <b>${money(need - spent)}</b>`,
      ``, `المستوى التالي: ${next.emoji} <b>${esc(next.name)}</b> · خصم ${next.discount_pct}%`,
    ].join('\n');
  } else {
    progress = `\n🎉 وصلت لأعلى مستوى.`;
  }

  const text =
    `${E('star')} <b>الحالات</b>\n${RULE}\n` +
    `الحالة الحالية: ${cur?.emoji || ''} <b>${esc(cur?.name || '—')}</b> · خصم ${cur?.discount_pct || 0}%\n` +
    progress;

  return { text, kb: kb()
    .text('🪜 كل المستويات', to('tiers')).row()
    .text('« الملف الشخصي', to('profile')).build() };
});

screen('tiers', async () => {
  const { data } = await db.from('tiers').select('*').order('sort_order');
  const body = (data || []).map((t) =>
    `${t.emoji} <b>${esc(t.name)}</b> — من ${money(t.min_spent)} · خصم ${t.discount_pct}%`
  ).join('\n');
  return { text: `🪜 <b>كل المستويات</b>\n${RULE}\n${body}`,
           kb: kb().text('« رجوع', to('tier')).build() };
});

// ---------- طلباتي ----------
screen('orders', async (ctx, [pageStr]) => {
  const page = Math.max(1, Number(pageStr || 1));
  const u = await ensureUser(ctx.from);
  const from = (page - 1) * 5;

  const { data, count } = await db.from('orders')
    .select('external_order_id, product_name, charged_usd, status, created_at', { count: 'exact' })
    .eq('user_id', u.id).order('created_at', { ascending: false })
    .range(from, from + 4);

  const pages = Math.max(1, Math.ceil((count || 0) / 5));

  if (!data?.length) {
    return { text: `📋 <b>طلباتي</b>\n${RULE}\nما عندك طلبات بعد.`,
             kb: kb().text('🛒 تصفّح المنتجات', to('providers')).row()
                     .text('« رجوع', to('profile')).build() };
  }

  const body = data.map((o) =>
    `${statusIcon(o.status)} <b>${esc(o.product_name || '')}</b>\n` +
    `    ${money(o.charged_usd)} · ${arDate(o.created_at)}`
  ).join('\n\n');

  const k = kb();
  for (const o of data.filter((x) => x.status === 'COMPLETED')) {
    k.text(`📄 ${trim(o.product_name)}`, to('order', o.external_order_id)).row();
  }
  k.pager({ page, totalPages: pages, make: (n) => to('orders', String(n)) });
  k.text('« رجوع', to('profile'));

  return { text: `📋 <b>طلباتي</b>\n${RULE}\n${body}`, kb: k.build() };
});

// ---------- تفاصيل طلب ----------
screen('order', async (ctx, [ext]) => {
  const u = await ensureUser(ctx.from);
  const { data: o } = await db.from('orders')
    .select('*').eq('external_order_id', ext).eq('user_id', u.id).maybeSingle();

  if (!o) return { text: '❌ الطلب غير موجود.',
                   kb: kb().text('« رجوع', to('orders', '1')).build() };

  const text = [
    `${statusIcon(o.status)} <b>${esc(o.product_name || '')}</b>`,
    RULE,
    `${E('receipt')} <code>${esc(o.gg_order_code || o.external_order_id)}</code>`,
    `${E('money')} ${money(o.charged_usd)}`,
    `📅 ${arTime(o.created_at)}`,
    o.status === 'COMPLETED' && o.delivery ? `\n${renderDelivery(o.delivery)}` : null,
    o.status === 'PENDING'  ? `\n⏳ قيد التنفيذ — رح يوصلك التسليم تلقائياً.` : null,
    o.status === 'REFUNDED' ? `\n↩️ تم إرجاع المبلغ لرصيدك.` : null,
    o.status === 'NEEDS_REVIEW' ? `\n🔴 قيد المراجعة — تواصل مع الدعم.` : null,
  ].filter(Boolean).join('\n');

  return { text, kb: kb().text('« رجوع', to('orders', '1')).build() };
});

// ---------- كشف المحفظة ----------
screen('ledger', async (ctx, [pageStr]) => {
  const page = Math.max(1, Number(pageStr || 1));
  const u = await ensureUser(ctx.from);
  const from = (page - 1) * 10;

  const { data, count } = await db.from('ledger')
    .select('amount, type, ref, created_at', { count: 'exact' })
    .eq('user_id', u.id).order('created_at', { ascending: false })
    .range(from, from + 9);

  const pages = Math.max(1, Math.ceil((count || 0) / 10));
  const label = { DEPOSIT: 'إيداع', PURCHASE: 'شراء', REFUND: 'إرجاع',
                  REFERRAL: 'إحالة', WITHDRAW: 'سحب', ADJUST: 'تعديل' };

  const body = data?.length
    ? data.map((r) => {
        const amt = Number(r.amount);
        return `${amt >= 0 ? '🟢 +' : '🔴 '}${amt.toFixed(2)}$ · ${label[r.type] || r.type}\n` +
               `    <i>${arDate(r.created_at)}</i>`;
      }).join('\n')
    : 'ما في حركات بعد.';

  const k = kb();
  k.pager({ page, totalPages: pages, make: (n) => to('ledger', String(n)) });
  k.text('« رجوع', to('profile'));

  return { text: `🏦 <b>كشف المحفظة</b>\n${RULE}\n${E('balance')} الرصيد: <b>${money(u.balance)}</b>\n\n${body}`,
           kb: k.build() };
});

// ---------- الدعوات ----------
screen('invites', async (ctx) => {
  const u  = await ensureUser(ctx.from);
  const me = await ctx.api.getMe();
  const { count } = await db.from('users')
    .select('id', { count: 'exact', head: true }).eq('referred_by', u.id);

  const link = `https://t.me/${me.username}?start=${u.ref_code}`;
  const pct  = Snum('referral_pct', 0);

  const text = [
    `${E('gift')} <b>الدعوات</b>`, RULE,
    pct > 0 ? `اربح <b>${pct}%</b> من كل عملية شراء يعملها من تدعوه — للأبد.` : 'شارك رابطك مع أصدقائك:',
    ``, `<code>${link}</code>`, ``,
    `👥 عدد المدعوين: <b>${count ?? 0}</b>`,
    `💵 أرباحك: <b>${money(u.ref_earned)}</b>`,
  ].join('\n');

  return { text, kb: kb()
    .url('📤 مشاركة الرابط', `https://t.me/share/url?url=${encodeURIComponent(link)}`).row()
    .text('« الرئيسية', to('home')).build() };
});
