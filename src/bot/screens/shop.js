// ============================================================
//  شاشات المتجر: الرئيسية / المزوّدين / الخطط / المنتج / التأكيد
// ============================================================
import { screen, to } from '../nav.js';
import { kb, stockStyle } from '../kb.js';
import { ensureUser } from '../../lib/db.js';
import { E, Snum, Sbool } from '../../lib/settings.js';
import { esc, money, RULE, quote, deliveryLabel } from '../../lib/fmt.js';
import { listProviders, listProducts, getProduct, listAvailable, provName,
         productDesc, productInstr } from '../../core/catalog.js';
import { clip } from '../../lib/html.js';
import { welcomeText, t } from '../../lib/i18n.js';
import { markActive } from '../referrals.js';
import { finalPrice, listPrice } from '../../core/pricing.js';
import { isAdmin } from '../../config.js';

// ---------- الرئيسية ----------
// ما في أزرار inline هون — التنقّل صار من الكيبورد الثابت (menu.js).
// النص بينتحكم فيه من: ⚙️ لوحة التحكم ← 📝 النصوص ← رسالة الترحيب
screen('home', async (ctx) => {
  await ensureUser(ctx.from);
  return { text: welcomeText(ctx.lang), kb: kb().build() };
});

// ---------- المزوّدين ----------
screen('providers', async (ctx) => {
  // فتح المنتجات = تفاعل حقيقي. هون بينحسب المدعو لمُحيله.
  markActive(await ensureUser(ctx.from)).catch(() => {});

  const provs = await listProviders();
  if (!provs.length) {
    return { text: t(ctx, 'shop.empty'),
             kb: kb().text(t(ctx, 'btn.close'), to('close')).build() };
  }

  // عمودين افتراضياً، ومزوّد معلّم full_width بياخد سطر لحاله.
  //
  // ⚠️ التخطيط ما بيجي من الـ API — الوثائق §17 بتقول إن تخطيط
  // بوتهم قواعد داخلية عندهم. منضبطه من ⚙️ لوحة التحكم ← 🗂 المزوّدين.
  // ⚠️ الترتيب مهم: منجمّع الأزرار العادية بأزواج، وأي زر بعرض
  // كامل بيقطع الزوج. الخوارزمية القديمة كانت بتترك الزر السابق
  // يتيم بسطره لما يجي بعده زر عريض — لهيك كان VPN لحاله بالصورة.
  const k = kb();
  let pair = [];
  const flush = () => { if (pair.length) { pair.forEach((b) => k.add(b)); k.row(); pair = []; } };

  for (const p of provs) {
    const btn = {
      text: `${p.emoji || ''} ${provName(p)}`.trim(),
      data: to('plans', p.key, '1'),
      icon: p.custom_emoji_id || undefined,
    };
    if (p.full_width) { flush(); k.add(btn); k.row(); }
    else { pair.push(btn); if (pair.length === 2) flush(); }
  }
  flush();
  k.add({ text: t(ctx, 'shop.available'), data: to('avail', '1'), style: 'success' }).row();
  k.text(t(ctx, 'btn.close'), to('close'));

  return { text: t(ctx, 'shop.pick'), kb: k.build() };
});

// ---------- ماهو المتاح ----------
// كل منتج فيه مخزون الآن، مجمّع تحت خدمته. الزبون بيشوف بلمحة
// شو يقدر يشتري بدل ما يفوت على كل خدمة وحدة وحدة.
screen('avail', async (ctx, [pageStr]) => {
  const page = Math.max(1, Number(pageStr || 1));
  const per  = 18;

  const rows = await listAvailable();
  if (!rows.length) {
    return {
      text: '🟢 <b>المتاح الآن</b>\n\n📭 ما في شي متوفّر هلق. جرّب بعد شوي.',
      kb: kb().text(t(ctx, 'btn.services'), to('providers')).build(),
    };
  }

  const u     = await ensureUser(ctx.from);
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const slice = rows.slice((page - 1) * per, page * per);

  const lines = [];
  let lastProv = null;
  for (const r of slice) {
    const pv = r.providers || {};
    if (r.provider_key !== lastProv) {
      lines.push(`\n${pv.emoji || '▫️'} <b>${esc(pv.name_override || pv.name || '')}</b>`);
      lastProv = r.provider_key;
    }
    const n = Number(r.stock_count || 0);
    lines.push(`· ${esc(r.name)} — ${money(finalPrice(r, u))} <i>(${n >= 9999 ? '∞' : n})</i>`);
  }

  const k = kb();
  k.pager({ page, totalPages: pages, make: (n) => to('avail', String(n)) });
  k.text(t(ctx, 'btn.services'), to('providers'));

  return {
    text: `🟢 <b>المتاح الآن</b> · ${rows.length} منتج\n${lines.join('\n')}`,
    kb: k.build(),
  };
});

screen('plans', async (ctx, [providerKey, pageStr]) => {
  const per   = Snum('products_per_page', 8);
  const page  = Math.max(1, Number(pageStr || 1));
  const all   = await listProducts(providerKey);
  const pages = Math.max(1, Math.ceil(all.length / per));
  const items = all.slice((page - 1) * per, page * per);
  const u     = await ensureUser(ctx.from);

  const head = `<b>اختر الخطة المطلوبة:</b>\n${RULE}`;
  if (!items.length) {
    return { text: `${head}\n📭 ما في خطط بهالقسم.`,
             kb: kb().text(t(ctx, 'btn.back'), to('providers')).build() };
  }

  const showCount = Sbool('show_stock_count', true);
  const k = kb();
  for (const p of items) {
    const count = showCount ? ` (${p.stock_count || 0})` : '';
    k.add({
      text:  `${p.emoji || ''} ${p.name} · ${money(finalPrice(p, u))}${count}`.trim(),
      data:  to('item', p.slug),
      style: stockStyle(p),
      icon:  p.custom_emoji_id || undefined,
    }).row();
  }
  k.pager({ page, totalPages: pages, make: (n) => to('plans', providerKey, String(n)) });
  k.text('« رجوع للخدمات', to('providers'));

  return { text: head, kb: k.build() };
});

// ---------- صفحة المنتج ----------
screen('item', async (ctx, [slug]) => {
  const p = await getProduct(slug);
  if (!p || p.deleted_at) return { text: t(ctx, 'shop.gone'),
                   kb: kb().text(t(ctx, 'btn.back'), to('providers')).build() };

  const u     = await ensureUser(ctx.from);
  const price = finalPrice(p, u);
  const base  = listPrice(p);

  const stock = !p.in_stock ? '🔴 غير متوفّر حالياً'
              : p.stock_count > 10 ? '🟢 متوفّر'
              : `🟡 متبقّي ${p.stock_count} فقط`;

  // الوصف والتعليمات بيجوا من GGSoma تلقائياً (منظّفين لتلغرام)
  const desc  = productDesc(p);
  const instr = productInstr(p);

  const head = [
    `${E('box')} <b>${esc(p.name)}</b>`,
    RULE,
    `${E('money')} <b>${money(price)}</b>` +
      (price < base ? `  <s>${money(base)}</s>` : ''),
    p.duration_days ? `${E('clock')} المدة: <b>${p.duration_days}</b> يوم` : null,
    p.warranty_days ? `${E('shield')} الضمان: <b>${p.warranty_days}</b> يوم` : null,
    `📥 التسليم: ${deliveryLabel(p.delivery_type)} · فوري`,
    stock,
    null,   // مكان الوصف — بينضاف تحت بعد حساب المتبقّي
  ].filter(Boolean).join('\n');

  // حد رسالة تلغرام 4096. كانت الأرقام مثبّتة (900 للوصف و2000
  // للتعليمات) فمنتجات كتير كان وصفها وتعليماتها بينقصّوا بلا داعي.
  // هلق منوزّع المتبقّي فعلياً: التعليمات أولوية لأنها يلي بدها
  // ياها الزبون بعد الشراء.
  const LIMIT = 3900;
  const instrRoom = Math.max(0, LIMIT - head.length - 80);
  const blocks = instr
    ? quote('التعليمات المهمة', clip(instr, Math.min(instrRoom, 2500)))
    : '';

  const descRoom = Math.max(0, LIMIT - head.length - blocks.length - 40);
  const descPart = desc && descRoom > 120 ? `\n${clip(desc, descRoom)}` : '';

  const k = kb();
  if (p.in_stock) {
    k.add({ text: `🛒 شراء`, data: to('confirm', slug), style: 'success' }).row();
  }
  if (isAdmin(ctx.from.id)) k.text('✏️ تعديل المنتج', to('a_prod', slug)).row();
  k.text('« رجوع للخطط', to('plans', p.provider_key, '1'));

  return { text: head + descPart + (blocks ? '\n' + blocks : ''), kb: k.build() };
});

// ---------- ملخّص الطلب ----------
screen('confirm', async (ctx, [slug]) => {
  const [p, u] = await Promise.all([getProduct(slug), ensureUser(ctx.from)]);
  if (!p) return { text: '❌ المنتج غير موجود.',
                   kb: kb().text(t(ctx, 'btn.back'), to('providers')).build() };

  const price  = finalPrice(p, u);
  const enough = Number(u.balance) >= price;

  const text = [
    `${E('receipt')} <b>ملخّص الطلب</b>`,
    RULE,
    `المنتج: <b>${esc(p.name)}</b>`,
    `الكمية: 1`,
    `سعر الوحدة: <b>${money(price)}</b>`,
    `الإجمالي: <b>${money(price)}</b>`,
    `📥 التسليم: ${deliveryLabel(p.delivery_type)}`,
    p.duration_days ? `${E('clock')} المدة: ${p.duration_days} يوم` : null,
    RULE,
    `${E('balance')} رصيدك: ${money(u.balance)}`,
    enough
      ? `الرصيد بعد الشراء: <b>${money(Number(u.balance) - price)}</b>`
      : `❌ <b>رصيد غير كافٍ</b>\nناقصك <b>${money(price - Number(u.balance))}</b>`,
  ].filter(Boolean).join('\n');

  const k = kb();
  if (enough) k.add({ text: '✅ تأكيد الشراء', data: to('buy', slug), style: 'success' }).row();
  else        k.add({ text: '💰 شحن رصيد',   data: to('topup'),      style: 'primary' }).row();
  k.text('❌ إلغاء', to('item', slug));

  return { text, kb: k.build() };
});
