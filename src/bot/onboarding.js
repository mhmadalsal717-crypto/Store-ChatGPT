// ============================================================
//  بوابة الدخول — اللغة ثم الاشتراك الإجباري
//
//  المسار لأي مستخدم جديد:
//    /start ──▶ اختيار اللغة ──▶ انضم للمجموعة والقناة ──▶ تحقق ──▶ الترحيب
//
//  ⚠️ البوت لازم يكون أدمن بالمجموعة وبالقناة، وإلا getChatMember
//     بيرمي خطأ. عالجناها بـ «يفتح عند الفشل»: لو الفحص ما اشتغل
//     منسمح بالدخول. أهون بكتير من قفل الباب على كل الزبائن.
// ============================================================
import { screen, to } from './nav.js';
import { kb } from './kb.js';
import { db } from '../lib/db.js';
import { T, Sbool } from '../lib/settings.js';
import { t, LANGS, setLang, welcomeText } from '../lib/i18n.js';
import { mainMenu } from './menu.js';

const OK = ['member', 'administrator', 'creator'];

/**
 * إنهاء البوابة: امسح رسالة البوابة وابعت الترحيب مع الكيبورد.
 *
 * ليش رسالة جديدة مو تعديل؟ لأن الكيبورد الثابت (ReplyKeyboard)
 * ما بينضاف بتعديل رسالة قديمة — تلغرام بيقبله بالإرسال بس.
 */
async function welcomeAndMenu(ctx) {
  await ctx.deleteMessage().catch(() => {});
  await ctx.reply(welcomeText(ctx.lang), {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: mainMenu(ctx.from.id, ctx.lang),
  }).catch(() => {});
}

/** القنوات المطلوبة: [{ id, url, labelKey }] — بس المضبوطة منها */
export function requiredChats() {
  const out = [];
  const g = T('join_group_id', '').trim();
  const c = T('join_channel_id', '').trim();
  if (g) out.push({ id: g, url: T('join_group_url', '').trim(),   key: 'join.group' });
  if (c) out.push({ id: c, url: T('join_channel_url', '').trim(), key: 'join.channel' });
  return out;
}

/** هل المستخدم مشترك بكل المطلوب؟ */
export async function isJoined(api, tgId) {
  if (!Sbool('force_join', false)) return true;

  for (const chat of requiredChats()) {
    try {
      const m = await api.getChatMember(chat.id, tgId);
      if (!OK.includes(m.status)) return false;
    } catch (e) {
      // البوت مو أدمن، أو المعرّف غلط. لا تقفل الباب.
      console.error('[join] فحص العضوية فشل:', chat.id, e.message);
      return true;
    }
  }
  return true;
}

// ============================================================
//  اختيار اللغة — أول شاشة يشوفها المستخدم الجديد
// ============================================================
screen('ob_lang', async () => ({
  // نص ثنائي اللغة عن قصد: لسه ما بنعرف لغته
  text: 'Welcome! 👋\nPlease select your preferred language:\n\n' +
        'مرحبًا بك! 👋\nاختر لغتك المفضّلة:',
  kb: kb()
    .text('🇸🇦 العربية', to('ob_set', 'ar'))
    .text('🇬🇧 English', to('ob_set', 'en')).row()
    .build(),
}));

screen('ob_set', async (ctx, [code]) => {
  const lang = await setLang(ctx.from.id, LANGS.includes(code) ? code : 'ar');
  ctx.lang = lang;

  // ⚠️ لازم نتأكد إن الحفظ نجح فعلاً. لو عمود lang_set ناقص
  // (يعني 10_onboarding.sql ما انشغّل)، الحفظ بيفشل بصمت
  // والحارس بيرجّع المستخدم لشاشة اللغة كل مرة — حلقة مقفلة.
  const { error } = await db.from('users')
    .update({ lang_set: true }).eq('tg_id', ctx.from.id);
  if (error) console.error('[onboarding] فشل حفظ lang_set:', error.message);

  // لسه ما اشترك؟ كمّل للبوابة بتعديل نفس الرسالة
  if (!(await isJoined(ctx.api, ctx.from.id))) return { goto: 'ob_join' };

  await welcomeAndMenu(ctx);
  return null;   // ما ترسم شي — welcomeAndMenu تصرّفت
});

// ============================================================
//  شاشة الاشتراك الإجباري
// ============================================================
screen('ob_join', async (ctx) => {
  const chats = requiredChats();
  const k = kb();
  for (const c of chats) if (c.url) k.url(t(ctx, c.key), c.url).row();
  k.text(t(ctx, 'join.verify'), to('ob_check')).row();

  return { text: t(ctx, 'join.text'), kb: k.build() };
});

screen('ob_check', async (ctx) => {
  if (await isJoined(ctx.api, ctx.from.id)) {
    await welcomeAndMenu(ctx);
    return null;
  }

  // لسه ما اشترك — نبّهه بدون ما نبدّل الشاشة
  await ctx.answerCallbackQuery?.({ text: t(ctx, 'join.missing'), show_alert: true })
    .catch(() => {});
  return { goto: 'ob_join' };
});
