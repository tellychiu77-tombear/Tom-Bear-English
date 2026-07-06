// ============================================================
// 012 驗收測試 — 模擬各角色，驗證 RLS 隔離是否正確
// 用法（PowerShell）：
//   $env:TARGET_DB_URL = "<staging 連線字串>"
//   node scripts/db/acceptance.mjs
// 前提：已依序套用 baseline → staging-seed → 001..011 → 012
// ============================================================
import pg from 'pg';

const url = process.env.TARGET_DB_URL;
if (!url) { console.error('❌ 請先設定 TARGET_DB_URL'); process.exit(1); }

const ID = {
  parentA: '11111111-1111-1111-1111-111111111111',
  parentB: '22222222-2222-2222-2222-222222222222',
  teacher: '33333333-3333-3333-3333-333333333333',
  admin:   '44444444-4444-4444-4444-444444444444',
  director:'55555555-5555-5555-5555-555555555555',
  kidA1: 'aaaaaaaa-0000-0000-0000-000000000001',
  kidB1: 'bbbbbbbb-0000-0000-0000-000000000001',
};

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

let pass = 0, fail = 0;
const failures = [];

// 在一個 transaction 內模擬某身分執行 SQL，結束後 ROLLBACK（不留任何變更）
async function as(who, sql, params = []) {
  await client.query('BEGIN');
  try {
    if (who === 'anon') {
      await client.query(`SET LOCAL ROLE anon`);
    } else {
      await client.query(`SET LOCAL ROLE authenticated`);
      await client.query(
        `SELECT set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: ID[who], role: 'authenticated' })]);
    }
    const r = await client.query(sql, params);
    await client.query('ROLLBACK');
    return { ok: true, rows: r.rows ?? [], count: r.rowCount ?? 0 };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    return { ok: false, error: e.message };
  }
}

function check(name, cond, detail) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; failures.push(name); console.log(`❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== 家長隔離 ===');
let r = await as('parentA', 'SELECT id FROM public.students');
check('家長A 只看得到自己的 2 個小孩', r.ok && r.count === 2, JSON.stringify(r));

r = await as('parentA', 'SELECT id FROM public.students WHERE id = $1', [ID.kidB1]);
check('家長A 讀不到家長B的小孩', r.ok && r.count === 0, JSON.stringify(r));

r = await as('parentB', 'SELECT id FROM public.students');
check('家長B 只看得到自己的 1 個小孩', r.ok && r.count === 1, JSON.stringify(r));

r = await as('anon', 'SELECT id FROM public.students');
check('未登入（anon）讀 students = 0 列', r.ok && r.count === 0, JSON.stringify(r));

r = await as('parentA', 'SELECT id FROM public.exam_results');
check('家長A 只看到自己小孩的成績（1 筆）', r.ok && r.count === 1, JSON.stringify(r));

r = await as('parentA', `UPDATE public.exam_results SET score = 100 WHERE student_id = $1`, [ID.kidB1]);
check('家長A 改不了別人小孩的成績（0 列受影響）', r.ok && r.count === 0, JSON.stringify(r));

r = await as('parentA', 'SELECT id FROM public.users');
check('家長A 讀 users 只回自己 1 列', r.ok && r.count === 1, JSON.stringify(r));

console.log('\n=== 聊天隔離 ===');
r = await as('parentA', 'SELECT id FROM public.chat_messages');
check('家長A 看得到自己的訊息（1 筆）', r.ok && r.count === 1, JSON.stringify(r));

r = await as('parentB', 'SELECT id FROM public.chat_messages');
check('家長B 看不到別人的訊息（0 筆）', r.ok && r.count === 0, JSON.stringify(r));

console.log('\n=== 防提權 ===');
r = await as('parentA', `UPDATE public.users SET role = 'director' WHERE id = $1`, [ID.parentA]);
check('家長不能把自己升為總園長（被 trigger 擋）', !r.ok || r.count === 0, JSON.stringify(r));

r = await as('teacher', `UPDATE public.users SET role = 'director' WHERE id = $1`, [ID.parentB]);
check('老師不能指派管理階層角色', !r.ok || r.count === 0, JSON.stringify(r));

r = await as('director', `UPDATE public.users SET role = 'admin' WHERE id = $1`, [ID.teacher]);
check('總園長可以指派角色（1 列成功）', r.ok && r.count === 1, JSON.stringify(r));

r = await as('parentA', `INSERT INTO public.role_configs (role, permissions) VALUES ('parent', '{"viewGrades":true}'::jsonb)`);
check('家長不能寫 role_configs（權限設定表）', !r.ok, JSON.stringify(r));

console.log('\n=== 稽核表 append-only ===');
r = await as('teacher', `INSERT INTO public.audit_logs (user_id, user_name, action, details) VALUES ($1, '測試老師', '驗收測試', 'x') RETURNING id`, [ID.teacher]);
check('登入者可寫入 audit_logs', r.ok && r.count === 1, JSON.stringify(r));

r = await as('admin', `UPDATE public.audit_logs SET details = '竄改' `);
check('audit_logs 不可 UPDATE（0 列）', r.ok ? r.count === 0 : true, JSON.stringify(r));

r = await as('admin', `DELETE FROM public.audit_logs`);
check('audit_logs 不可 DELETE（0 列）', r.ok ? r.count === 0 : true, JSON.stringify(r));

console.log('\n=== 教職員正常運作 ===');
r = await as('teacher', 'SELECT id FROM public.students');
check('老師看得到全部 3 個學生', r.ok && r.count === 3, JSON.stringify(r));

r = await as('teacher', `INSERT INTO public.exam_results (student_id, student_name, exam_name, subject, score, exam_date) VALUES ($1, '測試童三', '驗收考', '英文', 90, '2026-07-01') RETURNING id`, [ID.kidB1]);
check('老師可登錄成績', r.ok && r.count === 1, JSON.stringify(r));

r = await as('parentA', `INSERT INTO public.leave_requests (student_id, type, reason, start_date, end_date, status) VALUES ($1, '事假', '驗收', '2026-07-10', '2026-07-10', 'pending') RETURNING id`, [ID.kidA1]);
check('家長可為自己小孩請假', r.ok && r.count === 1, JSON.stringify(r));

r = await as('parentA', `INSERT INTO public.leave_requests (student_id, type, reason, start_date, end_date, status) VALUES ($1, '事假', '驗收', '2026-07-10', '2026-07-10', 'pending') RETURNING id`, [ID.kidB1]);
check('家長不能為別人小孩請假', !r.ok, JSON.stringify(r));

console.log('\n=== RPC ===');
r = await as('parentB', `SELECT * FROM public.match_student_for_binding('0911111111', '測試童一', NULL)`);
check('綁定 RPC：電話＋姓名同時命中 → 回 1 筆', r.ok && r.count === 1, JSON.stringify(r));

r = await as('parentB', `SELECT * FROM public.match_student_for_binding('0911111111', NULL, NULL)`);
check('綁定 RPC：只給電話不給姓名 → 0 筆（防枚舉）', r.ok && r.count === 0, JSON.stringify(r));

r = await as('anon', `SELECT * FROM public.match_student_for_binding('0911111111', '測試童一', NULL)`);
check('綁定 RPC：未登入不可呼叫', !r.ok, JSON.stringify(r));

r = await as('parentA', `SELECT * FROM public.list_chat_contacts()`);
check('聊天聯絡人 RPC：家長拿到教職員清單（≥1）', r.ok && r.count >= 1, JSON.stringify(r));

console.log(`\n════════════════════════`);
console.log(`結果：${pass} 通過 / ${fail} 失敗`);
if (fail > 0) console.log('失敗項目：\n - ' + failures.join('\n - '));
await client.end();
process.exit(fail > 0 ? 1 : 0);
