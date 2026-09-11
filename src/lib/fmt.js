// أدوات التنسيق
export const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const money = (n) => `${Number(n || 0).toFixed(2)}$`;
export const RULE  = '━━━━━━━━━━━━━━━';

/** اقتباس قابل للطي — نفس الشكل يلي بصور بوت GGSoma */
export const quote = (title, body) =>
  `<blockquote expandable><b>${title}</b>\n${body}</blockquote>`;

/** شريط تقدّم نصّي */
export function bar(pct, len = 12) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const f = Math.round((p / 100) * len);
  return '█'.repeat(f) + '░'.repeat(len - f);
}

export const trim = (s, n = 24) => {
  const v = String(s || '');
  return v.length > n ? v.slice(0, n - 1) + '…' : v;
};

export const arDate = (d) => new Date(d).toLocaleDateString('ar-EG');
export const arTime = (d) => new Date(d).toLocaleString('ar-EG');

export const deliveryLabel = (t) =>
  ({ LINK: 'رابط تفعيل', COUPON: 'كود', READY_ACCOUNT: 'حساب جاهز' }[t] || t || '—');

export const statusIcon = (s) =>
  ({ COMPLETED: '✅', PENDING: '⏳', FAILED: '❌', REFUNDED: '↩️', NEEDS_REVIEW: '🔴',
     APPROVED: '✅', REJECTED: '❌', PAID: '✅' }[s] || '•');
