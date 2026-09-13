// ============================================================
//  بوابة الدخول — تمرّ مرة وحدة بالحياة
//
//  الحالة محفوظة بعمود users.onboard_step:
//      0 = لازم يختار لغة
//      1 = لازم يشترك بالمجموعة والقناة
//      2 = خلص — ما بينفحص شي بعدها أبداً
//
//  ليش عدّاد مو فحص عضوية كل رسالة؟ لأن getChatMember نداء شبكة
//  لتلغرام. فحصه بكل ضغطة زر يعني تأخير بكل شاشة وضغط بلا داعي.
//  بيكفي نفحص مرة عند التحقق، وبعدها نختم الملف ونمشي.
//
//  ⚠️ البوت لازم يكون أدمن بالمجموعة وبالقناة. لو الفحص فشل
//     منسمح بالمرور — أهون من قفل الباب على كل الزبائن.
// ============================================================
import { screen, to } from './nav.js';
import { kb } from './kb.js';
import { db, rpc } from '../lib/db.js';
import { T, Sbool, Snum, E } from '../lib/settings.js';
import { money } from '../lib/fmt.js';
import { t, LANGS, setLang, welcomeText } from '../lib/i18n.js';
import { mainMenu } from './menu.js';

export const STEP_LANG = 0;
export const STEP_JOIN = 1;
export const STEP_DONE = 2;

const MEMBER = ['member', 'administrator', 'creator'];

const setStep = (tgId, step) =>
  db.from('users').update({ onboard_step: step }).eq('tg_id', tgId);

/** القنوات المطلوبة — بس يلي متضبّط منها */
export function requiredChats() {
  const out = [];
  const g = T('join_group_id', '').trim();
  const c = T('join_channel_id', '').trim();
  if (g) out.push({ id: g, url: T('join_group_url', '').trim(),   key: 'join.group' });
  if (c) out.push({ id: c, url: T('join_channel_url', '').trim(), key: 'join.channel' });
  return out;
}

/** هل البوابة مطلوبة أصلاً؟ مطفأة أو بلا معرّفات = لأ */
export const joinRequired = () =>
  Sbool('force_join', false) && requiredChats().length > 0;

export async function isJoined(api, tgId) {
  if (!joinRequired()) return true;

  for (const chat of requiredChats()) {
    try {
      const m = await api.getChatMember(chat.id, tgId);
      if (!MEMBER.includes(m.status)) return false;
    } catch (e) {
      console.error('[join] الفحص فشل — تأكد إن البوت أدمن:', chat.id, e.message);
      return true;   // يفتح عند الفشل
    }
  }
  return true;
}

/** ختم البوابة + الترحيب. الكيبورد الثابت بدّه رسالة جديدة مو تعديل. */
async function finish(ctx) {
  await setStep(ctx.from.id, STEP_DONE);
  await ctx.deleteMessage().catch(() => {});
  await ctx.reply(welcomeText(ctx.lang), {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: mainMenu(ctx.from.id, ctx.lang),
  }).catch(() => {});
}

/**
 * تسجيل الإحالة.
 * لازم تنستدعى من الحارس قبل البوابة: المستخدم الجديد بيوصل عبر
 * ‎/start?ref=xxx‎ والحارس بيوقفه قبل ما يوصل لمعالج /start،
 * فبدون هالنداء كان رابط الإحالة يضيع لكل مستخدم جديد.
 */
export async function applyReferral(ctx, api, payload) {
  if (!payload) return;
  const { data: me } = await db.from('users')
    .select('id, referred_by').eq('tg_id', ctx.from.id).maybeSingle();
  if (!me || me.referred_by) return;

  const { data: ref } = await db.from('users')
    .select('id, tg_id').eq('ref_code', payload).maybeSingle();
  if (!ref || ref.tg_id === ctx.from.id) return;

  await db.from('users').update({ referred_by: ref.id }).eq('id', me.id);

  const bonus = Snum('referral_join', 0);
  if (bonus > 0) {
    await rpc('credit_user', {
      p_tg_id: ref.tg_id, p_amount: bonus,
      p_type: 'REFERRAL', p_ref: 'join:' + ctx.from.id,
    }).catch(() => {});
  }
  api.sendMessage(ref.tg_id,
    `${E('gift')} انضم مستخدم جديد عبر رابطك.` + (bonus > 0 ? ` +${money(bonus)}` : ''),
    { parse_mode: 'HTML' }).catch(() => {});
}

// ============================================================
//  الخطوة 0 — اللغة
// ============================================================
screen('ob_lang', async () => ({
  // ثنائي اللغة عن قصد — لسه ما بنعرف لغته
  text: 'Welcome! 👋\nPlease select your preferred language:\n\n' +
        'مرحبًا بك! 👋\nاختر لغتك المفضّلة:',
  kb: kb()
    .text('🇸🇦 العربية', to('ob_set', 'ar'))
    .text('🇬🇧 English', to('ob_set', 'en')).row()
    .build(),
}));

screen('ob_set', async (ctx, [code]) => {
  ctx.lang = await setLang(ctx.from.id, LANGS.includes(code) ? code : 'ar');

  if (!joinRequired() || await isJoined(ctx.api, ctx.from.id)) {
    await finish(ctx);
    return null;
  }
  await setStep(ctx.from.id, STEP_JOIN);
  return { goto: 'ob_join' };
});

// ============================================================
//  الخطوة 1 — الاشتراك
// ============================================================
screen('ob_join', async (ctx) => {
  const k = kb();
  for (const c of requiredChats()) if (c.url) k.url(t(ctx, c.key), c.url).row();
  k.text(t(ctx, 'join.verify'), to('ob_check')).row();
  return { text: t(ctx, 'join.text'), kb: k.build() };
});

screen('ob_check', async (ctx) => {
  if (await isJoined(ctx.api, ctx.from.id)) {
    await finish(ctx);
    return null;
  }
  await ctx.answerCallbackQuery?.({ text: t(ctx, 'join.missing'), show_alert: true })
    .catch(() => {});
  return null;   // خلّي الشاشة زي ما هي
});
