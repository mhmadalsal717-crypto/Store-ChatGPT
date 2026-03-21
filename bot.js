const { Telegraf, Markup } = require('telegraf');
const supabase = require('./supabase');
require('dotenv').config();

if (!process.env.BOT_TOKEN) {
  console.error('❌ ERROR: BOT_TOKEN is missing!');
  process.exit(1);
}

let bot;
try {
  bot = new Telegraf(process.env.BOT_TOKEN);
  console.log('✅ Bot initialized successfully');
} catch (error) {
  console.error('❌ Bot init error:', error.message);
  process.exit(1);
}

const FOUNDER_ID = parseInt(process.env.FOUNDER_ID) || 0;

// ─── Payment Info ─────────────────────────────────────────────
const PAYMENT_INFO = {
  binance_id: '815791123',
  usdt_trc20: 'TN8bezRsWbVEFEp21fghdstLA2oxCU9B4A',
  usdt_bep20: '0x8ff168fb3140fe3f5106b8ec7736bddd2c57e621',
  usdt_erc20: '0x8ff168fb3140fe3f5106b8ec7736bddd2c57e621',
  support: '@XBLLT',
};

// ─── State Maps ───────────────────────────────────────────────
const pendingEmailEntries = new Map();  // userId -> subscriptionId (after Stars payment)
const pendingManualPayment = new Map(); // userId -> { plan, method } (after manual payment selection)
const userInfoCache = new Map();
const broadcastMode = new Map();

// ─── Plans ────────────────────────────────────────────────────
const plans = {
  youtube_month: { title: 'YouTube Premium - 1 Month', description: 'YouTube Premium for 1 month', amount: 300, label: '▶️ YouTube Premium — شهر' },
  youtube_year:  { title: 'YouTube Premium - 1 Year',  description: 'YouTube Premium for 1 year',  amount: 1000, label: '▶️ YouTube Premium — سنة' },
  netflix_month: { title: 'Netflix Premium - 1 Month', description: 'Netflix Premium for 1 month', amount: 350, label: '🎬 Netflix Premium — شهر' },
  netflix_year:  { title: 'Netflix Premium - 1 Year',  description: 'Netflix Premium for 1 year',  amount: 1000, label: '🎬 Netflix Premium — سنة' },
  shahid_month:  { title: 'Shahid Plus - 1 Month',     description: 'Shahid Plus for 1 month',     amount: 200, label: '🎥 Shahid Plus — شهر' },
  shahid_year:   { title: 'Shahid Plus - 1 Year',      description: 'Shahid Plus for 1 year',      amount: 600, label: '🎥 Shahid Plus — سنة' },
};

// ─── Keyboards ───────────────────────────────────────────────

const mainKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🛍️ المنتجات', 'section_products')],
  [Markup.button.callback('📦 طلباتي', 'my_orders'), Markup.button.callback('❓ أسئلة شائعة', 'faq')],
  [Markup.button.callback('💬 تواصل معنا', 'support'), Markup.button.callback('💳 طرق الدفع', 'payment_methods')],
]);

const productsKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('▶️ YouTube Premium', 'section_youtube')],
  [Markup.button.callback('🎬 Netflix Premium', 'section_netflix')],
  [Markup.button.callback('🎥 Shahid Plus', 'section_shahid')],
  [Markup.button.callback('🔙 رجوع', 'back_main')],
]);

const youtubeKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('📅 شهر واحد — 300 ⭐', 'buy_youtube_month')],
  [Markup.button.callback('📆 سنة كاملة — 1000 ⭐', 'buy_youtube_year')],
  [Markup.button.callback('🔙 رجوع', 'section_products')],
]);

const netflixKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('📅 شهر واحد — 350 ⭐', 'buy_netflix_month')],
  [Markup.button.callback('📆 سنة كاملة — 1000 ⭐', 'buy_netflix_year')],
  [Markup.button.callback('🔙 رجوع', 'section_products')],
]);

const shahidKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('📅 شهر واحد — 200 ⭐', 'buy_shahid_month')],
  [Markup.button.callback('📆 سنة كاملة — 600 ⭐', 'buy_shahid_year')],
  [Markup.button.callback('🔙 رجوع', 'section_products')],
]);

const backMainKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🔙 القائمة الرئيسية', 'back_main')],
]);

const adminKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('📊 الإحصائيات', 'admin_stats')],
  [Markup.button.callback('📢 رسالة للكل (Broadcast)', 'admin_broadcast')],
  [Markup.button.callback('🔙 رجوع', 'back_main')],
]);

const paymentMethodsKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('⭐ Telegram Stars', 'pm_stars')],
  [Markup.button.callback('🟡 Binance Pay', 'pm_binance')],
  [Markup.button.callback('💠 USDT Crypto', 'pm_usdt')],
  [Markup.button.callback('🔙 رجوع', 'back_main')],
]);

const usdtNetworkKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🔵 USDT TRC20', 'pm_usdt_trc20')],
  [Markup.button.callback('🟡 USDT BEP20', 'pm_usdt_bep20')],
  [Markup.button.callback('🔷 USDT ERC20', 'pm_usdt_erc20')],
  [Markup.button.callback('🔙 رجوع', 'payment_methods')],
]);

// ─── Middleware ───────────────────────────────────────────────

bot.use(async (ctx, next) => {
  try { await next(); } catch (error) {
    console.error('❌ Middleware error:', error.message);
    throw error;
  }
});

// ─── /start ──────────────────────────────────────────────────

bot.start(async (ctx) => {
  try {
    const firstName = ctx.from.first_name || 'عزيزي';
    const welcome = `
🌟 *أهلاً ${firstName}!*

مرحباً بك في متجر الاشتراكات الرقمية 🛍️

نقدم لك أفضل الاشتراكات بأسعار تنافسية وبشكل آمن وسريع.

📦 *خدماتنا:*
• ▶️ YouTube Premium
• 🎬 Netflix Premium
• 🎥 Shahid Plus

💳 *طرق الدفع المتاحة:*
• ⭐ Telegram Stars
• 🟡 Binance Pay
• 💠 USDT (TRC20 / BEP20 / ERC20)

✅ تفعيل سريع | 🔒 دفع آمن | 💬 دعم 24/7

👇 اختر من القائمة للبدء
    `.trim();

    await ctx.reply(welcome, {
      parse_mode: 'Markdown',
      reply_markup: mainKeyboard.reply_markup
    });
  } catch (error) {
    console.error('❌ /start error:', error.message);
    try { await ctx.reply('❌ حدث خطأ. الرجاء المحاولة لاحقاً.'); } catch (_) {}
  }
});

// ─── /help ───────────────────────────────────────────────────

bot.command('help', async (ctx) => {
  await ctx.reply(
    `📚 *مركز المساعدة*\n\n` +
    `*الأوامر المتاحة:*\n` +
    `• /start — الصفحة الرئيسية\n` +
    `• /orders — طلباتي\n` +
    `• /help — المساعدة\n` +
    `• /contact — تواصل معنا\n\n` +
    `للدعم المباشر تواصل مع ${PAYMENT_INFO.support} 💬`,
    { parse_mode: 'Markdown', reply_markup: backMainKeyboard.reply_markup }
  );
});

// ─── /contact ────────────────────────────────────────────────

bot.command('contact', async (ctx) => {
  await ctx.reply(
    `💬 *تواصل معنا*\n\n` +
    `يسعدنا مساعدتك في أي وقت!\n\n` +
    `👤 الدعم المباشر: ${PAYMENT_INFO.support}\n` +
    `⏰ متاحون: 24/7`,
    { parse_mode: 'Markdown', reply_markup: backMainKeyboard.reply_markup }
  );
});

// ─── /orders ─────────────────────────────────────────────────

bot.command('orders', async (ctx) => {
  await showOrders(ctx, false);
});

// ─── /admin ──────────────────────────────────────────────────

bot.command('admin', async (ctx) => {
  if (ctx.from.id !== FOUNDER_ID) return ctx.reply('❌ غير مصرح لك.');
  await ctx.reply('👨‍💼 *لوحة تحكم الأدمن*', {
    parse_mode: 'Markdown',
    reply_markup: adminKeyboard.reply_markup
  });
});

// ─── Main Navigation ──────────────────────────────────────────

bot.action('back_main', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    await ctx.editMessageText(
      `🌟 *القائمة الرئيسية*\n\nاختر ما تريد:`,
      { parse_mode: 'Markdown', reply_markup: mainKeyboard.reply_markup }
    );
  } catch (_) {
    await ctx.reply('🌟 *القائمة الرئيسية*\n\nاختر ما تريد:', {
      parse_mode: 'Markdown',
      reply_markup: mainKeyboard.reply_markup
    });
  }
});

// ─── Products ─────────────────────────────────────────────────

bot.action('section_products', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    await ctx.editMessageText(
      `🛍️ *المنتجات المتاحة*\n\nاختر الخدمة التي تريدها:`,
      { parse_mode: 'Markdown', reply_markup: productsKeyboard.reply_markup }
    );
  } catch (_) {}
});

bot.action('section_youtube', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    await ctx.editMessageText(
      `▶️ *YouTube Premium*\n\n🎵 استمع وشاهد بدون إعلانات\n🎬 محتوى حصري YouTube Originals\n📱 تشغيل في الخلفية\n\nاختر الباقة:`,
      { parse_mode: 'Markdown', reply_markup: youtubeKeyboard.reply_markup }
    );
  } catch (_) {}
});

bot.action('section_netflix', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    await ctx.editMessageText(
      `🎬 *Netflix Premium*\n\n📺 جودة 4K Ultra HD\n👥 4 شاشات في آن واحد\n🎭 آلاف الأفلام والمسلسلات\n\nاختر الباقة:`,
      { parse_mode: 'Markdown', reply_markup: netflixKeyboard.reply_markup }
    );
  } catch (_) {}
});

bot.action('section_shahid', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    await ctx.editMessageText(
      `🎥 *Shahid Plus*\n\n🌟 أفضل المسلسلات العربية\n🎬 أفلام ومسلسلات حصرية\n📱 على جميع الأجهزة\n\nاختر الباقة:`,
      { parse_mode: 'Markdown', reply_markup: shahidKeyboard.reply_markup }
    );
  } catch (_) {}
});

// ─── FAQ ─────────────────────────────────────────────────────

bot.action('faq', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    await ctx.editMessageText(
      `❓ *الأسئلة الشائعة*\n\n` +
      `*1️⃣ كيف أدفع؟*\n` +
      `لدينا 3 طرق دفع: Telegram Stars، Binance Pay، وعملات USDT.\n\n` +
      `*2️⃣ متى يتم التفعيل؟*\n` +
      `يتم التفعيل خلال دقائق بعد مراجعة الطلب من فريقنا.\n\n` +
      `*3️⃣ ماذا بعد الدفع؟*\n` +
      `أرسل إثبات الدفع (سكرين شوت) وإيميلك، وسيتم التفعيل فوراً.\n\n` +
      `*4️⃣ هل الدفع آمن؟*\n` +
      `نعم 100%، جميع طرق الدفع موثوقة وآمنة.\n\n` +
      `*5️⃣ ماذا لو واجهت مشكلة؟*\n` +
      `تواصل مع فريق الدعم ${PAYMENT_INFO.support} وسنساعدك فوراً.\n\n` +
      `*6️⃣ هل يمكن استرداد المبلغ؟*\n` +
      `في حال وجود مشكلة من جهتنا نعم، نضمن حقك كاملاً.`,
      { parse_mode: 'Markdown', reply_markup: backMainKeyboard.reply_markup }
    );
  } catch (_) {}
});

// ─── Support ─────────────────────────────────────────────────

bot.action('support', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    await ctx.editMessageText(
      `💬 *تواصل مع فريق الدعم*\n\n` +
      `يسعدنا مساعدتك في أي وقت! 🌟\n\n` +
      `👤 *الدعم المباشر:* ${PAYMENT_INFO.support}\n` +
      `⏰ *أوقات الدعم:* 24/7\n\n` +
      `_يمكنك التواصل معنا لأي استفسار أو مشكلة_`,
      { parse_mode: 'Markdown', reply_markup: backMainKeyboard.reply_markup }
    );
  } catch (_) {}
});

// ─── Payment Methods Info ─────────────────────────────────────

bot.action('payment_methods', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    await ctx.editMessageText(
      `💳 *طرق الدفع المتاحة*\n\n` +
      `اختر طريقة الدفع المناسبة لك:`,
      { parse_mode: 'Markdown', reply_markup: paymentMethodsKeyboard.reply_markup }
    );
  } catch (_) {}
});

bot.action('pm_stars', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    await ctx.editMessageText(
      `⭐ *Telegram Stars*\n\n` +
      `الدفع الرسمي والآمن عبر تلغرام مباشرة.\n\n` +
      `*كيف أدفع بـ Stars؟*\n` +
      `1. اختر المنتج من قسم المنتجات\n` +
      `2. اضغط على الباقة التي تريدها\n` +
      `3. ستظهر لك فاتورة الدفع\n` +
      `4. اضغط "دفع" وأكمل العملية\n` +
      `5. أدخل إيميلك بعد الدفع ✅\n\n` +
      `_الدفع يتم عبر نظام تلغرام الرسمي بأمان تام_`,
      { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🛍️ اذهب للمنتجات', 'section_products')],
        [Markup.button.callback('🔙 رجوع', 'payment_methods')],
      ]).reply_markup }
    );
  } catch (_) {}
});

bot.action('pm_binance', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    await ctx.editMessageText(
      `🟡 *Binance Pay*\n\n` +
      `*Binance ID:*\n` +
      `\`${PAYMENT_INFO.binance_id}\`\n\n` +
      `*خطوات الدفع:*\n` +
      `1️⃣ افتح تطبيق Binance\n` +
      `2️⃣ اذهب إلى Pay ← Send\n` +
      `3️⃣ أدخل الـ ID: \`${PAYMENT_INFO.binance_id}\`\n` +
      `4️⃣ أدخل المبلغ المطلوب للباقة\n` +
      `5️⃣ أكمل عملية الدفع\n` +
      `6️⃣ خذ سكرين شوت للتأكيد\n` +
      `7️⃣ أرسل السكرين شوت لـ ${PAYMENT_INFO.support} مع إيميلك والباقة المطلوبة\n\n` +
      `_سيتم التفعيل بعد التحقق من الدفع_`,
      { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔙 رجوع', 'payment_methods')],
      ]).reply_markup }
    );
  } catch (_) {}
});

bot.action('pm_usdt', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    await ctx.editMessageText(
      `💠 *USDT Crypto*\n\nاختر الشبكة:`,
      { parse_mode: 'Markdown', reply_markup: usdtNetworkKeyboard.reply_markup }
    );
  } catch (_) {}
});

bot.action('pm_usdt_trc20', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    await ctx.editMessageText(
      `🔵 *USDT TRC20 (Tron)*\n\n` +
      `*عنوان المحفظة:*\n` +
      `\`${PAYMENT_INFO.usdt_trc20}\`\n\n` +
      `*خطوات الدفع:*\n` +
      `1️⃣ افتح محفظتك (Binance / Trust Wallet / إلخ)\n` +
      `2️⃣ اختر إرسال USDT على شبكة TRC20\n` +
      `3️⃣ انسخ العنوان أعلاه والصقه\n` +
      `4️⃣ أدخل المبلغ المطلوب للباقة\n` +
      `5️⃣ أكمل التحويل\n` +
      `6️⃣ خذ سكرين شوت أو hash التحويل\n` +
      `7️⃣ أرسله لـ ${PAYMENT_INFO.support} مع إيميلك والباقة المطلوبة\n\n` +
      `⚠️ _تأكد أنك تستخدم شبكة TRC20 وليس غيرها لتجنب فقدان الأموال_`,
      { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔙 رجوع', 'pm_usdt')],
      ]).reply_markup }
    );
  } catch (_) {}
});

bot.action('pm_usdt_bep20', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    await ctx.editMessageText(
      `🟡 *USDT BEP20 (BSC)*\n\n` +
      `*عنوان المحفظة:*\n` +
      `\`${PAYMENT_INFO.usdt_bep20}\`\n\n` +
      `*خطوات الدفع:*\n` +
      `1️⃣ افتح محفظتك (Binance / MetaMask / إلخ)\n` +
      `2️⃣ اختر إرسال USDT على شبكة BEP20 (BSC)\n` +
      `3️⃣ انسخ العنوان أعلاه والصقه\n` +
      `4️⃣ أدخل المبلغ المطلوب للباقة\n` +
      `5️⃣ أكمل التحويل\n` +
      `6️⃣ خذ سكرين شوت أو hash التحويل\n` +
      `7️⃣ أرسله لـ ${PAYMENT_INFO.support} مع إيميلك والباقة المطلوبة\n\n` +
      `⚠️ _تأكد أنك تستخدم شبكة BEP20 (BSC) لتجنب فقدان الأموال_`,
      { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔙 رجوع', 'pm_usdt')],
      ]).reply_markup }
    );
  } catch (_) {}
});

bot.action('pm_usdt_erc20', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    await ctx.editMessageText(
      `🔷 *USDT ERC20 (Ethereum)*\n\n` +
      `*عنوان المحفظة:*\n` +
      `\`${PAYMENT_INFO.usdt_erc20}\`\n\n` +
      `*خطوات الدفع:*\n` +
      `1️⃣ افتح محفظتك (MetaMask / Trust Wallet / إلخ)\n` +
      `2️⃣ اختر إرسال USDT على شبكة ERC20 (Ethereum)\n` +
      `3️⃣ انسخ العنوان أعلاه والصقه\n` +
      `4️⃣ أدخل المبلغ المطلوب للباقة\n` +
      `5️⃣ أكمل التحويل\n` +
      `6️⃣ خذ سكرين شوت أو hash التحويل\n` +
      `7️⃣ أرسله لـ ${PAYMENT_INFO.support} مع إيميلك والباقة المطلوبة\n\n` +
      `⚠️ _تأكد أنك تستخدم شبكة ERC20. رسوم الغاز مرتفعة نسبياً_`,
      { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔙 رجوع', 'pm_usdt')],
      ]).reply_markup }
    );
  } catch (_) {}
});

// ─── My Orders ───────────────────────────────────────────────

bot.action('my_orders', async (ctx) => {
  await ctx.answerCbQuery();
  await showOrders(ctx, true);
});

async function showOrders(ctx, isCallback) {
  const userId = ctx.from.id;
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    const statusEmoji = { pending: '⏳', approved: '✅', rejected: '❌' };
    const statusText  = { pending: 'قيد المراجعة', approved: 'مكتمل ✅', rejected: 'مرفوض ❌' };

    if (error || !data || data.length === 0) {
      const msg = `📦 *طلباتي*\n\nلا يوجد لديك طلبات سابقة بعد.\nاضغط على المنتجات لبدء الاشتراك! 🛍️`;
      if (isCallback) return ctx.editMessageText(msg, { parse_mode: 'Markdown', reply_markup: backMainKeyboard.reply_markup });
      return ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: backMainKeyboard.reply_markup });
    }

    let message = `📦 *طلباتي* (آخر ${data.length} طلبات)\n\n`;
    data.forEach((order, i) => {
      message += `*${i + 1}. طلب #${order.id}*\n`;
      message += `   💰 ${order.payment_amount} ⭐\n`;
      message += `   ${statusEmoji[order.status] || '❓'} ${statusText[order.status] || order.status}\n`;
      message += `   📅 ${new Date(order.created_at).toLocaleDateString('ar-SA')}\n\n`;
    });

    if (isCallback) return ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: backMainKeyboard.reply_markup });
    return ctx.reply(message, { parse_mode: 'Markdown', reply_markup: backMainKeyboard.reply_markup });
  } catch (error) {
    console.error('❌ showOrders error:', error.message);
    ctx.reply('❌ حدث خطأ. الرجاء المحاولة لاحقاً.');
  }
}

// ─── Admin Actions ────────────────────────────────────────────

bot.action('admin_stats', async (ctx) => {
  if (ctx.from.id !== FOUNDER_ID) return ctx.answerCbQuery('❌ غير مصرح.');
  await ctx.answerCbQuery();
  try {
    const { data: all } = await supabase.from('subscriptions').select('status, payment_amount');
    const total    = all?.length || 0;
    const approved = all?.filter(o => o.status === 'approved').length || 0;
    const pending  = all?.filter(o => o.status === 'pending').length || 0;
    const rejected = all?.filter(o => o.status === 'rejected').length || 0;
    const revenue  = all?.filter(o => o.status === 'approved').reduce((s, o) => s + (o.payment_amount || 0), 0) || 0;

    await ctx.editMessageText(
      `📊 *إحصائيات المتجر*\n\n` +
      `📦 إجمالي الطلبات: *${total}*\n` +
      `✅ مكتملة: *${approved}*\n` +
      `⏳ قيد المراجعة: *${pending}*\n` +
      `❌ مرفوضة: *${rejected}*\n\n` +
      `💰 إجمالي الإيرادات: *${revenue} ⭐*`,
      { parse_mode: 'Markdown', reply_markup: adminKeyboard.reply_markup }
    );
  } catch (error) {
    ctx.reply('❌ خطأ في جلب الإحصائيات.');
  }
});

bot.action('admin_broadcast', async (ctx) => {
  if (ctx.from.id !== FOUNDER_ID) return ctx.answerCbQuery('❌ غير مصرح.');
  await ctx.answerCbQuery();
  broadcastMode.set(FOUNDER_ID, true);
  await ctx.reply(
    `📢 *وضع الـ Broadcast*\n\n` +
    `أرسل الرسالة التي تريد إرسالها لجميع المستخدمين.\n\n` +
    `_أرسل /cancel للإلغاء_`,
    { parse_mode: 'Markdown' }
  );
});

// ─── Stars Buy Actions ────────────────────────────────────────

Object.entries(plans).forEach(([key, plan]) => {
  bot.action(`buy_${key}`, async (ctx) => {
    const userId = ctx.from.id;
    try {
      await ctx.answerCbQuery();
      await ctx.replyWithInvoice({
        title: plan.title,
        description: plan.description,
        payload: `${key}_${userId}_${Date.now()}`,
        provider_token: '',
        currency: 'XTR',
        prices: [{ label: plan.title, amount: plan.amount }]
      });
    } catch (error) {
      console.error('❌ Invoice error:', error.message);
      try { await ctx.answerCbQuery('❌ حدث خطأ. الرجاء المحاولة لاحقاً.', true); } catch (_) {}
    }
  });
});

// ─── Pre-checkout ─────────────────────────────────────────────

bot.on('pre_checkout_query', async (ctx) => {
  try {
    await ctx.answerPreCheckoutQuery(true);
  } catch (error) {
    try { await ctx.answerPreCheckoutQuery(false, { error_message: 'حدث خطأ. الرجاء المحاولة لاحقاً.' }); } catch (_) {}
  }
});

// ─── Successful Payment (Stars) ───────────────────────────────

bot.on('successful_payment', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || ctx.from.first_name || 'غير معروف';
  const payment = ctx.message.successful_payment;

  try {
    userInfoCache.set(userId, {
      first_name: ctx.from.first_name || '',
      last_name: ctx.from.last_name || '',
      username
    });

    const paymentAmount = payment.currency === 'XTR' ? payment.total_amount : payment.total_amount / 100;

    const { data, error } = await supabase
      .from('subscriptions')
      .insert({ user_id: userId, username, status: 'pending', payment_amount: paymentAmount, payment_currency: payment.currency, email: null })
      .select().single();

    if (error) {
      console.error('❌ DB error:', error);
      return ctx.reply('❌ خطأ في حفظ البيانات. تواصل مع الدعم: ' + PAYMENT_INFO.support);
    }

    pendingEmailEntries.set(userId, data.id);

    await ctx.reply(
      `✅ *تم استلام الدفع بنجاح!*\n\n` +
      `📧 الآن أدخل الإيميل المرتبط بحسابك لإتمام التفعيل:\n\n` +
      `⚠️ تأكد من صحة الإيميل — نحن غير مسؤولين في حال كان خاطئاً`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('❌ Payment error:', error.message);
    try { await ctx.reply('❌ حدث خطأ. تواصل مع الدعم: ' + PAYMENT_INFO.support); } catch (_) {}
  }
});

// ─── Text Handler ─────────────────────────────────────────────

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;

  // Cancel command
  if (text === '/cancel') {
    broadcastMode.delete(userId);
    pendingEmailEntries.delete(userId);
    return ctx.reply('❌ تم الإلغاء.', { reply_markup: backMainKeyboard.reply_markup });
  }

  if (text.startsWith('/')) return;

  // Broadcast للأدمن
  if (userId === FOUNDER_ID && broadcastMode.get(FOUNDER_ID)) {
    broadcastMode.delete(FOUNDER_ID);
    try {
      const { data: users } = await supabase.from('subscriptions').select('user_id');
      if (!users || users.length === 0) return ctx.reply('❌ لا يوجد مستخدمين.');

      const uniqueUsers = [...new Set(users.map(u => u.user_id))];
      await ctx.reply(`📢 جاري الإرسال لـ ${uniqueUsers.length} مستخدم...`);

      let sent = 0, failed = 0;
      for (const uid of uniqueUsers) {
        try {
          await bot.telegram.sendMessage(uid, text, { parse_mode: 'Markdown' });
          sent++;
        } catch (_) { failed++; }
        await new Promise(r => setTimeout(r, 50));
      }
      return ctx.reply(`✅ *تم الإرسال!*\n\n📤 نجح: ${sent}\n❌ فشل: ${failed}`, { parse_mode: 'Markdown' });
    } catch (error) {
      return ctx.reply('❌ خطأ في الإرسال.');
    }
  }

  // Email بعد الدفع بـ Stars
  if (pendingEmailEntries.has(userId)) {
    const subscriptionId = pendingEmailEntries.get(userId);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(text)) {
      return ctx.reply('❌ يرجى إدخال إيميل صحيح.\nمثال: name@gmail.com');
    }

    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .update({ email: text, updated_at: new Date().toISOString() })
        .eq('id', subscriptionId)
        .select().single();

      if (error) return ctx.reply('❌ خطأ في حفظ الإيميل. الرجاء المحاولة لاحقاً.');

      pendingEmailEntries.delete(userId);
      await notifyFounder(ctx, data);
      await ctx.reply(
        `✅ *شكراً!*\n\n` +
        `تم استلام طلبك وسيتم التفعيل قريباً.\n\n` +
        `يمكنك متابعة حالة طلبك عبر /orders 📦`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('Email save error:', error);
      ctx.reply('❌ حدث خطأ. الرجاء المحاولة لاحقاً.');
    }
    return;
  }
});

// ─── Photo Handler (للدفع اليدوي) ────────────────────────────

bot.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || ctx.from.first_name || 'غير معروف';

  // أرسل إشعار للأدمن بالسكرين شوت
  try {
    const caption = ctx.message.caption || 'بدون ملاحظة';
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

    await bot.telegram.sendPhoto(FOUNDER_ID, fileId, {
      caption:
        `📸 *سكرين شوت دفع يدوي*\n\n` +
        `👤 المستخدم: @${username} (ID: \`${userId}\`)\n` +
        `📝 الملاحظة: ${caption}\n\n` +
        `_راجع الدفع وأرسل الإيميل لإتمام التفعيل_`,
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(`✅ تم التفعيل`, `manual_approve_${userId}`)],
        [Markup.button.callback(`❌ رفض`, `manual_reject_${userId}`)],
      ]).reply_markup
    });

    await ctx.reply(
      `✅ *تم استلام إثبات الدفع!*\n\n` +
      `سيقوم فريقنا بمراجعته وتفعيل اشتراكك قريباً.\n\n` +
      `للاستفسار تواصل مع ${PAYMENT_INFO.support} 💬`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Photo handler error:', error.message);
  }
});

// Manual approve/reject
bot.action(/^manual_approve_(\d+)$/, async (ctx) => {
  if (ctx.from.id !== FOUNDER_ID) return ctx.answerCbQuery('❌ غير مصرح.');
  const targetUserId = parseInt(ctx.match[1]);
  await ctx.answerCbQuery('✅ تم');
  await bot.telegram.sendMessage(targetUserId,
    `✅ *تم تفعيل اشتراكك بنجاح!*\n\n` +
    `تحقق من بريدك الإلكتروني للحصول على تفاصيل التفعيل.\n\nبتوفيق! 🎉`,
    { parse_mode: 'Markdown' }
  );
  await ctx.editMessageCaption('✅ تم التفعيل', { parse_mode: 'Markdown' });
});

bot.action(/^manual_reject_(\d+)$/, async (ctx) => {
  if (ctx.from.id !== FOUNDER_ID) return ctx.answerCbQuery('❌ غير مصرح.');
  const targetUserId = parseInt(ctx.match[1]);
  await ctx.answerCbQuery('❌ تم الرفض');
  await bot.telegram.sendMessage(targetUserId,
    `❌ *تم رفض إثبات الدفع*\n\n` +
    `للأسف لم يتم قبول إثبات الدفع. تواصل مع ${PAYMENT_INFO.support} للاستفسار.`,
    { parse_mode: 'Markdown' }
  );
  await ctx.editMessageCaption('❌ تم الرفض', { parse_mode: 'Markdown' });
});

// ─── Notify Founder (Stars) ───────────────────────────────────

async function notifyFounder(ctx, subscription) {
  try {
    const userInfo = userInfoCache.get(subscription.user_id) || {};
    const message =
      `🔔 *طلب اشتراك جديد!*\n\n` +
      `👤 المستخدم: @${subscription.username || 'غير متوفر'} (\`${subscription.user_id}\`)\n` +
      `📧 الإيميل: \`${subscription.email}\`\n` +
      `💰 الدفع: ${subscription.payment_amount} ⭐\n` +
      `🆔 رقم الطلب: #${subscription.id}\n` +
      `📅 ${new Date(subscription.created_at).toLocaleString('ar-SA')}`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ تم التفعيل', `approve_${subscription.id}`),
        Markup.button.callback('❌ مرفوض', `reject_${subscription.id}`)
      ]
    ]);

    await bot.telegram.sendMessage(FOUNDER_ID, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('notifyFounder error:', error);
  }
}

// ─── Approve / Reject (Stars) ─────────────────────────────────

bot.action(/^(approve|reject)_(\d+)$/, async (ctx) => {
  if (ctx.from.id !== FOUNDER_ID) return ctx.answerCbQuery('❌ غير مصرح.');
  const action = ctx.match[1];
  const subscriptionId = parseInt(ctx.match[2]);

  try {
    const status = action === 'approve' ? 'approved' : 'rejected';
    const { data, error } = await supabase
      .from('subscriptions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', subscriptionId)
      .select().single();

    if (error) return ctx.answerCbQuery('❌ خطأ في التحديث.');

    if (action === 'approve') {
      await bot.telegram.sendMessage(data.user_id,
        `✅ *تم تفعيل اشتراكك بنجاح!*\n\n` +
        `اذهب إلى بريدك الإلكتروني واضغط على رابط التفعيل.\n\nبتوفيق! 🎉`,
        { parse_mode: 'Markdown' }
      );
      await ctx.answerCbQuery('✅ تم التفعيل');
    } else {
      await bot.telegram.sendMessage(data.user_id,
        `❌ *تم رفض طلبك*\n\nللاستفسار تواصل مع ${PAYMENT_INFO.support}`,
        { parse_mode: 'Markdown' }
      );
      await ctx.answerCbQuery('❌ تم الرفض');
    }
    await ctx.editMessageReplyMarkup(null);
  } catch (error) {
    console.error('approve/reject error:', error);
    ctx.answerCbQuery('❌ حدث خطأ.');
  }
});

// ─── Error Handler ────────────────────────────────────────────

bot.catch((err, ctx) => {
  console.error('❌ Bot error:', err.message);
  try { if (ctx?.reply) ctx.reply('❌ حدث خطأ. الرجاء المحاولة لاحقاً.'); } catch (_) {}
});

console.log('✅ جميع handlers تم تسجيلها بنجاح');
module.exports = bot;
