const { Telegraf, Markup } = require('telegraf');
const supabase = require('./supabase');
require('dotenv').config();

if (!process.env.BOT_TOKEN) { console.error('❌ BOT_TOKEN missing!'); process.exit(1); }

let bot;
try { bot = new Telegraf(process.env.BOT_TOKEN); }
catch (e) { console.error('❌ Bot init error:', e.message); process.exit(1); }

const FOUNDER_ID = parseInt(process.env.FOUNDER_ID) || 0;

const PAYMENT_INFO = {
  binance_id: '815791123',
  usdt_trc20: 'TN8bezRsWbVEFEp21fghdstLA2oxCU9B4A',
  usdt_bep20: '0x8ff168fb3140fe3f5106b8ec7736bddd2c57e621',
  usdt_erc20: '0x8ff168fb3140fe3f5106b8ec7736bddd2c57e621',
  support: '@XBLLT',
};

// ─── State ────────────────────────────────────────────────────
const verifiedUsers = new Set();
const userLang      = new Map(); // userId -> 'en' | 'ar'
const pendingEmail  = new Map();
const userInfoCache = new Map();
const broadcastMode = new Map();

// ─── Language Helper ──────────────────────────────────────────
const getLang = (userId) => userLang.get(userId) || 'en';

// ─── Translations ─────────────────────────────────────────────
const T = {
  en: {
    verify_prompt:   `👋 *Welcome!*\n\nBefore we get started, please confirm you're human.`,
    verify_btn:      `✅  I'm not a robot`,
    verify_success:  `✅ *Verified!* Welcome to the store.`,
    main_text:       (name) => `🌟 *Digital Subscriptions Store*\n\nHey ${name}!\n\nGet premium services at competitive prices with instant activation.\n\n_Choose an option below:_`,
    products:        `🛒  Products`,
    my_orders:       `📦  My Orders`,
    faq:             `❓  FAQ`,
    support_btn:     `💬  Support`,
    payments_btn:    `💳  Payments`,
    switch_lang:     `🌐  العربية`,
    browse:          `🛒 *Products*\n\nSelect a service:`,
    youtube_desc:    `▶️ *YouTube Premium*\n\n• Ad-free videos & music\n• Background playback\n• YouTube Originals\n• All devices\n\nSelect your plan:`,
    netflix_desc:    `🎬 *Netflix Premium*\n\n• 4K Ultra HD\n• 4 screens at once\n• Thousands of titles\n• Offline downloads\n\nSelect your plan:`,
    shahid_desc:     `🎥 *Shahid Plus*\n\n• Exclusive Arabic content\n• Live sports & events\n• All devices\n• HD quality\n\nSelect your plan:`,
    plan_month:      (p) => `📅  1 Month  —  ${p} ⭐`,
    plan_year:       (p) => `📆  1 Year   —  ${p} ⭐`,
    back:            `‹  Back`,
    back_menu:       `‹  Back to Menu`,
    faq_text:        `❓ *FAQ*\n\n*How do I pay?*\nTelegram Stars, Binance Pay, or USDT.\n\n*When is activation?*\nWithin minutes after review.\n\n*What after payment?*\nProvide your email and we'll handle the rest.\n\n*Is it secure?*\nYes, 100%.\n\n*Issues?*\nContact ${PAYMENT_INFO.support} — we reply instantly.\n\n*Refunds?*\nGuaranteed if the issue is on our end.`,
    support_text:    `💬 *Support*\n\n👤 ${PAYMENT_INFO.support}\n⏰ Available 24/7\n\n_Reach out for any question or issue._`,
    payments_text:   `💳 *Payment Methods*\n\nChoose your preferred method:`,
    stars_text:      `⭐ *Telegram Stars*\n\nFastest & most secure — directly through Telegram.\n\n*Steps:*\n1. Browse Products\n2. Pick a plan\n3. Tap Pay on the invoice\n4. Enter your email\n5. Done ✅`,
    binance_text:    `🟡 *Binance Pay*\n\n*ID:* \`${PAYMENT_INFO.binance_id}\`\n\n*Steps:*\n1. Binance → Pay → Send\n2. Enter ID above\n3. Enter amount\n4. Screenshot the receipt\n5. Send to ${PAYMENT_INFO.support} with email & plan`,
    usdt_text:       `💠 *USDT Crypto*\n\nSelect network:`,
    trc20_text:      `🔵 *USDT · TRC20*\n\n\`${PAYMENT_INFO.usdt_trc20}\`\n\nSend USDT on TRC20, screenshot TX, send to ${PAYMENT_INFO.support}.\n\n⚠️ _TRC20 network only._`,
    bep20_text:      `🟡 *USDT · BEP20*\n\n\`${PAYMENT_INFO.usdt_bep20}\`\n\nSend USDT on BEP20 (BSC), screenshot TX, send to ${PAYMENT_INFO.support}.\n\n⚠️ _BEP20 network only._`,
    erc20_text:      `🔷 *USDT · ERC20*\n\n\`${PAYMENT_INFO.usdt_erc20}\`\n\nSend USDT on ERC20, screenshot TX, send to ${PAYMENT_INFO.support}.\n\n⚠️ _Gas fees apply._`,
    orders_empty:    `📦 *My Orders*\n\nNo orders yet. Browse our products to get started! 🛒`,
    orders_title:    (n) => `📦 *My Orders*  _(last ${n})_\n\n`,
    order_row:       (o, i) => {
      const icon = { pending: '🕐', approved: '✅', rejected: '❌' }[o.status] || '❓';
      const label = { pending: 'Pending', approved: 'Activated', rejected: 'Rejected' }[o.status] || o.status;
      return `*${i + 1}.  Order #${o.id}*\n   ${icon}  ${label}\n   💰  ${o.payment_amount} ⭐\n   📅  ${new Date(o.created_at).toLocaleDateString('en-GB')}\n\n`;
    },
    pay_received:    `✅ *Payment received!*\n\nPlease enter the email linked to your account for activation:\n\n_⚠️ Double-check — incorrect emails cannot be corrected._`,
    email_invalid:   `❌ Invalid email. Try again.\nExample: name@gmail.com`,
    email_saved:     `✅ *All set!*\n\nYour order is under review. Activation usually takes a few minutes.\n\nTrack it with /orders 📦`,
    proof_received:  `✅ *Proof received!*\n\nOur team will verify and activate your subscription shortly.\n\n_For updates: ${PAYMENT_INFO.support}_`,
    activated:       `✅ *Subscription Activated!*\n\nCheck your inbox for the activation email and follow the instructions.\n\nEnjoy! 🎉`,
    rejected_msg:    `❌ *Order Rejected*\n\nContact ${PAYMENT_INFO.support} for assistance.`,
  },

  ar: {
    verify_prompt:   `👋 *أهلاً!*\n\nقبل البدء، تأكد أنك لست روبوت.`,
    verify_btn:      `✅  لست روبوت`,
    verify_success:  `✅ *تم التحقق!* أهلاً بك في المتجر.`,
    main_text:       (name) => `🌟 *متجر الاشتراكات الرقمية*\n\nأهلاً ${name}!\n\nاحصل على أفضل الاشتراكات بأسعار تنافسية وتفعيل فوري.\n\n_اختر من القائمة:_`,
    products:        `🛒  المنتجات`,
    my_orders:       `📦  طلباتي`,
    faq:             `❓  أسئلة شائعة`,
    support_btn:     `💬  الدعم`,
    payments_btn:    `💳  طرق الدفع`,
    switch_lang:     `🌐  English`,
    browse:          `🛒 *المنتجات*\n\nاختر الخدمة:`,
    youtube_desc:    `▶️ *YouTube Premium*\n\n• بدون إعلانات\n• تشغيل في الخلفية\n• محتوى حصري\n• جميع الأجهزة\n\nاختر الباقة:`,
    netflix_desc:    `🎬 *Netflix Premium*\n\n• جودة 4K Ultra HD\n• 4 شاشات في آن واحد\n• آلاف الأفلام والمسلسلات\n• تحميل للمشاهدة دون إنترنت\n\nاختر الباقة:`,
    shahid_desc:     `🎥 *Shahid Plus*\n\n• مسلسلات عربية حصرية\n• رياضة مباشرة\n• جميع الأجهزة\n• جودة HD\n\nاختر الباقة:`,
    plan_month:      (p) => `📅  شهر واحد  —  ${p} ⭐`,
    plan_year:       (p) => `📆  سنة كاملة  —  ${p} ⭐`,
    back:            `‹  رجوع`,
    back_menu:       `‹  القائمة الرئيسية`,
    faq_text:        `❓ *أسئلة شائعة*\n\n*كيف أدفع؟*\nTelegram Stars أو Binance Pay أو USDT.\n\n*متى يتم التفعيل؟*\nخلال دقائق بعد المراجعة.\n\n*ماذا بعد الدفع؟*\nأدخل إيميلك وسنتولى الباقي.\n\n*هل الدفع آمن؟*\nنعم، 100%.\n\n*مشكلة؟*\nتواصل مع ${PAYMENT_INFO.support} — نرد فوراً.\n\n*استرداد؟*\nمضمون إذا كانت المشكلة من جهتنا.`,
    support_text:    `💬 *الدعم*\n\n👤 ${PAYMENT_INFO.support}\n⏰ متاح 24/7\n\n_تواصل معنا لأي استفسار._`,
    payments_text:   `💳 *طرق الدفع*\n\nاختر الطريقة المناسبة:`,
    stars_text:      `⭐ *Telegram Stars*\n\nالأسرع والأكثر أماناً — مباشرة عبر تلغرام.\n\n*الخطوات:*\n1. تصفح المنتجات\n2. اختر الباقة\n3. اضغط دفع على الفاتورة\n4. أدخل إيميلك\n5. تم ✅`,
    binance_text:    `🟡 *Binance Pay*\n\n*ID:* \`${PAYMENT_INFO.binance_id}\`\n\n*الخطوات:*\n1. Binance ← Pay ← Send\n2. أدخل الـ ID أعلاه\n3. أدخل المبلغ\n4. خذ سكرين شوت\n5. أرسله لـ ${PAYMENT_INFO.support} مع إيميلك والباقة`,
    usdt_text:       `💠 *USDT*\n\nاختر الشبكة:`,
    trc20_text:      `🔵 *USDT · TRC20*\n\n\`${PAYMENT_INFO.usdt_trc20}\`\n\nأرسل USDT على TRC20، خذ سكرين شوت، أرسله لـ ${PAYMENT_INFO.support}.\n\n⚠️ _شبكة TRC20 فقط._`,
    bep20_text:      `🟡 *USDT · BEP20*\n\n\`${PAYMENT_INFO.usdt_bep20}\`\n\nأرسل USDT على BEP20، خذ سكرين شوت، أرسله لـ ${PAYMENT_INFO.support}.\n\n⚠️ _شبكة BEP20 فقط._`,
    erc20_text:      `🔷 *USDT · ERC20*\n\n\`${PAYMENT_INFO.usdt_erc20}\`\n\nأرسل USDT على ERC20، خذ سكرين شوت، أرسله لـ ${PAYMENT_INFO.support}.\n\n⚠️ _رسوم الغاز مطبقة._`,
    orders_empty:    `📦 *طلباتي*\n\nلا توجد طلبات بعد. تصفح المنتجات للبدء! 🛒`,
    orders_title:    (n) => `📦 *طلباتي*  _(آخر ${n})_\n\n`,
    order_row:       (o, i) => {
      const icon = { pending: '🕐', approved: '✅', rejected: '❌' }[o.status] || '❓';
      const label = { pending: 'قيد المراجعة', approved: 'مفعّل', rejected: 'مرفوض' }[o.status] || o.status;
      return `*${i + 1}.  طلب #${o.id}*\n   ${icon}  ${label}\n   💰  ${o.payment_amount} ⭐\n   📅  ${new Date(o.created_at).toLocaleDateString('ar-SA')}\n\n`;
    },
    pay_received:    `✅ *تم استلام الدفع!*\n\nأدخل الإيميل المرتبط بحسابك للتفعيل:\n\n_⚠️ تأكد من صحة الإيميل — لا يمكن تصحيحه لاحقاً._`,
    email_invalid:   `❌ إيميل غير صحيح. حاول مجدداً.\nمثال: name@gmail.com`,
    email_saved:     `✅ *تم!*\n\nطلبك قيد المراجعة. التفعيل عادةً خلال دقائق.\n\nتابع طلبك عبر /orders 📦`,
    proof_received:  `✅ *تم استلام إثبات الدفع!*\n\nسيراجعه فريقنا ويفعّل اشتراكك قريباً.\n\n_للمتابعة: ${PAYMENT_INFO.support}_`,
    activated:       `✅ *تم تفعيل اشتراكك!*\n\nتحقق من بريدك الإلكتروني واتبع تعليمات التفعيل.\n\nبتوفيق! 🎉`,
    rejected_msg:    `❌ *تم رفض الطلب*\n\nتواصل مع ${PAYMENT_INFO.support} للاستفسار.`,
  },
};

// ─── Plans ────────────────────────────────────────────────────
const PLANS = {
  youtube_month: { title: 'YouTube Premium · 1 Month', description: 'YouTube Premium for 1 month.', amount: 300  },
  youtube_year:  { title: 'YouTube Premium · 1 Year',  description: 'YouTube Premium for 1 year.',  amount: 1000 },
  netflix_month: { title: 'Netflix Premium · 1 Month', description: 'Netflix Premium for 1 month.', amount: 350  },
  netflix_year:  { title: 'Netflix Premium · 1 Year',  description: 'Netflix Premium for 1 year.',  amount: 1000 },
  shahid_month:  { title: 'Shahid Plus · 1 Month',     description: 'Shahid Plus for 1 month.',     amount: 200  },
  shahid_year:   { title: 'Shahid Plus · 1 Year',      description: 'Shahid Plus for 1 year.',      amount: 600  },
};

// ─── Keyboard Builder ─────────────────────────────────────────
const kb = {
  verify:    (lang) => Markup.inlineKeyboard([[Markup.button.callback(T[lang].verify_btn, 'verify_human')]]),
  main:      (lang) => Markup.inlineKeyboard([
    [Markup.button.callback(T[lang].products,     'nav_products')],
    [Markup.button.callback(T[lang].my_orders,    'nav_orders'),  Markup.button.callback(T[lang].faq,          'nav_faq')],
    [Markup.button.callback(T[lang].support_btn,  'nav_support'), Markup.button.callback(T[lang].payments_btn, 'nav_payments')],
    [Markup.button.callback(T[lang].switch_lang,  'switch_lang')],
  ]),
  products:  (lang) => Markup.inlineKeyboard([
    [Markup.button.callback('▶️  YouTube Premium', 'cat_youtube')],
    [Markup.button.callback('🎬  Netflix Premium', 'cat_netflix')],
    [Markup.button.callback('🎥  Shahid Plus',      'cat_shahid')],
    [Markup.button.callback(T[lang].back, 'nav_main')],
  ]),
  youtube:   (lang) => Markup.inlineKeyboard([
    [Markup.button.callback(T[lang].plan_month(300),  'buy_youtube_month')],
    [Markup.button.callback(T[lang].plan_year(1000),  'buy_youtube_year')],
    [Markup.button.callback(T[lang].back, 'nav_products')],
  ]),
  netflix:   (lang) => Markup.inlineKeyboard([
    [Markup.button.callback(T[lang].plan_month(350),  'buy_netflix_month')],
    [Markup.button.callback(T[lang].plan_year(1000),  'buy_netflix_year')],
    [Markup.button.callback(T[lang].back, 'nav_products')],
  ]),
  shahid:    (lang) => Markup.inlineKeyboard([
    [Markup.button.callback(T[lang].plan_month(200), 'buy_shahid_month')],
    [Markup.button.callback(T[lang].plan_year(600),  'buy_shahid_year')],
    [Markup.button.callback(T[lang].back, 'nav_products')],
  ]),
  backMain:  (lang) => Markup.inlineKeyboard([[Markup.button.callback(T[lang].back_menu, 'nav_main')]]),
  payments:  (lang) => Markup.inlineKeyboard([
    [Markup.button.callback('⭐  Telegram Stars', 'pm_stars')],
    [Markup.button.callback('🟡  Binance Pay',    'pm_binance')],
    [Markup.button.callback('💠  USDT Crypto',    'pm_usdt')],
    [Markup.button.callback(T[lang].back, 'nav_main')],
  ]),
  usdt:      (lang) => Markup.inlineKeyboard([
    [Markup.button.callback('🔵  USDT · TRC20', 'pm_trc20')],
    [Markup.button.callback('🟡  USDT · BEP20', 'pm_bep20')],
    [Markup.button.callback('🔷  USDT · ERC20', 'pm_erc20')],
    [Markup.button.callback(T[lang].back, 'nav_payments')],
  ]),
  backPayments: (lang) => Markup.inlineKeyboard([[Markup.button.callback(T[lang].back, 'nav_payments')]]),
  backUsdt:     (lang) => Markup.inlineKeyboard([[Markup.button.callback(T[lang].back, 'pm_usdt')]]),
  starsBack:    (lang) => Markup.inlineKeyboard([
    [Markup.button.callback('🛒  ' + (lang === 'ar' ? 'تصفح المنتجات' : 'Browse Products'), 'nav_products')],
    [Markup.button.callback(T[lang].back, 'nav_payments')],
  ]),
};

// ─── Helper ───────────────────────────────────────────────────
async function editOrReply(ctx, text, extra) {
  try { await ctx.editMessageText(text, extra); }
  catch (_) { await ctx.reply(text, extra); }
}

// ─── Middleware ───────────────────────────────────────────────
bot.use(async (ctx, next) => {
  try { await next(); } catch (err) { console.error('MW error:', err.message); throw err; }
});

// ─── /start ──────────────────────────────────────────────────
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const lang = getLang(userId);

  if (!verifiedUsers.has(userId)) {
    return ctx.reply(T[lang].verify_prompt, {
      parse_mode: 'Markdown',
      reply_markup: kb.verify(lang).reply_markup,
    });
  }
  await showMain(ctx, false);
});

// ─── /lang ───────────────────────────────────────────────────
bot.command('lang', async (ctx) => {
  const userId = ctx.from.id;
  const lang = getLang(userId);
  await ctx.reply(
    lang === 'en'
      ? `🌐 *Language / اللغة*\n\nCurrent: 🇬🇧 English`
      : `🌐 *Language / اللغة*\n\nالحالية: 🇸🇦 العربية`,
    {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🇬🇧 English', 'set_lang_en'), Markup.button.callback('🇸🇦 العربية', 'set_lang_ar')],
      ]).reply_markup,
    }
  );
});

// ─── Anti-spam ────────────────────────────────────────────────
bot.action('verify_human', async (ctx) => {
  const userId = ctx.from.id;
  const lang = getLang(userId);
  verifiedUsers.add(userId);
  await ctx.answerCbQuery('✅');
  await ctx.editMessageText(T[lang].verify_success, { parse_mode: 'Markdown' });
  setTimeout(async () => { try { await showMain(ctx, false); } catch (_) {} }, 700);
});

// ─── Language Switch ──────────────────────────────────────────
bot.action('switch_lang', async (ctx) => {
  const userId = ctx.from.id;
  const current = getLang(userId);
  const next = current === 'en' ? 'ar' : 'en';
  userLang.set(userId, next);
  await ctx.answerCbQuery(next === 'ar' ? '🇸🇦 تم التبديل للعربية' : '🇬🇧 Switched to English');
  await showMain(ctx, true);
});

bot.action('set_lang_en', async (ctx) => {
  userLang.set(ctx.from.id, 'en');
  await ctx.answerCbQuery('🇬🇧 English selected');
  await showMain(ctx, false);
});

bot.action('set_lang_ar', async (ctx) => {
  userLang.set(ctx.from.id, 'ar');
  await ctx.answerCbQuery('🇸🇦 تم اختيار العربية');
  await showMain(ctx, false);
});

// ─── Main Menu ────────────────────────────────────────────────
async function showMain(ctx, isEdit) {
  const lang = getLang(ctx.from.id);
  const name = ctx.from?.first_name || (lang === 'ar' ? 'عزيزي' : 'there');
  const text = T[lang].main_text(name);
  const extra = { parse_mode: 'Markdown', reply_markup: kb.main(lang).reply_markup };
  if (isEdit) await editOrReply(ctx, text, extra);
  else await ctx.reply(text, extra);
}

bot.action('nav_main', async (ctx) => { await ctx.answerCbQuery(); await showMain(ctx, true); });

// ─── Products ─────────────────────────────────────────────────
bot.action('nav_products', async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx.from.id);
  await editOrReply(ctx, T[lang].browse, { parse_mode: 'Markdown', reply_markup: kb.products(lang).reply_markup });
});

bot.action('cat_youtube', async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx.from.id);
  await editOrReply(ctx, T[lang].youtube_desc, { parse_mode: 'Markdown', reply_markup: kb.youtube(lang).reply_markup });
});

bot.action('cat_netflix', async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx.from.id);
  await editOrReply(ctx, T[lang].netflix_desc, { parse_mode: 'Markdown', reply_markup: kb.netflix(lang).reply_markup });
});

bot.action('cat_shahid', async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx.from.id);
  await editOrReply(ctx, T[lang].shahid_desc, { parse_mode: 'Markdown', reply_markup: kb.shahid(lang).reply_markup });
});

// ─── Buy ──────────────────────────────────────────────────────
Object.entries(PLANS).forEach(([key, plan]) => {
  bot.action(`buy_${key}`, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await ctx.replyWithInvoice({
        title: plan.title,
        description: plan.description,
        payload: `${key}_${ctx.from.id}_${Date.now()}`,
        provider_token: '',
        currency: 'XTR',
        prices: [{ label: plan.title, amount: plan.amount }],
      });
    } catch (err) {
      try { await ctx.answerCbQuery('❌ Error. Try again.', true); } catch (_) {}
    }
  });
});

// ─── FAQ ─────────────────────────────────────────────────────
bot.action('nav_faq', async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx.from.id);
  await editOrReply(ctx, T[lang].faq_text, { parse_mode: 'Markdown', reply_markup: kb.backMain(lang).reply_markup });
});

// ─── Support ─────────────────────────────────────────────────
bot.action('nav_support', async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx.from.id);
  await editOrReply(ctx, T[lang].support_text, { parse_mode: 'Markdown', reply_markup: kb.backMain(lang).reply_markup });
});

// ─── Payments ────────────────────────────────────────────────
bot.action('nav_payments', async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx.from.id);
  await editOrReply(ctx, T[lang].payments_text, { parse_mode: 'Markdown', reply_markup: kb.payments(lang).reply_markup });
});

bot.action('pm_stars', async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx.from.id);
  await editOrReply(ctx, T[lang].stars_text, { parse_mode: 'Markdown', reply_markup: kb.starsBack(lang).reply_markup });
});

bot.action('pm_binance', async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx.from.id);
  await editOrReply(ctx, T[lang].binance_text, { parse_mode: 'Markdown', reply_markup: kb.backPayments(lang).reply_markup });
});

bot.action('pm_usdt', async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx.from.id);
  await editOrReply(ctx, T[lang].usdt_text, { parse_mode: 'Markdown', reply_markup: kb.usdt(lang).reply_markup });
});

bot.action('pm_trc20', async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx.from.id);
  await editOrReply(ctx, T[lang].trc20_text, { parse_mode: 'Markdown', reply_markup: kb.backUsdt(lang).reply_markup });
});

bot.action('pm_bep20', async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx.from.id);
  await editOrReply(ctx, T[lang].bep20_text, { parse_mode: 'Markdown', reply_markup: kb.backUsdt(lang).reply_markup });
});

bot.action('pm_erc20', async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx.from.id);
  await editOrReply(ctx, T[lang].erc20_text, { parse_mode: 'Markdown', reply_markup: kb.backUsdt(lang).reply_markup });
});

// ─── My Orders ───────────────────────────────────────────────
bot.action('nav_orders', async (ctx) => { await ctx.answerCbQuery(); await showOrders(ctx, true); });
bot.command('orders', async (ctx) => { await showOrders(ctx, false); });

async function showOrders(ctx, isEdit) {
  const userId = ctx.from.id;
  const lang = getLang(userId);
  try {
    const { data } = await supabase.from('subscriptions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(5);
    const extra = { parse_mode: 'Markdown', reply_markup: kb.backMain(lang).reply_markup };

    if (!data?.length) {
      if (isEdit) return editOrReply(ctx, T[lang].orders_empty, extra);
      return ctx.reply(T[lang].orders_empty, extra);
    }

    let msg = T[lang].orders_title(data.length);
    data.forEach((o, i) => { msg += T[lang].order_row(o, i); });

    if (isEdit) return editOrReply(ctx, msg, extra);
    return ctx.reply(msg, extra);
  } catch (_) {
    ctx.reply('❌ Error loading orders.');
  }
}

// ─── Pre-checkout ─────────────────────────────────────────────
bot.on('pre_checkout_query', async (ctx) => {
  try { await ctx.answerPreCheckoutQuery(true); }
  catch (_) { try { await ctx.answerPreCheckoutQuery(false, { error_message: 'Error. Try again.' }); } catch (__) {} }
});

// ─── Successful Payment ───────────────────────────────────────
bot.on('successful_payment', async (ctx) => {
  const userId = ctx.from.id;
  const lang = getLang(userId);
  const username = ctx.from.username || ctx.from.first_name || 'Unknown';
  const payment = ctx.message.successful_payment;
  try {
    userInfoCache.set(userId, { first_name: ctx.from.first_name || '', username });
    const amount = payment.currency === 'XTR' ? payment.total_amount : payment.total_amount / 100;
    const { data, error } = await supabase.from('subscriptions')
      .insert({ user_id: userId, username, status: 'pending', payment_amount: amount, payment_currency: payment.currency, email: null })
      .select().single();
    if (error) return ctx.reply(`❌ Error. Contact ${PAYMENT_INFO.support}`);
    pendingEmail.set(userId, data.id);
    await ctx.reply(T[lang].pay_received, { parse_mode: 'Markdown' });
  } catch (err) {
    try { await ctx.reply(`❌ Error. Contact ${PAYMENT_INFO.support}`); } catch (_) {}
  }
});

// ─── Text Handler ─────────────────────────────────────────────
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const lang = getLang(userId);
  const text = ctx.message.text.trim();

  if (text === '/cancel') {
    broadcastMode.delete(userId);
    pendingEmail.delete(userId);
    return ctx.reply('❌ Cancelled.', { reply_markup: kb.backMain(lang).reply_markup });
  }
  if (text.startsWith('/')) return;

  // Broadcast
  if (userId === FOUNDER_ID && broadcastMode.get(FOUNDER_ID)) {
    broadcastMode.delete(FOUNDER_ID);
    try {
      const { data: users } = await supabase.from('subscriptions').select('user_id');
      if (!users?.length) return ctx.reply('No users found.');
      const unique = [...new Set(users.map(u => u.user_id))];
      await ctx.reply(`📢 Sending to ${unique.length} users...`);
      let sent = 0, failed = 0;
      for (const uid of unique) {
        try { await bot.telegram.sendMessage(uid, text, { parse_mode: 'Markdown' }); sent++; }
        catch (_) { failed++; }
        await new Promise(r => setTimeout(r, 50));
      }
      return ctx.reply(`✅ Done!\n✓ ${sent} sent\n✗ ${failed} failed`);
    } catch (_) { return ctx.reply('❌ Broadcast failed.'); }
  }

  // Email
  if (pendingEmail.has(userId)) {
    const subId = pendingEmail.get(userId);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      return ctx.reply(T[lang].email_invalid, { parse_mode: 'Markdown' });
    }
    try {
      const { data, error } = await supabase.from('subscriptions')
        .update({ email: text, updated_at: new Date().toISOString() })
        .eq('id', subId).select().single();
      if (error) return ctx.reply('❌ Error. Try again.');
      pendingEmail.delete(userId);
      await notifyFounder(data);
      await ctx.reply(T[lang].email_saved, { parse_mode: 'Markdown' });
    } catch (_) { ctx.reply('❌ Error. Try again.'); }
  }
});

// ─── Photo (manual payment proof) ────────────────────────────
bot.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  const lang = getLang(userId);
  const username = ctx.from.username || ctx.from.first_name || 'Unknown';
  try {
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    const caption = ctx.message.caption || '—';
    await bot.telegram.sendPhoto(FOUNDER_ID, fileId, {
      caption: `📸 *Manual Payment*\n\n👤 @${username} (\`${userId}\`)\n📝 ${caption}`,
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('✅  Activate', `man_ok_${userId}`), Markup.button.callback('❌  Reject', `man_no_${userId}`)],
      ]).reply_markup,
    });
    await ctx.reply(T[lang].proof_received, { parse_mode: 'Markdown' });
  } catch (err) { console.error('Photo error:', err.message); }
});

bot.action(/^man_ok_(\d+)$/, async (ctx) => {
  if (ctx.from.id !== FOUNDER_ID) return ctx.answerCbQuery('Not authorized.');
  const uid = parseInt(ctx.match[1]);
  const lang = getLang(uid);
  await ctx.answerCbQuery('✅');
  await bot.telegram.sendMessage(uid, T[lang].activated, { parse_mode: 'Markdown' });
  try { await ctx.editMessageCaption('✅ Activated'); } catch (_) {}
});

bot.action(/^man_no_(\d+)$/, async (ctx) => {
  if (ctx.from.id !== FOUNDER_ID) return ctx.answerCbQuery('Not authorized.');
  const uid = parseInt(ctx.match[1]);
  const lang = getLang(uid);
  await ctx.answerCbQuery('❌');
  await bot.telegram.sendMessage(uid, T[lang].rejected_msg, { parse_mode: 'Markdown' });
  try { await ctx.editMessageCaption('❌ Rejected'); } catch (_) {}
});

// ─── Notify Founder ───────────────────────────────────────────
async function notifyFounder(subscription) {
  try {
    const msg =
      `🔔 *New Order  #${subscription.id}*\n\n` +
      `👤 @${subscription.username || 'N/A'}  (\`${subscription.user_id}\`)\n` +
      `📧 \`${subscription.email}\`\n` +
      `💰 ${subscription.payment_amount} ⭐\n` +
      `📅 ${new Date(subscription.created_at).toLocaleString('en-GB')}`;
    await bot.telegram.sendMessage(FOUNDER_ID, msg, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('✅  Activate', `ok_${subscription.id}`), Markup.button.callback('❌  Reject', `no_${subscription.id}`)],
      ]).reply_markup,
    });
  } catch (err) { console.error('notifyFounder error:', err); }
}

// ─── Stars Approve / Reject ───────────────────────────────────
bot.action(/^ok_(\d+)$/, async (ctx) => {
  if (ctx.from.id !== FOUNDER_ID) return ctx.answerCbQuery('Not authorized.');
  const subId = parseInt(ctx.match[1]);
  try {
    const { data } = await supabase.from('subscriptions').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', subId).select().single();
    const lang = getLang(data.user_id);
    await bot.telegram.sendMessage(data.user_id, T[lang].activated, { parse_mode: 'Markdown' });
    await ctx.answerCbQuery('✅ Activated');
    await ctx.editMessageReplyMarkup(null);
  } catch (_) { ctx.answerCbQuery('Error.'); }
});

bot.action(/^no_(\d+)$/, async (ctx) => {
  if (ctx.from.id !== FOUNDER_ID) return ctx.answerCbQuery('Not authorized.');
  const subId = parseInt(ctx.match[1]);
  try {
    const { data } = await supabase.from('subscriptions').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', subId).select().single();
    const lang = getLang(data.user_id);
    await bot.telegram.sendMessage(data.user_id, T[lang].rejected_msg, { parse_mode: 'Markdown' });
    await ctx.answerCbQuery('❌ Rejected');
    await ctx.editMessageReplyMarkup(null);
  } catch (_) { ctx.answerCbQuery('Error.'); }
});

// ─── Admin ────────────────────────────────────────────────────
bot.command('admin', async (ctx) => {
  if (ctx.from.id !== FOUNDER_ID) return ctx.reply('❌ Not authorized.');
  const adminKb = Markup.inlineKeyboard([
    [Markup.button.callback('📊  Statistics',  'adm_stats')],
    [Markup.button.callback('📢  Broadcast',   'adm_broadcast')],
    [Markup.button.callback('‹  Back',         'nav_main')],
  ]);
  await ctx.reply('👨‍💼 *Admin Panel*', { parse_mode: 'Markdown', reply_markup: adminKb.reply_markup });
});

bot.action('adm_stats', async (ctx) => {
  if (ctx.from.id !== FOUNDER_ID) return ctx.answerCbQuery('Not authorized.');
  await ctx.answerCbQuery();
  try {
    const { data } = await supabase.from('subscriptions').select('status, payment_amount');
    const total    = data?.length || 0;
    const approved = data?.filter(o => o.status === 'approved').length || 0;
    const pending  = data?.filter(o => o.status === 'pending').length  || 0;
    const rejected = data?.filter(o => o.status === 'rejected').length || 0;
    const revenue  = data?.filter(o => o.status === 'approved').reduce((s, o) => s + (o.payment_amount || 0), 0) || 0;
    const adminKb = Markup.inlineKeyboard([[Markup.button.callback('‹  Back', 'nav_main')]]);
    await editOrReply(ctx,
      `📊 *Statistics*\n\n` +
      `📦  Total:      *${total}*\n` +
      `✅  Activated:  *${approved}*\n` +
      `🕐  Pending:    *${pending}*\n` +
      `❌  Rejected:   *${rejected}*\n\n` +
      `💰  Revenue:    *${revenue} ⭐*`,
      { parse_mode: 'Markdown', reply_markup: adminKb.reply_markup }
    );
  } catch (_) { ctx.reply('❌ Error loading stats.'); }
});

bot.action('adm_broadcast', async (ctx) => {
  if (ctx.from.id !== FOUNDER_ID) return ctx.answerCbQuery('Not authorized.');
  await ctx.answerCbQuery();
  broadcastMode.set(FOUNDER_ID, true);
  await ctx.reply(`📢 *Broadcast Mode*\n\nSend your message now.\n\n_/cancel to abort._`, { parse_mode: 'Markdown' });
});

// ─── /help & /contact ─────────────────────────────────────────
bot.command('help', async (ctx) => {
  const lang = getLang(ctx.from.id);
  await ctx.reply(
    lang === 'ar'
      ? `📚 *المساعدة*\n\n• /start — القائمة الرئيسية\n• /orders — طلباتي\n• /lang — تغيير اللغة\n• /contact — الدعم`
      : `📚 *Help*\n\n• /start — Main menu\n• /orders — My orders\n• /lang — Change language\n• /contact — Support`,
    { parse_mode: 'Markdown', reply_markup: kb.backMain(lang).reply_markup }
  );
});

bot.command('contact', async (ctx) => {
  const lang = getLang(ctx.from.id);
  await ctx.reply(T[lang].support_text, { parse_mode: 'Markdown', reply_markup: kb.backMain(lang).reply_markup });
});

// ─── Error Handler ────────────────────────────────────────────
bot.catch((err, ctx) => {
  console.error('Bot error:', err.message);
  try { if (ctx?.reply) ctx.reply('❌ Something went wrong. Please try again.'); } catch (_) {}
});

console.log('✅ All handlers registered');
module.exports = bot;
