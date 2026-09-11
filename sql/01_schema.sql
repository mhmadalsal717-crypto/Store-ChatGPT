Enter-- ============================================================
--  01 — الجداول
--  شغّله أولاً من Supabase → SQL Editor
-- ============================================================

-- ---------- المستخدمين ----------
create table if not exists users (
  id            bigserial primary key,
  tg_id         bigint unique not null,
  username      text,
  first_name    text,
  balance       numeric(12,2) not null default 0,
  total_spent   numeric(12,2) not null default 0,   -- لحساب المستوى
  banned        boolean not null default false,
  notify_stock  boolean not null default true,      -- إشعار توفّر المنتجات
  binance_id    text,                               -- لطلبات السحب
  referred_by   bigint references users(id),
  ref_code      text unique,
  ref_earned    numeric(12,2) not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists users_ref_idx on users(referred_by);

-- ---------- دفتر الحركات ----------
create table if not exists ledger (
  id         bigserial primary key,
  user_id    bigint not null references users(id),
  amount     numeric(12,2) not null,   -- + إيداع / − خصم
  type       text not null,            -- DEPOSIT PURCHASE REFUND REFERRAL WITHDRAW ADJUST
  ref        text,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists ledger_user_idx on ledger(user_id, created_at desc);

-- ---------- المستويات ----------
create table if not exists tiers (
  id           serial primary key,
  name         text not null,
  emoji        text default '⭐️',
  min_spent    numeric(12,2) not null default 0,
  discount_pct numeric(5,2)  not null default 0,
  sort_order   int not null default 0
);

-- ---------- المزوّدين ----------
create table if not exists providers (
  key             text primary key,
  name            text not null,
  emoji           text,
  custom_emoji_id text,
  sort_order      int default 100,
  visible         boolean not null default true,
  updated_at      timestamptz not null default now()
);

-- ---------- المنتجات ----------
create table if not exists products (
  slug            text primary key,
  product_code    text,
  name            text not null,
  provider_key    text references providers(key),
  emoji           text,
  custom_emoji_id text,
  delivery_type   text,                      -- LINK | COUPON | READY_ACCOUNT
  cost_price      numeric(12,2) not null,    -- yourPrice من GGSoma (تكلفتك)
  catalog_price   numeric(12,2),             -- catalogPrice (سعرهم المعلن — مرجع لك)
  sell_price      numeric(12,2) not null,    -- السعر المحسوب
  price_override  numeric(12,2),             -- سعر يدوي يتجاوز الحساب
  markup_pct      numeric(6,2),              -- هامش خاص بهالمنتج
  duration_days   int,
  warranty_days   int,
  in_stock        boolean not null default false,
  stock_count     int default 0,
  max_quantity    int default 1,
  -- ---- محتوى مسحوب من GGSoma تلقائياً (لا تكتبه يدوياً) ----
  description        text,
  description_format text default 'TEXT',   -- HTML | TEXT
  instructions       text,
  has_instructions   boolean default false,
  sensitive_delivery boolean default false,
  details_synced_at  timestamptz,
  gg_updated_at      timestamptz,
  -- ---- تجاوزات اختيارية من الأدمن ----
  desc_override   text,
  instr_override  text,
  -- ---- حالة المنتج ----
  prev_stock      int default 0,           -- لحساب فرق المخزون
  deleted_at      timestamptz,             -- اختفى من كتالوجهم
  paused          boolean not null default false,   -- بيع موقوف (حماية الهامش)
  paused_reason   text,
  last_cost       numeric(12,2),           -- التكلفة بالدورة السابقة
  visible         boolean not null default true,
  sort_order      int default 100,
  updated_at      timestamptz not null default now()
);
create index if not exists products_provider_idx on products(provider_key, sort_order);

-- ---------- الطلبات ----------
create table if not exists orders (
  id                bigserial primary key,
  user_id           bigint not null references users(id),
  external_order_id text unique not null,
  product_slug      text not null,
  product_name      text,
  provider_key      text,
  quantity          int not null default 1,
  cost_usd          numeric(12,2) not null,
  charged_usd       numeric(12,2) not null,
  actual_cost_usd   numeric(12,2),
  status            text not null default 'PENDING',
                    -- PENDING COMPLETED FAILED REFUNDED NEEDS_REVIEW
  gg_order_code     text,
  delivery          jsonb,
  error_code        text,
  attempts          int not null default 0,
  last_attempt_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists orders_user_idx    on orders(user_id, created_at desc);
create index if not exists orders_pending_idx on orders(status, last_attempt_at) where status = 'PENDING';

-- ---------- القسائم ----------
create table if not exists vouchers (
  code       text primary key,
  amount     numeric(12,2) not null,
  used_by    bigint references users(id),
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- طلبات السحب ----------
create table if not exists withdrawals (
  id         bigserial primary key,
  user_id    bigint not null references users(id),
  amount     numeric(12,2) not null,
  binance_id text,
  status     text not null default 'PENDING',   -- PENDING PAID REJECTED
  admin_note text,
  created_at timestamptz not null default now()
);

-- ---------- الإعدادات ----------
create table if not exists settings (
  key        text primary key,
  value      text,
  kind       text not null default 'text',   -- text | number | bool
  label      text,
  grp        text default 'عام',
  sort_order int default 100
);

-- ---------- النصوص الطويلة ----------
create table if not exists texts (
  key     text primary key,
  content text,
  label   text
);

-- ---------- الإيموجي (عادي + بريميوم) ----------
create table if not exists ui_emoji (
  key       text primary key,
  fallback  text not null,
  custom_id text,              -- معرّف الإيموجي المخصص (بريميوم)
  label     text
);

-- ---------- طابور إشعارات المخزون ----------
create table if not exists stock_alerts (
  id         bigserial primary key,
  slug       text not null,
  kind       text not null,          -- NEW | RESTOCK
  delta      int  not null default 0,
  stock_now  int  not null default 0,
  status     text not null default 'QUEUED',   -- QUEUED | SENT | SKIPPED
  sent       int default 0,
  failed     int default 0,
  created_at timestamptz not null default now()
);
create index if not exists stock_alerts_q on stock_alerts(status, created_at);

-- ---------- الدفعات (كل الطرق) ----------
create table if not exists payments (
  id          bigserial primary key,
  user_id     bigint not null references users(id),
  method      text not null,              -- CRYPTOMUS | STARS | BINANCE_PAY
  amount_usd  numeric(12,2) not null,
  stars       int,                        -- لدفعات النجوم
  status      text not null default 'PENDING',
                                          -- PENDING PAID FAILED EXPIRED CANCELLED
  order_id    text unique not null,       -- معرّفنا نحنا
  external_id text,                       -- uuid كريبتوموس / charge_id النجوم / TxID بايننس
  pay_url     text,
  payload     jsonb,
  credited    boolean not null default false,
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists payments_user_idx on payments(user_id, created_at desc);
create index if not exists payments_open_idx on payments(status, expires_at) where status = 'PENDING';

-- ============================================================
--  ترقية الأعمدة
--  «create table if not exists» ما بيضيف أعمدة لجدول موجود.
--  هالقسم بيخلّي الملف آمن للتشغيل مرة تانية بعد أي تحديث.
-- ============================================================
alter table products add column if not exists catalog_price      numeric(12,2);
alter table products add column if not exists description_format text default 'TEXT';
alter table products add column if not exists instructions       text;
alter table products add column if not exists has_instructions   boolean default false;
alter table products add column if not exists sensitive_delivery boolean default false;
alter table products add column if not exists details_synced_at  timestamptz;
alter table products add column if not exists gg_updated_at      timestamptz;
alter table products add column if not exists desc_override      text;
alter table products add column if not exists instr_override     text;
alter table products add column if not exists prev_stock         int default 0;
alter table products add column if not exists deleted_at         timestamptz;
alter table products add column if not exists paused             boolean not null default false;
alter table products add column if not exists paused_reason      text;
alter table products add column if not exists last_cost          numeric(12,2);

alter table users    add column if not exists total_spent  numeric(12,2) not null default 0;
alter table users    add column if not exists notify_stock boolean not null default true;
alter table users    add column if not exists binance_id   text;
alter table users    add column if not exists ref_earned   numeric(12,2) not null default 0;

alter table providers add column if not exists custom_emoji_id text;
alter table orders    add column if not exists provider_key    text;
