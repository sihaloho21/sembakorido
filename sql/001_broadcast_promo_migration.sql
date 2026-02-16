-- Broadcast Promo Segmentation + Queueing schema (PostgreSQL)
-- Safe to run multiple times (IF NOT EXISTS).

create table if not exists segment_definition (
  id bigserial primary key,
  code varchar(64) not null unique,
  name varchar(120) not null,
  description text,
  is_active boolean not null default true,
  cooldown_hours int not null default 72,
  max_send_7d int not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wa_template (
  id bigserial primary key,
  code varchar(64) not null unique,
  category varchar(32) not null,
  language varchar(10) not null default 'id',
  body text not null,
  cta_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists promo_campaign (
  id bigserial primary key,
  code varchar(64) not null unique,
  name varchar(160) not null,
  status varchar(20) not null default 'draft', -- draft/scheduled/running/stopped
  channel varchar(20) not null default 'whatsapp',
  template_code varchar(64) not null,
  promo_code_prefix varchar(32),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by varchar(120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promo_campaign_status_chk check (status in ('draft', 'scheduled', 'running', 'stopped'))
);

create table if not exists campaign_segment_map (
  id bigserial primary key,
  campaign_id bigint not null references promo_campaign(id) on delete cascade,
  segment_id bigint not null references segment_definition(id) on delete cascade,
  priority int not null default 100,
  unique (campaign_id, segment_id)
);

create table if not exists campaign_target (
  id bigserial primary key,
  campaign_id bigint not null references promo_campaign(id) on delete cascade,
  segment_id bigint references segment_definition(id),
  user_id varchar(64) not null,
  phone_norm varchar(20) not null,
  customer_name varchar(160),
  voucher_code varchar(64),
  short_link text,
  payload_json jsonb,
  status varchar(20) not null default 'queued', -- queued/sent/delivered/read/failed/skipped
  attempt_count int not null default 0,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  provider_message_id varchar(128),
  error_message text,
  unique (campaign_id, user_id)
);

create table if not exists wa_message_log (
  id bigserial primary key,
  campaign_id bigint references promo_campaign(id) on delete set null,
  target_id bigint references campaign_target(id) on delete set null,
  user_id varchar(64) not null,
  phone_norm varchar(20) not null,
  template_code varchar(64) not null,
  status varchar(20) not null, -- sent/delivered/read/failed/skipped
  provider_message_id varchar(128),
  error_message text,
  sent_at timestamptz not null default now(),
  meta_json jsonb
);

create index if not exists idx_campaign_target_campaign_status
  on campaign_target(campaign_id, status, queued_at);

create index if not exists idx_campaign_target_phone
  on campaign_target(phone_norm);

create index if not exists idx_wa_message_log_user_sent_at
  on wa_message_log(user_id, sent_at desc);

create index if not exists idx_wa_message_log_phone_sent_at
  on wa_message_log(phone_norm, sent_at desc);

create index if not exists idx_campaign_segment_map_campaign_priority
  on campaign_segment_map(campaign_id, priority asc);

