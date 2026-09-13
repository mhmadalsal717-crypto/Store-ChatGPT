// ============================================================
//  محرّك التنقّل — تعديل نفس الرسالة بدل إرسال رسالة جديدة.
//  هاد يلي بيخلّي البوت يحس كتطبيق مو كشات.
// ============================================================
const screens = new Map();

/** @param {(ctx, args) => Promise<{text, kb}>} fn */
export const screen = (name, fn) => screens.set(name, fn);

/** ترميز مسار الشاشة داخل callback_data (الحد 64 بايت) */
export const to = (name, ...args) => ['n', name, ...args].join(':');

export async function go(ctx, name, args = [], { forceNew = false } = {}) {
  // «إغلاق» — بيمسح الرسالة بدل ما يرجّع للرئيسية.
  // صار ممكن بس بعد ما نقلنا القائمة لكيبورد ثابت: المستخدم
  // ما بيضيع لأن القائمة دايماً تحت إيده.
  if (name === 'close') {
    try { await ctx.deleteMessage(); }
    catch { await ctx.editMessageText('✔️').catch(() => {}); }
    return;
  }

  const fn = screens.get(name);
  if (!fn) throw new Error('شاشة غير معروفة: ' + name);

  const view = await fn(ctx, args);
  const opts = {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: view.kb,
  };

  if (ctx.callbackQuery && !forceNew) {
    try { await ctx.editMessageText(view.text, opts); return; }
    catch (e) {
      // ضغط نفس الزر مرتين — تجاهله بصمت
      if (/not modified/i.test(e.description || e.message || '')) return;
      // الرسالة قديمة/محذوفة -> ابعت جديدة
    }
  }
  await ctx.reply(view.text, opts);
}

/** حالة تحميل: بدونها المستخدم بيحس البوت متجمّد فبيضغط مرتين */
export async function withLoading(ctx, loadingText, task) {
  if (ctx.callbackQuery) {
    await ctx.editMessageText(loadingText, { parse_mode: 'HTML' }).catch(() => {});
  } else {
    await ctx.replyWithChatAction('typing').catch(() => {});
  }
  return task();
}

export const hasScreen = (name) => screens.has(name);
