begin;

insert into public.system_configuration (id, data, updated_at)
values (
  'document_policy',
  jsonb_build_object('corMode', 'cor_only', 'manualReviewEnabled', true),
  now()
)
on conflict (id) do update
set data = public.system_configuration.data || jsonb_build_object(
      'corMode', coalesce(public.system_configuration.data->>'corMode', 'cor_only'),
      'manualReviewEnabled', coalesce(
        (public.system_configuration.data->>'manualReviewEnabled')::boolean,
        true
      )
    ),
    updated_at = now();

commit;
