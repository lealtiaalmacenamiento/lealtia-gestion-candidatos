-- Campaign progress summary view aggregates per-campaign counters.
-- Drop first to allow re-running locally without schema conflicts.
drop view if exists public.campaign_progress_summary;

create view public.campaign_progress_summary as
with status_counts as (
    select
        campaign_id,
        status::text as status,
        count(*) as count
    from public.campaign_progress
    group by campaign_id, status
),
status_map as (
    select
        campaign_id,
        jsonb_object_agg(status, count order by status) as status_counts
    from status_counts
    group by campaign_id
)
select
    cp.campaign_id,
    count(*) as total,
    count(*) filter (where cp.eligible) as eligible_total,
    count(*) filter (where cp.status = 'completed') as completed_total,
    coalesce(sm.status_counts, '{}'::jsonb) as status_counts
from public.campaign_progress cp
left join status_map sm on sm.campaign_id = cp.campaign_id
group by cp.campaign_id, sm.status_counts;

comment on view public.campaign_progress_summary is 'Aggregated progress counters (totals and per-status) for each campaign.';
