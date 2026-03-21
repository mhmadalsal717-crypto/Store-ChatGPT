const { Telegraf, Markup } = require('telegraf');
const supabase = require('./supabase');
require('dotenv').config();

// Validate BOT_TOKEN
if (!process.env.BOT_TOKEN) {
  console.error('❌ ERROR: BOT_TOKEN is missing in .env file!');
  console.error('Please create a .env file and add your BOT_TOKEN from @BotFather');
  process.exit(1);
}

console.log('🤖 تهيئة البوت...');

let bot;
try {
  bot = new Telegraf(process.env.BOT_TOKEN);
  console.log('✅ تم تهيئة البوت بنجاح');
} catch (error) {
  console.error('❌ خطأ في تهيئة البوت:', error.message);
  process.exit(1);
}

const FOUNDER_ID = parseInt(process.env.FOUNDER_ID) || 0;
const PAYMENT_CURRENCY = 'XTR';

if (FOUNDER_ID) {
  console.log(`👤 Founder ID: ${FOUNDER_ID}`);
} else {
  console.log('⚠️  Founder ID غير مضبوط (الإشعارات لن تعمل)');
}

const pendingEmailEntries = new Map();
const userInfoCache = new Map();

// ─── Keyboards ───────────────────────────────────────────────

const mainKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('▶️ YouTube Premium', 'section_youtube')],
  [Markup.button.callback('🎬 Netflix Premium', 'section_netflix')],
  [Markup.button.callback('🎥 Shahid Plus', 'section_shahid')],
]);

const youtubeKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('📅 1 Month — 300 ⭐', 'buy_youtube_month')],
  [Markup.button.callback('📆 1 Year — 1000 ⭐', 'buy_youtube_year')],
  [Markup.button.callback('🔙 Back', 'back_main')],
]);

const netflixKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('📅 1 Month — 350 ⭐', 'buy_netflix_month')],
  [Markup.button.callback('📆 1 Year — 1000 ⭐', 'buy_netflix_year')],
  [Markup.button.callback('🔙 Back', 'back_main')],
]);

const shahidKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('📅 1 Month — 200 ⭐', 'buy_shahid_month')],
  [Markup.button.callback('📆 1 Year — 600 ⭐', 'buy_shahid_year')],
  [Markup.button.callback('🔙 Back', 'back_main')],
]);

// ─── Middleware ───────────────────────────────────────────────

bot.use(async (ctx, next) => {
  try {
    const updateType = ctx.updateType;
    const userId = ctx.from?.id || 'unknown';
    const username = ctx.from?.username || ctx.from?.first_name || 'unknown';
    console.log(`\n${'='.repeat(50)}`);
    console.log(`📨 استلام تحديث: ${updateType}`);
    console.log(`👤 من: ${username} (ID: ${userId})`);
    if (ctx.message?.text) console.log(`📝 النص: ${ctx.message.text}`);
    if (ctx.callbackQuery) console.log(`🔘 Callback: ${ctx.callbackQuery.data}`);
    console.log(`${'='.repeat(50)}`);
    await next();
    console.log(`✅ تم معالجة التحديث: ${updateType}`);
  } catch (error) {
    console.error('\n❌ خطأ في middleware:', error.message);
    throw error;
  }
});

// ─── /start ──────────────────────────────────────────────────

bot.start(async (ctx) => {
  try {
    const welcomeMessage = `
🎉 Welcome to our Digital Subscriptions Store!

✨ Get your subscription easily and securely.

📦 Available Services:
• ▶️ YouTube Premium
• 🎬 Netflix Premium
• 🎥 Shahid Plus

👇 Choose a service below to get started!
    `.trim();

    await ctx.reply(welcomeMessage, {
      reply_markup: mainKeyboard.reply_markup
    });
  } catch (error) {
    console.error('❌ خطأ في /start:', error.message);
    try { await ctx.reply('❌ حدث خطأ. الرجاء المحاولة لاحقاً.'); } catch (_) {}
  }
});

// ─── Section Buttons ─────────────────────────────────────────

bot.action('section_youtube', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('▶️ *YouTube Premium*\n\nChoose your plan:', {
    parse_mode: 'Markdown',
    reply_markup: youtubeKeyboard.reply_markup
  });
});

bot.action('section_netflix', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('🎬 *Netflix Premium*\n\nChoose your plan:', {
    parse_mode: 'Markdown',
    reply_markup: netflixKeyboard.reply_markup
  });
});

bot.action('section_shahid', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('🎥 *Shahid Plus*\n\nChoose your plan:', {
    parse_mode: 'Markdown',
    reply_markup: shahidKeyboard.reply_markup
  });
});

bot.action('back_main', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('🛒 Choose a service:', {
    reply_markup: mainKeyboard.reply_markup
  });
});

// ─── Plans & Buy Actions ──────────────────────────────────────

const plans = {
  youtube_month: { title: 'YouTube Premium - 1 Month', description: 'YouTube Premium subscription for 1 month', amount: 300 },
  youtube_year:  { title: 'YouTube Premium - 1 Year',  description: 'YouTube Premium subscription for 1 year',  amount: 1000 },
  netflix_month: { title: 'Netflix Premium - 1 Month', description: 'Netflix Premium subscription for 1 month', amount: 350 },
  netflix_year:  { title: 'Netflix Premium - 1 Year',  description: 'Netflix Premium subscription for 1 year',  amount: 1000 },
  shahid_month:  { title: 'Shahid Plus - 1 Month',     description: 'Shahid Plus subscription for 1 month',     amount: 200 },
  shahid_year:   { title: 'Shahid Plus - 1 Year',      description: 'Shahid Plus subscription for 1 year',      amount: 600 },
};

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
      console.error('❌ خطأ في إرسال الفاتورة:', error.message);
      try { await ctx.answerCbQuery('❌ حدث خطأ. الرجاء المحاولة لاحقاً.', true); } catch (_) {}
    }
  });
});

// ─── Pre-checkout ─────────────────────────────────────────────

bot.on('pre_checkout_query', async (ctx) => {
  try {
    await ctx.answerPreCheckoutQuery(true);
    console.log('✅ Pre-checkout answered');
  } catch (error) {
    console.error('❌ خطأ في pre-checkout:', error.message);
    try { await ctx.answerPreCheckoutQuery(false, { error_message: 'حدث خطأ. الرجاء المحاولة لاحقاً.' }); } catch (_) {}
  }
});

// ─── Successful Payment ───────────────────────────────────────

bot.on('successful_payment', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || ctx.from.first_name || 'غير معروف';
  const payment = ctx.message.successful_payment;

  try {
    userInfoCache.set(userId, {
      first_name: ctx.from.first_name || '',
      last_name: ctx.from.last_name || '',
      username: username
    });

    const paymentAmount = payment.currency === 'XTR'
      ? payment.total_amount
      : payment.total_amount / 100;

    const { data, error } = await supabase
      .from('subscriptions')
      .insert({
        user_id: userId,
        username: username,
        status: 'pending',
        payment_amount: paymentAmount,
        payment_currency: payment.currency,
        email: null
      })
      .select()
      .single();

    if (error) {
      console.error('❌ خطأ في قاعدة البيانات:', error);
      return ctx.reply('❌ حدث خطأ في حفظ البيانات. الرجاء المحاولة لاحقاً.');
    }

    pendingEmailEntries.set(userId, data.id);

    await ctx.reply(
      '✅ تم استلام الدفع بنجاح!\n\n' +
      '📧 أدخل الإيميل الذي تملك عليه حسابك لتفعيلك.\n' +
      '⚠️ نحن غير مسؤولين في حال كان الإيميل غلط',
      { reply_markup: Markup.removeKeyboard() }
    );

  } catch (error) {
    console.error('❌ خطأ في معالجة الدفع:', error.message);
    try { await ctx.reply('❌ حدث خطأ في معالجة الدفع. الرجاء المحاولة لاحقاً.'); } catch (_) {}
  }
});

// ─── Text (Email input) ───────────────────────────────────────

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;

  if (text.startsWith('/')) return;

  if (pendingEmailEntries.has(userId)) {
    const subscriptionId = pendingEmailEntries.get(userId);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(text)) {
      return ctx.reply('❌ يرجى إدخال إيميل صحيح.');
    }

    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .update({ email: text, updated_at: new Date().toISOString() })
        .eq('id', subscriptionId)
        .select()
        .single();

      if (error) {
        console.error('Database error:', error);
        return ctx.reply('❌ حدث خطأ في حفظ الإيميل. الرجاء المحاولة لاحقاً.');
      }

      pendingEmailEntries.delete(userId);
      await notifyFounder(ctx, data);
      await ctx.reply('✅ تم استلام إيميلك. سيتم مراجعته قريباً.');

    } catch (error) {
      console.error('Error saving email:', error);
      ctx.reply('❌ حدث خطأ. الرجاء المحاولة لاحقاً.');
    }
  }
});

// ─── Notify Founder ───────────────────────────────────────────

async function notifyFounder(ctx, subscription) {
  try {
    const userInfo = userInfoCache.get(subscription.user_id) || {};
    const message = `
🔔 طلب اشتراك جديد

👤 معلومات المستخدم:
• المعرف: ${subscription.user_id}
• اسم المستخدم: @${subscription.username || 'غير متوفر'}
• الاسم: ${(userInfo.first_name || '') + ' ' + (userInfo.last_name || '')}

📧 الإيميل: ${subscription.email}

💰 الدفع: ${subscription.payment_amount} ${subscription.payment_currency}

🆔 رقم الطلب: #${subscription.id}
📅 التاريخ: ${new Date(subscription.created_at).toLocaleString('ar-SA')}
    `.trim();

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ تم إنهاء العملية', `approve_${subscription.id}`),
        Markup.button.callback('❌ مرفوض', `reject_${subscription.id}`)
      ]
    ]);

    await bot.telegram.sendMessage(FOUNDER_ID, message, {
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('Error notifying founder:', error);
  }
}

// ─── Approve / Reject ─────────────────────────────────────────

bot.action(/^(approve|reject)_(\d+)$/, async (ctx) => {
  const action = ctx.match[1];
  const subscriptionId = parseInt(ctx.match[2]);
  const founderId = ctx.from.id;

  if (founderId !== FOUNDER_ID) {
    return ctx.answerCbQuery('❌ غير مصرح لك بتنفيذ هذا الإجراء.');
  }

  try {
    const status = action === 'approve' ? 'approved' : 'rejected';
    const { data, error } = await supabase
      .from('subscriptions')
      .update({ status: status, updated_at: new Date().toISOString() })
      .eq('id', subscriptionId)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return ctx.answerCbQuery('❌ حدث خطأ في تحديث البيانات.');
    }

    const userId = data.user_id;
    if (action === 'approve') {
      await bot.telegram.sendMessage(userId,
        '✅ تم إنهاء العملية بنجاح!\n\nاذهب إلى الرسائل الواردة في إيميلك واضغط على "انضمام" من الإيميل الذي وصلك ليتم التفعيل.\n\nبتوفيق! 🎉'
      );
      await ctx.answerCbQuery('✅ تم الموافقة على الطلب');
    } else {
      await bot.telegram.sendMessage(userId,
        '❌ تم رفض طلبك.\n\nللأسف، لم يتم قبول طلب الاشتراك الخاص بك.'
      );
      await ctx.answerCbQuery('❌ تم رفض الطلب');
    }

    await ctx.editMessageReplyMarkup(null);

  } catch (error) {
    console.error('Error processing action:', error);
    ctx.answerCbQuery('❌ حدث خطأ في معالجة الطلب.');
  }
});

// ─── Error Handler ────────────────────────────────────────────

bot.catch((err, ctx) => {
  console.error('❌ خطأ في البوت:', err.message);
  try {
    if (ctx && ctx.reply) ctx.reply('❌ حدث خطأ غير متوقع. الرجاء المحاولة لاحقاً.');
  } catch (_) {}
});

console.log('✅ جميع handlers تم تسجيلها بنجاح');

module.exports = bot;
