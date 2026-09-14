// ============================================================
//  نظام الإحالات بالمراحل
//
//  المدعو ما بينحسب بمجرد ما يضغط الرابط. لازم يمرق بأربع مراحل:
//
//    1. سجّل            دخل عبر رابطك
//    2. انضم            كمّل المجموعة والقناة (onboard_step = 2)
//    3. تحقق بشري       نجح بالتحدي — يوقف السكربتات
//    4. تفاعل مع البوت  عمل شي فعلي (فتح المنتجات مثلاً)
//
//  وبس بعد الأربعة بيصير «مؤهّل» وبينحسب ضمن دفعة المكافأة.
//  السبب: بدون هالمراحل أي حدا بيعمل 100 حساب وهمي بخمس دقايق.
// ============================================================
import { screen, to } from './nav.js';
import { kb } from './kb.js';
import { db, rpc, ensureUser } from '../lib/db.js';
import { T, Snum, Sbool, E } from '../lib/settings.js';
import { money } from '../lib/fmt.js';
import { t } from '../lib/i18n.js';

const perReward = () => Math.max(1, Snum('ref_per_reward', 15));
const rewardUsd = () => Snum('ref_reward_usd', 1);

/** إحصاء كل مرحلة لمُحيل معيّن */
async function stats(userId) {
  const { data } = await db.from('users')
    .select('onboard_step, ref_verified, ref_active, ref_rewarded')
    .eq('referred_by', userId);

  const rows = data || [];
  const s = { total: rows.length, join: 0, human: 0, active: 0, ready: 0, paid: 0 };

  for (const r of rows) {
    if (r.ref_rewarded)            { s.paid++;   continue; }
    if ((r.onboard_step ?? 0) < 2) { s.join++;   continue; }
    if (!r.ref_verified)           { s.human++;  continue; }
    if (!r.ref_active)             { s.active++; continue; }
    s.ready++;
  }
  return s;
}

/**
 * تعليم المدعو كمتفاعل — بينستدعى من أول إجراء حقيقي بالبوت.
 * كتابة وحدة بس أول مرة، فما بتضغط على قاعدة البيانات.
 */
export async function markActive(user) {
  if (!user || user.ref_active || !user.referred_by) return;
  await db.from('users').update({ ref_active: true }).eq('id', user.id);
}

// ============================================================
//  القائمة
// ============================================================
screen('invites', async (ctx) => ({
  text: t(ctx, 'inv.menu'),
  kb: kb()
    .text(t(ctx, 'inv.btnLink'),  to('inv_link'))
    .text(t(ctx, 'inv.btnStats'), to('inv_stats')).row()
    .text(t(ctx, 'btn.close'), to('close'))
    .build(),
}));

// ============================================================
//  رابط الدعوة + القواعد
// ============================================================
screen('inv_link', async (ctx) => {
  const u    = await ensureUser(ctx.from);
  const me   = await ctx.api.getMe();
  const link = `https://t.me/${me.username}?start=${u.ref_code}`;

  const text = [
    t(ctx, 'inv.linkTitle'),
    `<blockquote><code>${link}</code></blockquote>`,
    '',
    t(ctx, 'inv.linkPitch', { reward: rewardUsd(), per: perReward() }),
    '',
    t(ctx, 'inv.rules', {
      daily:   Snum('ref_daily_cap', 10),
      total:   Snum('ref_total_cap', 100),
      support: T('support_user', '@XBLLT'),
    }),
  ].join('\n');

  return { text, kb: kb()
    .url('📤 ' + t(ctx, 'inv.btnLink'), `https://t.me/share/url?url=${encodeURIComponent(link)}`).row()
    .text(t(ctx, 'btn.back'), to('invites'))
    .build() };
});

// ============================================================
//  الإحصائيات
// ============================================================
screen('inv_stats', async (ctx) => {
  const u = await ensureUser(ctx.from);
  const s = await stats(u.id);
  const per = perReward();

  const text = [
    t(ctx, 'inv.statsTitle'), '',
    t(ctx, 'inv.stTotal',  { n: s.total }),
    t(ctx, 'inv.stJoin',   { n: s.join }),
    t(ctx, 'inv.stHuman',  { n: s.human }),
    t(ctx, 'inv.stActive', { n: s.active }),
    t(ctx, 'inv.stReady',  { n: s.ready }),
    t(ctx, 'inv.stPaid',   { n: s.paid }),
    t(ctx, 'inv.stEarned', { amount: money(u.ref_earned) }),
    '',
    t(ctx, 'inv.stFoot', { per, reward: rewardUsd() }),
  ].join('\n');

  const k = kb();
  if (s.ready >= per) k.add({ text: t(ctx, 'inv.btnClaim'), data: to('inv_claim'), style: 'success' }).row();
  k.text(t(ctx, 'btn.back'), to('invites'));

  return { text, kb: k.build() };
});

// ============================================================
//  صرف المكافأة — الحساب كله بدالة SQL ذرّية
// ============================================================
screen('inv_claim', async (ctx) => {
  const per = perReward();
  const [row] = await rpc('pay_referral_rewards', {
    p_referrer_tg: ctx.from.id,
    p_per_reward:  per,
    p_reward_usd:  rewardUsd(),
    p_total_cap:   Snum('ref_total_cap', 100),
  });

  if (!row || row.out_batches < 1) {
    const u = await ensureUser(ctx.from);
    const s = await stats(u.id);
    await ctx.answerCallbackQuery?.({
      text: t(ctx, 'inv.claimNone', { need: per - (s.ready % per) }), show_alert: true,
    }).catch(() => {});
    return { goto: 'inv_stats' };
  }

  return {
    text: t(ctx, 'inv.claimOk', {
      amount:  money(row.out_paid),
      n:       row.out_batches * per,
      balance: money(row.out_balance),
    }),
    kb: kb().text(t(ctx, 'btn.back'), to('invites')).build(),
  };
});
