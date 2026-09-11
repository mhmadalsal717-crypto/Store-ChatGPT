-- ============================================================
--  02 — الدوال الذرّية
--  كل الأمان المالي هون. شغّله بعد 01_schema.sql
-- ============================================================

-- ============================================================
--  ملاحظة: الدوال يلي بترجّع TABLE لازم DROP قبل التعديل،
--  لأن CREATE OR REPLACE ما بيقدر يغيّر نوع المخرجات.
--  هيك بتقدر تعيد تشغيل الملف كامل بأي وقت بدون أخطاء.
-- ============================================================
drop function if exists debit_and_open_order(bigint, text, text, text, int, numeric, numeric, text);
drop function if exists redeem_voucher(bigint, text);
drop function if exists credit_payment(text, text);


-- خصم الرصيد + فتح طلب PENDING بعملية واحدة غير قابلة للتجزئة.
-- شرط balance >= p_charge جوّا الـ UPDATE نفسه: طلبين متزامنين
-- ما بيقدروا يسحبوا أكتر من الرصيد المتاح.
create or replace function debit_and_open_order(
  p_tg_id    bigint,
  p_slug     text,
  p_name     text,
  p_provider text,
  p_qty      int,
  p_charge   numeric,
  p_cost     numeric,
  p_ext      text
) returns table (order_id bigint, new_balance numeric)
language plpgsql
as $$
declare
  v_user_id bigint;
  v_bal     numeric;
  v_oid     bigint;
begin
  select id into v_user_id from users where tg_id = p_tg_id for update;
  if v_user_id is null then raise exception 'USER_NOT_FOUND'; end if;

  update users
     set balance = balance - p_charge
   where id = v_user_id and balance >= p_charge
  returning balance into v_bal;

  if v_bal is null then raise exception 'INSUFFICIENT_BALANCE'; end if;

  insert into orders (user_id, external_order_id, product_slug, product_name,
                      provider_key, quantity, cost_usd, charged_usd, status)
  values (v_user_id, p_ext, p_slug, p_name, p_provider, p_qty, p_cost, p_charge, 'PENDING')
  returning id into v_oid;

  insert into ledger (user_id, amount, type, ref)
  values (v_user_id, -p_charge, 'PURCHASE', p_ext);

  return query select v_oid, v_bal;
end;
$$;


-- تثبيت الطلب بعد نجاحه: تحديث total_spent + عمولة الإحالة
create or replace function complete_order(
  p_ext        text,
  p_gg_code    text,
  p_actual     numeric,
  p_delivery   jsonb,
  p_ref_pct    numeric default 0
) returns void
language plpgsql
as $$
declare
  v_order   orders%rowtype;
  v_ref_id  bigint;
  v_bonus   numeric;
begin
  select * into v_order from orders where external_order_id = p_ext for update;
  if not found or v_order.status = 'COMPLETED' then return; end if;

  update orders
     set status = 'COMPLETED', gg_order_code = p_gg_code,
         actual_cost_usd = p_actual, delivery = p_delivery,
         error_code = null, updated_at = now()
   where id = v_order.id;

  update users
     set total_spent = total_spent + v_order.charged_usd
   where id = v_order.user_id;

  -- عمولة الإحالة على كل عملية شراء
  if p_ref_pct > 0 then
    select referred_by into v_ref_id from users where id = v_order.user_id;
    if v_ref_id is not null then
      v_bonus := round(v_order.charged_usd * p_ref_pct / 100, 2);
      if v_bonus > 0 then
        update users
           set balance = balance + v_bonus, ref_earned = ref_earned + v_bonus
         where id = v_ref_id;
        insert into ledger (user_id, amount, type, ref)
        values (v_ref_id, v_bonus, 'REFERRAL', p_ext);
      end if;
    end if;
  end if;
end;
$$;


-- إرجاع الرصيد — idempotent: ما بترجّع مرتين لنفس الطلب
create or replace function refund_order(
  p_ext        text,
  p_error_code text
) returns numeric
language plpgsql
as $$
declare
  v_order orders%rowtype;
  v_bal   numeric;
begin
  select * into v_order from orders where external_order_id = p_ext for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.status in ('COMPLETED', 'REFUNDED') then
    select balance into v_bal from users where id = v_order.user_id;
    return v_bal;
  end if;

  update users set balance = balance + v_order.charged_usd
   where id = v_order.user_id
  returning balance into v_bal;

  insert into ledger (user_id, amount, type, ref, note)
  values (v_order.user_id, v_order.charged_usd, 'REFUND', p_ext, p_error_code);

  update orders
     set status = 'REFUNDED', error_code = p_error_code, updated_at = now()
   where id = v_order.id;

  return v_bal;
end;
$$;


-- إيداع / تعديل رصيد
create or replace function credit_user(
  p_tg_id  bigint,
  p_amount numeric,
  p_type   text,
  p_ref    text
) returns numeric
language plpgsql
as $$
declare
  v_user_id bigint;
  v_bal     numeric;
begin
  select id into v_user_id from users where tg_id = p_tg_id for update;
  if v_user_id is null then raise exception 'USER_NOT_FOUND'; end if;

  update users set balance = balance + p_amount
   where id = v_user_id
  returning balance into v_bal;

  if v_bal < 0 then raise exception 'INSUFFICIENT_BALANCE'; end if;

  insert into ledger (user_id, amount, type, ref)
  values (v_user_id, p_amount, p_type, p_ref);

  return v_bal;
end;
$$;


-- استعمال قسيمة — ذرّي، ما بتنستعمل مرتين
create or replace function redeem_voucher(
  p_tg_id bigint,
  p_code  text
) returns table (amount numeric, new_balance numeric)
language plpgsql
as $$
declare
  v_user_id bigint;
  v_amount  numeric;
  v_bal     numeric;
begin
  select id into v_user_id from users where tg_id = p_tg_id;
  if v_user_id is null then raise exception 'USER_NOT_FOUND'; end if;

  update vouchers
     set used_by = v_user_id, used_at = now()
   where code = p_code and used_by is null
  returning vouchers.amount into v_amount;

  if v_amount is null then raise exception 'VOUCHER_INVALID'; end if;

  update users set balance = balance + v_amount
   where id = v_user_id
  returning balance into v_bal;

  insert into ledger (user_id, amount, type, ref)
  values (v_user_id, v_amount, 'DEPOSIT', 'voucher:' || p_code);

  return query select v_amount, v_bal;
end;
$$;


-- طلب سحب: بيحجز المبلغ فوراً من الرصيد
create or replace function open_withdrawal(
  p_tg_id  bigint,
  p_amount numeric
) returns bigint
language plpgsql
as $$
declare
  v_user_id bigint;
  v_bin     text;
  v_bal     numeric;
  v_id      bigint;
begin
  select id, binance_id into v_user_id, v_bin
    from users where tg_id = p_tg_id for update;
  if v_user_id is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_bin is null or v_bin = '' then raise exception 'NO_BINANCE_ID'; end if;

  update users set balance = balance - p_amount
   where id = v_user_id and balance >= p_amount
  returning balance into v_bal;
  if v_bal is null then raise exception 'INSUFFICIENT_BALANCE'; end if;

  insert into withdrawals (user_id, amount, binance_id)
  values (v_user_id, p_amount, v_bin)
  returning id into v_id;

  insert into ledger (user_id, amount, type, ref)
  values (v_user_id, -p_amount, 'WITHDRAW', 'wd:' || v_id);

  return v_id;
end;
$$;


-- رفض طلب سحب -> رجّع المبلغ
create or replace function reject_withdrawal(p_id bigint, p_note text)
returns void
language plpgsql
as $$
declare
  w withdrawals%rowtype;
begin
  select * into w from withdrawals where id = p_id for update;
  if not found or w.status <> 'PENDING' then return; end if;

  update users set balance = balance + w.amount where id = w.user_id;
  insert into ledger (user_id, amount, type, ref, note)
  values (w.user_id, w.amount, 'REFUND', 'wd:' || p_id, p_note);

  update withdrawals set status = 'REJECTED', admin_note = p_note where id = p_id;
end;
$$;


-- ============================================================
--  إضافة رصيد من دفعة — idempotent بالكامل
--  الويبهوك ممكن يجي أكتر من مرة لنفس الدفعة.
--  الشرط credited = false جوّا الـ UPDATE بيضمن الشحن مرة وحدة بس.
-- ============================================================
--  ⚠️ أسماء المخرجات مسبوقة بـ out_ عن قصد.
--  لو سمّيناها credited/amount بتتعارض مع أعمدة payments بنفس الاسم
--  وPostgres بيرمي "column reference is ambiguous" — يعني ولا دفعة بتنشحن.
create or replace function credit_payment(
  p_order_id   text,
  p_external   text default null
) returns table (out_credited boolean, out_balance numeric, out_amount numeric)
language plpgsql
as $$
declare
  v_pay   payments%rowtype;
  v_bal   numeric;
  v_ok    boolean;
begin
  select * into v_pay from payments where payments.order_id = p_order_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  -- علّمها مدفوعة ومشحونة بنفس العملية.
  -- شرط payments.credited = false هو يلي بيمنع الشحن المكرر.
  update payments
     set status = 'PAID',
         credited = true,
         external_id = coalesce(p_external, payments.external_id),
         updated_at = now()
   where payments.id = v_pay.id
     and payments.credited = false
  returning true into v_ok;

  if v_ok is null then
    -- انشحنت من قبل — رجّع الرصيد الحالي بدون أي تعديل
    select users.balance into v_bal from users where users.id = v_pay.user_id;
    return query select false, v_bal, v_pay.amount_usd;
    return;
  end if;

  update users set balance = users.balance + v_pay.amount_usd
   where users.id = v_pay.user_id
  returning users.balance into v_bal;

  insert into ledger (user_id, amount, type, ref, note)
  values (v_pay.user_id, v_pay.amount_usd, 'DEPOSIT', p_order_id, v_pay.method);

  return query select true, v_bal, v_pay.amount_usd;
end;
$$;
