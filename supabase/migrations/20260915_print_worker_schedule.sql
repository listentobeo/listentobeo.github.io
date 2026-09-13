begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create or replace function public.print_configure_worker(p_url text, p_secret text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_job bigint;
begin
  if p_url <> 'https://wphqcccliiwdvwdjgrmc.supabase.co' or length(p_secret) < 24 then
    raise exception 'Invalid worker configuration';
  end if;
  select id into v_id from vault.secrets where name = 'beo_print_worker_secret';
  if v_id is null then
    perform vault.create_secret(p_secret, 'beo_print_worker_secret');
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
  select cron.schedule('beo-print-worker', '* * * * *',
    $job$select net.http_post(
      url := 'https://wphqcccliiwdvwdjgrmc.supabase.co/functions/v1/print-worker',
      headers := jsonb_build_object('Content-Type','application/json','x-print-worker-secret',
        (select decrypted_secret from vault.decrypted_secrets where name='beo_print_worker_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 120000
    );$job$) into v_job;
  return v_job;
end $$;
revoke all on function public.print_configure_worker(text,text) from public, anon, authenticated;
grant execute on function public.print_configure_worker(text,text) to service_role;
commit;
