// ============================================================
//  لوحة التحكم — كل شي بينتحكم فيه من هون بدون لمس الكود
// ============================================================
import { screen, to, go } from '../nav.js';
import { kb } from '../kb.js';
import { db, rpc } from '../../lib/db.js';
import { esc, money, RULE, arDate, statusIcon, trim } from '../../lib/fmt.js';
import { loadAll, invalidate, S, T, Sbool, Snum, setSetting, margins } from '../../lib/settings.js';
import { listPrice, flatMode } from '../../core/pricing.js';
import { listAllProviders } from '../../core/catalog.js';
import { ask } from '../input.js';
import { isAdmin } from '../../config.js';

const guard = (ctx) => isAdmin(ctx.from.id);
const denied = { text: '⛔️ غير مصرّح.', kb: kb().text('« الرئيسية', to('home')).build() };

// ---------- الرئيسية ----------
screen('admin', async (ctx) => {
  if (!guard(ctx)) return denied;

  const [wd, stuck, users, bp, paused] = await Promise.all([
    db.from('withdrawals').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
    db.from('orders').select('id', { count: 'exact', head: true }).in('status', ['PENDING', 'NEEDS_REVIEW']),
    db.from('users').select('id', { count: 'exact', head: true }),
    db.from('payments').select('id', { count: 'exact', head: true })
      .eq('status', 'PENDING').eq('method', 'BINANCE_PAY').not('external_id', 'is', null),
    db.from('products').select('slug', { count: 'exact', head: true })
      .eq('paused', true).is('deleted_at', null),
  ]);

  const badge = (n) => (n ? ` (${n})` : '');
  const text = [
    `⚙️ <b>لوحة التحكم</b>`, RULE,
    `👥 المستخدمين: <b>${users.count ?? 0}</b>`,
    `📤 طلبات سحب: <b>${wd.count ?? 0}</b>`,
    `⏳ طلبات عالقة: <b>${stuck.count ?? 0}</b>`,
    `🅱️ تحويلات Binance: <b>${bp.count ?? 0}</b>`,
    (paused.count ?? 0) > 0 ? `⏸ منتجات موقوفة: <b>${paused.count}</b>` : null,
  ].filter(Boolean).join('\n');

  const k = kb()
    .text('📊 الإحصائيات', to('a_stats')).text('💵 التسعير', to('a_pricing')).row()
    .text('⚖️ إعدادات الهامش', to('a_set', 'التسعير')).row()
    .text('🎨 المظهر', to('a_set', 'المظهر')).text('🔔 الإشعارات', to('a_set', 'الإشعارات')).row()
    .text('⚙️ النظام', to('a_set', 'النظام')).text('💳 الدفع', to('a_set', 'الدفع')).row()
    .text('📝 النصوص', to('a_texts')).text('😀 الإيموجي', to('a_emoji')).row()
    .text('🗂 المزوّدين', to('a_provs')).text('🚪 البوابة', to('a_gate')).row()
    .text('💵 شرائح الهامش', to('a_margins')).row()
    .text('📦 المنتجات', to('a_prods', '1')).row()
    .text(`📤 السحوبات${badge(wd.count)}`, to('a_wds')).row()
    .text(`⏳ الطلبات العالقة${badge(stuck.count)}`, to('a_stuck')).row()
    .text(`🅱️ تحويلات Binance${badge(bp.count)}`, to('a_pays'))
    .text(`⏸ منتجات موقوفة${badge(paused.count)}`, to('a_paused')).row()
    .text('👤 بحث مستخدم', to('a_ufind')).text('🎟 إنشاء قسيمة', to('a_vnew')).row()
    .text('📣 بث رسالة', to('a_bc')).text('🔄 مزامنة الآن', to('a_sync')).row()
    .text('« الرئيسية', to('home'));

  return { text, kb: k.build() };
});

// ---------- الإحصائيات ----------
screen('a_stats', async (ctx) => {
  if (!guard(ctx)) return denied;
  const since = new Date(Date.now() - 30 * 864e5).toISOString();

  const { data: rows } = await db.from('orders')
    .select('charged_usd, actual_cost_usd, status, created_at')
    .eq('status', 'COMPLETED').gte('created_at', since);

  const rev  = (rows || []).reduce((a, r) => a + Number(r.charged_usd || 0), 0);
  const cost = (rows || []).reduce((a, r) => a + Number(r.actual_cost_usd || 0), 0);
  const day  = (rows || []).filter((r) => Date.now() - new Date(r.created_at) < 864e5);
  const dayRev = day.reduce((a, r) => a + Number(r.charged_usd || 0), 0);

  const { data: bal } = await db.from('users').select('balance');
  const held = (bal || []).reduce((a, r) => a + Number(r.balance || 0), 0);

  const text = [
    `📊 <b>الإحصائيات — آخر 30 يوم</b>`, RULE,
    `🛒 الطلبات: <b>${rows?.length ?? 0}</b>`,
    `💵 المبيعات: <b>${money(rev)}</b>`,
    `💸 التكلفة: <b>${money(cost)}</b>`,
    `📈 الربح: <b>${money(rev - cost)}</b>`,
    rev > 0 ? `📐 هامش فعلي: <b>${(((rev - cost) / rev) * 100).toFixed(1)}%</b>` : null,
    RULE,
    `🕐 مبيعات اليوم: <b>${money(dayRev)}</b> (${day.length} طلب)`,
    `🏦 أرصدة الزبائن عندك: <b>${money(held)}</b>`,
  ].filter(Boolean).join('\n');

  return { text, kb: kb().text('« رجوع', to('admin')).build() };
});

// ---------- الإعدادات حسب المجموعة ----------
screen('a_set', async (ctx, [grp]) => {
  if (!guard(ctx)) return denied;
  await loadAll(true);

  const { data } = await db.from('settings')
    .select('*').eq('grp', grp).order('sort_order');

  const k = kb();
  for (const s of data || []) {
    const val = s.kind === 'bool'
      ? (Sbool(s.key) ? '🟢 مفعّل' : '🔴 مطفأ')
      : (S(s.key) || '—');
    k.text(`${s.label}: ${val}`, to('a_seti', s.key)).row();
  }
  k.text('« رجوع', to('admin'));

  return { text: `⚙️ <b>${esc(grp)}</b>\n${RULE}\nاضغط أي إعداد لتعديله.`, kb: k.build() };
});

screen('a_seti', async (ctx, [key]) => {
  if (!guard(ctx)) return denied;
  const { data: s } = await db.from('settings').select('*').eq('key', key).maybeSingle();
  if (!s) return { text: 'إعداد غير موجود.', kb: kb().text('« رجوع', to('admin')).build() };

  // التبديل المنطقي فوري بدون إدخال
  if (s.kind === 'bool') {
    const next = Sbool(key) ? 'off' : 'on';
    await setSetting(key, next);
    return { text: `${s.label}: ${next === 'on' ? '🟢 مفعّل' : '🔴 مطفأ'}`,
             kb: kb().text('« رجوع', to('a_set', s.grp)).build() };
  }

  ask(ctx.from.id, 'setting', { key, grp: s.grp });
  return { text: `✏️ <b>${esc(s.label)}</b>\n${RULE}\n` +
                 `القيمة الحالية: <code>${esc(s.value || '—')}</code>\n\nابعت القيمة الجديدة:`,
           kb: kb().text('« رجوع', to('a_set', s.grp)).build() };
});

// ---------- النصوص ----------
screen('a_texts', async (ctx) => {
  if (!guard(ctx)) return denied;
  const { data } = await db.from('texts').select('key, label, content').order('key');
  const k = kb();
  for (const t of data || []) {
    k.text(`${t.label}${t.content ? '' : ' ⚠️'}`, to('a_text', t.key)).row();
  }
  k.text('« رجوع', to('admin'));
  return { text: `📝 <b>النصوص</b>\n${RULE}\n⚠️ = فاضي.\nالنصوص بتدعم وسوم HTML.`,
           kb: k.build() };
});

screen('a_text', async (ctx, [key]) => {
  if (!guard(ctx)) return denied;
  const { data: t } = await db.from('texts').select('*').eq('key', key).maybeSingle();
  ask(ctx.from.id, 'text', { key });
  return { text: `✏️ <b>${esc(t?.label || key)}</b>\n${RULE}\n` +
                 `<b>الحالي:</b>\n${t?.content ? t.content : '<i>فاضي</i>'}\n\n` +
                 `${RULE}\nابعت النص الجديد (HTML مسموح):`,
           kb: kb().text('« رجوع', to('a_texts')).build() };
});

// ---------- الإيموجي ----------
screen('a_emoji', async (ctx) => {
  if (!guard(ctx)) return denied;
  const { data } = await db.from('ui_emoji').select('*').order('key');
  const k = kb().grid(data || [], {
    cols: 2,
    label: (e) => `${e.fallback} ${e.label}${e.custom_id ? ' ⭐️' : ''}`,
    data:  (e) => to('a_emo', e.key),
  });
  k.text('« رجوع', to('admin'));

  return { text: `😀 <b>الإيموجي</b>\n${RULE}\n` +
                 `${Sbool('premium_emoji') ? '🟢' : '🔴'} البريميوم: ` +
                 `${Sbool('premium_emoji') ? 'مفعّل' : 'مطفأ'} — بدّله من «المظهر».\n\n` +
                 `⭐️ = عليه إيموجي مخصص.\n` +
                 `<blockquote>الإيموجي المخصص بيشتغل بس إذا صاحب البوت عنده Telegram Premium. ` +
                 `المستخدم العادي بيشوف الإيموجي البديل، فما بينكسر شي.</blockquote>`,
           kb: k.build() };
});

screen('a_emo', async (ctx, [key]) => {
  if (!guard(ctx)) return denied;
  const { data: e } = await db.from('ui_emoji').select('*').eq('key', key).maybeSingle();
  ask(ctx.from.id, 'emoji', { key });
  return { text: `😀 <b>${esc(e?.label || key)}</b>\n${RULE}\n` +
                 `البديل: ${e?.fallback}\n` +
                 `المخصص: <code>${esc(e?.custom_id || '—')}</code>\n\n` +
                 `ابعت <b>معرّف الإيموجي المخصص</b> (أرقام)، أو ابعت <code>-</code> للحذف.\n` +
                 `<i>لجلب المعرّف: ابعت الإيموجي لبوت مستخرج معرّفات.</i>`,
           kb: kb().text('« رجوع', to('a_emoji')).build() };
});

// ---------- المنتجات ----------
screen('a_prods', async (ctx, [pageStr]) => {
  if (!guard(ctx)) return denied;
  const page = Math.max(1, Number(pageStr || 1));
  const from = (page - 1) * 10;

  const { data, count } = await db.from('products')
    .select('slug, name, cost_price, catalog_price, sell_price, price_override, ' +
            'visible, in_stock, stock_count, deleted_at, paused', { count: 'exact' })
    .order('provider_key').order('sort_order').range(from, from + 9);

  const pages = Math.max(1, Math.ceil((count || 0) / 10));
  const k = kb();
  for (const p of data || []) {
    const margin = listPrice(p) - Number(p.cost_price);
    const flag = p.deleted_at ? '🗑' : p.paused ? '⏸' : (p.visible ? '👁' : '🚫');
    k.text(`${flag}${p.in_stock ? '' : '·'} ${trim(p.name, 20)} ` +
           `${money(listPrice(p))} (+${margin.toFixed(2)})`, to('a_prod', p.slug)).row();
  }
  k.pager({ page, totalPages: pages, make: (n) => to('a_prods', String(n)) });
  k.text('« رجوع', to('admin'));

  return { text: `📦 <b>المنتجات</b>\n${RULE}\n👁 ظاهر · 🚫 مخفي · 🗑 محذوف من كتالوجهم\n` +
                 `الرقم بين قوسين = ربحك للوحدة.`,
           kb: k.build() };
});

screen('a_prod', async (ctx, [slug]) => {
  if (!guard(ctx)) return denied;
  const { data: p } = await db.from('products').select('*').eq('slug', slug).maybeSingle();
  if (!p) return { text: 'منتج غير موجود.', kb: kb().text('« رجوع', to('a_prods', '1')).build() };

  const price  = listPrice(p);
  const margin = price - Number(p.cost_price);

  const text = [
    `📦 <b>${esc(p.name)}</b>`, RULE,
    `<code>${esc(p.slug)}</code>`,
    `💸 تكلفتك: <b>${money(p.cost_price)}</b>` +
      (p.catalog_price ? `  <i>(سعرهم المعلن ${money(p.catalog_price)})</i>` : ''),
    `💵 سعر البيع: <b>${money(price)}</b>` + (p.price_override != null ? ' <i>(يدوي)</i>' : ''),
    `📈 الربح: <b>${money(margin)}</b>` +
      (Number(p.cost_price) > 0 ? ` (${((margin / Number(p.cost_price)) * 100).toFixed(0)}%)` : ''),
    `🏷 هامش خاص: ${p.markup_pct != null ? p.markup_pct + '%' : 'العام'}`,
    `📊 المخزون: ${p.in_stock ? `🟢 ${p.stock_count}` : '🔴 نافد'}` +
      (p.prev_stock != null && p.stock_count !== p.prev_stock
        ? ` <i>(كان ${p.prev_stock})</i>` : ''),
    `${p.visible ? '👁 ظاهر' : '🚫 مخفي'}` + (p.deleted_at ? ' · 🗑 محذوف من كتالوجهم' : ''),
    p.paused ? `⏸ <b>البيع موقوف</b> — ${esc(p.paused_reason || '')}` : null,
    RULE,
    `<i>الوصف والتعليمات بتنسحب من GGSoma تلقائياً.</i>`,
    `📄 الوصف: ${p.desc_override ? '✏️ تجاوز يدوي' : (p.description ? '🔄 من GGSoma' : '—')}`,
    `📋 التعليمات: ${p.instr_override ? '✏️ تجاوز يدوي' : (p.instructions ? '🔄 من GGSoma' : '—')}`,
    p.details_synced_at ? `🕐 آخر سحب: ${arDate(p.details_synced_at)}` : '🕐 ما انسحبت بعد',
  ].filter(Boolean).join('\n');

  const k = kb()
    .text('💵 سعر يدوي', to('a_pset', slug, 'price'))
    .text('🏷 هامش خاص', to('a_pset', slug, 'markup')).row()
    .text(p.visible ? '🚫 إخفاء' : '👁 إظهار', to('a_ptoggle', slug))
    .add(p.paused ? { text: '▶️ استئناف البيع', data: to('a_resume', slug), style: 'success' }
                  : { text: '✅ البيع شغّال', data: 'noop' }).row()
    .text(`📄 الوصف${p.desc_override ? ' ✏️' : ''}`, to('a_pset', slug, 'desc'))
    .text(`📋 التعليمات${p.instr_override ? ' ✏️' : ''}`, to('a_pset', slug, 'instr')).row()
    .text('« رجوع', to('a_prods', '1'));

  return { text, kb: k.build() };
});

screen('a_ptoggle', async (ctx, [slug]) => {
  if (!guard(ctx)) return denied;
  const { data: p } = await db.from('products').select('visible').eq('slug', slug).maybeSingle();
  await db.from('products').update({ visible: !p.visible }).eq('slug', slug);
  const { data: n } = await db.from('products').select('*').eq('slug', slug).maybeSingle();
  return { text: `${n.visible ? '👁 صار ظاهر' : '🚫 صار مخفي'}: ${esc(n.name)}`,
           kb: kb().text('« تفاصيل المنتج', to('a_prod', slug)).row()
                   .text('« القائمة', to('a_prods', '1')).build() };
});

screen('a_pset', async (ctx, [slug, field]) => {
  if (!guard(ctx)) return denied;
  const labels = {
    price:  'السعر اليدوي (رقم، أو <code>-</code> للرجوع للحساب التلقائي)',
    markup: 'الهامش الخاص % (رقم، أو <code>-</code> لاستعمال الهامش العام)',
    desc:   'تجاوز الوصف (HTML مسموح، أو <code>-</code> للرجوع لنص GGSoma)',
    instr:  'تجاوز التعليمات (أو <code>-</code> للرجوع لنص GGSoma)',
  };
  ask(ctx.from.id, 'product', { slug, field });
  return { text: `✏️ ${labels[field]}\n${RULE}\nابعت القيمة:`,
           kb: kb().text('« رجوع', to('a_prod', slug)).build() };
});

// ---------- الإيداعات ----------
// ---------- السحوبات ----------
screen('a_wds', async (ctx) => {
  if (!guard(ctx)) return denied;
  const { data } = await db.from('withdrawals')
    .select('*, users!inner(tg_id, first_name)')
    .eq('status', 'PENDING').order('created_at').limit(10);

  if (!data?.length) return { text: '📤 ما في طلبات سحب معلّقة.',
                              kb: kb().text('« رجوع', to('admin')).build() };

  const k = kb();
  for (const w of data) {
    k.text(`#${w.id} · ${money(w.amount)} · ${esc(w.users.first_name || w.users.tg_id)}`,
           to('a_wd', String(w.id))).row();
  }
  k.text('« رجوع', to('admin'));
  return { text: `📤 <b>طلبات السحب</b>\n${RULE}`, kb: k.build() };
});

screen('a_wd', async (ctx, [id]) => {
  if (!guard(ctx)) return denied;
  const { data: w } = await db.from('withdrawals')
    .select('*, users!inner(tg_id, first_name)').eq('id', id).maybeSingle();
  if (!w) return { text: 'غير موجود.', kb: kb().text('« رجوع', to('a_wds')).build() };

  const text = [
    `📤 <b>سحب #${w.id}</b>`, RULE,
    `👤 ${esc(w.users.first_name || '')} · <code>${w.users.tg_id}</code>`,
    `💵 المبلغ: <b>${money(w.amount)}</b>`,
    `🏦 Binance ID: <code>${esc(w.binance_id || '—')}</code>`,
    `📅 ${arDate(w.created_at)}`,
    ``, `<i>المبلغ محجوز من رصيده مسبقاً. الرفض بيرجّعه.</i>`,
  ].join('\n');

  return { text, kb: kb()
    .add({ text: '✅ تم الدفع', data: to('a_wdok', id), style: 'success' }).row()
    .add({ text: '❌ رفض وإرجاع', data: to('a_wdno', id), style: 'danger' }).row()
    .text('« رجوع', to('a_wds')).build() };
});

// ---------- الطلبات العالقة ----------
screen('a_stuck', async (ctx) => {
  if (!guard(ctx)) return denied;
  const { data } = await db.from('orders')
    .select('external_order_id, product_name, charged_usd, status, attempts, error_code, created_at')
    .in('status', ['PENDING', 'NEEDS_REVIEW'])
    .order('created_at').limit(15);

  if (!data?.length) return { text: '✅ ما في طلبات عالقة.',
                              kb: kb().text('« رجوع', to('admin')).build() };

  const body = data.map((o) =>
    `${statusIcon(o.status)} <b>${esc(o.product_name || '')}</b> · ${money(o.charged_usd)}\n` +
    `    <code>${o.external_order_id}</code>\n` +
    `    محاولات: ${o.attempts} · ${o.error_code || '—'}`
  ).join('\n\n');

  const k = kb();
  for (const o of data.filter((x) => x.status === 'NEEDS_REVIEW')) {
    k.text(`↩️ إرجاع ${trim(o.product_name, 18)}`, to('a_refund', o.external_order_id)).row();
  }
  k.text('« رجوع', to('admin'));

  return { text: `⏳ <b>الطلبات العالقة</b>\n${RULE}\n${body}\n\n` +
                 `<i>PENDING بيتحسم تلقائياً. NEEDS_REVIEW لازم تفحصه بلوحة GGSoma قبل الإرجاع.</i>`,
           kb: k.build() };
});

screen('a_refund', async (ctx, [ext]) => {
  if (!guard(ctx)) return denied;
  await rpc('refund_order', { p_ext: ext, p_error_code: 'ADMIN_REFUND' });
  return { text: `↩️ تم إرجاع المبلغ للزبون.\n<code>${esc(ext)}</code>`,
           kb: kb().text('« رجوع', to('a_stuck')).build() };
});

// ---------- أدوات ----------
screen('a_ufind', async (ctx) => {
  if (!guard(ctx)) return denied;
  ask(ctx.from.id, 'find_user');
  return { text: `👤 ابعت معرّف تلغرام (رقم) أو @يوزر:`,
           kb: kb().text('« رجوع', to('admin')).build() };
});

screen('a_user', async (ctx, [tgId]) => {
  if (!guard(ctx)) return denied;
  const { data: u } = await db.from('users').select('*').eq('tg_id', tgId).maybeSingle();
  if (!u) return { text: 'مستخدم غير موجود.', kb: kb().text('« رجوع', to('admin')).build() };

  const { count } = await db.from('orders')
    .select('id', { count: 'exact', head: true }).eq('user_id', u.id).eq('status', 'COMPLETED');

  const text = [
    `👤 <b>${esc(u.first_name || '')}</b> ${u.username ? '@' + esc(u.username) : ''}`,
    RULE,
    `🆔 <code>${u.tg_id}</code>`,
    `💰 الرصيد: <b>${money(u.balance)}</b>`,
    `💸 المصروف: ${money(u.total_spent)}`,
    `🛒 الطلبات: ${count ?? 0}`,
    `🎁 أرباح إحالة: ${money(u.ref_earned)}`,
    `📅 ${arDate(u.created_at)}`,
    u.banned ? `\n🚫 <b>محظور</b>` : null,
  ].filter(Boolean).join('\n');

  return { text, kb: kb()
    .text('💵 تعديل الرصيد', to('a_ubal', tgId)).row()
    .add({ text: u.banned ? '✅ فكّ الحظر' : '🚫 حظر',
           data: to('a_uban', tgId), style: u.banned ? 'success' : 'danger' }).row()
    .text('« رجوع', to('admin')).build() };
});

screen('a_ubal', async (ctx, [tgId]) => {
  if (!guard(ctx)) return denied;
  ask(ctx.from.id, 'adj_balance', { tgId });
  return { text: `💵 ابعت المبلغ.\nموجب للشحن (<code>10</code>)، سالب للخصم (<code>-5</code>):`,
           kb: kb().text('« رجوع', to('a_user', tgId)).build() };
});

screen('a_uban', async (ctx, [tgId]) => {
  if (!guard(ctx)) return denied;
  const { data: u } = await db.from('users').select('banned').eq('tg_id', tgId).maybeSingle();
  await db.from('users').update({ banned: !u.banned }).eq('tg_id', tgId);
  return { text: !u.banned ? '🚫 تم الحظر.' : '✅ تم فكّ الحظر.',
           kb: kb().text('« رجوع', to('a_user', tgId)).build() };
});

screen('a_vnew', async (ctx) => {
  if (!guard(ctx)) return denied;
  ask(ctx.from.id, 'voucher_new');
  return { text: `🎟 <b>إنشاء قسيمة</b>\n${RULE}\n` +
                 `ابعت: <code>المبلغ العدد</code>\nمثال: <code>5 10</code> = 10 قسائم بقيمة 5$`,
           kb: kb().text('« رجوع', to('admin')).build() };
});

screen('a_bc', async (ctx) => {
  if (!guard(ctx)) return denied;
  const { count } = await db.from('users')
    .select('id', { count: 'exact', head: true }).eq('banned', false);
  ask(ctx.from.id, 'broadcast');
  return { text: `📣 <b>بث رسالة</b>\n${RULE}\n` +
                 `المستلمين: <b>${count ?? 0}</b>\nابعت نص الرسالة (HTML مسموح):`,
           kb: kb().text('« رجوع', to('admin')).build() };
});

// ---------- إجراءات السحب ----------
screen('a_wdok', async (ctx, [id]) => {
  if (!guard(ctx)) return denied;
  const { data: w } = await db.from('withdrawals')
    .select('*, users!inner(tg_id)').eq('id', id).maybeSingle();
  if (!w || w.status !== 'PENDING')
    return { text: 'الطلب مو معلّق.', kb: kb().text('« رجوع', to('a_wds')).build() };

  await db.from('withdrawals').update({ status: 'PAID' }).eq('id', id);
  ctx.api.sendMessage(w.users.tg_id,
    `✅ تم تحويل <b>${money(w.amount)}</b> على Binance ID تبعك.`,
    { parse_mode: 'HTML' }).catch(() => {});

  return { text: `✅ تم تعليم السحب #${id} كمدفوع.`,
           kb: kb().text('« رجوع', to('a_wds')).build() };
});

screen('a_wdno', async (ctx, [id]) => {
  if (!guard(ctx)) return denied;
  const { data: w } = await db.from('withdrawals')
    .select('*, users!inner(tg_id)').eq('id', id).maybeSingle();

  await rpc('reject_withdrawal', { p_id: Number(id), p_note: 'رفض إداري' });
  if (w) ctx.api.sendMessage(w.users.tg_id,
    `❌ تم رفض طلب السحب. رجّعنا <b>${money(w.amount)}</b> لرصيدك.`,
    { parse_mode: 'HTML' }).catch(() => {});

  return { text: `❌ تم الرفض وإرجاع المبلغ.`,
           kb: kb().text('« رجوع', to('a_wds')).build() };
});

// ---------- مزامنة يدوية ----------
screen('a_sync', async (ctx) => {
  if (!guard(ctx)) return denied;
  const { syncCatalog } = await import('../../core/catalog.js');
  const { gg } = await import('../../lib/ggsoma.js');

  try {
    const r = await syncCatalog();
    let extra = '';
    try {
      const [b, u] = await Promise.all([gg.balance(), gg.usage()]);
      extra = `\n${RULE}\n💼 رصيدك عند GGSoma: <b>${money(b.balance)}</b>\n` +
              `📦 طلبات API: ${u.apiOrdersTotal} (24س: ${u.apiOrders24h})\n` +
              `💸 إنفاق كلي: ${money(u.apiSpendTotal)}`;
    } catch { extra = '\n⚠️ ما قدرنا نقرأ رصيد GGSoma.'; }

    return { text: `🔄 <b>تمت المزامنة</b>\n${RULE}\n` +
                   `مزوّدين: <b>${r.providers}</b>\nمنتجات: <b>${r.products}</b>\n` +
                   `🆕 جديد: ${r.added} · 🔄 عاد للمخزون: ${r.restocked} · 🗑 محذوف: ${r.removed}` + extra,
             kb: kb().text('« رجوع', to('admin')).build() };
  } catch (e) {
    return { text: `❌ فشلت المزامنة:\n<code>${esc(e.code || e.message)}</code>`,
             kb: kb().text('« رجوع', to('admin')).build() };
  }
});

// ============================================================
//  مراجعة دفعات Binance Pay
// ============================================================
screen('a_payok', async (ctx, [orderId]) => {
  if (!guard(ctx)) return denied;
  const { getPaymentRow, creditPayment } = await import('../../core/payments.js');

  const row = await getPaymentRow(orderId);
  if (!row) return { text: 'الدفعة غير موجودة.', kb: kb().text('« رجوع', to('a_pays')).build() };

  const r = await creditPayment(orderId, row.external_id);
  if (!r.credited) {
    return { text: `ℹ️ هالدفعة انشحنت من قبل.\nرصيد الزبون: ${money(r.new_balance)}`,
             kb: kb().text('« رجوع', to('a_pays')).build() };
  }

  ctx.api.sendMessage(row.users.tg_id,
    `✅ تم تأكيد تحويلك.\n💵 انضاف <b>${money(r.amount)}</b>\n💰 رصيدك: <b>${money(r.new_balance)}</b>`,
    { parse_mode: 'HTML' }).catch(() => {});

  return { text: `✅ تم شحن ${money(r.amount)} للزبون.\nرصيده صار ${money(r.new_balance)}.`,
           kb: kb().text('« الدفعات', to('a_pays')).build() };
});

screen('a_payno', async (ctx, [orderId]) => {
  if (!guard(ctx)) return denied;
  const { getPaymentRow, setPayment } = await import('../../core/payments.js');

  const row = await getPaymentRow(orderId);
  if (!row) return { text: 'الدفعة غير موجودة.', kb: kb().text('« رجوع', to('a_pays')).build() };
  if (row.credited)
    return { text: '⚠️ هالدفعة انشحنت من قبل — ما بينفع ترفضها.',
             kb: kb().text('« رجوع', to('a_pays')).build() };

  await setPayment(orderId, { status: 'FAILED' });
  ctx.api.sendMessage(row.users.tg_id,
    '❌ ما قدرنا نتأكد من تحويلك. تواصل مع الدعم مع رقم العملية.').catch(() => {});

  return { text: '❌ تم رفض الدفعة.', kb: kb().text('« الدفعات', to('a_pays')).build() };
});

screen('a_pays', async (ctx) => {
  if (!guard(ctx)) return denied;
  const { data } = await db.from('payments')
    .select('*, users!inner(tg_id, first_name)')
    .eq('status', 'PENDING').eq('method', 'BINANCE_PAY')
    .not('external_id', 'is', null)
    .order('created_at').limit(10);

  if (!data?.length)
    return { text: '🅱️ ما في تحويلات Binance بانتظار المراجعة.',
             kb: kb().text('« رجوع', to('admin')).build() };

  const k = kb();
  for (const p of data) {
    k.text(`${money(p.amount_usd)} · ${esc(p.users.first_name || p.users.tg_id)}`,
           to('a_pay', p.order_id)).row();
  }
  k.text('« رجوع', to('admin'));
  return { text: `🅱️ <b>تحويلات Binance Pay</b>\n${RULE}\nاضغط لمراجعة التحويل.`, kb: k.build() };
});

screen('a_pay', async (ctx, [orderId]) => {
  if (!guard(ctx)) return denied;
  const { getPaymentRow } = await import('../../core/payments.js');
  const row = await getPaymentRow(orderId);
  if (!row) return { text: 'غير موجودة.', kb: kb().text('« رجوع', to('a_pays')).build() };

  const text = [
    `🅱️ <b>تحويل Binance Pay</b>`, RULE,
    `👤 ${esc(row.users.first_name || '')} · <code>${row.users.tg_id}</code>`,
    `💵 المبلغ: <b>${money(row.amount_usd)}</b>`,
    `🔢 TxID: <code>${esc(row.external_id || '—')}</code>`,
    `📅 ${arDate(row.created_at)}`,
    ``, `<i>تحقّق من وصول التحويل بحسابك قبل الموافقة.</i>`,
  ].join('\n');

  return { text, kb: kb()
    .add({ text: `✅ موافقة · ${money(row.amount_usd)}`, data: to('a_payok', orderId), style: 'success' }).row()
    .add({ text: '❌ رفض', data: to('a_payno', orderId), style: 'danger' }).row()
    .text('« رجوع', to('a_pays')).build() };
});

// ============================================================
//  المنتجات الموقوفة (حماية الهامش)
// ============================================================
screen('a_paused', async (ctx) => {
  if (!guard(ctx)) return denied;
  const { data } = await db.from('products')
    .select('slug, name, cost_price, sell_price, price_override, paused_reason')
    .eq('paused', true).is('deleted_at', null).limit(20);

  if (!data?.length)
    return { text: '✅ ما في منتجات موقوفة — كل الهوامش سليمة.',
             kb: kb().text('« رجوع', to('admin')).build() };

  const k = kb();
  for (const p of data) k.text(`⏸ ${trim(p.name, 24)}`, to('a_prod', p.slug)).row();
  k.text('« رجوع', to('admin'));

  const body = data.map((p) =>
    `⏸ <b>${esc(p.name)}</b>\n    ${esc(p.paused_reason || '')}`).join('\n\n');

  return { text: `⏸ <b>منتجات موقوفة عن البيع</b>\n${RULE}\n${body}\n\n` +
                 `<i>عدّل السعر وبتستأنف تلقائياً بالمزامنة الجاية.</i>`,
           kb: k.build() };
});

screen('a_resume', async (ctx, [slug]) => {
  if (!guard(ctx)) return denied;
  await db.from('products').update({ paused: false, paused_reason: null }).eq('slug', slug);
  return { text: '▶️ تم استئناف البيع.\n<i>لو الهامش لسّه تحت الحد، المزامنة رح توقفه مرة تانية.</i>',
           kb: kb().text('« تفاصيل المنتج', to('a_prod', slug)).build() };
});

// ============================================================
//  شاشة التسعير — الحساب واضح قدامك
// ============================================================
screen('a_pricing', async (ctx) => {
  if (!guard(ctx)) return denied;
  const { Snum, Sbool } = await import('../../lib/settings.js');
  const { basePrice, maxTierDiscount } = await import('../../core/pricing.js');

  const mk    = Snum('markup_pct', 40);
  const step  = Snum('round_to', 0.25);
  const floor = Snum('min_price', 0);
  const after = Sbool('margin_after_discount', false);
  const maxD  = maxTierDiscount();

  const [{ count: total }, { count: manual }, { count: custom }] = await Promise.all([
    db.from('products').select('slug', { count: 'exact', head: true }).is('deleted_at', null),
    db.from('products').select('slug', { count: 'exact', head: true })
      .not('price_override', 'is', null).is('deleted_at', null),
    db.from('products').select('slug', { count: 'exact', head: true })
      .not('markup_pct', 'is', null).is('deleted_at', null),
  ]);

  // أمثلة حيّة بالإعدادات الحالية
  const demo = [1, 2, 5].map((c) => {
    const p = basePrice(c, mk);
    const worst = p * (1 - maxD / 100);
    return `  ${money(c)} → <b>${money(p)}</b>` +
           (maxD > 0 ? `  <i>(أعلى مستوى يدفع ${money(worst)} · ربح ${money(worst - c)})</i>` : ` · ربح ${money(p - c)}`);
  }).join('\n');

  const text = [
    `💵 <b>التسعير</b>`, RULE,
    `<b>سعرك = التكلفة × (1 + ${mk}%)</b>`,
    `التكلفة بتنقرأ من GGSoma كل مزامنة، فالسعر بيتحرّك معها لحاله.`,
    ``,
    `📊 الهامش العام: <b>${mk}%</b>`,
    `🔢 التقريب لأعلى: <b>${step}</b>`,
    floor > 0 ? `⬇️ أدنى سعر: <b>${money(floor)}</b>` : null,
    `🛡 ضمان الهامش بعد الخصم: <b>${after ? '🟢 مفعّل' : '🔴 مطفأ'}</b>`,
    maxD > 0 ? `🏅 أعلى خصم مستوى: <b>${maxD}%</b>` : null,
    ``, `<b>أمثلة بالإعدادات الحالية:</b>`, demo,
    ``, RULE,
    `📦 المنتجات: <b>${total ?? 0}</b>`,
    `🔗 بتتابع التكلفة تلقائياً: <b>${(total ?? 0) - (manual ?? 0)}</b>`,
    (manual ?? 0) > 0 ? `✏️ سعر يدوي (ما بتتابع): <b>${manual}</b>` : null,
    (custom ?? 0) > 0 ? `🏷 هامش خاص: <b>${custom}</b>` : null,
  ].filter(Boolean).join('\n');

  const k = kb()
    .text(`📊 الهامش العام: ${mk}%`, to('a_seti', 'markup_pct')).row()
    .text(`🔢 التقريب: ${step}`, to('a_seti', 'round_to'))
    .text(`⬇️ أدنى سعر: ${floor}`, to('a_seti', 'min_price')).row()
    .text(`🛡 ضمان الهامش: ${after ? '🟢' : '🔴'}`, to('a_seti', 'margin_after_discount')).row();

  if ((manual ?? 0) > 0) {
    k.add({ text: `♻️ إلغاء كل الأسعار اليدوية (${manual})`, data: to('a_clearmanual'), style: 'danger' }).row();
    k.text('📋 المنتجات بسعر يدوي', to('a_manual')).row();
  }
  k.text('« رجوع', to('admin'));

  return { text, kb: k.build() };
});

screen('a_manual', async (ctx) => {
  if (!guard(ctx)) return denied;
  const { data } = await db.from('products')
    .select('slug, name, cost_price, sell_price, price_override')
    .not('price_override', 'is', null).is('deleted_at', null).limit(20);

  const body = (data || []).map((p) => {
    const diff = Number(p.price_override) - Number(p.sell_price);
    return `✏️ <b>${esc(p.name)}</b>\n` +
           `    يدوي ${money(p.price_override)} · محسوب ${money(p.sell_price)} ` +
           `(${diff >= 0 ? '+' : ''}${diff.toFixed(2)})`;
  }).join('\n');

  const k = kb();
  for (const p of data || []) k.text(`✏️ ${trim(p.name, 24)}`, to('a_prod', p.slug)).row();
  k.text('« رجوع', to('a_pricing'));

  return { text: `✏️ <b>منتجات بسعر يدوي</b>\n${RULE}\n${body}\n\n` +
                 `<i>هدول ما بيتابعوا تكلفة المورّد. لو نزلت تكلفتهم، سعرك بيضل مكانه.</i>`,
           kb: k.build() };
});

screen('a_clearmanual', async (ctx) => {
  if (!guard(ctx)) return denied;
  const { count } = await db.from('products')
    .select('slug', { count: 'exact', head: true }).not('price_override', 'is', null);

  await db.from('products').update({ price_override: null }).not('price_override', 'is', null);

  return { text: `♻️ تم إلغاء <b>${count ?? 0}</b> سعر يدوي.\n` +
                 `كل المنتجات رجعت تتابع التكلفة تلقائياً.\n\n` +
                 `<i>الأسعار بتنحدّث بالمزامنة الجاية.</i>`,
           kb: kb().add({ text: '🔄 مزامنة الآن', data: to('a_sync'), style: 'primary' }).row()
                   .text('« التسعير', to('a_pricing')).build() };
});


// ============================================================
//  إدارة المزوّدين
//
//  ليش يدوي: الوثائق §17 بتقول إن ترتيب وتخطيط بوت GGSoma
//  قواعد داخلية عندهم، والـ API بيعطي sortOrder بس. والإيموجي
//  يلي بيعرضوه إيموجي بريميوم مخصص — ما بيشتغل إلا لصاحب بوت
//  مشترك بريميوم. فمنخلّي الأدمن يضبط الشكل بنفسه.
// ============================================================
screen('a_provs', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return { text: '⛔️', kb: kb().build() };

  const provs = await listAllProviders();
  if (!provs.length) {
    return { text: '📭 ما في مزوّدين. شغّل المزامنة أول.',
             kb: kb().text('« رجوع', to('admin')).build() };
  }

  const k = kb();
  for (const p of provs) {
    const eye = p.visible ? '👁' : '🙈';
    const w   = p.full_width ? '▬' : '▪';
    k.text(`${eye}${w} ${p.emoji || '·'} ${p.name_override || p.name}`, to('a_prov', p.key)).row();
  }
  k.text('« رجوع', to('admin'));

  return {
    text: `🗂 <b>المزوّدين</b>\n\n` +
          `👁 ظاهر · 🙈 مخفي\n▬ سطر كامل · ▪ نص سطر\n\n` +
          `اضغط مزوّد لتعديله:`,
    kb: k.build(),
  };
});

screen('a_prov', async (ctx, [key]) => {
  if (!isAdmin(ctx.from.id)) return { text: '⛔️', kb: kb().build() };

  const { data: p } = await db.from('providers').select('*').eq('key', key).maybeSingle();
  if (!p) return { text: '❌ مزوّد غير موجود.',
                   kb: kb().text('« رجوع', to('a_provs')).build() };

  return {
    text: `🗂 <b>${esc(p.name_override || p.name)}</b>\n${RULE}\n` +
          `🔤 اسم GGSoma: <code>${esc(p.name)}</code>\n` +
          `✏️ الاسم المعروض: ${p.name_override ? esc(p.name_override) : '— نفس الأصلي'}\n` +
          `😀 الإيموجي: ${p.emoji || '— ما في'}\n` +
          `🔢 الترتيب: <b>${p.sort_order ?? 100}</b>\n` +
          `👁 الظهور: <b>${p.visible ? 'ظاهر' : 'مخفي'}</b>\n` +
          `↔️ العرض: <b>${p.full_width ? 'سطر كامل' : 'نص سطر'}</b>\n` +
          (p.custom_emoji_id
            ? `\n⭐ إيموجي مخصص محفوظ — بيظهر بس لو فعّلت «إيموجي بريميوم».`
            : ''),
    kb: kb()
      .text('✏️ غيّر الاسم', to('a_pvset', key, 'name')).row()
      .text('😀 غيّر الإيموجي', to('a_pvset', key, 'emoji')).row()
      .text('🔢 غيّر الترتيب', to('a_pvset', key, 'order')).row()
      .text(p.visible ? '🙈 إخفاء' : '👁 إظهار', to('a_pvtog', key, 'visible'))
      .text(p.full_width ? '▪ نص سطر' : '▬ سطر كامل', to('a_pvtog', key, 'width')).row()
      .text('« رجوع', to('a_provs'))
      .build(),
  };
});

screen('a_pvtog', async (ctx, [key, what]) => {
  if (!isAdmin(ctx.from.id)) return { text: '⛔️', kb: kb().build() };
  const col = what === 'width' ? 'full_width' : 'visible';
  const { data: p } = await db.from('providers').select(col).eq('key', key).maybeSingle();
  await db.from('providers').update({ [col]: !p?.[col] }).eq('key', key);
  return go(ctx, 'a_prov', [key]);
});

screen('a_pvset', async (ctx, [key, field]) => {
  if (!isAdmin(ctx.from.id)) return { text: '⛔️', kb: kb().build() };
  ask(ctx.from.id, 'provider', { key, field });
  return {
    text: field === 'emoji'
      ? `😀 أرسل الإيموجي الجديد (إيموجي واحد).\nأرسل <code>-</code> لحذفه.`
      : field === 'name'
      ? `✏️ أرسل الاسم المعروض، مثل <code>يوتيوب</code>.\n` +
        `أرسل <code>-</code> للرجوع لاسم GGSoma الأصلي.\n\n` +
        `<i>الاسم الأصلي بيضل محفوظ — المزامنة ما بتدهس تعديلك.</i>`
      : `🔢 أرسل رقم الترتيب.\nالأصغر بيطلع أول. مثال: <code>10</code>`,
    kb: kb().text('« إلغاء', to('a_prov', key)).build(),
  };
});


// ============================================================
//  بوابة الدخول — إجبار الاشتراك
// ============================================================
screen('a_gate', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return { text: '⛔️', kb: kb().build() };

  const on = Sbool('force_join', false);
  // ⚠️ T مو S — الروابط محفوظة بجدول texts مو settings.
  //    هون كانت الواجهة تعرض «فاضي» مهما حفظت.
  const f  = (k) => (T(k) || '').trim() || '— فاضي';

  return {
    text: `🚪 <b>بوابة الدخول</b>\n${RULE}\n` +
          `الحالة: <b>${on ? '🟢 مفعّلة' : '🔴 مطفأة'}</b>\n\n` +
          `💬 معرّف المجموعة: <code>${esc(f('join_group_id'))}</code>\n` +
          `🔗 رابط المجموعة: ${esc(f('join_group_url'))}\n\n` +
          `📢 معرّف القناة: <code>${esc(f('join_channel_id'))}</code>\n` +
          `🔗 رابط القناة: ${esc(f('join_channel_url'))}\n\n` +
          `<i>⚠️ البوت لازم يكون أدمن بالمجموعة وبالقناة، وإلا ما بيقدر\n` +
          `يتحقق من العضوية. لو فشل الفحص بيسمح بالدخول بدل ما يقفل الباب.</i>`,
    kb: kb()
      .text(on ? '🔴 إطفاء' : '🟢 تفعيل', to('a_gate_tog')).row()
      .text('💬 معرّف المجموعة', to('a_gate_set', 'join_group_id'))
      .text('🔗 رابط المجموعة', to('a_gate_set', 'join_group_url')).row()
      .text('📢 معرّف القناة', to('a_gate_set', 'join_channel_id'))
      .text('🔗 رابط القناة', to('a_gate_set', 'join_channel_url')).row()
      .text('« رجوع', to('admin'))
      .build(),
  };
});

screen('a_gate_tog', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return { text: '⛔️', kb: kb().build() };
  await setSetting('force_join', Sbool('force_join', false) ? 'off' : 'on');
  invalidate();
  await loadAll(true);
  return go(ctx, 'a_gate');
});

screen('a_gate_set', async (ctx, [key]) => {
  if (!isAdmin(ctx.from.id)) return { text: '⛔️', kb: kb().build() };
  ask(ctx.from.id, 'gate', { key });
  const isId = key.endsWith('_id');
  return {
    text: isId
      ? `أرسل معرّف الدردشة.\n\nطريقة سهلة: حوّل أي رسالة من المجموعة\n` +
        `إلى <code>@userinfobot</code> وبياخد المعرّف.\n` +
        `بيبدأ بـ <code>-100</code> عادةً.\n\nأرسل <code>-</code> للحذف.`
      : `أرسل الرابط، مثل <code>https://t.me/yourgroup</code>\n\nأرسل <code>-</code> للحذف.`,
    kb: kb().text('« إلغاء', to('a_gate')).build(),
  };
});


// ============================================================
//  شرائح الهامش الثابت
// ============================================================
screen('a_margins', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return { text: '⛔️', kb: kb().build() };

  const list = margins();
  const flat = flatMode();

  const rows = list.map((m, i) => {
    const from = i === 0 ? '0.00' : Number(list[i - 1].up_to).toFixed(2);
    const to   = m.up_to == null ? '∞' : Number(m.up_to).toFixed(2);
    return `${i + 1}. تكلفة <b>${from}$ – ${to}$</b> ← ربح <b>+${Number(m.add_usd).toFixed(2)}$</b>`;
  });

  return {
    text: `💵 <b>شرائح الهامش</b>\n${RULE}\n` +
          `الوضع: <b>${flat ? '🟢 هامش ثابت بالدولار' : '🔵 نسبة مئوية'}</b>\n\n` +
          (flat ? rows.join('\n') : `الهامش العام: <b>${Snum('markup_pct', 40)}%</b>`) +
          `\n\n<i>سعرك = التكلفة + ربح الشريحة. التكلفة بتنقرأ من GGSoma\n` +
          `كل دقيقة، فالسعر بيتحرّك لوحده لو غيّروا تكلفتهم.</i>\n\n` +
          `<i>للتعديل: الإعدادات ← التسعير، أو جدول margin_tiers بقاعدة البيانات.</i>`,
    kb: kb()
      .text(flat ? '🔵 حوّل لنسبة مئوية' : '🟢 حوّل لهامش ثابت', to('a_mm_tog')).row()
      .text('« رجوع', to('admin'))
      .build(),
  };
});

screen('a_mm_tog', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return { text: '⛔️', kb: kb().build() };
  await setSetting('margin_mode', flatMode() ? 'percent' : 'flat');
  invalidate();
  await loadAll(true);
  return go(ctx, 'a_margins');
});
