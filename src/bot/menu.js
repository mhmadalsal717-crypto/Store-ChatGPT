// ============================================================
//  القائمة الرئيسية — Reply Keyboard + شاشة اللغة
//
//  هاي الأزرار بتظهر تحت حقل الكتابة (مو ملتصقة بالرسالة)،
//  وبتضل ثابتة مهما تنقّل المستخدم — نفس شكل بوت GGSoma.
//
//  الفرق التقني: زر الـ Reply Keyboard لما ينضغط بيبعت
//  رسالة نصية عادية بنفس نص الزر، مو callback_query.
//  لهيك منمسك كل نص بـ bot.hears ومنحوّله للشاشة المطلوبة.
//
//  ⚠️ جدول MENU مبني تلقائياً من القاموس بكل اللغات، فزر
//     المستخدم بيشتغل حتى لو بدّل لغته والكيبورد القديم لسه ظاهر.
// ============================================================
import { Keyboard } from 'grammy';
import { isAdmin } from '../config.js';
import { screen, to } from './nav.js';
import { kb } from './kb.js';
import { t, LANGS, setLang, welcomeText } from '../lib/i18n.js';

// ---------- المفاتيح وشاشاتها ----------
const ITEMS = [
  ['menu.products', 'providers'],
  ['menu.profile',  'profile'],
  ['menu.invites',  'invites'],
  ['menu.voucher',  'voucher'],
  ['menu.topup',    'topup'],
  ['menu.help',     'help'],
  ['menu.policy',   'policy'],
  ['menu.admin',    'admin'],
];

/**
 * نص الزر -> اسم الشاشة، بكل اللغات دفعة وحدة.
 * لازم يغطّي كل اللغات: المستخدم ممكن يبدّل لغته والكيبورد
 * القديم يضل معلّق عنده لحدّ ما يبعت رسالة.
 */
export const MENU = {};
for (const [key, screenName] of ITEMS) {
  for (const lang of LANGS) MENU[t(lang, key)] = screenName;
}

/**
 * بناء الكيبورد. زر لوحة التحكم بيظهر للأدمن بس.
 * resized    = ارتفاع مضبوط بدل أزرار عملاقة
 * persistent = تضل ظاهرة وما تنطوي
 */
export function mainMenu(tgId, lang = 'ar') {
  // ⚠️ grammy's Keyboard.text ما بتمرّر style، فمنضيف الزر ككائن خام.
  //    Bot API 9.4 بيدعم style على KeyboardButton كمان مو بس Inline.
  const k = new Keyboard();
  k.add({ text: t(lang, 'menu.products'), style: 'success' });
  k.row()
    .text(t(lang, 'menu.profile')).text(t(lang, 'menu.invites')).row()
    .text(t(lang, 'menu.voucher')).text(t(lang, 'menu.topup')).row()
    .text(t(lang, 'menu.help')).text(t(lang, 'menu.policy')).row();

  if (isAdmin(tgId)) k.text(t(lang, 'menu.admin')).row();

  return k.resized().persistent();
}

// ============================================================
//  شاشة اللغة
// ============================================================
screen('lang', async (ctx) => {
  const lang = ctx.lang || 'ar';
  return {
    text: `${t(lang, 'lang.title')}\n${t(lang, 'lang.current')}\n\n${t(lang, 'lang.pick')}`,
    kb: kb()
      .text(t(lang, 'lang.ar'), to('lang_set', 'ar')).row()
      .text(t(lang, 'lang.en'), to('lang_set', 'en')).row()
      .build(),
  };
});

screen('lang_set', async (ctx, [code]) => {
  const lang = await setLang(ctx.from.id, code);
  ctx.lang = lang;

  // الكيبورد ما بينتحدّث بتعديل رسالة قديمة — لازم رسالة جديدة
  await ctx.reply(welcomeText(lang), {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: mainMenu(ctx.from.id, lang),
  }).catch(() => {});

  return { text: t(lang, 'lang.done'), kb: kb().build() };
});
