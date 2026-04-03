import { createServerSupabaseClient } from '../src/lib/supabase/server';

async function checkAuditLogs() {
  const supabase = createServerSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('nc_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching audit logs:', error);
      return;
    }

    console.log('\n✓ Latest Audit Logs:');
    console.log(JSON.stringify(data, null, 2));
    console.log(`\nTotal logs fetched: ${data?.length || 0}`);
  } catch (err) {
    console.error('Failed to check audit logs:', err);
  }
}

checkAuditLogs();
