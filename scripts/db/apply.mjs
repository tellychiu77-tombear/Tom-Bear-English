// ============================================================
// 依序把 SQL 檔套用到目標資料庫（每個檔案一個 transaction，出錯即停）
// 用法（PowerShell）：
//   $env:TARGET_DB_URL = "<目標資料庫連線字串>"
//   node scripts/db/apply.mjs <sql檔1> <sql檔2> ...
// 例：node scripts/db/apply.mjs supabase/baseline_from_prod.sql
// ============================================================
import pg from 'pg';
import { readFileSync } from 'fs';

const url = process.env.TARGET_DB_URL;
if (!url) { console.error('❌ 請先設定 TARGET_DB_URL 環境變數'); process.exit(1); }
const files = process.argv.slice(2);
if (files.length === 0) { console.error('❌ 請指定至少一個 SQL 檔'); process.exit(1); }

// 防呆：不小心把 013/014 丟進來時擋下（它們需要程式碼配合才能套）
for (const f of files) {
  if (/20260702_01[34]/.test(f) && !process.env.ALLOW_RISKY) {
    console.error(`❌ ${f} 尚不可套用（需程式碼配合，見檔頭說明）。確定要套請設 ALLOW_RISKY=1`);
    process.exit(1);
  }
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
const host = new URL(url.replace('postgresql://', 'http://')).host;
console.log(`✅ 已連線目標資料庫（${host}）\n`);

for (const f of files) {
  const sql = readFileSync(f, 'utf-8');
  process.stdout.write(`▶ ${f} ... `);
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.log('❌');
    console.error(`\n💥 套用失敗：${f}`);
    console.error(`   錯誤：${e.message}`);
    if (e.position) {
      const upto = sql.slice(0, Number(e.position));
      const line = upto.split('\n').length;
      console.error(`   大約在第 ${line} 行附近`);
    }
    console.error('\n已 ROLLBACK，此檔案的變更未生效。後續檔案未執行。');
    await client.end();
    process.exit(1);
  }
}

console.log('\n🎉 全部套用完成');
await client.end();
