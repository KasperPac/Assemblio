-- Server-side filter/sort/paginate for the orders table. SECURITY INVOKER so the
-- caller's RLS on orders/order_line applies; p_tenant_id is belt-and-suspenders.
create or replace function public.list_orders(
  p_tenant_id  uuid,
  p_search     text default null,
  p_status     text default null,
  p_source     text default null,
  p_historical text default 'all',   -- 'all' | 'only' | 'hide'
  p_date_from  date default null,
  p_date_to    date default null,
  p_sort       text default 'order_date',
  p_dir        text default 'desc',
  p_limit      int  default 25,
  p_offset     int  default 0
)
returns table (
  id uuid,
  order_number text,
  customer_email text,
  status text,
  source text,
  target_ship_date timestamptz,
  shopify_processed_at timestamptz,
  shopify_created_at timestamptz,
  fulfilled_at timestamptz,
  historical boolean,
  order_total numeric,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      o.id, o.order_number, o.customer_email, o.status, o.source,
      o.target_ship_date, o.shopify_processed_at, o.shopify_created_at,
      o.fulfilled_at, o.historical,
      coalesce(ol.total, 0) as order_total,
      coalesce(o.shopify_processed_at, o.shopify_created_at) as order_date
    from public.orders o
    left join (
      select order_id, sum(line_sell_price) as total
      from public.order_line
      where tenant_id = p_tenant_id
      group by order_id
    ) ol on ol.order_id = o.id
    where o.tenant_id = p_tenant_id
      and (p_search is null or p_search = ''
           or o.order_number ilike '%' || p_search || '%'
           or o.customer_email ilike '%' || p_search || '%')
      and (p_status is null or o.status = p_status)
      and (p_source is null or o.source = p_source)
      and (p_historical = 'all'
           or (p_historical = 'only' and o.historical)
           or (p_historical = 'hide' and not o.historical))
      and (p_date_from is null
           or coalesce(o.shopify_processed_at, o.shopify_created_at) >= p_date_from)
      and (p_date_to is null
           or coalesce(o.shopify_processed_at, o.shopify_created_at) < (p_date_to + 1))
  )
  select
    id, order_number, customer_email, status, source, target_ship_date,
    shopify_processed_at, shopify_created_at, fulfilled_at, historical, order_total,
    count(*) over() as total_count
  from base
  order by
    case when p_sort = 'order_number'     and p_dir = 'asc'  then order_number end asc nulls last,
    case when p_sort = 'order_number'     and p_dir = 'desc' then order_number end desc nulls last,
    case when p_sort = 'customer_email'   and p_dir = 'asc'  then customer_email end asc nulls last,
    case when p_sort = 'customer_email'   and p_dir = 'desc' then customer_email end desc nulls last,
    case when p_sort = 'status'           and p_dir = 'asc'  then status end asc nulls last,
    case when p_sort = 'status'           and p_dir = 'desc' then status end desc nulls last,
    case when p_sort = 'target_ship_date' and p_dir = 'asc'  then target_ship_date end asc nulls last,
    case when p_sort = 'target_ship_date' and p_dir = 'desc' then target_ship_date end desc nulls last,
    case when p_sort = 'total'            and p_dir = 'asc'  then order_total end asc nulls last,
    case when p_sort = 'total'            and p_dir = 'desc' then order_total end desc nulls last,
    case when p_sort = 'order_date'       and p_dir = 'asc'  then order_date end asc nulls last,
    case when p_sort = 'order_date'       or p_dir = 'desc' then order_date end desc nulls last,
    id
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;
