Enter// ============================================================
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
import { t, LANGS, setLang } from '../lib/i18n.js';

const OK = ['member', 'administrator', 'creator'];

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
  await db.from('users').update({ lang_set: true }).eq('tg_id', ctx.from.id);
  ctx.lang = lang;

  // مشترك أصلاً؟ فوّته على طول
  if (await isJoined(ctx.api, ctx.from.id)) return { goto: 'ob_done' };
  return { goto: 'ob_join' };
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
  if (await isJoined(ctx.api, ctx.from.id)) return { goto: 'ob_done' };

  // لسه ما اشترك — نبّهه بدون ما نبدّل الشاشة
  await ctx.answerCallbackQuery?.({ text: t(ctx, 'join.missing'), show_alert: true })
    .catch(() => {});
  return { goto: 'ob_join' };
});
