begin;
-- Preserve arbitrary numeric accuracy across JSON/JavaScript; Admin RLS still applies.
create view public.work_session_rates_read with (security_invoker=true) as
 select work_session_id,hourly_rate_applied::text as hourly_rate_applied,currency,source,captured_by,captured_at
 from public.work_session_rates;
revoke all on public.work_session_rates_read from public,anon,authenticated,service_role;
grant select on public.work_session_rates_read to authenticated;
commit;
