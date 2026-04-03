import { createClient } from '@supabase/supabase-js'

function loadLocalEnv() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    process.loadEnvFile('.env');
  }
}

loadLocalEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkStorageSetup() {
  console.log('Checking storage setup...')

  // Check if nc-assets bucket exists
  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets()

  if (bucketError) {
    console.error('Error fetching buckets:', bucketError)
    return
  }

  const ncAssetsBucket = buckets?.find(b => b.id === 'nc-assets')
  console.log('nc-assets bucket exists:', !!ncAssetsBucket)

  if (ncAssetsBucket) {
    console.log('Bucket details:', ncAssetsBucket)

    // Try to list objects in the bucket
    const { data: objects, error: listError } = await supabase.storage
      .from('nc-assets')
      .list()

    if (listError) {
      console.error('Error listing objects:', listError)
    } else {
      console.log('Objects in bucket:', objects?.length || 0)
    }
  }
}

checkStorageSetup()