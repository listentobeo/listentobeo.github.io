import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { env, dbResult, processPrintOrder } from '../_shared/print-service.ts';
Deno.serve(async req => {
  if (req.method !== 'POST' || !env('PRINT_WORKER_SECRET') || req.headers.get('x-print-worker-secret') !== env('PRINT_WORKER_SECRET')) return new Response('Unauthorized', { status: 401 });
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  try {
    const jobs = dbResult(await db.from('print_jobs').select('order_id').or('status.eq.pending,and(status.eq.running,updated_at.lt.' + new Date(Date.now()-300000).toISOString() + ')').order('updated_at').limit(3));
    const results = await Promise.allSettled(jobs.map((j: any) => processPrintOrder(db, j.order_id)));
    return Response.json({ processed: jobs.length, errors: results.filter(r => r.status === 'rejected').length });
  } catch { return new Response('Worker failed; inspect pending jobs.', { status: 500 }); }
});
