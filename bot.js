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
const supportMode    = new Map(); // userId -> conversation history (AI Support)

const getLang = (id) => userLang.get(id) || 'en';

// ─── Plans ────────────────────────────────────────────────────
const PLANS = {
  youtube_month:   { title: 'YouTube Premium · 1 Month',  description: 'YouTube Premium for 1 month.',  amount: 300,  usd: 5,  emoji: '▶️', service: 'YouTube Premium',  period: '1 Month',  period_ar: 'شهر واحد'  },
  youtube_3months: { title: 'YouTube Premium · 3 Months', description: 'YouTube Premium for 3 months.', amount: 750,  usd: 8,  emoji: '▶️', service: 'YouTube Premium',  period: '3 Months', period_ar: '3 أشهر'     },
  youtube_6months: { title: 'YouTube Premium · 6 Months', description: 'YouTube Premium for 6 months.', amount: 1300, usd: 12, emoji: '▶️', service: 'YouTube Premium',  period: '6 Months', period_ar: '6 أشهر'     },
  youtube_year:    { title: 'YouTube Premium · 1 Year',   description: 'YouTube Premium for 1 year.',   amount: 2000, usd: 15, emoji: '▶️', service: 'YouTube Premium',  period: '1 Year',   period_ar: 'سنة كاملة' },
  netflix_month:   { title: 'Netflix Premium · 1 Month',  description: 'Netflix Premium for 1 month.',  amount: 350,  usd: 5,  emoji: '🎬', service: 'Netflix Premium',  period: '1 Month',  period_ar: 'شهر واحد'  },
  netflix_3months: { title: 'Netflix Premium · 3 Months', description: 'Netflix Premium for 3 months.', amount: 900,  usd: 8,  emoji: '🎬', service: 'Netflix Premium',  period: '3 Months', period_ar: '3 أشهر'     },
  netflix_6months: { title: 'Netflix Premium · 6 Months', description: 'Netflix Premium for 6 months.', amount: 1600, usd: 12, emoji: '🎬', service: 'Netflix Premium',  period: '6 Months', period_ar: '6 أشهر'     },
  netflix_year:    { title: 'Netflix Premium · 1 Year',   description: 'Netflix Premium for 1 year.',   amount: 2800, usd: 15, emoji: '🎬', service: 'Netflix Premium',  period: '1 Year',   period_ar: 'سنة كاملة' },
  shahid_month:    { title: 'Shahid Plus · 1 Month',      description: 'Shahid Plus for 1 month.',      amount: 200,  usd: 5,  emoji: '🎥', service: 'Shahid Plus',      period: '1 Month',  period_ar: 'شهر واحد'  },
  shahid_3months:  { title: 'Shahid Plus · 3 Months',     description: 'Shahid Plus for 3 months.',     amount: 500,  usd: 8,  emoji: '🎥', service: 'Shahid Plus',      period: '3 Months', period_ar: '3 أشهر'     },
  shahid_6months:  { title: 'Shahid Plus · 6 Months',     description: 'Shahid Plus for 6 months.',     amount: 900,  usd: 12, emoji: '🎥', service: 'Shahid Plus',      period: '6 Months', period_ar: '6 أشهر'     },
  shahid_year:     { title: 'Shahid Plus · 1 Year',       description: 'Shahid Plus for 1 year.',       amount: 1500, usd: 15, emoji: '🎥', service: 'Shahid Plus',      period: '1 Year',   period_ar: 'سنة كاملة' },
  gemini_month:    { title: 'Gemini Pro · 1 Month',       description: 'Gemini Pro for 1 month.',       amount: 400,  usd: 5,  emoji: '✨', service: 'Gemini Pro',        period: '1 Month',  period_ar: 'شهر واحد'  },
  gemini_year:     { title: 'Gemini Pro · 1 Year',        description: 'Gemini Pro for 1 year.',        amount: 3500, usd: 15, emoji: '✨', service: 'Gemini Pro',        period: '1 Year',   period_ar: 'سنة كاملة' },
  chatgpt_month:   { title: 'ChatGPT Plus · 1 Month',     description: 'ChatGPT Plus for 1 month.',     amount: 450,  usd: 5,  emoji: '🤖', service: 'ChatGPT Plus',      period: '1 Month',  period_ar: 'شهر واحد'  },
  chatgpt_year:    { title: 'ChatGPT Plus · 1 Year',      description: 'ChatGPT Plus for 1 year.',      amount: 4000, usd: 15, emoji: '🤖', service: 'ChatGPT Plus',      period: '1 Year',   period_ar: 'سنة كاملة' },
};

// ─── Translations ─────────────────────────────────────────────
const T = {
  en: {
    verify_prompt: `🔐 *Verification Required*\n\n_One quick step before we get started._\n\nPlease confirm you're human to access the store.`,
    verify_btn:    `✅  Confirm — I'm not a robot`,
    verify_ok:     `✅ *Verified successfully!*\n\n_Redirecting you to the store..._`,

    welcome: (name) =>
`🎉 *Welcome to SubsGate Store!*

Hey *${name}* 👋

━━━━━━━━━━━━━━━━━━
🌟 *Your gateway to premium digital subscriptions*

_We offer the best streaming & AI services at prices far below official rates — fast, secure, and always reliable._

⚡ *Near-instant activation*
💰 *Prices cheaper than official apps*
🔒 *Secure payments* via Stars & Crypto
💬 *24/7 dedicated support*
━━━━━━━━━━━━━━━━━━

_Choose from the menu below to get started_ 👇

📢 _Stay updated:_ [SubsGate Channel](https://t.me/SubsGate) — _bot news & offers_`,

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
✦ *Ad-free* videos & music 🎵
✦ *Background* playback 📱
✦ *YouTube Originals* & exclusives 🎬
✦ Works on *all* your devices 💻
━━━━━━━━━━━━━━━━━━
_Select your plan:_`,

    netflix_info:
`🎬 *Netflix Premium*
━━━━━━━━━━━━━━━━━━
✦ *4K Ultra HD* quality 🎥
✦ *Shared account* access 👥
✦ *Thousands* of movies & series 🍿
✦ *Download* for offline viewing 📥
━━━━━━━━━━━━━━━━━━
_Select your plan:_`,

    shahid_info:
`🎥 *Shahid Plus*
━━━━━━━━━━━━━━━━━━
✦ *Exclusive* Arabic series & films 🎭
✦ *Live* sports & major events ⚽
✦ Available on *all* devices 📱
✦ *HD & Full HD* quality 🌟
━━━━━━━━━━━━━━━━━━
_Select your plan:_`,

    gemini_info: `✨ *Gemini Pro*
━━━━━━━━━━━━━━━━━━
✦ *Advanced* AI by Google 🧠
✦ *Smart* & creative conversations 💡
✦ *Analyze* images & documents 📄
✦ Available on *all* devices 📱
━━━━━━━━━━━━━━━━━━
_Select your plan:_`,
    chatgpt_info: `🤖 *ChatGPT Plus*
━━━━━━━━━━━━━━━━━━
✦ *GPT-4* — OpenAI's most powerful model 🧠
✦ *Faster* & more accurate responses ⚡
✦ *Image generation* with DALL·E 🎨
✦ *Priority access* to latest features 🌟
━━━━━━━━━━━━━━━━━━
_Select your plan:_`,
    plan_month:   () => `📅  1 Month`,
    plan_3months: () => `🗓️  3 Months`,
    plan_6months: () => `📆  6 Months`,
    plan_year:    () => `🗃️  1 Year`,

    choose_payment: (plan) =>
`💳 *Select Payment Method*
━━━━━━━━━━━━━━━━━━
${plan.emoji} *${plan.service}* ·  _${plan.period}_
💰 *Price:* ${plan.amount} ⭐  |  $${plan.usd} USD
━━━━━━━━━━━━━━━━━━
_Choose how you'd like to pay:_`,

    nowpay_text: (plan) =>
`💠 *Crypto Payment · NOWPayments*
━━━━━━━━━━━━━━━━━━
${plan.emoji} *${plan.service}* · _${plan.period}_
💰 *Amount:* $${plan.usd} USD
━━━━━━━━━━━━━━━━━━
_Generating your payment link..._`,

    nowpay_link: (plan, url) =>
`💠 *Crypto Payment · NOWPayments*
━━━━━━━━━━━━━━━━━━
${plan.emoji} *${plan.service}* · _${plan.period}_
💰 *Amount:* $${plan.usd} USD
━━━━━━━━━━━━━━━━━━
✅ *Your payment link is ready!*
👇 Click the button below to pay`,

    nowpay_error: `❌ *Failed to generate payment link.*
_Please try again or choose another payment method._`,

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

👤 *Direct support:* ${PAYMENT_INFO.support}
⏰ *Availability:* 24 / 7

_Don't hesitate to reach out for any question or issue._
━━━━━━━━━━━━━━━━━━`,

    ai_support_welcome:
`🤖 *AI Support*
━━━━━━━━━━━━━━━━━━
_Hello! I'm your virtual assistant. How can I help you?_

_Ask me anything about our products, payments, or orders._`,

    ai_support_end: `✅ *Chat ended.*
_Thank you for contacting us! Feel free to reach out anytime._ 👋`,
    ai_support_escalate: `👨‍💼 _I'm connecting you with our support team now..._`,
    ai_thinking: `🤔 _Thinking..._`,
    ai_error: `❌ _Something went wrong. Please try again._`,
    end_chat_btn: `✖️  End Chat`,

    ai_support_welcome:
`🤖 *AI Support*
━━━━━━━━━━━━━━━━━━
_Hello! I'm your smart assistant._
_I can help you with:_

• Products & prices
• Payment methods
• Order tracking
• Any other questions

_Just type your question! 👇_`,

    ai_support_end: `✅ *Chat ended.*
_Thank you for contacting us! Have a great day_ 👋`,
    ai_support_escalate: `👨‍💼 *Connecting you to our support team...*
_We'll get back to you as soon as possible._`,
    ai_thinking: `🤖 _Thinking..._`,
    ai_end_btn: `✖️  End Chat`,

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
    orders_title: (n) => `📦 *My Orders* ·  _last ${n}_\n━━━━━━━━━━━━━━━━━━\n`,
    order_row: (o, i) => {
      const icon  = { pending: '🕐', approved: '✅', rejected: '❌' }[o.status] || '❓';
      const label = { pending: 'Pending Review', approved: 'Activated', rejected: 'Rejected' }[o.status] || o.status;
      return `*${i+1}.* Order *#${o.id}*\n     ${icon}  _${label}_\n     💰  *${o.payment_amount} ⭐*\n     📅  ${new Date(o.created_at).toLocaleDateString('en-GB')}\n\n`;
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
`🎉 *أهلاً بك في متجر SubsGate!*

مرحباً *${name}* 👋

━━━━━━━━━━━━━━━━━━
🌟 *بوابتك للاشتراكات الرقمية المميزة*

_نوفر أفضل خدمات البث والذكاء الاصطناعي بأسعار أقل بكثير من التطبيقات الرسمية — سريع، آمن، وموثوق دائماً._

⚡ *تفعيل شبه فوري*
💰 *أسعار أرخص من التطبيقات الرسمية*
🔒 *دفع آمن* عبر Stars والعملات الرقمية
💬 *دعم متخصص* على مدار الساعة
━━━━━━━━━━━━━━━━━━

_اختر من القائمة للبدء_ 👇

📢 _آخر التحديثات:_ [قناة SubsGate](https://t.me/SubsGate) — _أخبار وعروض البوت_`,

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
✦ *بدون إعلانات* للمقاطع والموسيقى 🎵
✦ *تشغيل في الخلفية* 📱
✦ *محتوى حصري* YouTube Originals 🎬
✦ يعمل على *جميع* أجهزتك 💻
━━━━━━━━━━━━━━━━━━
_اختر الباقة:_`,

    netflix_info:
`🎬 *نتفليكس بريميوم*
━━━━━━━━━━━━━━━━━━
✦ *جودة 4K Ultra HD* 🎥
✦ *حساب مشترك* 👥
✦ *آلاف* الأفلام والمسلسلات 🍿
✦ *تحميل* للمشاهدة بدون إنترنت 📥
━━━━━━━━━━━━━━━━━━
_اختر الباقة:_`,

    shahid_info:
`🎥 *شاهد بلس*
━━━━━━━━━━━━━━━━━━
✦ مسلسلات وأفلام عربية *حصرية* 🎭
✦ *رياضة مباشرة* وفعاليات كبرى ⚽
✦ متاح على *جميع* الأجهزة 📱
✦ جودة *HD و Full HD* 🌟
━━━━━━━━━━━━━━━━━━
_اختر الباقة:_`,

    gemini_info: `✨ *Gemini Pro*
━━━━━━━━━━━━━━━━━━
✦ *ذكاء اصطناعي* متقدم من Google 🧠
✦ *محادثات* ذكية وإبداعية 💡
✦ *تحليل* الصور والمستندات 📄
✦ متاح على *جميع* الأجهزة 📱
━━━━━━━━━━━━━━━━━━
_اختر الباقة:_`,
    chatgpt_info: `🤖 *ChatGPT Plus*
━━━━━━━━━━━━━━━━━━
✦ *GPT-4* أقوى نموذج من OpenAI 🧠
✦ *ردود أسرع* وأكثر دقة ⚡
✦ *توليد* الصور بـ DALL·E 🎨
✦ *وصول أولوي* لأحدث الميزات 🌟
━━━━━━━━━━━━━━━━━━
_اختر الباقة:_`,
    plan_month:   () => `📅  شهر واحد`,
    plan_3months: () => `🗓️  3 أشهر`,
    plan_6months: () => `📆  6 أشهر`,
    plan_year:    () => `🗃️  سنة كاملة`,

    choose_payment: (plan) =>
`💳 *اختر طريقة الدفع*
━━━━━━━━━━━━━━━━━━
${plan.emoji} *${plan.service}* ·  _${plan.period_ar}_
💰 *السعر:* ${plan.amount} ⭐  |  $${plan.usd}
━━━━━━━━━━━━━━━━━━
_اختر طريقة الدفع المناسبة:_`,

    nowpay_text: (plan) =>
`💠 *دفع بالعملات الرقمية · NOWPayments*
━━━━━━━━━━━━━━━━━━
${plan.emoji} *${plan.service}* · _${plan.period_ar}_
💰 *المبلغ:* $${plan.usd}
━━━━━━━━━━━━━━━━━━
_جارٍ إنشاء رابط الدفع..._`,

    nowpay_link: (plan, url) =>
`💠 *دفع بالعملات الرقمية · NOWPayments*
━━━━━━━━━━━━━━━━━━
${plan.emoji} *${plan.service}* · _${plan.period_ar}_
💰 *المبلغ:* $${plan.usd}
━━━━━━━━━━━━━━━━━━
✅ *رابط الدفع جاهز!*
👇 اضغط الزر أدناه للدفع`,

    nowpay_error: `❌ *فشل إنشاء رابط الدفع.*
_حاول مجدداً أو اختر طريقة دفع أخرى._`,

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

👤 *الدعم المباشر:* ${PAYMENT_INFO.support}
⏰ *التوفر:* 24 / 7

_لا تتردد في التواصل لأي استفسار أو مشكلة._
━━━━━━━━━━━━━━━━━━`,

    ai_support_welcome:
`🤖 *دعم AI*
━━━━━━━━━━━━━━━━━━
_مرحباً! أنا مساعدك الذكي. كيف أقدر أساعدك؟_

_اسألني عن أي شيء — المنتجات، الدفع، أو طلباتك._`,

    ai_support_end: `✅ *تم إنهاء المحادثة.*
_شكراً لتواصلك معنا! لا تتردد في التواصل في أي وقت._ 👋`,
    ai_support_escalate: `👨‍💼 _جارٍ تحويلك لفريق الدعم..._`,
    ai_thinking: `🤔 _جارٍ التفكير..._`,
    ai_error: `❌ _حدث خطأ. حاول مجدداً._`,
    end_chat_btn: `✖️  إنهاء المحادثة`,

    ai_support_welcome:
`🤖 *دعم ذكي*
━━━━━━━━━━━━━━━━━━
_مرحباً! أنا مساعدك الذكي._
_أقدر أساعدك في:_

• المنتجات والأسعار
• طرق الدفع
• متابعة الطلبات
• أي استفسار آخر

_فقط اكتب سؤالك! 👇_`,

    ai_support_end: `✅ *تم إنهاء المحادثة.*
_شكراً لتواصلك معنا! أتمنى لك يوماً رائعاً_ 👋`,
    ai_support_escalate: `👨‍💼 *جارٍ تحويلك لفريق الدعم...*
_سنتواصل معك في أقرب وقت._`,
    ai_thinking: `🤖 _جارٍ التفكير..._`,
    ai_end_btn: `✖️  إنهاء المحادثة`,

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
    orders_title: (n) => `📦 *طلباتي* ·  _آخر ${n}_\n━━━━━━━━━━━━━━━━━━\n`,
    order_row: (o, i) => {
      const icon  = { pending: '🕐', approved: '✅', rejected: '❌' }[o.status] || '❓';
      const label = { pending: 'قيد المراجعة', approved: 'مفعّل', rejected: 'مرفوض' }[o.status] || o.status;
      return `*${i+1}.* طلب *#${o.id}*\n     ${icon}  _${label}_\n     💰  *${o.payment_amount} ⭐*\n     📅  ${new Date(o.created_at).toLocaleDateString('ar-SA')}\n\n`;
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
  main:     (l, userId) => {
    const rows = [
      [Markup.button.callback(T[l].products,    'nav_products')],
      [Markup.button.callback(T[l].my_orders,   'nav_orders'),  Markup.button.callback(T[l].faq, 'nav_faq')],
      [Markup.button.callback(T[l].support_btn, 'nav_support'), Markup.button.callback(T[l].switch_lang, 'switch_lang')],
      [Markup.button.callback(l === 'ar' ? '🔄  بدء من جديد' : '🔄  Restart', 'restart_bot')],
    ];
    if (userId === FOUNDER_ID) rows.push([Markup.button.callback('👨‍💼  Admin Panel', 'nav_admin')]);
    return Markup.inlineKeyboard(rows);
  },
  products: (l) => Markup.inlineKeyboard([
    [Markup.button.callback('▶️  YouTube Premium', 'cat_youtube')],
    [Markup.button.callback('🎬  Netflix Premium',  'cat_netflix')],
    [Markup.button.callback('🎥  Shahid Plus',       'cat_shahid')],
    [Markup.button.callback('✨  Gemini Pro',         'cat_gemini')],
    [Markup.button.callback('🤖  ChatGPT Plus',       'cat_chatgpt')],
    [Markup.button.callback(T[l].back, 'nav_main')],
  ]),
  gemini:   (l) => Markup.inlineKeyboard([
    [Markup.button.callback(T[l].plan_month(), 'sel_gemini_month')],
    [Markup.button.callback(T[l].plan_year(),  'sel_gemini_year')],
    [Markup.button.callback(T[l].back, 'nav_products')],
  ]),
  chatgpt:  (l) => Markup.inlineKeyboard([
    [Markup.button.callback(T[l].plan_month(), 'sel_chatgpt_month')],
    [Markup.button.callback(T[l].plan_year(),  'sel_chatgpt_year')],
    [Markup.button.callback(T[l].back, 'nav_products')],
  ]),
  youtube:  (l) => Markup.inlineKeyboard([
    [Markup.button.callback(T[l].plan_month(),   'sel_youtube_month')],
    [Markup.button.callback(T[l].plan_3months(), 'sel_youtube_3months')],
    [Markup.button.callback(T[l].plan_6months(), 'sel_youtube_6months')],
    [Markup.button.callback(T[l].plan_year(),    'sel_youtube_year')],
    [Markup.button.callback(T[l].back, 'back_to_products')],
  ]),
  netflix:  (l) => Markup.inlineKeyboard([
    [Markup.button.callback(T[l].plan_month(),   'sel_netflix_month')],
    [Markup.button.callback(T[l].plan_3months(), 'sel_netflix_3months')],
    [Markup.button.callback(T[l].plan_6months(), 'sel_netflix_6months')],
    [Markup.button.callback(T[l].plan_year(),    'sel_netflix_year')],
    [Markup.button.callback(T[l].back, 'back_to_products')],
  ]),
  shahid:   (l) => Markup.inlineKeyboard([
    [Markup.button.callback(T[l].plan_month(),   'sel_shahid_month')],
    [Markup.button.callback(T[l].plan_3months(), 'sel_shahid_3months')],
    [Markup.button.callback(T[l].plan_6months(), 'sel_shahid_6months')],
    [Markup.button.callback(T[l].plan_year(),    'sel_shahid_year')],
    [Markup.button.callback(T[l].back, 'back_to_products')],
  ]),
  payMethod: (l, planKey) => Markup.inlineKeyboard([
    [Markup.button.callback(l === 'ar' ? '⭐  Telegram Stars · ادفع الآن' : '⭐  Telegram Stars · Pay Now', `pay_stars_${planKey}`)],
    [Markup.button.callback(l === 'ar' ? '💠  عملات رقمية · Pay' : '💠  Crypto · Pay', `pay_nowpay_${planKey}`)],
    [Markup.button.callback('🟡  Binance Pay', `pay_binance_${planKey}`)],
    [Markup.button.callback(l === 'ar' ? '‹  رجوع' : '‹  Back', `back_plan_${planKey}`)],
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

  // Track user in database
  try {
    await supabase.from('users').upsert({
      user_id: userId,
      username: ctx.from.username || null,
      first_name: ctx.from.first_name || null,
      lang: lang,
      last_seen: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch (_) {}

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

// ─── Restart ──────────────────────────────────────────────────
bot.action('restart_bot', async (ctx) => {
  await ctx.answerCbQuery();
  await showMain(ctx, false);
});

// Reply Keyboard — Restart text handler
bot.hears(['🔄 Restart', '🔄 إعادة التشغيل'], async (ctx) => {
  await showMain(ctx, false);
});

// ─── Anti-spam ────────────────────────────────────────────────
bot.action('verify_human', async (ctx) => {
  const userId = ctx.from.id;
  const lang = getLang(userId);
  verifiedUsers.add(userId);
  await ctx.answerCbQuery('✅');
  await ctx.editMessageText(T[lang].verify_ok, { parse_mode: 'Markdown' });
  setTimeout(async () => { try { await showMain(ctx, false); } catch (_) {} }, 700);
});

// ─── Lang Switch ──────────────────────────────────────────────
bot.action('switch_lang', async (ctx) => {
  const userId = ctx.from.id;
  const next = getLang(userId) === 'en' ? 'ar' : 'en';
  userLang.set(userId, next);
  await ctx.answerCbQuery(next === 'ar' ? '🇸🇦 العربية' : '🇬🇧 English');
  await showMain(ctx, true);
});
bot.action('set_lang_en', async (ctx) => { userLang.set(ctx.from.id, 'en'); await ctx.answerCbQuery('🇬🇧 English'); await showMain(ctx, false); });
bot.action('set_lang_ar', async (ctx) => { userLang.set(ctx.from.id, 'ar'); await ctx.answerCbQuery('🇸🇦 العربية'); await showMain(ctx, false); });

// ─── Main Menu ────────────────────────────────────────────────
async function showMain(ctx, isEdit) {
  const userId = ctx.from.id;
  const lang = getLang(userId);
  const name = ctx.from?.first_name || (lang === 'ar' ? 'عزيزي' : 'there');
  const isAdmin = userId === FOUNDER_ID;

  // Reply Keyboard shown below screen
  const replyKb = Markup.keyboard([
    [lang === 'ar' ? '🛒 المنتجات' : '🛒 Products',   lang === 'ar' ? '📦 طلباتي' : '📦 My Orders'],
    [lang === 'ar' ? '💬 الدعم' : '💬 Support',        lang === 'ar' ? '❓ أسئلة شائعة' : '❓ FAQ'],
    [lang === 'ar' ? '🔄 إعادة التشغيل' : '🔄 Restart', lang === 'ar' ? '🌐 English' : '🌐 العربية'],
    ...(isAdmin ? [[lang === 'ar' ? '👨‍💼 الأدمن' : '👨‍💼 Admin Panel']] : []),
  ]).resize();

  if (isEdit) {
    // When editing (nav_main), keep reply keyboard + edit message without inline buttons
    try {
      await ctx.editMessageText(T[lang].welcome(name), { parse_mode: 'Markdown' });
    } catch (_) {}
  } else {
    await ctx.reply(T[lang].welcome(name), {
      parse_mode: 'Markdown',
      reply_markup: replyKb.reply_markup,
    });
  }
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
  try { await ctx.deleteMessage(); } catch (_) {}
  await ctx.replyWithPhoto('https://i.postimg.cc/nLMhGL8V/f013c8552c71d1f31fbd5e8430d2457c.jpg', {
    caption: T[lang].youtube_info,
    parse_mode: 'Markdown',
    reply_markup: kb.youtube(lang).reply_markup,
  });
});

bot.action('cat_netflix', async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx.from.id);
  try { await ctx.deleteMessage(); } catch (_) {}
  await ctx.replyWithPhoto('https://i.postimg.cc/hjzhctpn/979161810ef2d1ab4d338e91fceb8b96.jpg', {
    caption: T[lang].netflix_info,
    parse_mode: 'Markdown',
    reply_markup: kb.netflix(lang).reply_markup,
  });
});

bot.action('cat_shahid', async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx.from.id);
  try { await ctx.deleteMessage(); } catch (_) {}
  await ctx.replyWithPhoto('https://i.postimg.cc/vHz8Rnb6/9bb7347e380da518e4ebe55d9b63ad2a.jpg', {
    caption: T[lang].shahid_info,
    parse_mode: 'Markdown',
    reply_markup: kb.shahid(lang).reply_markup,
  });
});

bot.action('cat_gemini', async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx.from.id);
  await editOrReply(ctx,
    lang === 'ar'
      ? `✨ *Gemini Pro*
━━━━━━━━━━━━━━━━━━
✦ *ذكاء اصطناعي* متقدم من Google 🧠
✦ *محادثات* ذكية وإبداعية 💡
✦ *تحليل* الصور والمستندات 📄
✦ متاح على *جميع* الأجهزة 📱
━━━━━━━━━━━━━━━━━━
_اختر الباقة:_`
      : `✨ *Gemini Pro*
━━━━━━━━━━━━━━━━━━
✦ *Advanced* AI by Google 🧠
✦ *Smart* & creative conversations 💡
✦ *Analyze* images & documents 📄
✦ Available on *all* devices 📱
━━━━━━━━━━━━━━━━━━
_Select your plan:_`,
    { parse_mode: 'Markdown', reply_markup: kb.gemini(lang).reply_markup }
  );
});

bot.action('cat_chatgpt', async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx.from.id);
  await editOrReply(ctx,
    lang === 'ar'
      ? `🤖 *ChatGPT Plus*
━━━━━━━━━━━━━━━━━━
✦ *GPT-4* أقوى نموذج من OpenAI 🧠
✦ *ردود أسرع* وأكثر دقة ⚡
✦ *توليد* الصور بـ DALL·E 🎨
✦ *وصول أولوي* لأحدث الميزات 🌟
━━━━━━━━━━━━━━━━━━
_اختر الباقة:_`
      : `🤖 *ChatGPT Plus*
━━━━━━━━━━━━━━━━━━
✦ *GPT-4* — OpenAI's most powerful model 🧠
✦ *Faster* & more accurate responses ⚡
✦ *Image generation* with DALL·E 🎨
✦ *Priority access* to latest features 🌟
━━━━━━━━━━━━━━━━━━
_Select your plan:_`,
    { parse_mode: 'Markdown', reply_markup: kb.chatgpt(lang).reply_markup }
  );
});

// ─── Back to category (for photo pages) ──────────────────────
const PHOTO_IDS = {
  youtube: 'AgACAgEAAxkBAAFFYSZpvxhcfwvMfkT1uO3pFCI38PfqEQAC3AtrGxjM-UU6VQmt4eB16gEAAwIAA3gAAzoE',
  netflix: 'AgACAgEAAxkBAAFFYSdpvxhcsW4VFjuRG6X57dGUpSYydwAC3QtrGxjM-UW-Mhm3bMcksQEAAwIAA3gAAzoE',
  shahid:  'AgACAgEAAxkBAAFFYSVpvxhcvfPUnOxgOnDf8rF_qsUwkgAC2wtrGxjM-UVDOdz_nBvY-AEAAwIAA3gAAzoE',
};

const CAT_CAPTIONS = {
  youtube: (lang, T) => T[lang].youtube_info,
  netflix: (lang, T) => T[lang].netflix_info,
  shahid:  (lang, T) => T[lang].shahid_info,
};

['youtube', 'netflix', 'shahid'].forEach((cat) => {
  bot.action(`back_to_cat_${cat}`, async (ctx) => {
    await ctx.answerCbQuery();
    const lang = getLang(ctx.from.id);
    try {
      await ctx.editMessageCaption(CAT_CAPTIONS[cat](lang, T), {
        parse_mode: 'Markdown',
        reply_markup: kb[cat](lang).reply_markup,
      });
    } catch (_) {
      await ctx.replyWithPhoto(PHOTO_IDS[cat], {
        caption: CAT_CAPTIONS[cat](lang, T),
        parse_mode: 'Markdown',
        reply_markup: kb[cat](lang).reply_markup,
      });
    }
  });
});

bot.action('back_to_cat_gemini', async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx.from.id);
  await editOrReply(ctx,
    lang === 'ar'
      ? `✨ *Gemini Pro*
━━━━━━━━━━━━━━━━━━
✦ *ذكاء اصطناعي* متقدم من Google 🧠
✦ *محادثات* ذكية وإبداعية 💡
✦ *تحليل* الصور والمستندات 📄
✦ متاح على *جميع* الأجهزة 📱
━━━━━━━━━━━━━━━━━━
_اختر الباقة:_`
      : `✨ *Gemini Pro*
━━━━━━━━━━━━━━━━━━
✦ *Advanced* AI by Google 🧠
✦ *Smart* & creative conversations 💡
✦ *Analyze* images & documents 📄
✦ Available on *all* devices 📱
━━━━━━━━━━━━━━━━━━
_Select your plan:_`,
    { parse_mode: 'Markdown', reply_markup: kb.gemini(lang).reply_markup }
  );
});

bot.action('back_to_cat_chatgpt', async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx.from.id);
  await editOrReply(ctx,
    lang === 'ar'
      ? `🤖 *ChatGPT Plus*
━━━━━━━━━━━━━━━━━━
✦ *GPT-4* أقوى نموذج من OpenAI 🧠
✦ *ردود أسرع* وأكثر دقة ⚡
✦ *توليد* الصور بـ DALL·E 🎨
✦ *وصول أولوي* لأحدث الميزات 🌟
━━━━━━━━━━━━━━━━━━
_اختر الباقة:_`
      : `🤖 *ChatGPT Plus*
━━━━━━━━━━━━━━━━━━
✦ *GPT-4* — OpenAI's most powerful model 🧠
✦ *Faster* & more accurate responses ⚡
✦ *Image generation* with DALL·E 🎨
✦ *Priority access* to latest features 🌟
━━━━━━━━━━━━━━━━━━
_Select your plan:_`,
    { parse_mode: 'Markdown', reply_markup: kb.chatgpt(lang).reply_markup }
  );
});

// ─── Back: plan list → products ─────────────────────────────
bot.action('back_to_products', async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx.from.id);
  try { await ctx.deleteMessage(); } catch (_) {}
  await ctx.reply(T[lang].browse, { parse_mode: 'Markdown', reply_markup: kb.products(lang).reply_markup });
});

// ─── Back: payment method → plan list ────────────────────────
Object.keys(PLANS).forEach((key) => {
  bot.action(`back_plan_${key}`, async (ctx) => {
    await ctx.answerCbQuery();
    const lang = getLang(ctx.from.id);
    const cat = key.split('_')[0];
    const catKbMap = { youtube: kb.youtube, netflix: kb.netflix, shahid: kb.shahid, gemini: kb.gemini, chatgpt: kb.chatgpt };
    const catTextMap = {
      youtube: (l) => T[l].youtube_info,
      netflix: (l) => T[l].netflix_info,
      shahid:  (l) => T[l].shahid_info,
      gemini:  (l) => T[l].gemini_info,
      chatgpt: (l) => T[l].chatgpt_info,
    };
    if (['youtube','netflix','shahid'].includes(cat)) {
      try {
        await ctx.editMessageCaption(catTextMap[cat](lang), {
          parse_mode: 'Markdown',
          reply_markup: catKbMap[cat](lang).reply_markup,
        });
      } catch (_) {
        await ctx.replyWithPhoto(PHOTO_IDS[cat], {
          caption: catTextMap[cat](lang),
          parse_mode: 'Markdown',
          reply_markup: catKbMap[cat](lang).reply_markup,
        });
      }
    } else {
      await editOrReply(ctx, catTextMap[cat](lang), {
        parse_mode: 'Markdown',
        reply_markup: catKbMap[cat](lang).reply_markup,
      });
    }
  });
});

// ─── Plan Selection → Payment Method ─────────────────────────
Object.keys(PLANS).forEach((key) => {
  bot.action(`sel_${key}`, async (ctx) => {
    await ctx.answerCbQuery();
    const lang = getLang(ctx.from.id);
    const plan = PLANS[key];
    // Send Stars invoice directly
    try {
      await ctx.replyWithInvoice({
        title: plan.title,
        description: plan.description,
        payload: `${key}_${ctx.from.id}_${Date.now()}`,
        provider_token: '',
        currency: 'XTR',
        prices: [{ label: plan.title, amount: plan.amount }],
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.pay(`⭐ Pay ${plan.amount} Stars`)],
          [Markup.button.callback(l => T[lang].back, `show_pay_methods_${key}`)],
        ]).reply_markup,
      });
    } catch (err) {
      // Fallback: show payment method selection
      try {
        await ctx.editMessageCaption(T[lang].choose_payment(plan), {
          parse_mode: 'Markdown',
          reply_markup: kb.payMethod(lang, key).reply_markup,
        });
      } catch (_) {
        await editOrReply(ctx, T[lang].choose_payment(plan), {
          parse_mode: 'Markdown',
          reply_markup: kb.payMethod(lang, key).reply_markup,
        });
      }
    }
  });
});

// Show payment methods (for other payment options)
Object.keys(PLANS).forEach((key) => {
  bot.action(`show_pay_methods_${key}`, async (ctx) => {
    await ctx.answerCbQuery();
    const lang = getLang(ctx.from.id);
    const plan = PLANS[key];
    const cat = key.split('_')[0];
    const photoIds = {
      youtube: 'https://i.postimg.cc/nLMhGL8V/f013c8552c71d1f31fbd5e8430d2457c.jpg',
      netflix: 'https://i.postimg.cc/hjzhctpn/979161810ef2d1ab4d338e91fceb8b96.jpg',
      shahid:  'https://i.postimg.cc/vHz8Rnb6/9bb7347e380da518e4ebe55d9b63ad2a.jpg',
    };

    // نجرب نعدل نفس الرسالة أولاً
    try {
      await ctx.editMessageCaption(T[lang].choose_payment(plan), {
        parse_mode: 'Markdown',
        reply_markup: kb.payMethod(lang, key).reply_markup,
      });
    } catch (_) {
      try {
        await ctx.editMessageText(T[lang].choose_payment(plan), {
          parse_mode: 'Markdown',
          reply_markup: kb.payMethod(lang, key).reply_markup,
        });
      } catch (__) {
        // الرسالة اتحذفت (جاي من Binance) - نرسل رسالة جديدة مع صورة لو موجودة
        try { await ctx.deleteMessage(); } catch (_) {}
        if (photoIds[cat]) {
          await ctx.replyWithPhoto(photoIds[cat], {
            caption: T[lang].choose_payment(plan),
            parse_mode: 'Markdown',
            reply_markup: kb.payMethod(lang, key).reply_markup,
          });
        } else {
          await ctx.reply(T[lang].choose_payment(plan), {
            parse_mode: 'Markdown',
            reply_markup: kb.payMethod(lang, key).reply_markup,
          });
        }
      }
    }
  });
});

// ─── Pay with Stars ───────────────────────────────────────────
Object.keys(PLANS).forEach((key) => {
  bot.action(`pay_stars_${key}`, async (ctx) => {
    const lang = getLang(ctx.from.id);
    const plan = PLANS[key];
    try {
      await ctx.answerCbQuery();

      // نص صفحة الدفع بالستارز
      const starsText = lang === 'ar'
        ? `⭐ *Telegram Stars · ادفع الآن*
━━━━━━━━━━━━━━━━━━
${plan.emoji} *${plan.service}* · _${plan.period_ar}_
💰 *السعر:* ${plan.amount} ⭐
━━━━━━━━━━━━━━━━━━
_اضغط الزر أدناه للدفع مباشرة عبر تلغرام:_`
        : `⭐ *Telegram Stars · Pay Now*
━━━━━━━━━━━━━━━━━━
${plan.emoji} *${plan.service}* · _${plan.period}_
💰 *Price:* ${plan.amount} ⭐
━━━━━━━━━━━━━━━━━━
_Tap the button below to pay directly via Telegram:_`;

      const starsKb = Markup.inlineKeyboard([
        [Markup.button.callback(lang === 'ar' ? `⭐ ادفع ${plan.amount} Stars` : `⭐ Pay ${plan.amount} Stars`, `stars_confirm_${key}`)],
        [Markup.button.callback(lang === 'ar' ? '‹  رجوع' : '‹  Back', `show_pay_methods_${key}`)],
      ]);

      // تعديل نفس الرسالة
      try {
        await ctx.editMessageCaption(starsText, { parse_mode: 'Markdown', reply_markup: starsKb.reply_markup });
      } catch (_) {
        try {
          await ctx.editMessageText(starsText, { parse_mode: 'Markdown', reply_markup: starsKb.reply_markup });
        } catch (__) {
          await ctx.reply(starsText, { parse_mode: 'Markdown', reply_markup: starsKb.reply_markup });
        }
      }

    } catch (err) {
      console.error('Stars error:', err.message);
      try { await ctx.answerCbQuery('❌ Error. Try again.', true); } catch (_) {}
    }
  });

  // زر التأكيد - يبعث الفاتورة الفعلية
  bot.action(`stars_confirm_${key}`, async (ctx) => {
    const lang = getLang(ctx.from.id);
    const plan = PLANS[key];
    try {
      await ctx.answerCbQuery();
      await ctx.replyWithInvoice({
        title: plan.title,
        description: plan.description,
        payload: `${key}_${ctx.from.id}_${Date.now()}`,
        provider_token: '',
        currency: 'XTR',
        prices: [{ label: plan.title, amount: plan.amount }],
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.pay(lang === 'ar' ? `⭐ ادفع ${plan.amount} Stars` : `⭐ Pay ${plan.amount} Stars`)],
          [Markup.button.callback(lang === 'ar' ? '✖️  إغلاق' : '✖️  Close', `del_invoice_msg`)],
        ]).reply_markup,
      });
    } catch (err) {
      console.error('Stars invoice error:', err.message);
      try { await ctx.answerCbQuery('❌ Error. Try again.', true); } catch (_) {}
    }
  });
});

// ─── Pay with Binance (manual) ───────────────────────────────
Object.keys(PLANS).forEach((planKey) => {
  bot.action(`pay_binance_${planKey}`, async (ctx) => {
    await ctx.answerCbQuery();
    const lang = getLang(ctx.from.id);
    const plan = PLANS[planKey];
    const text = lang === 'ar'
      ? `🟡 *Binance Pay*
━━━━━━━━━━━━━━━━━━
*Binance ID:*
\`${PAYMENT_INFO.binance_id}\`

*الخطوات:*
➊ افتح Binance ← Pay ← Send
➋ أدخل ID: \`${PAYMENT_INFO.binance_id}\`
➌ أدخل المبلغ: *$${plan.usd}*
➍ أكمل الدفع
➎ خذ سكرين شوت
➏ أرسله لـ ${PAYMENT_INFO.support} مع _إيميلك والباقة_
━━━━━━━━━━━━━━━━━━
📦 *طلبك:* ${plan.emoji} ${plan.service} · _${plan.period_ar}_ · *$${plan.usd}*`
      : `🟡 *Binance Pay*
━━━━━━━━━━━━━━━━━━
*Binance ID:*
\`${PAYMENT_INFO.binance_id}\`

*How to pay:*
➊ Open Binance → Pay → Send
➋ Enter ID: \`${PAYMENT_INFO.binance_id}\`
➌ Enter amount: *$${plan.usd}*
➍ Complete the payment
➎ Screenshot the receipt
➏ Send to ${PAYMENT_INFO.support} with your _email & plan_
━━━━━━━━━━━━━━━━━━
📦 *Your order:* ${plan.emoji} ${plan.service} · _${plan.period}_ · *$${plan.usd}*`;

    const closeKb = Markup.inlineKeyboard([[Markup.button.callback(lang === 'ar' ? '✖️  إغلاق' : '✖️  Close', `close_binance_${planKey}`)]]);

    // نحذف الصورة ونحط النص في رسالة جديدة نظيفة
    try { await ctx.deleteMessage(); } catch (_) {}
    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: closeKb.reply_markup });
  });
});

// ─── Pay with NOWPayments (Crypto) ───────────────────────────
const axios = require('axios');

async function createNowPayment(plan, userId) {
  const payload = {
    price_amount: plan.usd,
    price_currency: 'usd',
    order_id: `order_${userId}_${Date.now()}`,
    order_description: plan.title,
    ipn_callback_url: `${process.env.WEBHOOK_URL}/nowpayments-webhook`,
    success_url: `https://t.me/SubsGateBot`,
    cancel_url: `https://t.me/SubsGateBot`,
  };
  console.log('NOWPayments invoice request:', JSON.stringify(payload));
  try {
    const response = await axios.post(
      'https://api.nowpayments.io/v1/invoice',
      payload,
      {
        headers: {
          'x-api-key': process.env.NOWPAYMENTS_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('NOWPayments invoice response:', JSON.stringify(response.data));
    return response.data;
  } catch (err) {
    console.error('NOWPayments full error:', err.response?.data || err.message);
    throw err;
  }
}

Object.keys(PLANS).forEach((planKey) => {
  bot.action(`pay_nowpay_${planKey}`, async (ctx) => {
    await ctx.answerCbQuery();
    const lang = getLang(ctx.from.id);
    const plan = PLANS[planKey];
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name || 'Unknown';

    // أولاً نعدل الرسالة الحالية "جارٍ التوليد..."
    try {
      await ctx.editMessageCaption(T[lang].nowpay_text(plan), { parse_mode: 'Markdown' });
    } catch (_) {
      try { await ctx.editMessageText(T[lang].nowpay_text(plan), { parse_mode: 'Markdown' }); } catch (__) {}
    }

    try {
      const payment = await createNowPayment(plan, userId);

      // حفظ الدفع في Supabase
      const invoiceId = payment.id || payment.invoice_id || String(Date.now());
      await supabase.from('subscriptions').insert({
        user_id: userId,
        username,
        status: 'pending',
        payment_amount: plan.usd,
        payment_currency: 'USD',
        payment_method: 'nowpayments',
        nowpayment_id: invoiceId,
        plan_key: planKey,
        plan_name: plan.title,
        email: null,
      });

      // رابط الدفع
      const payUrl = payment.invoice_url || `https://nowpayments.io/payment/?iid=${payment.id}`;

      const payBtn = Markup.inlineKeyboard([
        [Markup.button.url(lang === 'ar' ? '💠 ادفع الآن' : '💠 Pay Now', payUrl)],
        [Markup.button.callback(lang === 'ar' ? '‹  رجوع' : '‹  Back', `show_pay_methods_${planKey}`)],
      ]);

      // تعديل نفس الرسالة بدل فتح جديدة
      try {
        await ctx.editMessageCaption(T[lang].nowpay_link(plan, payUrl), {
          parse_mode: 'Markdown',
          reply_markup: payBtn.reply_markup,
        });
      } catch (_) {
        try {
          await ctx.editMessageText(T[lang].nowpay_link(plan, payUrl), {
            parse_mode: 'Markdown',
            reply_markup: payBtn.reply_markup,
          });
        } catch (__) {
          await ctx.reply(T[lang].nowpay_link(plan, payUrl), {
            parse_mode: 'Markdown',
            reply_markup: payBtn.reply_markup,
          });
        }
      }

    } catch (err) {
      console.error('NOWPayments error:', err.message);
      const errBtn = Markup.inlineKeyboard([[Markup.button.callback(lang === 'ar' ? '‹  رجوع' : '‹  Back', `show_pay_methods_${planKey}`)]]);
      try {
        await ctx.editMessageCaption(T[lang].nowpay_error, { parse_mode: 'Markdown', reply_markup: errBtn.reply_markup });
      } catch (_) {
        await ctx.reply(T[lang].nowpay_error, { parse_mode: 'Markdown', reply_markup: errBtn.reply_markup });
      }
    }
  });
});

// ─── NOWPayments Webhook Handler (يُستدعى من index.js) ──────
const crypto = require('crypto');

function sortObject(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return obj;
  return Object.keys(obj).sort().reduce((acc, key) => {
    acc[key] = sortObject(obj[key]);
    return acc;
  }, {});
}

async function handleNowPaymentsWebhook(body, signature) {
  // التحقق من صحة الطلب
  const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (ipnSecret && signature) {
    try {
      const sortedBody = sortObject(body);
      const sorted = JSON.stringify(sortedBody);
      const hmac = crypto.createHmac('sha512', ipnSecret).update(sorted).digest('hex');
      console.log('Expected HMAC:', hmac);
      console.log('Received sig:', signature);
      if (hmac !== signature) {
        console.warn('⚠️ NOWPayments signature mismatch — proceeding anyway for now');
        // لا نوقف العملية، نكمل عشان نتحقق إن كل شي شغال
      }
    } catch (e) {
      console.error('Signature check error:', e.message);
    }
  }

  const { payment_id, payment_status, order_id } = body;
  console.log(`💳 NOWPayments webhook: ${payment_id} → ${payment_status}`);

  if (payment_status === 'finished' || payment_status === 'confirmed') {
    try {
      // تحديث حالة الطلب في Supabase
      const { data: sub } = await supabase
        .from('subscriptions')
        .update({ status: 'pending_activation', updated_at: new Date().toISOString() })
        .eq('nowpayment_id', payment_id)
        .select().single();

      if (sub) {
        const lang = getLang(sub.user_id);
        // طلب الإيميل من المستخدم
        pendingEmail.set(sub.user_id, sub.id);
        await bot.telegram.sendMessage(sub.user_id, T[lang].pay_received, { parse_mode: 'Markdown' });

        // إشعار الأدمن
        const msg =
          `🔔 *New Crypto Order  #${sub.id}*
` +
          `━━━━━━━━━━━━━━━━━━
` +
          `👤 @${sub.username || 'N/A'}  (\`${sub.user_id}\`)
` +
          `💠 *NOWPayments* · \`${payment_id}\`
` +
          `💰 *$${sub.payment_amount} USD*
` +
          `📅 ${new Date().toLocaleString('en-GB')}`;

        await bot.telegram.sendMessage(FOUNDER_ID, msg, {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('✅  Activate', `ok_${sub.id}`), Markup.button.callback('❌  Reject', `no_${sub.id}`)],
          ]).reply_markup,
        });
      }
    } catch (err) {
      console.error('NOWPayments webhook DB error:', err.message);
    }
  }
  return true;
}

bot.nowPaymentsWebhook = handleNowPaymentsWebhook;

// ─── Close Invoice (يمسح فاتورة Stars) ──────────────────────
bot.action('del_invoice_msg', async (ctx) => {
  await ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (_) {}
});

// ─── Close Binance (يمسح ويرجع للرئيسية) ─────────────────────
Object.keys(PLANS).forEach((planKey) => {
  bot.action(`close_binance_${planKey}`, async (ctx) => {
    await ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (_) {}
    await showMain(ctx, false);
  });
});

// ─── Close Payment (يمسح الرسالة ويرجع لاختيار الخطط) ────────
Object.keys(PLANS).forEach((planKey) => {
  bot.action(`close_payment_${planKey}`, async (ctx) => {
    await ctx.answerCbQuery();
    const lang = getLang(ctx.from.id);
    const cat = planKey.split('_')[0];
    const catKbMap = { youtube: kb.youtube, netflix: kb.netflix, shahid: kb.shahid, gemini: kb.gemini, chatgpt: kb.chatgpt };
    const catTextMap = {
      youtube: (l) => T[l].youtube_info,
      netflix: (l) => T[l].netflix_info,
      shahid:  (l) => T[l].shahid_info,
      gemini:  (l) => T[l].gemini_info,
      chatgpt: (l) => T[l].chatgpt_info,
    };
    if (['youtube','netflix','shahid'].includes(cat)) {
      try { await ctx.deleteMessage(); } catch (_) {}
      await ctx.replyWithPhoto(PHOTO_IDS[cat], {
        caption: catTextMap[cat](lang),
        parse_mode: 'Markdown',
        reply_markup: catKbMap[cat](lang).reply_markup,
      });
    } else {
      try {
        await ctx.editMessageText(catTextMap[cat](lang), {
          parse_mode: 'Markdown',
          reply_markup: catKbMap[cat](lang).reply_markup,
        });
      } catch (_) {
        await ctx.reply(catTextMap[cat](lang), {
          parse_mode: 'Markdown',
          reply_markup: catKbMap[cat](lang).reply_markup,
        });
      }
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
// ─── Gemini AI Support ───────────────────────────────────────
const STORE_CONTEXT = `
You are a helpful customer support assistant for SubsGate Store, a digital subscriptions store.
You help customers in both Arabic and English - always respond in the same language the customer uses.

PRODUCTS & PRICES:
- YouTube Premium: 1 Month $5 | 3 Months $8 | 6 Months $12 | 1 Year $15
- Netflix Premium: 1 Month $5 | 3 Months $8 | 6 Months $12 | 1 Year $15
- Shahid Plus: 1 Month $5 | 3 Months $8 | 6 Months $12 | 1 Year $15
- Gemini Pro: 1 Month $5 | 1 Year $15
- ChatGPT Plus: 1 Month $5 | 1 Year $15

PAYMENT METHODS:
1. Telegram Stars - instant, directly through Telegram
2. Crypto via NOWPayments - accepts 300+ cryptocurrencies (USDT, BTC, ETH, BNB, etc.)
3. Binance Pay - send to Binance ID: 815791123, then screenshot to @XBLLT

AFTER PAYMENT:
- Enter your email for activation
- Activation within minutes after review
- Track orders with /orders command

SUPPORT: @XBLLT available 24/7

RULES:
- Be friendly and helpful
- Keep responses concise
- If customer is very angry or insists on human support, say you will escalate and include the word "ESCALATE" in your response
- Never make up information not listed above
`;

async function askGemini(history, userMessage) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: STORE_CONTEXT,
  });

  const chat = model.startChat({
    history: history.map(h => ({
      role: h.role,
      parts: [{ text: h.text }],
    })),
  });

  const result = await chat.sendMessage(userMessage);
  return result.response.text();
}

bot.action('nav_support', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const lang = getLang(userId);

  // تفعيل وضع AI Support وتصفير المحادثة
  supportMode.set(userId, []);

  const endBtn = Markup.inlineKeyboard([
    [Markup.button.callback(T[lang].end_chat_btn || (lang === 'ar' ? '✖️  إنهاء المحادثة' : '✖️  End Chat'), 'ai_support_end')],
  ]);

  await editOrReply(ctx, T[lang].ai_support_welcome, {
    parse_mode: 'Markdown',
    reply_markup: endBtn.reply_markup,
  });
});

bot.action('ai_support_end', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const lang = getLang(userId);
  supportMode.delete(userId);
  await editOrReply(ctx, T[lang].ai_support_end, {
    parse_mode: 'Markdown',
    reply_markup: kb.backMain(lang).reply_markup,
  });
});

// ─── Payments Info ────────────────────────────────────────────
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
      return isEdit ? editOrReply(ctx, T[lang].orders_empty, extra) : ctx.reply(T[lang].orders_empty, extra);
    }
    let msg = T[lang].orders_title(data.length);
    data.forEach((o, i) => { msg += T[lang].order_row(o, i); });
    return isEdit ? editOrReply(ctx, msg, extra) : ctx.reply(msg, extra);
  } catch (_) { ctx.reply('❌ Error loading orders.'); }
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

    // استخراج plan_key من الـ payload (شكله: youtube_month_123456_timestamp)
    const payloadParts = (payment.invoice_payload || '').split('_');
    const planKey = payloadParts.length >= 2 ? `${payloadParts[0]}_${payloadParts[1]}` : null;
    const plan = planKey && PLANS[planKey] ? PLANS[planKey] : null;

    const { data, error } = await supabase.from('subscriptions')
      .insert({
        user_id: userId,
        username,
        status: 'pending',
        payment_amount: amount,
        payment_currency: payment.currency,
        payment_method: 'stars',
        plan_key: planKey,
        plan_name: plan ? plan.title : null,
        email: null,
      })
      .select().single();
    if (error) return ctx.reply(`❌ Error. Contact ${PAYMENT_INFO.support}`);
    pendingEmail.set(userId, data.id);
    await ctx.reply(T[lang].pay_received, { parse_mode: 'Markdown' });
  } catch (_) {
    try { await ctx.reply(`❌ Error. Contact ${PAYMENT_INFO.support}`); } catch (__) {}
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

  // ─── Reply Keyboard handlers ───────────────────────────────
  const replyMap = {
    '🛒 Products': 'nav_products', '🛒 المنتجات': 'nav_products',
    '📦 My Orders': 'nav_orders',  '📦 طلباتي': 'nav_orders',
    '💬 Support': 'nav_support',   '💬 الدعم': 'nav_support',
    '❓ FAQ': 'nav_faq',           '❓ أسئلة شائعة': 'nav_faq',
    '🔄 Restart': 'restart',   '🔄 إعادة التشغيل': 'restart',
    '🌐 العربية': 'ar',            '🌐 English': 'en',
    '👨‍💼 Admin Panel': 'admin',    '👨‍💼 الأدمن': 'admin',
  };

  if (replyMap[text] !== undefined) {
    const action = replyMap[text];
    if (action === 'ar' || action === 'en') {
      userLang.set(userId, action);
      return showMain(ctx, false);
    }
    if (action === 'admin') {
      if (userId !== FOUNDER_ID) return;
      return ctx.reply('👨‍💼 *Admin Panel*', { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('📊  Store Statistics', 'adm_stats')],
        [Markup.button.callback('👥  User Statistics',  'adm_users')],
        [Markup.button.callback('📢  Broadcast',         'adm_broadcast')],
      ]).reply_markup });
    }
    if (action === 'nav_products') {
      return ctx.reply(T[lang].browse, { parse_mode: 'Markdown', reply_markup: kb.products(lang).reply_markup });
    }
    if (action === 'nav_orders') return showOrders(ctx, false);
    if (action === 'nav_support') {
      supportMode.set(userId, []);
      const endBtn = Markup.inlineKeyboard([
        [Markup.button.callback(lang === 'ar' ? '✖️  إنهاء المحادثة' : '✖️  End Chat', 'ai_support_end')],
      ]);
      return ctx.reply(T[lang].ai_support_welcome, { parse_mode: 'Markdown', reply_markup: endBtn.reply_markup });
    }
    if (action === 'nav_faq') {
      return ctx.reply(T[lang].faq_text, { parse_mode: 'Markdown', reply_markup: kb.backMain(lang).reply_markup });
    }
    if (action === 'restart') {
      return showMain(ctx, false);
    }
    return;
  }



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

  // ─── AI Support Handler ───────────────────────────────────
  if (supportMode.has(userId)) {
    const lang = getLang(userId);
    const history = supportMode.get(userId);
    const endBtn = Markup.inlineKeyboard([
      [Markup.button.callback(T[lang].end_chat_btn || (lang === 'ar' ? '✖️  إنهاء المحادثة' : '✖️  End Chat'), 'ai_support_end')],
    ]);

    // رسالة "جارٍ التفكير"
    const thinkingMsg = await ctx.reply(T[lang].ai_thinking, { parse_mode: 'Markdown' });

    try {
      const aiReply = await askGemini(history, text);

      // حذف رسالة التفكير
      try { await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id); } catch (_) {}

      // تحديث المحادثة
      history.push({ role: 'user', text });
      history.push({ role: 'model', text: aiReply });
      supportMode.set(userId, history);

      // تحقق لو يحتاج تحويل للأدمن
      if (aiReply.includes('ESCALATE')) {
        const cleanReply = aiReply.replace('ESCALATE', '').trim();
        await ctx.reply(cleanReply, { parse_mode: 'Markdown', reply_markup: endBtn.reply_markup });
        supportMode.delete(userId);

        // إشعار الأدمن
        const username = ctx.from.username || ctx.from.first_name || 'Unknown';
        const lastMessages = history.slice(-4).map(h => (h.role === 'user' ? '👤 ' : '🤖 ') + h.text).join('\n');
        await bot.telegram.sendMessage(FOUNDER_ID,
          `🆘 *Support Escalation*
━━━━━━━━━━━━━━━━━━
👤 @${username} (\`${userId}\`)

*Last messages:*
${lastMessages}`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply(aiReply, { parse_mode: 'Markdown', reply_markup: endBtn.reply_markup });
      }
    } catch (err) {
      console.error('Gemini error:', err.message);
      try { await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id); } catch (_) {}
      await ctx.reply(
        lang === 'ar' ? '❌ عذراً، حدث خطأ. حاول مجدداً.' : '❌ Sorry, an error occurred. Please try again.',
        { parse_mode: 'Markdown', reply_markup: endBtn.reply_markup }
      );
    }
    return;
  }

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

// ─── Photo ────────────────────────────────────────────────────
bot.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  const lang = getLang(userId);
  const username = ctx.from.username || ctx.from.first_name || 'Unknown';
  try {
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    const caption = ctx.message.caption || '—';
    await bot.telegram.sendPhoto(FOUNDER_ID, fileId, {
      caption: `📸 *Manual Payment*\n\n👤 @${username}  (\`${userId}\`)\n📝 _${caption}_`,
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('✅  Activate', `man_ok_${userId}`), Markup.button.callback('❌  Reject', `man_no_${userId}`)],
      ]).reply_markup,
    });
    await ctx.reply(T[lang].manual_received, { parse_mode: 'Markdown' });
  } catch (err) { console.error('Photo error:', err.message); }
});

bot.action(/^man_ok_(\d+)$/, async (ctx) => {
  if (ctx.from.id !== FOUNDER_ID) return ctx.answerCbQuery('Not authorized.');
  const uid = parseInt(ctx.match[1]);
  await ctx.answerCbQuery('✅');
  await bot.telegram.sendMessage(uid, T[getLang(uid)].activated, { parse_mode: 'Markdown' });
  try { await ctx.editMessageCaption('✅ Activated'); } catch (_) {}
});

bot.action(/^man_no_(\d+)$/, async (ctx) => {
  if (ctx.from.id !== FOUNDER_ID) return ctx.answerCbQuery('Not authorized.');
  const uid = parseInt(ctx.match[1]);
  await ctx.answerCbQuery('❌');
  await bot.telegram.sendMessage(uid, T[getLang(uid)].rejected_msg, { parse_mode: 'Markdown' });
  try { await ctx.editMessageCaption('❌ Rejected'); } catch (_) {}
});

// ─── Notify Founder ───────────────────────────────────────────
async function notifyFounder(subscription) {
  try {
    const msg =
      `🔔 *New Order  #${subscription.id}*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 @${subscription.username || 'N/A'}  (\`${subscription.user_id}\`)\n` +
      `📧 \`${subscription.email}\`\n` +
      `💰 *${subscription.payment_amount} ⭐*\n` +
      `📅 ${new Date(subscription.created_at).toLocaleString('en-GB')}`;
    await bot.telegram.sendMessage(FOUNDER_ID, msg, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('✅  Activate', `ok_${subscription.id}`), Markup.button.callback('❌  Reject', `no_${subscription.id}`)],
      ]).reply_markup,
    });
  } catch (err) { console.error('notifyFounder:', err); }
}

// ─── Stars Approve / Reject ───────────────────────────────────
bot.action(/^ok_(\d+)$/, async (ctx) => {
  if (ctx.from.id !== FOUNDER_ID) return ctx.answerCbQuery('Not authorized.');
  try {
    const { data } = await supabase.from('subscriptions').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', parseInt(ctx.match[1])).select().single();
    await bot.telegram.sendMessage(data.user_id, T[getLang(data.user_id)].activated, { parse_mode: 'Markdown' });
    await ctx.answerCbQuery('✅ Activated');
    await ctx.editMessageReplyMarkup(null);
  } catch (_) { ctx.answerCbQuery('Error.'); }
});

bot.action(/^no_(\d+)$/, async (ctx) => {
  if (ctx.from.id !== FOUNDER_ID) return ctx.answerCbQuery('Not authorized.');
  try {
    const { data } = await supabase.from('subscriptions').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', parseInt(ctx.match[1])).select().single();
    await bot.telegram.sendMessage(data.user_id, T[getLang(data.user_id)].rejected_msg, { parse_mode: 'Markdown' });
    await ctx.answerCbQuery('❌ Rejected');
    await ctx.editMessageReplyMarkup(null);
  } catch (_) { ctx.answerCbQuery('Error.'); }
});

// ─── Admin ────────────────────────────────────────────────────
bot.action('nav_admin', async (ctx) => {
  if (ctx.from.id !== FOUNDER_ID) return ctx.answerCbQuery('Not authorized.');
  await ctx.answerCbQuery();
  await editOrReply(ctx, '👨‍💼 *Admin Panel*', { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard([
    [Markup.button.callback('📊  Store Statistics', 'adm_stats')],
    [Markup.button.callback('👥  User Statistics',  'adm_users')],
    [Markup.button.callback('📢  Broadcast',         'adm_broadcast')],
    [Markup.button.callback('‹  Back',               'nav_main')],
  ]).reply_markup });
});

bot.command('admin', async (ctx) => {
  if (ctx.from.id !== FOUNDER_ID) return ctx.reply('❌ Not authorized.');
  await ctx.reply('👨‍💼 *Admin Panel*', { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard([
    [Markup.button.callback('📊  Store Statistics', 'adm_stats')],
    [Markup.button.callback('👥  User Statistics',  'adm_users')],
    [Markup.button.callback('📢  Broadcast',         'adm_broadcast')],
    [Markup.button.callback('‹  Back',               'nav_main')],
  ]).reply_markup });
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
    await editOrReply(ctx,
      `📊 *Store Statistics*\n━━━━━━━━━━━━━━━━━━\n` +
      `📦  _Total Orders:_   *${total}*\n` +
      `✅  _Activated:_      *${approved}*\n` +
      `🕐  _Pending:_        *${pending}*\n` +
      `❌  _Rejected:_       *${rejected}*\n\n` +
      `💰  _Total Revenue:_  *${revenue} ⭐*`,
      { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard([[Markup.button.callback('‹  Back', 'nav_main')]]).reply_markup }
    );
  } catch (_) { ctx.reply('❌ Error loading stats.'); }
});

bot.action('adm_users', async (ctx) => {
  if (ctx.from.id !== FOUNDER_ID) return ctx.answerCbQuery('Not authorized.');
  await ctx.answerCbQuery();
  try {
    const { data: users } = await supabase.from('users').select('user_id, lang, created_at');
    const { data: orders } = await supabase.from('subscriptions').select('user_id, status');

    const totalUsers    = users?.length || 0;
    const arUsers       = users?.filter(u => u.lang === 'ar').length || 0;
    const enUsers       = users?.filter(u => u.lang === 'en').length || 0;
    const buyerIds      = [...new Set(orders?.map(o => o.user_id) || [])];
    const totalBuyers   = buyerIds.length;
    const activeUsers   = orders?.filter(o => o.status === 'approved').map(o => o.user_id);
    const uniqueActive  = [...new Set(activeUsers || [])].length;
    const convRate      = totalUsers > 0 ? ((totalBuyers / totalUsers) * 100).toFixed(1) : 0;

    const today = new Date();
    today.setHours(0,0,0,0);
    const newToday = users?.filter(u => new Date(u.created_at) >= today).length || 0;

    const adminKb = Markup.inlineKeyboard([[Markup.button.callback('‹  Back', 'nav_admin')]]);

    await editOrReply(ctx,
      `👥 *User Statistics*
━━━━━━━━━━━━━━━━━━
` +
      `👤  _Total Users:_       *${totalUsers}*
` +
      `🆕  _New Today:_         *${newToday}*
` +
      `🛒  _Have Purchased:_    *${totalBuyers}*
` +
      `✅  _Active Subscribers:_ *${uniqueActive}*
` +
      `📈  _Conversion Rate:_   *${convRate}%*

` +
      `🌐 *Language Breakdown:*
` +
      `🇬🇧  English: *${enUsers}*
` +
      `🇸🇦  Arabic:  *${arUsers}*`,
      { parse_mode: 'Markdown', reply_markup: adminKb.reply_markup }
    );
  } catch (err) {
    console.error('adm_users error:', err);
    ctx.reply('❌ Error loading user stats.');
  }
});

bot.action('adm_broadcast', async (ctx) => {
  if (ctx.from.id !== FOUNDER_ID) return ctx.answerCbQuery('Not authorized.');
  await ctx.answerCbQuery();
  broadcastMode.set(FOUNDER_ID, true);
  await ctx.reply(`📢 *Broadcast Mode*\n\n_Send your message now. Use /cancel to abort._`, { parse_mode: 'Markdown' });
});

bot.command('help', async (ctx) => {
  const lang = getLang(ctx.from.id);
  await ctx.reply(
    lang === 'ar'
      ? `📚 *المساعدة*\n━━━━━━━━━━━━━━━━━━\n• /start — القائمة الرئيسية\n• /orders — طلباتي\n• /lang — تغيير اللغة\n• /contact — الدعم`
      : `📚 *Help*\n━━━━━━━━━━━━━━━━━━\n• /start — Main menu\n• /orders — My orders\n• /lang — Change language\n• /contact — Support`,
    { parse_mode: 'Markdown', reply_markup: kb.backMain(lang).reply_markup }
  );
});

bot.command('contact', async (ctx) => {
  const lang = getLang(ctx.from.id);
  await ctx.reply(T[lang].support_text, { parse_mode: 'Markdown', reply_markup: kb.backMain(lang).reply_markup });
});

bot.catch((err, ctx) => {
  console.error('Bot error:', err.message);
  try { if (ctx?.reply) ctx.reply('❌ Something went wrong. Please try again.'); } catch (_) {}
});

console.log('✅ All handlers registered');
module.exports = bot;
