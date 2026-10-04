-- Independent reconstruction by summing worked gaps, not total minus paused time.
with gaps as (
 select s.id,p.paused_at-coalesce(lag(p.resumed_at) over(partition by s.id order by p.paused_at,p.id),s.started_at) as worked_gap
 from public.work_sessions s join public.work_pauses p on p.work_session_id=s.id where s.status='finished'
), reconstructed as (
 select s.id,s.worked_seconds,
 floor(coalesce((select sum(extract(epoch from g.worked_gap)) from gaps g where g.id=s.id),0)
 +extract(epoch from(s.finished_at-coalesce((select max(p.resumed_at) from public.work_pauses p where p.work_session_id=s.id),s.started_at))))::bigint as independent_seconds
 from public.work_sessions s where s.status='finished'
)
select count(*) as finished_sessions,count(*) filter(where worked_seconds<>independent_seconds) as mismatches,
 (select count(*) from public.work_sessions where status<>'finished') as open_sessions,
 (select count(*) from public.work_sessions s where not exists(select 1 from public.work_session_rates r where r.work_session_id=s.id)) as missing_rates,
 (select count(*) from public.work_sessions a join public.work_sessions b on a.user_id=b.user_id and a.id<b.id where tstzrange(a.started_at,a.finished_at,'[)')&&tstzrange(b.started_at,b.finished_at,'[)')) as overlaps
 from reconstructed;
