-- Subscription spans and payment remarks.

alter table payments add column if not exists remark text;
