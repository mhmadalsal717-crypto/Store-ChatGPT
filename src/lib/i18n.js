// ============================================================
//  اللغات — عربي / إنكليزي
//
//  لغة كل مستخدم محفوظة بعمود users.lang، ومنقرأها مرة وحدة
//  بالحارس العام ومنحطها على ctx.lang. الشاشات بتستعملها
//  مباشرة بدون أي نداء إضافي لقاعدة البيانات.
//
//  إضافة نص جديد: حطّه بالقاموسين. لو نسيت الإنكليزي،
//  بيرجع العربي تلقائياً بدل ما ينكسر شي.
// ============================================================
import { db } from './db.js';
import { T } from './settings.js';

export const LANGS = ['ar', 'en'];
export const DEFAULT_LANG = 'ar';

// ============================================================
//  القاموس
// ============================================================
const DICT = {
  ar: {
    // ---- أزرار القائمة الرئيسية ----
    'menu.products': '🛒 المنتجات',
    'menu.profile':  '👤 ملفي',
    'menu.invites':  '🎁 الدعوات',
    'menu.voucher':  '💳 شحن بكود',
    'menu.topup':    '💰 شحن رصيد',
    'menu.help':     '❓ المساعدة',
    'menu.policy':   '🛡 سياسة البوت',
    'menu.admin':    '⚙️ لوحة التحكم',

    // ---- شاشة اللغة ----
    'lang.title':    '🌐 <b>اللغة</b>',
    'lang.pick':     'اختر لغة البوت:',
    'lang.current':  'اللغة الحالية: <b>العربية</b>',
    'lang.done':     '✅ تم تغيير اللغة إلى العربية.',
    'lang.ar':       '🇸🇦 العربية',
    'lang.en':       '🇬🇧 English',

    // ---- أوامر البوت ----
    'cmd.start':     'القائمة الرئيسية',
    'cmd.menu':      'فتح القائمة',
    'cmd.lang':      'تغيير اللغة · Change language',

    // ---- عام ----
    'common.back':   '« رجوع',
    'common.home':   '« الرئيسية',
  },

  en: {
    // ---- Main menu buttons ----
    'menu.products': '🛒 Products',
    'menu.profile':  '👤 My Profile',
    'menu.invites':  '🎁 Referrals',
    'menu.voucher':  '💳 Redeem Code',
    'menu.topup':    '💰 Add Funds',
    'menu.help':     '❓ Support',
    'menu.policy':   '🛡 Bot Policy',
    'menu.admin':    '⚙️ Admin Panel',

    // ---- Language screen ----
    'lang.title':    '🌐 <b>Language</b>',
    'lang.pick':     'Choose your language:',
    'lang.current':  'Current language: <b>English</b>',
    'lang.done':     '✅ Language changed to English.',
    'lang.ar':       '🇸🇦 العربية',
    'lang.en':       '🇬🇧 English',

    // ---- Bot commands ----
    'cmd.start':     'Main menu',
    'cmd.menu':      'Open menu',
    'cmd.lang':      'Change language · تغيير اللغة',

    // ---- Common ----
    'common.back':   '« Back',
    'common.home':   '« Home',
  },
};

/** جلب نص. لو ناقص بالإنكليزي بيرجع العربي، ولو ناقص بالتنين بيرجع المفتاح. */
export const t = (lang, key) =>
  DICT[lang]?.[key] ?? DICT[DEFAULT_LANG][key] ?? key;

/** كل النصوص لمفتاح معيّن بكل اللغات — مستعملة ببناء جدول التوجيه */
export const allOf = (key) => LANGS.map((l) => t(l, key));

/**
 * نص الترحيب. محفوظ بجدول texts مفتاحين منفصلين
 * حتى تقدر تعدّله من لوحة التحكم بدون لمس الكود.
 */
export const welcomeText = (lang) =>
  lang === 'en'
    ? T('welcome_en', '<blockquote>👋 Welcome!</blockquote>')
    : T('welcome',    '<blockquote>👋 مرحبًا بك!</blockquote>');

/** حفظ لغة المستخدم */
export async function setLang(tgId, lang) {
  const v = LANGS.includes(lang) ? lang : DEFAULT_LANG;
  await db.from('users').update({ lang: v }).eq('tg_id', tgId);
  return v;
}
