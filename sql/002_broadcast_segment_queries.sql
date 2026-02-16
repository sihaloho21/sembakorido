-- Segment query templates for Broadcast Promo (PostgreSQL)
-- Adjust table/column names if your schema differs.

-- Parameters (examples):
-- :as_of_date                  -> '2026-02-16'
-- :high_spender_threshold      -> 1000000
-- :dormant_days                -> 30
-- :new_user_days               -> 7
-- :inactive_days               -> 14

-- Normalized order success status:
-- paid, selesai, terima, diterima

-- 1) DORMANT_30D
with orders_ok as (
  select
    regexp_replace(coalesce(o.phone, ''), '[^0-9]', '', 'g') as phone_key,
    o.tanggal_pesanan::date as order_date
  from orders o
  where lower(coalesce(o.status, '')) in ('paid', 'selesai', 'terima', 'diterima')
),
user_last_order as (
  select phone_key, max(order_date) as last_order_date
  from orders_ok
  group by phone_key
)
select
  u.id as user_id,
  u.nama as customer_name,
  regexp_replace(coalesce(u.whatsapp, ''), '[^0-9]', '', 'g') as phone_norm,
  ulo.last_order_date
from users u
join user_last_order ulo
  on ulo.phone_key = regexp_replace(coalesce(u.whatsapp, ''), '[^0-9]', '', 'g')
where lower(coalesce(u.status, 'aktif')) in ('aktif', 'active')
  and ulo.last_order_date < (:as_of_date::date - (:dormant_days || ' day')::interval)::date;

-- 2) NEW_USER_NO_ORDER_7D
with orders_ok as (
  select distinct regexp_replace(coalesce(o.phone, ''), '[^0-9]', '', 'g') as phone_key
  from orders o
  where lower(coalesce(o.status, '')) in ('paid', 'selesai', 'terima', 'diterima')
)
select
  u.id as user_id,
  u.nama as customer_name,
  regexp_replace(coalesce(u.whatsapp, ''), '[^0-9]', '', 'g') as phone_norm,
  u.tanggal_daftar::date as register_date
from users u
left join orders_ok oo
  on oo.phone_key = regexp_replace(coalesce(u.whatsapp, ''), '[^0-9]', '', 'g')
where lower(coalesce(u.status, 'aktif')) in ('aktif', 'active')
  and u.tanggal_daftar::date >= (:as_of_date::date - (:new_user_days || ' day')::interval)::date
  and oo.phone_key is null;

-- 3) HIGH_SPENDER_INACTIVE_14D
with orders_ok as (
  select
    regexp_replace(coalesce(o.phone, ''), '[^0-9]', '', 'g') as phone_key,
    o.tanggal_pesanan::date as order_date,
    coalesce(o.total, 0)::numeric as total
  from orders o
  where lower(coalesce(o.status, '')) in ('paid', 'selesai', 'terima', 'diterima')
),
gmv_90d as (
  select
    phone_key,
    sum(total) as total_90d,
    max(order_date) as last_order_date
  from orders_ok
  where order_date >= (:as_of_date::date - interval '90 day')::date
  group by phone_key
)
select
  u.id as user_id,
  u.nama as customer_name,
  regexp_replace(coalesce(u.whatsapp, ''), '[^0-9]', '', 'g') as phone_norm,
  g.total_90d,
  g.last_order_date
from users u
join gmv_90d g
  on g.phone_key = regexp_replace(coalesce(u.whatsapp, ''), '[^0-9]', '', 'g')
where lower(coalesce(u.status, 'aktif')) in ('aktif', 'active')
  and g.total_90d >= :high_spender_threshold
  and g.last_order_date < (:as_of_date::date - (:inactive_days || ' day')::interval)::date;

-- 4) Frequency cap guard (<= 2 sends in last 7 days per user)
select
  t.user_id,
  count(*) as sent_7d
from wa_message_log t
where t.sent_at >= now() - interval '7 day'
  and t.status in ('sent', 'delivered', 'read')
group by t.user_id
having count(*) >= 2;

