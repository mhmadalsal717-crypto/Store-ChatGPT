import 'dotenv/config';

const need = (n) => {
  const v = process.env[n];
  if (!v) throw new Error(`متغيّر البيئة الناقص: ${n}`);
  return v;
};

export const cfg = {
  bot: {
    token:      need('BOT_TOKEN'),
    adminIds:   String(process.env.ADMIN_IDS || '').split(',').filter(Boolean).map(Number),
    webhookUrl: process.env.WEBHOOK_URL || null,
    secret:     process.env.WEBHOOK_SECRET || 'change-me',
  },
  gg: {
    baseUrl: process.env.GG_BASE_URL || 'https://ggsoma.store/api/partner/v1',
    apiKey:  need('GG_API_KEY'),
  },
  db: {
    url: need('SUPABASE_URL'),
    key: need('SUPABASE_SERVICE_KEY'),
  },
  cryptomus: {
    merchant:   process.env.CRYPTOMUS_MERCHANT_ID || '',
    apiKey:     process.env.CRYPTOMUS_API_KEY || '',
    // مفتاح منفصل للتحقق من الويبهوك — لو ما انحطّ منستعمل apiKey
    paymentKey: process.env.CRYPTOMUS_PAYMENT_KEY || process.env.CRYPTOMUS_API_KEY || '',
  },
  port: Number(process.env.PORT || 3000),
};

export const isAdmin = (id) => cfg.bot.adminIds.includes(Number(id));
