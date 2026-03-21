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
const verifiedUsers  = new Set();
const userLang       = new Map();
const pendingEmail   = new Map();
const pendingPayment = new Map(); // userId -> { planKey, plan }
const userInfoCache  = new Map();
const broadcastMode  = new Map();

const getLang = (id) => userLang.get(id) || 'en';

// ─── Plans ────────────────────────────────────────────────────
const PLANS = {
  youtube_month: { title: 'YouTube Premium · 1 Month',  description: 'YouTube Premium for 1 month.',  amount: 300,  emoji: '▶️', service: 'YouTube Premium',  period: '1 Month',  period_ar: 'شهر واحد'  },
  youtube_year:  { title: 'YouTube Premium · 1 Year',   description: 'YouTube Premium for 1 year.',   amount: 1000, emoji: '▶️', service: 'YouTube Premium',  period: '1 Year',   period_ar: 'سنة كاملة' },
  netflix_month: { title: 'Netflix Premium · 1 Month',  description: 'Netflix Premium for 1 month.',  amount: 350,  emoji: '🎬', service: 'Netflix Premium',  period: '1 Month',  period_ar: 'شهر واحد'  },
  netflix_year:  { title: 'Netflix Premium · 1 Year',   description: 'Netflix Premium for 1 year.',   amount: 1000, emoji: '🎬', service: 'Netflix Premium',  period: '1 Year',   period_ar: 'سنة كاملة' },
  shahid_month:  { title: 'Shahid Plus · 1 Month',      description: 'Shahid Plus for 1 month.',      amount: 200,  emoji: '🎥', service: 'Shahid Plus',      period: '1 Month',  period_ar: 'شهر واحد'  },
  shahid_year:   { title: 'Shahid Plus · 1 Year',       description: 'Shahid Plus for 1 year.',       amount: 600,  emoji: '🎥', service: 'Shahid Plus',      period: '1 Year',   period_ar: 'سنة كاملة' },
};

// ─── Translations ─────────────────────────────────────────────
const T = {
  en: {
    verify_prompt: `🔐 *Verification Required*\n\n_One quick step before we get started._\n\nPlease confirm you're human to access the store.`,
    verify_btn:    `✅  Confirm — I'm not a robot`,
    verify_ok:     `✅ *Verified successfully!*\n\n_Redirecting you to the store..._`,

    welcome: (name) =>
`🎉 *Welcome to the Entertainment Subscriptions Store!*

Hello, *${name}!* 👋

━━━━━━━━━━━━━━━━━━
🌟 *Our Premium Services:*

▶️ *YouTube Premium*
_Ad-free videos, background play & YouTube Originals_

🎬 *Netflix Premium*
_4K streaming, 4 screens & thousands of exclusive titles_

🎥 *Shahid Plus*
_The best Arabic series, films & live sports_
━━━━━━━━━━━━━━━━━━

⚡ *Near-instant activation* after order confirmation
🔒 *Secure payments* via Telegram Stars & Crypto
💬 *24/7 support* always at your service

_Choose an option below to get started_ 👇`,

    products:     `🛒  Products`,
    my_orders:    `📦  My Orders`,
    faq:          `❓  FAQ`,
    support_btn:  `💬  Support`,
    payments_btn: `💳  Payments`,
    switch_lang:  `🌐  العربية`,
    back:         `‹  Back`,
    back_menu:    `‹  Back to Menu`,

    browse: `🛒 *Products*\n\n_Select a service to view available plans:_`,

    youtube_info:
`▶️ *YouTube Premium*
━━━━━━━━━━━━━━━━━━
✦ _Ad-free videos & music_
✦ _Background playback_
✦ _YouTube Originals & exclusives_
✦ _Works on all your devices_
━━━━━━━━━━━━━━━━━━
_Select your plan:_`,

    netflix_info:
`🎬 *Netflix Premium*
━━━━━━━━━━━━━━━━━━
✦ _4K Ultra HD quality_
✦ _Up to 4 screens simultaneously_
✦ _Thousands of movies & series_
✦ _Download for offline viewing_
━━━━━━━━━━━━━━━━━━
_Select your plan:_`,

    shahid_info:
`🎥 *Shahid Plus*
━━━━━━━━━━━━━━━━━━
✦ _Exclusive Arabic series & films_
✦ _Live sports & major events_
✦ _Available on all devices_
✦ _HD & Full HD quality_
━━━━━━━━━━━━━━━━━━
_Select your plan:_`,

    plan_month: (p) => `📅  1 Month  ·  ${p} ⭐`,
    plan_year:  (p) => `📆  1 Year   ·  ${p} ⭐`,

    choose_payment: (plan) =>
`💳 *Select Payment Method*
━━━━━━━━━━━━━━━━━━
${plan.emoji} *${plan.service}*  ·  _${plan.period}_
💰 *Price:* ${plan.amount} ⭐
━━━━━━━━━━━━━━━━━━
_Choose how you'd like to pay:_`,

    faq_text:
`❓ *Frequently Asked Questions*
━━━━━━━━━━━━━━━━━━
*💳 How do I pay?*
_Telegram Stars, Binance Pay, or USDT (TRC20/BEP20/ERC20)._

*⚡ When is activation?*
_Within minutes after our team reviews your order._

*📧 What happens after payment?*
_You'll be asked to enter your email. Activation follows shortly._

*🔒 Is it secure?*
_Yes — all methods are verified and fully secure._

*🆘 Issues?*
_Contact ${PAYMENT_INFO.support} — we reply instantly._

*💸 Refunds?*
_Guaranteed if the issue is on our end._
━━━━━━━━━━━━━━━━━━`,

    support_text:
`💬 *Support Center*
━━━━━━━━━━━━━━━━━━
_Our team is always here for you._

👤 *Direct support:*  ${PAYMENT_INFO.support}
⏰ *Availability:*  24 / 7

_Don't hesitate to reach out for any question or issue._
━━━━━━━━━━━━━━━━━━`,

    payments_text: `💳 *Payment Methods*\n\n_Choose your preferred payment method:_`,

    stars_text:
`⭐ *Telegram Stars*
━━━━━━━━━━━━━━━━━━
_The fastest & most secure way — directly through Telegram._

*How to pay:*
➊ Browse Products & select a plan
➋ Choose _Telegram Stars_ as payment
➌ An invoice will appear — tap *Pay*
➍ Enter your email after payment
➎ Done! ✅
━━━━━━━━━━━━━━━━━━`,

    binance_text:
`🟡 *Binance Pay*
━━━━━━━━━━━━━━━━━━
*Binance ID:*
\`${PAYMENT_INFO.binance_id}\`

*How to pay:*
➊ Open Binance → Pay → Send
➋ Enter ID: \`${PAYMENT_INFO.binance_id}\`
➌ Enter the amount for your plan
➍ Complete the payment
➎ Screenshot the receipt
➏ Send to ${PAYMENT_INFO.support} with your _email & plan_
━━━━━━━━━━━━━━━━━━
_⚡ Activation within minutes after verification._`,

    usdt_text: `💠 *USDT Crypto*\n\n_Select your preferred network:_`,

    trc20_text:
`🔵 *USDT · TRC20 (Tron)*
━━━━━━━━━━━━━━━━━━
*Wallet Address:*
\`${PAYMENT_INFO.usdt_trc20}\`

*How to pay:*
➊ Open wallet (Binance / Trust Wallet)
➋ Send USDT on *TRC20* network
➌ Paste the address above
➍ Enter the amount for your plan
➎ Complete the transfer
➏ Screenshot TX or copy hash
➐ Send to ${PAYMENT_INFO.support} with your _email & plan_
━━━━━━━━━━━━━━━━━━
⚠️ _TRC20 network only — other networks will result in lost funds._`,

    bep20_text:
`🟡 *USDT · BEP20 (BSC)*
━━━━━━━━━━━━━━━━━━
*Wallet Address:*
\`${PAYMENT_INFO.usdt_bep20}\`

*How to pay:*
➊ Open wallet (Binance / MetaMask)
➋ Send USDT on *BEP20 (BSC)* network
➌ Paste the address above
➍ Enter the amount for your plan
➎ Complete the transfer
➏ Screenshot TX or copy hash
➐ Send to ${PAYMENT_INFO.support} with your _email & plan_
━━━━━━━━━━━━━━━━━━
⚠️ _BEP20 network only._`,

    erc20_text:
`🔷 *USDT · ERC20 (Ethereum)*
━━━━━━━━━━━━━━━━━━
*Wallet Address:*
\`${PAYMENT_INFO.usdt_erc20}\`

*How to pay:*
➊ Open wallet (MetaMask / Trust Wallet)
➋ Send USDT on *ERC20* network
➌ Paste the address above
➍ Enter the amount for your plan
➎ Complete the transfer
➏ Screenshot TX or copy hash
➐ Send to ${PAYMENT_INFO.support} with your _email & plan_
━━━━━━━━━━━━━━━━━━
⚠️ _Ethereum gas fees apply._`,

    orders_empty: `📦 *My Orders*\n━━━━━━━━━━━━━━━━━━\n_You haven't placed any orders yet._\n\nBrowse our products to get started! 🛒`,
    orders_title: (n) => `📦 *My Orders*  ·  _last ${n}_\n━━━━━━━━━━━━━━━━━━\n`,
    order_row: (o, i) => {
      const icon  = { pending: '🕐', approved: '✅', rejected: '❌' }[o.status] || '❓';
      const label = { pending: 'Pending Review', approved: 'Activated', rejected: 'Rejected' }[o.status] || o.status;
      return `*${i+1}.*  Order *#${o.id}*\n     ${icon}  _${label}_\n     💰  *${o.payment_amount} ⭐*\n     📅  ${new Date(o.created_at).toLocaleDateString('en-GB')}\n\n`;
    },

    pay_received: `✅ *Payment Received!*\n━━━━━━━━━━━━━━━━━━\n📧 _Please enter the email linked to your account for activation:_\n\n⚠️ _Double-check your email — incorrect entries cannot be corrected._`,
    manual_received: `✅ *Payment Proof Received!*\n━━━━━━━━━━━━━━━━━━\n_Our team will verify and activate your subscription shortly._\n\n_For updates: ${PAYMENT_INFO.support}_`,
    email_invalid: `❌ *Invalid email format.*\n_Please try again._\n\nExample: \`name@gmail.com\``,
    email_saved: `✅ *You're all set!*\n━━━━━━━━━━━━━━━━━━\n_Your order is under review. Activation usually takes a few minutes._\n\n📦 Track your order: /orders`,
    activated: `✅ *Subscription Activated!*\n━━━━━━━━━━━━━━━━━━\n🎉 _Your subscription is now active!_\n\nCheck your inbox for the activation email and follow the instructions.\n\n_Enjoy your subscription!_ 🌟`,
    rejected_msg: `❌ *Order Rejected*\n━━━━━━━━━━━━━━━━━━\n_We could not process your order._\nContact ${PAYMENT_INFO.support} for assistance.`,
  },

  ar: {
    verify_prompt: `🔐 *التحقق من الهوية*\n\n_خطوة سريعة قبل البدء._\n\nأكّد أنك لست روبوتاً للوصول إلى المتجر.`,
    verify_btn:    `✅  تأكيد — لست روبوتاً`,
    verify_ok:     `✅ *تم التحقق بنجاح!*\n\n_جارٍ توجيهك للمتجر..._`,

    welcome: (name) =>
`🎉 *أهلاً بكم في متجر الاشتراكات الترفيهية!*

مرحباً، *${name}!* 👋

━━━━━━━━━━━━━━━━━━
🌟 *خدماتنا المميزة:*

▶️ *يوتيوب بريميوم*
_بدون إعلانات، تشغيل خلفي ومحتوى حصري_

🎬 *نتفليكس بريميوم*
_جودة 4K، 4 شاشات وآلاف الأفلام والمسلسلات_

🎥 *شاهد بلس*
_أفضل المسلسلات العربية والأفلام والرياضة المباشرة_
━━━━━━━━━━━━━━━━━━

⚡ *تفعيل شبه فوري* بعد تأكيد الطلب
🔒 *دفع آمن* عبر Telegram Stars والعملات الرقمية
💬 *دعم 24/7* في خدمتك دائماً

_اختر من القائمة أدناه للبدء_ 👇`,

    products:     `🛒  المنتجات`,
    my_orders:    `📦  طلباتي`,
    faq:          `❓  أسئلة شائعة`,
    support_btn:  `💬  الدعم`,
    payments_btn: `💳  طرق الدفع`,
    switch_lang:  `🌐  English`,
    back:         `‹  رجوع`,
    back_menu:    `‹  القائمة الرئيسية`,

    browse: `🛒 *المنتجات*\n\n_اختر الخدمة لعرض الباقات المتاحة:_`,

    youtube_info:
`▶️ *يوتيوب بريميوم*
━━━━━━━━━━━━━━━━━━
✦ _مقاطع وموسيقى بدون إعلانات_
✦ _تشغيل في الخلفية_
✦ _محتوى حصري YouTube Originals_
✦ _يعمل على جميع أجهزتك_
━━━━━━━━━━━━━━━━━━
_اختر الباقة:_`,

    netflix_info:
`🎬 *نتفليكس بريميوم*
━━━━━━━━━━━━━━━━━━
✦ _جودة 4K Ultra HD_
✦ _حتى 4 شاشات في آن واحد_
✦ _آلاف الأفلام والمسلسلات_
✦ _تحميل للمشاهدة بدون إنترنت_
━━━━━━━━━━━━━━━━━━
_اختر الباقة:_`,

    shahid_info:
`🎥 *شاهد بلس*
━━━━━━━━━━━━━━━━━━
✦ _مسلسلات وأفلام عربية حصرية_
✦ _رياضة مباشرة وفعاليات كبرى_
✦ _متاح على جميع الأجهزة_
✦ _جودة HD و Full HD_
━━━━━━━━━━━━━━━━━━
_اختر الباقة:_`,

    plan_month: (p) => `📅  شهر واحد  ·  ${p} ⭐`,
    plan_year:  (p) => `📆  سنة كاملة  ·  ${p} ⭐`,

    choose_payment: (plan) =>
`💳 *اختر طريقة الدفع*
━━━━━━━━━━━━━━━━━━
${plan.emoji} *${plan.service}*  ·  _${plan.period_ar}_
💰 *السعر:* ${plan.amount} ⭐
━━━━━━━━━━━━━━━━━━
_اختر طريقة الدفع المناسبة:_`,

    faq_text:
`❓ *الأسئلة الشائعة*
━━━━━━━━━━━━━━━━━━
*💳 كيف أدفع؟*
_Telegram Stars أو Binance Pay أو USDT._

*⚡ متى يتم التفعيل؟*
_خلال دقائق بعد مراجعة فريقنا للطلب._

*📧 ماذا بعد الدفع؟*
_ستُطلب منك إدخال إيميلك، ثم يتم التفعيل فوراً._

*🔒 هل الدفع آمن؟*
_نعم — جميع الطرق موثوقة وآمنة 100%._

*🆘 مشكلة؟*
_تواصل مع ${PAYMENT_INFO.support} — نرد فوراً._

*💸 استرداد؟*
_مضمون إذا كانت المشكلة من جهتنا._
━━━━━━━━━━━━━━━━━━`,

    support_text:
`💬 *مركز الدعم*
━━━━━━━━━━━━━━━━━━
_فريقنا دائماً هنا لمساعدتك._

👤 *الدعم المباشر:*  ${PAYMENT_INFO.support}
⏰ *التوفر:*  24 / 7

_لا تتردد في التواصل لأي استفسار أو مشكلة._
━━━━━━━━━━━━━━━━━━`,

    payments_text: `💳 *طرق الدفع*\n\n_اختر طريقة الدفع المناسبة:_`,

    stars_text:
`⭐ *Telegram Stars*
━━━━━━━━━━━━━━━━━━
_الأسرع والأكثر أماناً — مباشرة عبر تلغرام._

*الخطوات:*
➊ تصفح المنتجات واختر الباقة
➋ اختر _Telegram Stars_ كطريقة دفع
➌ ستظهر فاتورة — اضغط *دفع*
➍ أدخل إيميلك بعد الدفع
➎ تم! ✅
━━━━━━━━━━━━━━━━━━`,

    binance_text:
`🟡 *Binance Pay*
━━━━━━━━━━━━━━━━━━
*Binance ID:*
\`${PAYMENT_INFO.binance_id}\`

*الخطوات:*
➊ افتح Binance ← Pay ← Send
➋ أدخل ID: \`${PAYMENT_INFO.binance_id}\`
➌ أدخل مبلغ الباقة
➍ أكمل الدفع
➎ خذ سكرين شوت
➏ أرسله لـ ${PAYMENT_INFO.support} مع _إيميلك والباقة_
━━━━━━━━━━━━━━━━━━
_⚡ تفعيل خلال دقائق بعد التحقق._`,

    usdt_text: `💠 *USDT*\n\n_اختر الشبكة المناسبة:_`,

    trc20_text:
`🔵 *USDT · TRC20 (Tron)*
━━━━━━━━━━━━━━━━━━
*عنوان المحفظة:*
\`${PAYMENT_INFO.usdt_trc20}\`

*الخطوات:*
➊ افتح محفظتك (Binance / Trust Wallet)
➋ أرسل USDT على شبكة *TRC20*
➌ الصق العنوان أعلاه
➍ أدخل مبلغ الباقة
➎ أكمل التحويل
➏ خذ سكرين شوت أو انسخ الـ hash
➐ أرسله لـ ${PAYMENT_INFO.support} مع _إيميلك والباقة_
━━━━━━━━━━━━━━━━━━
⚠️ _شبكة TRC20 فقط — الشبكات الأخرى تؤدي لفقدان الأموال._`,

    bep20_text:
`🟡 *USDT · BEP20 (BSC)*
━━━━━━━━━━━━━━━━━━
*عنوان المحفظة:*
\`${PAYMENT_INFO.usdt_bep20}\`

*الخطوات:*
➊ افتح محفظتك (Binance / MetaMask)
➋ أرسل USDT على شبكة *BEP20*
➌ الصق العنوان أعلاه
➍ أدخل مبلغ الباقة
➎ أكمل التحويل
➏ خذ سكرين شوت أو انسخ الـ hash
➐ أرسله لـ ${PAYMENT_INFO.support} مع _إيميلك والباقة_
━━━━━━━━━━━━━━━━━━
⚠️ _شبكة BEP20 فقط._`,

    erc20_text:
`🔷 *USDT · ERC20 (Ethereum)*
━━━━━━━━━━━━━━━━━━
*عنوان المحفظة:*
\`${PAYMENT_INFO.usdt_erc20}\`

*الخطوات:*
➊ افتح محفظتك (MetaMask / Trust Wallet)
➋ أرسل USDT على شبكة *ERC20*
➌ الصق العنوان أعلاه
➍ أدخل مبلغ الباقة
➎ أكمل التحويل
➏ خذ سكرين شوت أو انسخ الـ hash
➐ أرسله لـ ${PAYMENT_INFO.support} مع _إيميلك والباقة_
━━━━━━━━━━━━━━━━━━
⚠️ _رسوم الغاز مطبقة على شبكة Ethereum._`,

    orders_empty: `📦 *طلباتي*\n━━━━━━━━━━━━━━━━━━\n_لا توجد طلبات بعد._\n\nتصفح المنتجات للبدء! 🛒`,
    orders_title: (n) => `📦 *طلباتي*  ·  _آخر ${n}_\n━━━━━━━━━━━━━━━━━━\n`,
    order_row: (o, i) => {
      const icon  = { pending: '🕐', approved: '✅', rejected: '❌' }[o.status] || '❓';
      const label = { pending: 'قيد المراجعة', approved: 'مفعّل', rejected: 'مرفوض' }[o.status] || o.status;
      return `*${i+1}.*  طلب *#${o.id}*\n     ${icon}  _${label}_\n     💰  *${o.payment_amount} ⭐*\n     📅  ${new Date(o.created_at).toLocaleDateString('ar-SA')}\n\n`;
    },

    pay_received: `✅ *تم استلام الدفع!*\n━━━━━━━━━━━━━━━━━━\n📧 _أدخل الإيميل المرتبط بحسابك للتفعيل:_\n\n⚠️ _تأكد من صحة الإيميل — لا يمكن تصحيحه لاحقاً._`,
    manual_received: `✅ *تم استلام إثبات الدفع!*\n━━━━━━━━━━━━━━━━━━\n_سيراجعه فريقنا ويفعّل اشتراكك قريباً._\n\n_للمتابعة: ${PAYMENT_INFO.support}_`,
    email_invalid: `❌ *إيميل غير صحيح.*\n_حاول مجدداً._\n\nمثال: \`name@gmail.com\``,
    email_saved: `✅ *تم بنجاح!*\n━━━━━━━━━━━━━━━━━━\n_طلبك قيد المراجعة. التفعيل عادةً خلال دقائق._\n\n📦 تابع طلبك: /orders`,
    activated: `✅ *تم تفعيل اشتراكك!*\n━━━━━━━━━━━━━━━━━━\n🎉 _اشتراكك الآن نشط!_\n\nتحقق من بريدك الإلكتروني واتبع تعليمات التفعيل.\n\n_استمتع باشتراكك!_ 🌟`,
    rejected_msg: `❌ *تم رفض الطلب*\n━━━━━━━━━━━━━━━━━━\n_لم نتمكن من معالجة طلبك._\nتواصل مع ${PAYMENT_INFO.support} للاستفسار.`,
  },
};

// ─── Keyboard Builder ─────────────────────────────────────────
const kb = {
  verify:   (l) => Markup.inlineKeyboard([[Markup.button.callback(T[l].verify_btn, 'verify_human')]]),
  main:     (l) => Markup.inlineKeyboard([
    [Markup.button.callback(T[l].products,     'nav_products')],
    [Markup.button.callback(T[l].my_orders,    'nav_orders'),  Markup.button.callback(T[l].faq,          'nav_faq')],
    [Markup.button.callback(T[l].support_btn,  'nav_support'), Markup.button.callback(T[l].payments_btn, 'nav_payments')],
    [Markup.button.callback(T[l].switch_lang,  'switch_lang')],
  ]),
  products: (l) => Markup.inlineKeyboard([
    [Markup.button.callback('▶️  YouTube Premium', 'cat_youtube')],
    [Markup.button.callback('🎬  Netflix Premium',  'cat_netflix')],
    [Markup.button.callback('🎥  Shahid Plus',       'cat_shahid')],
    [Markup.button.callback(T[l].back, 'nav_main')],
  ]),
  youtube:  (l) => Markup.inlineKeyboard([
    [Markup.button.callback(T[l].plan_month(300),  'sel_youtube_month')],
    [Markup.button.callback(T[l].plan_year(1000),  'sel_youtube_year')],
    [Markup.button.callback(T[l].back, 'nav_products')],
  ]),
  netflix:  (l) => Markup.inlineKeyboard([
    [Markup.button.callback(T[l].plan_month(350),  'sel_netflix_month')],
    [Markup.button.callback(T[l].plan_year(1000),  'sel_netflix_year')],
    [Markup.button.callback(T[l].back, 'nav_products')],
  ]),
  shahid:   (l) => Markup.inlineKeyboard([
    [Markup.button.callback(T[l].plan_month(200),  'sel_shahid_month')],
    [Markup.button.callback(T[l].plan_year(600),   'sel_shahid_year')],
    [Markup.button.callback(T[l].back, 'nav_products')],
  ]),
  payMethod: (l, planKey) => Markup.inlineKeyboard([
    [Markup.button.callback('⭐  Telegram Stars',  `pay_stars_${planKey}`)],
    [Markup.button.callback('🟡  Binance Pay',     `pay_binance_${planKey}`)],
    [Markup.button.callback('💠  USDT · TRC20',    `pay_trc20_${planKey}`)],
    [Markup.button.callback('💠  USDT · BEP20',    `pay_bep20_${planKey}`)],
    [Markup.button.callback('💠  USDT · ERC20',    `pay_erc20_${planKey}`)],
    [Markup.button.callback(T[l].back, `cat_${planKey.split('_')[0]}`)],
  ]),
  backMain:     (l) => Markup.inlineKeyboard([[Markup.button.callback(T[l].back_menu, 'nav_main')]]),
  payments:     (l) => Markup.inlineKeyboard([
    [Markup.button.callback('⭐  Telegram Stars', 'pm_stars')],
    [Markup.button.callback('🟡  Binance Pay',    'pm_binance')],
    [Markup.button.callback('💠  USDT Crypto',    'pm_usdt')],
    [Markup.button.callback(T[l].back, 'nav_main')],
  ]),
  usdt:         (l) => Markup.inlineKeyboard([
    [Markup.button.callback('🔵  USDT · TRC20', 'pm_trc20')],
    [Markup.button.callback('🟡  USDT · BEP20', 'pm_bep20')],
    [Markup.button.callback('🔷  USDT · ERC20', 'pm_erc20')],
    [Markup.button.callback(T[l].back, 'nav_payments')],
  ]),
  backPayments: (l) => Markup.inlineKeyboard([[Markup.button.callback(T[l].back, 'nav_payments')]]),
  backUsdt:     (l) => Markup.inlineKeyboard([[Markup.button.callback(T[l].back, 'pm_usdt')]]),
  starsBack:    (l) => Markup.inlineKeyboard([
    [Markup.button.callback('🛒  ' + (l === 'ar' ? 'تصفح المنتجات' : 'Browse Products'), 'nav_products')],
    [Markup.button.callback(T[l].back, 'nav_payments')],
  ]),
};

// ─── Helper ───────────────────────────────────────────────────
async function editOrReply(ctx, text, extra) {
  try { await ctx.editMessageText(text, extra); }
  catch (_) { await ctx.reply(text, extra); }
}

// ─── Middleware ───────────────────────────────────────────────
bot.use(async (ctx, next) => {
  try { await next(); } catch (err) { console.error('MW:', err.message); throw err; }
});

// ─── /start ──────────────────────────────────────────────────
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const lang = getLang(userId);
  if (!verifiedUsers.has(userId)) {
    return ctx.reply(T[lang].verify_prompt, { parse_mode: 'Markdown', reply_markup: kb.verify(lang).reply_markup });
  }
  await showMain(ctx, false);
});

// ─── /lang ───────────────────────────────────────────────────
bot.command('lang', async (ctx) => {
  const lang = getLang(ctx.from.id);
  await ctx.reply(
    `🌐 *Language · اللغة*\n\n_Current: ${lang === 'en' ? '🇬🇧 English' : '🇸🇦 العربية'}_`,
    { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🇬🇧 English', 'set_lang_en'), Markup.button.callback('🇸🇦 العربية', 'set_lang_ar')],
    ]).reply_markup }
  );
});

// ─── Anti-spam ────────────────────────────────────────────────
bot.action('verify_human', async (ctx) => {
  const userId = ctx.from.id;
  const lang = getLang(userId);
  verifiedUsers.add(userId);
  await ctx.answerCbQuery('✅');
  await ctx.editMessageText(T[lang].verify_ok, { parse_mode: 'Markdown' });
  setTimeout(async () => { try { await showMain(ctx, false); } catch (_) {} }, 700)
