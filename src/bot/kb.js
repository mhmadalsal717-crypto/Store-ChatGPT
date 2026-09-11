// ============================================================
//  بناء لوحات الأزرار
//  style: 'success' أخضر · 'danger' أحمر · 'primary' أزرق  (Bot API 9.4)
//  icon_custom_emoji_id: إيموجي مخصص على الزر (بريميوم)
// ============================================================
import { Sbool } from '../lib/settings.js';

export class KB {
  constructor() { this.rows = []; this.cur = []; }

  /** @param {{text, data?, url?, style?, icon?, switchInline?}} b */
  add(b) {
    const btn = { text: b.text };
    if (b.data) {
      // تلغرام بيرفض callback_data فوق 64 بايت — الزر بيصير ميّت بصمت.
      // منطبع تحذير بدل ما نكتشفها من شكوى زبون.
      if (Buffer.byteLength(b.data, 'utf8') > 64) {
        console.error('[kb] callback_data تجاوز 64 بايت:', b.data);
      }
      btn.callback_data = b.data;
    }
    if (b.url) btn.url = b.url;
    if (b.switchInline !== undefined) btn.switch_inline_query_current_chat = b.switchInline;
    if (b.style && Sbool('button_colors', true)) btn.style = b.style;
    if (b.icon && Sbool('premium_emoji', false)) btn.icon_custom_emoji_id = b.icon;
    this.cur.push(btn);
    return this;
  }

  text(text, data, style) { return this.add({ text, data, style }); }
  url(text, url)          { return this.add({ text, url }); }

  row() {
    if (this.cur.length) { this.rows.push(this.cur); this.cur = []; }
    return this;
  }

  /** ترتيب شبكي بعدد أعمدة */
  grid(items, { cols = 2, label, data, style, icon } = {}) {
    items.forEach((it, i) => {
      this.add({ text: label(it), data: data(it),
                 style: style?.(it), icon: icon?.(it) });
      if ((i + 1) % cols === 0) this.row();
    });
    this.row();
    return this;
  }

  /** أزرار الصفحات */
  pager({ page, totalPages, make }) {
    if (totalPages <= 1) return this;
    this.row();
    if (page > 1) this.add({ text: '‹ السابق', data: make(page - 1) });
    this.add({ text: `${page}/${totalPages}`, data: 'noop' });
    if (page < totalPages) this.add({ text: 'التالي ›', data: make(page + 1) });
    return this.row();
  }

  build() { this.row(); return { inline_keyboard: this.rows }; }
}

export const kb = () => new KB();

/** لون زر المنتج حسب المخزون — أخضر متوفّر، أحمر نافد */
export const stockStyle = (p) => (p.in_stock ? 'success' : 'danger');
