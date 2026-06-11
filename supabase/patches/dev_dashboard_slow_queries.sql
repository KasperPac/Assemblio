create or replace function public.get_slow_queries()
returns table(
  query text,
  calls bigint,
  mean_time double precision,
  total_time double precision
)
language sql
security definer
as $$
  select
    left(query, 200) as query,
    calls,
    round(mean_exec_time::numeric, 2)::double precision as mean_time,
    round(total_exec_time::numeric, 2)::double precision as total_time
  from pg_stat_statements
  where userid = (select usesysid from pg_user where usename = current_user)
  order by mean_exec_time desc
  limit 15;
$$;
