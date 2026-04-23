const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
  connectionString: 'postgresql://postgres:Guilds2026!Comercial@db.mdmbuekuemcjumxcmkls.supabase.co:5432/postgres'
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to DB');

    const files = [
      'supabase/schema.sql',
      'supabase/migration_v2_completude.sql',
      'supabase/migration_v3_funil.sql',
      'supabase/migration_v4_score.sql',
      'supabase/migration_v5_ai.sql',
      'supabase/create_users.sql',
      'supabase/seed.sql'
    ];

    const dropViewsSql = `
      drop view if exists public.v_kpis_por_responsavel cascade;
      drop view if exists public.v_kpis_globais cascade;
      drop view if exists public.v_leads_enriched cascade;
      drop view if exists public.v_kpis_por_canal cascade;
    `;

    for (const file of files) {
      console.log(`Executing ${file}...`);
      
      // Before each migration (except schema which drops anyway), drop views to avoid column mismatch errors
      if (file !== 'supabase/schema.sql') {
        await client.query(dropViewsSql);
      }

      const filePath = path.join(__dirname, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      await client.query(sql);
      console.log(`Successfully executed ${file}`);
    }
  } catch (err) {
    console.error('Error executing SQL', err);
  } finally {
    await client.end();
  }
}

run();
