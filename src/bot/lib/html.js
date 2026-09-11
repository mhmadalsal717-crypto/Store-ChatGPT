// ============================================================
//  منظّف HTML لتلغرام
//
//  ليش ضروري: نصوص GGSoma بترجع بـ descriptionFormat: "HTML"،
//  وممكن تحتوي <div> أو <p> أو <ul>. تلغرام بيرفض أي وسم برّا
//  قائمته ويرمي "Unsupported start tag" — يعني الرسالة كلها بتفشل
//  والزبون ما بيشوف المنتج.
//
//  هون منحوّل الوسوم البنيوية لأسطر، ومنشيل غير المدعوم مع الإبقاء
//  على النص جوّاه، ومنترك المدعوم زي ما هو.
// ============================================================

// الوسوم يلي تلغرام بيقبلها
const ALLOWED = new Set([
  'b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del',
  'a', 'code', 'pre', 'blockquote', 'span', 'tg-emoji', 'tg-spoiler',
]);

// وسوم بنيوية -> سطر جديد
const BLOCK = /<\/?(p|div|br|li|ul|ol|h[1-6]|tr|section|article)[^>]*>/gi;

/** تهريب & يلي مو جزء من كيان HTML أصلاً */
const fixAmp = (s) => s.replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,7}|#\d{1,7}|#[xX][0-9a-fA-F]{1,6});)/g, '&amp;');

/** تهريب < يلي مو بداية وسم فعلي — مثل «الطول < 5» */
const fixLt = (s) => s.replace(/<(?!\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?\/?>)/g, '&lt;');

/**
 * @param {string} html   النص الخام من GGSoma
 * @param {string} format 'HTML' أو 'TEXT'
 * @returns {string} نص آمن لإرساله بـ parse_mode: 'HTML'
 */
export function sanitizeTgHtml(html, format = 'TEXT') {
  if (!html) return '';
  let s = String(html);

  // نص عادي: هرّب كل شي وخلص
  if (String(format).toUpperCase() !== 'HTML') {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
  }

  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');   // شيل السكربتات كاملة
  s = s.replace(/<!--[\s\S]*?-->/g, '');                  // والتعليقات
  s = s.replace(BLOCK, '\n');                             // بنيوي -> سطر

  // شيل أي وسم غير مدعوم مع الإبقاء على محتواه
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s[^>]*)?)\/?>/g, (m, tag, attrs) => {
    const t = tag.toLowerCase();
    if (!ALLOWED.has(t)) return '';
    if (m.startsWith('</')) return `</${t}>`;

    // نظّف الخصائص — بس المسموح لكل وسم
    if (t === 'a') {
      const href = /href\s*=\s*["']([^"']+)["']/i.exec(attrs);
      const url = href?.[1] || '';
      return /^(https?:|tg:)/i.test(url) ? `<a href="${url.replace(/"/g, '%22')}">` : '';
    }
    if (t === 'tg-emoji') {
      const id = /emoji-id\s*=\s*["'](\d+)["']/i.exec(attrs);
      return id ? `<tg-emoji emoji-id="${id[1]}">` : '';
    }
    if (t === 'span') {
      return /tg-spoiler/i.test(attrs) ? '<span class="tg-spoiler">' : '';
    }
    if (t === 'blockquote') {
      return /expandable/i.test(attrs) ? '<blockquote expandable>' : '<blockquote>';
    }
    if (t === 'pre') {
      const lang = /language-([a-zA-Z0-9+#-]+)/i.exec(attrs);
      return lang ? `<pre><code class="language-${lang[1]}">` : '<pre>';
    }
    return `<${t}>`;
  });

  s = fixAmp(s);
  s = fixLt(s);
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return closeUnbalanced(s);
}

/**
 * موازنة الوسوم:
 *  - بتشيل أي </tag> يتيم (بيصير لما ننفي وسم فاتح، مثل رابط شرير)
 *  - وبتقفل أي <tag> ضلّ مفتوح
 * أي خلل بالاتنين = تلغرام بيرفض الرسالة كلها.
 */
function closeUnbalanced(s) {
  const stack = [];
  const orphans = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)[^>]*>/g;
  let m;
  while ((m = re.exec(s))) {
    const t = m[2].toLowerCase();
    if (!ALLOWED.has(t)) continue;
    if (m[1]) {
      const i = stack.lastIndexOf(t);
      if (i === -1) orphans.push([m.index, m.index + m[0].length]);
      else stack.splice(i, 1);
    } else stack.push(t);
  }

  // شيل اليتامى من الآخر للأول حتى ما تتغيّر المواقع
  let out = s;
  for (let i = orphans.length - 1; i >= 0; i--) {
    out = out.slice(0, orphans[i][0]) + out.slice(orphans[i][1]);
  }
  return out + stack.reverse().map((t) => `</${t}>`).join('');
}

/** قصّ آمن — ما بيقصّ بنص وسم */
export function clip(s, max = 700) {
  if (!s || s.length <= max) return s;
  let cut = s.slice(0, max);
  const lastOpen = cut.lastIndexOf('<');
  if (lastOpen > cut.lastIndexOf('>')) cut = cut.slice(0, lastOpen);
  return closeUnbalanced(cut.trim()) + '…';
}
