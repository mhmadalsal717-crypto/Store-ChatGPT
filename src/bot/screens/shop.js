// ============================================================
//  شاشات المتجر: الرئيسية / المزوّدين / الخطط / المنتج / التأكيد
// ============================================================
import { screen, to } from '../nav.js';
import { kb, stockStyle } from '../kb.js';
import { ensureUser } from '../../lib/db.js';
import { E, Snum, Sbool } from '../../lib/settings.js';
import { esc, money, RULE, quote, deliveryLabel } from '../../lib/fmt.js';
import { listProviders, listProducts, getProduct,
         productDesc, productInstr } from '../../core/catalog.js';
import { clip } from '../../lib/html.js';
import { welcomeText } from '../../lib/i18n.js';
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
screen('providers', async () => {
  const provs = await listProviders();
  if (!provs.length) {
    return { text: '📭 الكتالوج فاضي حالياً.',
             kb: kb().text('✖️ إغلاق', to('close')).build() };
  }

  // عمودين متل GGSoma. الإيموجي المخصص بينضاف تلقائياً لو
  // فعّلت «إيموجي بريميوم» من ⚙️ لوحة التحكم ← المظهر.
  const k = kb().grid(provs, {
    cols: 2,
    label: (p) => `${p.emoji || ''} ${p.name}`.trim(),
    data:  (p) => to('plans', p.key, '1'),
    icon:  (p) => p.custom_emoji_id || undefined,
  });
  k.text('✖️ إغلاق', to('close'));

  return { text: `${E('shop')} <b>المنتجات</b>\n\nاختر الخدمة:`, kb: k.build() };
});

screen('plans', async (ctx, [providerKey, pageStr]) => {
  const per   = Snum('products_per_page', 8);
  const page  = Math.max(1, Number(pageStr || 1));
  const all   = await listProducts(providerKey);
  const pages = Math.max(1, Math.ceil(all.length / per));
  const items = all.slice((page - 1) * per, page * per);
  const u     = await ensureUser(ctx.from);

  const prov = (await listProviders()).find((x) => x.key === providerKey);
  const pemo = prov?.emoji || '';
  const head = `${pemo} اختر خطة <b>${esc(prov?.name || '')}</b> التي تريد تفعيلها:`.trim();

  if (!items.length) {
    return { text: `${head}\n\n📭 ما في خطط متاحة بهالقسم.`,
             kb: kb().text('« الخدمات', to('providers')).build() };
  }

  // نفس شكل GGSoma: زر بعرض كامل لكل خطة، أخضر متوفّر وأحمر نافد،
  // والعدد بين قوسين. السعر مخفي افتراضياً متلهم — فيك تظهره من
  // ⚙️ لوحة التحكم ← المظهر ← «السعر على أزرار الخطط».
  const showCount = Sbool('show_stock_count', true);
  const showPrice = Sbool('show_plan_price', false);

  const k = kb();
  for (const p of items) {
    const n     = Number(p.stock_count || 0);
    const count = showCount ? ` (${!p.in_stock ? 0 : n >= 9999 ? '∞' : n})` : '';
    const price = showPrice ? ` · ${money(finalPrice(p, u))}` : '';
    k.add({
      text:  `${p.emoji || ''} ${p.name}${price}${count}`.trim(),
      data:  to('item', p.slug),
      style: stockStyle(p),
      icon:  p.custom_emoji_id || undefined,
    }).row();
  }
  k.pager({ page, totalPages: pages, make: (n) => to('plans', providerKey, String(n)) });
  k.text('« الخدمات', to('providers'));

  return { text: head, kb: k.build() };
});

screen('item', async (ctx, [slug]) => {
  const p = await getProduct(slug);
  if (!p || p.deleted_at) return { text: '❌ المنتج ما عاد متوفّر.',
                   kb: kb().text('« رجوع', to('providers')).build() };

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
                   kb: kb().text('« رجوع', to('providers')).build() };

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
