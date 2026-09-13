// ============================================================
//  محرّك اللغات
//
//  النصوص نفسها بمجلد src/lang — ما في ولا نص هون.
//  هالملف بس بيوصّل: يجيب اللغة، يعبّي المتغيّرات، يحفظ الاختيار.
//
//  الاستعمال بالشاشات:
//      t(ctx, 'shop.pick')
//      t(ctx, 'item.low', { n: 3 })
//
//  ctx.lang بينتحدّد مرة وحدة بالحارس العام (bot/index.js).
// ============================================================
import { db } from './db.js';
import { T } from './settings.js';
import ar from '../lang/ar.js';
import en from '../lang/en.js';

const DICT = { ar, en };

export const LANGS = ['ar', 'en'];
export const DEFAULT_LANG = 'ar';

/**
 * جلب نص وتعبئة المتغيّرات.
 * @param ctxOrLang  ctx كامل أو رمز لغة ('ar' / 'en')
 * @param key        مثل 'shop.pick'
 * @param vars       { name: 'قيمة' } بتستبدل {name} بالنص
 */
export function t(ctxOrLang, key, vars) {
  const lang = typeof ctxOrLang === 'string'
    ? ctxOrLang
    : (ctxOrLang?.lang || DEFAULT_LANG);

  // ناقص بالإنكليزي؟ رجّع العربي. ناقص بالتنين؟ رجّع المفتاح
  // نفسه — بيبيّن فوراً بالشاشة إنو في نص ناسي.
  let s = DICT[lang]?.[key] ?? DICT[DEFAULT_LANG][key] ?? key;

  if (vars) for (const [k, v] of Object.entries(vars)) {
    s = s.replaceAll(`{${k}}`, String(v ?? ''));
  }
  return s;
}

/** كل صيغ مفتاح معيّن — لبناء جدول توجيه أزرار الكيبورد */
export const allOf = (key) => LANGS.map((l) => t(l, key));

/**
 * نصوص طويلة قابلة للتحرير من لوحة التحكم (ترحيب، سياسة، مساعدة).
 * محفوظة بجدول texts مفتاحين: welcome و welcome_en.
 */
export const longText = (lang, key, fallback = '') =>
  lang === 'en' ? T(`${key}_en`, T(key, fallback)) : T(key, fallback);

export const welcomeText = (lang) =>
  longText(lang, 'welcome', '<blockquote>👋 مرحبًا بك!</blockquote>');

export async function setLang(tgId, lang) {
  const v = LANGS.includes(lang) ? lang : DEFAULT_LANG;
  await db.from('users').update({ lang: v }).eq('tg_id', tgId);
  return v;
}
