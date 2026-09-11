// ============================================================
//  شاشات المتجر: الرئيسية / المزوّدين / الخطط / المنتج / التأكيد
// ============================================================
import { screen, to } from '../nav.js';
import { kb, stockStyle } from '../kb.js';
import { ensureUser } from '../../lib/db.js';
import { E, T, Snum, Sbool } from '../../lib/settings.js';
import { esc, money, RULE, quote, deliveryLabel } from '../../lib/fmt.js';
import { listProviders, listProducts, getProduct,
         productDesc, productInstr } from '../../core/catalog.js';
import { clip } from '../../lib/html.js';
import { finalPrice, listPrice, tierOf } from '../../core/pricing.js';
import { isAdmin } from '../../config.js';

// ---------- الرئيسية ----------
screen('home', async (ctx) => {
  const u = await ensureUser(ctx.from);
  const t = tierOf(u.total_spent);

  const text =
    `${T('welcome', 'أهلاً فيك 👋')}\n${RULE}\n` +
    `${E('balance')} رصيدك: <b>${money(u.balance)}</b>\n` +
    (t ? `${t.emoji} مستواك: <b>${esc(t.name)}</b>` +
         (Number(t.discount_pct) > 0 ? ` · خصم ${t.discount_pct}%` : '') + '\n' : '');

  const k = kb()
    .add({ text: `${'🛒'} المنتجات`, data: to('providers'), style: 'primary' }).row()
    .text('👤 ملفي', to('profile')).text('🎁 الدعوات', to('invites')).row()
    .text('💳 شحن بكود', to('voucher')).text('💰 شحن رصيد', to('topup')).row()
    .text('❓ المساعدة', to('help')).text('📜 السياسة', to('policy')).row();

  if (isAdmin(ctx.from.id)) k.text('⚙️ لوحة التحكم', to('admin')).row();

  return { text, kb: k.build() };
});

// ---------- المزوّدين ----------
screen('providers', async () => {
  const provs = await listProviders();
  if (!provs.length) {
    return { text: '📭 الكتالوج فاضي حالياً.',
             kb: kb().text('« الرئيسية', to('home')).build() };
  }

  const k = kb().grid(provs, {
    cols: 2,
    label: (p) => `${p.emoji || '▫️'} ${p.name}`,
    data:  (p) => to('plans', p.key, '1'),
    icon:  (p) => p.custom_emoji_id || undefined,
  });
  k.text('« الرئيسية', to('home'));

  return { text: `${E('shop')} <b>المنتجات</b>\n${RULE}\nاختر الخدمة يلي بدك ياها:`,
           kb: k.build() };
});

// ---------- الخطط داخل مزوّد ----------
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
             kb: kb().text('« رجوع', to('providers')).build() };
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
    desc ? `\n${clip(desc, 900)}` : null,
  ].filter(Boolean).join('\n');

  // اقتباس قابل للطي — نفس شكل بوت GGSoma
  const blocks = instr ? quote('التعليمات المهمة', clip(instr, 2000)) : '';

  const k = kb();
  if (p.in_stock) {
    k.add({ text: `🛒 شراء`, data: to('confirm', slug), style: 'success' }).row();
  }
  if (isAdmin(ctx.from.id)) k.text('✏️ تعديل المنتج', to('a_prod', slug)).row();
  k.text('« رجوع للخطط', to('plans', p.provider_key, '1'));

  return { text: head + (blocks ? '\n' + blocks : ''), kb: k.build() };
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
