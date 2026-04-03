import { createClient } from '@supabase/supabase-js';

// Use environment variables directly, already loaded from .env.local via Next.js dev environment.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data, error } = await supabase.from('pg_policies').select('polname, polcmd, pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)').eq('polrelid', 'public.nc_assets' as any);
  if (error) {
    console.error('query error', error);
    process.exit(1);
  }
  console.log('nc_assets policies:', data);
}

main().catch((e) => console.error(e));
