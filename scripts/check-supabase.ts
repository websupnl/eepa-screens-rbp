type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

function loadLocalEnv() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    process.loadEnvFile('.env');
  }
}

async function runCheck(name: string, callback: () => Promise<string>): Promise<CheckResult> {
  try {
    const detail = await callback();

    return {
      name,
      ok: true,
      detail,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function main() {
  loadLocalEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing required Supabase environment variables in .env.local.');
  }

  const authCheck = await runCheck('auth-admin', async () => {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const payload = (await response.json()) as { users?: unknown[] };
    return `service role accepted, users=${payload.users?.length ?? 0}`;
  });

  const restCheck = await runCheck('rest-products', async () => {
    const response = await fetch(`${supabaseUrl}/rest/v1/products?select=id,name,active&limit=1`, {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const payload = (await response.json()) as Array<{ active: boolean; id: string; name: string }>;
    return `schema reachable, rows=${payload.length}`;
  });

  const storageCheck = await runCheck('storage-buckets', async () => {
    const response = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();

      if (body.includes('42P01')) {
        throw new Error('Storage backend tables are missing in the Supabase project. This must be fixed at project infrastructure level.');
      }

      throw new Error(`HTTP ${response.status}: ${body}`);
    }

    const payload = (await response.json()) as Array<{ id: string }>;
    const hasNcAssetsBucket = payload.some((bucket) => bucket.id === 'nc-assets');

    return `storage reachable, nc-assets=${hasNcAssetsBucket ? 'present' : 'missing'}`;
  });

  const results = [authCheck, restCheck, storageCheck];

  for (const result of results) {
    const status = result.ok ? 'OK' : 'FAIL';
    console.log(`${status} ${result.name} ${result.detail}`);
  }

  if (results.some((result) => !result.ok)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});