// ============================================================
//  ربط البوت: التوجيه + الشراء + الإدخال + الأوامر
// ============================================================
import { Bot } from 'grammy';
import { cfg, isAdmin } from '../config.js';
import { db, rpc, ensureUser } from '../lib/db.js';
import { loadAll, Sbool, Snum, E, T } from '../lib/settings.js';
import { esc, money, RULE } from '../lib/fmt.js';
import { go, to, withLoading, screen } from './nav.js';
import { kb } from './kb.js';
import { MENU, mainMenu } from './menu.js';
import { t, welcomeText, DEFAULT_LANG } from '../lib/i18n.js';
import { clear } from './input.js';
import { isJoined } from './onboarding.js';   // الاستيراد بيسجّل شاشات البوابة
import { purchase } from '../core/purchase.js';
import { renderDelivery } from './delivery.js';
import { handleInput } from './handlers.js';
import { wireStars } from './payflow.js';

// تسجيل كل الشاشات
import './screens/shop.js';
import './screens/account.js';
import './screens/wallet.js';
import './screens/topup.js';
import './screens/admin.js';

export const bot = new Bot(cfg.bot.token);

export const notifyAdmin = (text, replyMarkup = undefined) => {
  for (const id of cfg.bot.adminIds) {
    bot.api.sendMessage(id, text, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: replyMarkup,
    }).catch(() => {});
  }
};

const homeKb = (tgId, lang) => mainMenu(tgId, lang);

// ---------- حراسة عامة ----------
bot.use(async (ctx, next) => {
  if (!ctx.from) return;
  await loadAll();

  // وضع الصيانة — الأدمن بيضل يشتغل
  if (Sbool('maintenance') && !isAdmin(ctx.from.id)) {
    const msg = '🛠 البوت تحت الصيانة حالياً. جرّب بعد شوي.';
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: msg, show_alert: true });
    else await ctx.reply(msg);
    return;
  }

  // لغة المستخدم بتنقرأ هون مرة وحدة — كل الشاشات بتستعمل ctx.lang
  //
  // ⚠️ لو عمود lang_set ناقص (10_onboarding.sql ما انشغّل) الاستعلام
  // بيفشل كامل. وقتها منعتبر البوابة مكمّلة بدل ما نحبس كل الزبائن
  // بشاشة اللغة للأبد.
  const { data: u, error: uErr } = await db.from('users')
    .select('banned, lang, lang_set').eq('tg_id', ctx.from.id).maybeSingle();
  if (uErr) console.error('[guard] قراءة المستخدم فشلت:', uErr.message);
  ctx.lang = u?.lang || DEFAULT_LANG;
  const gateReady = !uErr;

  if (u?.banned) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: t(ctx, 'sys.banned'), show_alert: true });
    return;
  }

  // ---------- بوابة الدخول ----------
  // الأدمن معفى. شاشات البوابة نفسها معفاة وإلا بتصير حلقة مقفلة.
  const data = ctx.callbackQuery?.data || '';
  const inGate = data.startsWith('n:ob_');

  if (gateReady && !isAdmin(ctx.from.id) && !inGate) {
    if (!u?.lang_set) { await go(ctx, 'ob_lang', [], { forceNew: true }); return; }
    if (!(await isJoined(ctx.api, ctx.from.id))) {
      await go(ctx, 'ob_join', [], { forceNew: true }); return;
    }
  }

  return next();
});

// ---------- /start + الإحالة ----------
bot.command('start', async (ctx) => {
  const user = await ensureUser(ctx.from);
  const payload = ctx.match?.trim();

  if (payload && !user.referred_by) {
    const { data: ref } = await db.from('users')
      .select('id, tg_id').eq('ref_code', payload).maybeSingle();
    if (ref && ref.tg_id !== ctx.from.id) {
      await db.from('users').update({ referred_by: ref.id }).eq('id', user.id);
      const join = Snum('referral_join', 0);
      if (join > 0) {
        await rpc('credit_user', {
          p_tg_id: ref.tg_id, p_amount: join, p_type: 'REFERRAL', p_ref: 'join:' + ctx.from.id,
        });
      }
      bot.api.sendMessage(ref.tg_id,
        `${E('gift')} انضم مستخدم جديد عبر رابطك.` + (join > 0 ? ` +${money(join)}` : ''),
        { parse_mode: 'HTML' }).catch(() => {});
    }
  }

  await ctx.reply(welcomeText(ctx.lang), {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: homeKb(ctx.from.id, ctx.lang),
  });
});

// ---------- أزرار الكيبورد الثابت ----------
// كل زر بيبعت نص، ومنحوّله للشاشة. لازم يجي قبل معالج الإدخال
// حتى لو المستخدم بنص عملية إدخال، الزر يلغيها ويطلّعه.
for (const [label, screenName] of Object.entries(MENU)) {
  bot.hears(label, async (ctx) => {
    clear(ctx.from.id);
    await go(ctx, screenName, [], { forceNew: true });
  });
}

// توافق مع النسخة القديمة — لو ضل عند حدا الكيبورد القديم
bot.hears('🏠 القائمة', (ctx) => go(ctx, 'home', [], { forceNew: true }));

bot.command('menu', async (ctx) => {
  await ctx.reply(welcomeText(ctx.lang), {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: homeKb(ctx.from.id, ctx.lang),
  });
});

// ---------- تغيير اللغة ----------
bot.command('lang', (ctx) => go(ctx, 'lang', [], { forceNew: true }));

bot.command('admin', (ctx) => isAdmin(ctx.from.id) && go(ctx, 'admin', [], { forceNew: true }));

// ---------- الشراء (لازم يجي قبل الموجّه العام) ----------
bot.callbackQuery(/^n:buy:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: 'جاري التنفيذ…' });
  const slug = ctx.match[1];
  const user = await ensureUser(ctx.from);

  const result = await withLoading(
    ctx,
    `⏳ <b>جاري تنفيذ طلبك…</b>\n${RULE}\nلا تغلق المحادثة.`,
    () => purchase({ tgId: ctx.from.id, slug, quantity: 1, user, notifyAdmin })
  );

  const markup = kb()
    .text('📋 طلباتي', to('orders', '1')).row()
    .text('🏠 الرئيسية', to('home')).build();

  await ctx.editMessageText(renderResult(result), {
    parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: markup,
  }).catch(() => ctx.reply(renderResult(result), { parse_mode: 'HTML' }));

  if (result.state === 'DELIVERED') {
    notifyAdmin(`🛒 بيع: <b>${esc(slug)}</b> · ${money(result.order?.totalCharged || 0)} تكلفة`);
  }
});

// ---------- باقة نجوم جاهزة ----------
bot.callbackQuery(/^n:st_buy:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: 'جاري إنشاء الفاتورة…' });
  const { startStars } = await import('./payflow.js');
  await startStars(ctx, parseInt(ctx.match[1], 10));
});

// ---------- إلغاء دفعة ----------
bot.callbackQuery(/^n:pay_cancel:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: 'تم الإلغاء' });
  const { setPayment } = await import('../core/payments.js');
  const { clear } = await import('./input.js');
  clear(ctx.from.id);
  await setPayment(ctx.match[1], { status: 'CANCELLED' });
  await go(ctx, 'topup', [], { forceNew: true });
});

// ---------- الموجّه العام ----------
bot.callbackQuery('noop', (ctx) => ctx.answerCallbackQuery());

bot.callbackQuery(/^n:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const [name, ...args] = ctx.match[1].split(':');
  await go(ctx, name, args);
});

// ---------- مدفوعات النجوم ----------
wireStars(bot, { notifyAdmin });

// ---------- الإدخال النصّي ----------
bot.on(['message:text', 'message:photo', 'message:document'], async (ctx, next) => {
  const done = await handleInput(ctx, { notifyAdmin, bot });
  if (!done) return next();
});

bot.on('message', (ctx) => go(ctx, 'home', [], { forceNew: true }));

bot.catch((err) => console.error('[bot]', err.error?.description || err.message));

// ---------- عرض النتيجة ----------
export function renderResult(r) {
  if (r.state === 'DELIVERED') {
    return `✅ <b>تم التنفيذ بنجاح</b>\n${RULE}\n` +
           `${E('receipt')} <code>${esc(r.order?.orderCode || '')}</code>\n\n` +
           renderDelivery(r.delivery);
  }
  if (r.state === 'PENDING') {
    return `⏳ <b>طلبك قيد التنفيذ</b>\n${RULE}\n` +
           `رح يوصلك التسليم تلقائياً خلال دقايق. رصيدك محجوز.`;
  }
  return `❌ <b>تعذّر التنفيذ</b>\n${RULE}\n${esc(r.message || '')}`;
}

/** يستعملها المُصالح لإرسال النتيجة لاحقاً */
export const sendResult = (chatId, result) =>
  bot.api.sendMessage(chatId, renderResult(result), {
    parse_mode: 'HTML', link_preview_options: { is_disabled: true },
  }).catch(() => {});

// ---------- إعداد واجهة البوت ----------
export async function setupBotUI() {
  await bot.api.setMyCommands([
    { command: 'start', description: t('ar', 'cmd.start') },
    { command: 'menu',  description: t('ar', 'cmd.menu') },
    { command: 'lang',  description: t('ar', 'cmd.lang') },
  ]).catch(() => {});

  // قائمة منفصلة للمستخدمين بواجهة إنكليزية
  await bot.api.setMyCommands([
    { command: 'start', description: t('en', 'cmd.start') },
    { command: 'menu',  description: t('en', 'cmd.menu') },
    { command: 'lang',  description: t('en', 'cmd.lang') },
  ], { language_code: 'en' }).catch(() => {});
  await bot.api.setChatMenuButton({ menu_button: { type: 'commands' } }).catch(() => {});
  await bot.api.setMyShortDescription('اشتراكات رقمية بتسليم فوري').catch(() => {});
  await bot.api.setMyDescription(
    'متجر اشتراكات رقمية — تسليم فوري وأسعار منافسة.\nاضغط «ابدأ» للتصفّح.'
  ).catch(() => {});
}
