// ============================================================
//  القائمة الرئيسية — Reply Keyboard
//
//  هاي الأزرار بتظهر تحت حقل الكتابة (مو ملتصقة بالرسالة)،
//  وبتضل ثابتة مهما تنقّل المستخدم — نفس شكل بوت GGSoma.
//
//  الفرق التقني: زر الـ Reply Keyboard لما ينضغط بيبعت
//  رسالة نصية عادية بنفس نص الزر، مو callback_query.
//  لهيك منمسك كل نص بـ bot.hears ومنحوّله للشاشة المطلوبة.
//
//  ⚠️ أي تعديل على نص زر هون لازم يتطابق حرفياً مع المفتاح
//     بجدول MENU تحت، وإلا الزر بيصير ميّت.
// ============================================================
import { Keyboard } from 'grammy';
import { isAdmin } from '../config.js';

// ---------- نصوص الأزرار ----------
export const L = {
  products: '🛒 المنتجات',
  profile:  '👤 ملفي',
  invites:  '🎁 الدعوات',
  voucher:  '💳 شحن بكود',
  topup:    '💰 شحن رصيد',
  help:     '❓ المساعدة',
  policy:   '🛡 سياسة البوت',
  admin:    '⚙️ لوحة التحكم',
};

/** نص الزر -> اسم الشاشة */
export const MENU = {
  [L.products]: 'providers',
  [L.profile]:  'profile',
  [L.invites]:  'invites',
  [L.voucher]:  'voucher',
  [L.topup]:    'topup',
  [L.help]:     'help',
  [L.policy]:   'policy',
  [L.admin]:    'admin',
};

/**
 * بناء الكيبورد. زر لوحة التحكم بيظهر للأدمن بس.
 * resized  = ارتفاع مضبوط بدل أزرار عملاقة
 * persistent = تضل ظاهرة وما تنطوي
 */
export function mainMenu(tgId) {
  const k = new Keyboard()
    .text(L.products).row()
    .text(L.profile).text(L.invites).row()
    .text(L.voucher).text(L.topup).row()
    .text(L.help).text(L.policy).row();

  if (isAdmin(tgId)) k.text(L.admin).row();

  return k.resized().persistent();
}
