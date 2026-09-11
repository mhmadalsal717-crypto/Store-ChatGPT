// عرض محتوى التسليم — مشترك بين الشراء المباشر والمُصالح وسجل الطلبات
import { esc } from '../lib/fmt.js';

export function renderDelivery(d) {
  if (!d) return '';
  if (d.lines?.length) {
    return d.lines
      .map((l, i) => `${i + 1}. <code>${esc(l.code || l.link || '')}</code>`)
      .join('\n');
  }
  if (d.link)
    return `🔗 <b>رابط التفعيل:</b>\n<code>${esc(d.link)}</code>` + instr(d);
  if (d.code)
    return `🎟 <b>الكود:</b>\n<code>${esc(d.code)}</code>` + instr(d);
  if (d.content)
    return `🔐 <b>بيانات الحساب:</b>\n<code>${esc(d.content)}</code>\n\n` +
           `⚠️ غيّر كلمة السر فوراً واحتفظ فيها بمكان آمن.`;
  return '';
}

const instr = (d) => (d.instructions ? `\n\n📝 ${esc(d.instructions)}` : '');
