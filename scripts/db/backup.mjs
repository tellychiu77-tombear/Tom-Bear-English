// ============================================================
// Production 資料備份 — 把所有有資料的表匯出成可還原的 SQL 檔
// 用法（PowerShell）：
//   $env:SOURCE_DB_URL = "<production 連線字串>"
//   node scripts/db/backup.mjs
// 產出：backups/backup_YYYY-MM-DD_HHmm.sql（含 INSERT 語句，可直接貼回 SQL Editor 還原）
//
// ⚠️ 產出的檔案含全部學生個資，已在 .gitignore 排除，不會進版本庫。
// ============================================================
import pg from 'pg';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const url = process.env.SOURCE_DB_URL;
if (!url) { console.error('❌ 請先設定 SOURCE_DB_URL 環境變數'); process.exit(1); }

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log('✅ 已連線資料庫\n');

// 找出 public schema 下所有有資料的表
const tables = (await client.query(`
  SELECT c.relname AS tbl
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY c.relname`)).rows.map(r => r.tbl);

const out = [];
out.push('-- ==========================================================');
out.push(`-- Tom Bear 資料備份 — ${new Date().toLocaleString('zh-TW')}`);
out.push('-- 還原方式：在 Supabase SQL Editor 貼上並執行（會覆蓋同 id 的資料）');
out.push('-- ⚠️ 本檔含真實學生與家長個資，請勿外流、勿上傳 git');
out.push('-- ==========================================================');
out.push('');

function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (Array.isArray(v)) {
    if (v.length === 0) return `'{}'`;
    return `'{${v.map(x => `"${String(x).replace(/"/g, '\\"')}"`).join(',')}}'`;
  }
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

let totalRows = 0;
const summary = [];

for (const t of tables) {
  const { rows } = await client.query(`SELECT * FROM public."${t}"`);
  if (rows.length === 0) continue;

  const cols = Object.keys(rows[0]);
  out.push(`-- ---------- ${t}（${rows.length} 筆）----------`);
  for (const row of rows) {
    const vals = cols.map(c => lit(row[c])).join(', ');
    out.push(`INSERT INTO public."${t}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${vals}) ON CONFLICT DO NOTHING;`);
  }
  out.push('');
  totalRows += rows.length;
  summary.push(`${t}: ${rows.length}`);
  console.log(`  ${t.padEnd(28)} ${String(rows.length).padStart(5)} 筆`);
}

// auth.users（帳號本體，還原時需要）
const authUsers = (await client.query(
  `SELECT id, email, encrypted_password, email_confirmed_at, created_at FROM auth.users`)).rows;
out.push(`-- ---------- auth.users 帳號清單（${authUsers.length} 筆，僅供對照，還原需另行處理）----------`);
for (const u of authUsers) {
  out.push(`-- ${u.id}  ${u.email}  confirmed=${u.email_confirmed_at ? 'Y' : 'N'}`);
}
console.log(`  auth.users（帳號對照）${String(authUsers.length).padStart(9)} 筆`);

if (!existsSync('backups')) mkdirSync('backups');
const now = new Date();
const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
const file = `backups/backup_${stamp}.sql`;
writeFileSync(file, out.join('\n'), 'utf-8');

console.log(`\n🎉 備份完成：${file}`);
console.log(`   共 ${totalRows} 筆資料（${summary.length} 張表）`);
console.log(`   ⚠️ 此檔含真實個資，已自動排除於 git 之外，請自行留存一份到安全的地方。`);
await client.end();
