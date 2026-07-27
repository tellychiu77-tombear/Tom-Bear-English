// ============================================================
// 雙親綁定專項測試 — 驗證「一個學生綁定兩位家長」是否順暢無 bug
// 用法（PowerShell）：
//   $env:TARGET_DB_URL = "<staging 連線字串>"
//   node scripts/db/test-two-parents.mjs
// 前提：staging 已套用 001-007 + 010 + 012，且已有 staging-seed 的測試帳號
// 本腳本會自動建立「測試家長C」，測完自動清除，不留殘留資料。
// ============================================================
import pg from 'pg';

const url = process.env.TARGET_DB_URL;
if (!url) { console.error('❌ 請先設定 TARGET_DB_URL'); process.exit(1); }

const ID = {
  parentA: '11111111-1111-1111-1111-111111111111',
  parentB: '22222222-2222-2222-2222-222222222222',
  parentC: 'cccccccc-0000-0000-0000-000000000001',
  teacher: '33333333-3333-3333-3333-333333333333',
  admin:   '44444444-4444-4444-4444-444444444444',
  kidA1: 'aaaaaaaa-0000-0000-0000-000000000001',  // 測試童一（A 的小孩，將加綁 C）
  kidA2: 'aaaaaaaa-0000-0000-0000-000000000002',
  kidB1: 'bbbbbbbb-0000-0000-0000-000000000001',  // 測試童三（B 的小孩）
};

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; failures.push(name); console.log(`❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

// 以某身分執行（transaction 內，結束即 ROLLBACK，不留痕跡）
async function as(uid, sql, params = []) {
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE authenticated');
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    const r = await client.query(sql, params);
    await client.query('ROLLBACK');
    return { ok: true, rows: r.rows ?? [], count: r.rowCount ?? 0 };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    return { ok: false, error: e.message };
  }
}

console.log('=== 準備：建立測試家長C ===');
const tenant = (await client.query(`SELECT tenant_id FROM public.users WHERE id = $1`, [ID.parentA])).rows[0]?.tenant_id;
await client.query(`
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data)
  VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
    'parent-c@test.local', crypt('Test1234!', gen_salt('bf')), now(), now(), now(),
    '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING`, [ID.parentC]);
await client.query(`
  INSERT INTO public.users (id, email, name, role, is_approved, tenant_id)
  VALUES ($1, 'parent-c@test.local', '測試家長C', 'parent', true, $2)
  ON CONFLICT (id) DO UPDATE SET role = 'parent', is_approved = true`, [ID.parentC, tenant]);
console.log('   已建立 parent-c@test.local\n');

console.log('=== 1. 綁定第二位家長（模擬後台批准）===');
// 重現 admin/page.tsx handleApproveLinkRequest 的邏輯
const stu = (await client.query(`SELECT parent_id, parent_id_2 FROM public.students WHERE id = $1`, [ID.kidA1])).rows[0];
if (stu.parent_id && stu.parent_id !== ID.parentC) {
  if (stu.parent_id_2 && stu.parent_id_2 !== ID.parentC) {
    console.log('   （此學生已有兩位家長，先清掉第二位以便測試）');
    await client.query(`UPDATE public.students SET parent_id_2 = NULL WHERE id = $1`, [ID.kidA1]);
  }
  await client.query(`UPDATE public.students SET parent_id_2 = $1 WHERE id = $2`, [ID.parentC, ID.kidA1]);
} else {
  await client.query(`UPDATE public.students SET parent_id = $1 WHERE id = $2`, [ID.parentC, ID.kidA1]);
}
const after = (await client.query(
  `SELECT parent_id, parent_id_2 FROM public.students WHERE id = $1`, [ID.kidA1])).rows[0];
check('第一位家長 A 沒有被頂掉', after.parent_id === ID.parentA, `實際 parent_id=${after.parent_id}`);
check('第二位家長 C 正確寫入 parent_id_2', after.parent_id_2 === ID.parentC, `實際 parent_id_2=${after.parent_id_2}`);

console.log('\n=== 2. 第二位家長 C 的讀取權限 ===');
let r = await as(ID.parentC, 'SELECT id, chinese_name FROM public.students');
check('C 看得到共同的小孩（1 位）', r.ok && r.count === 1, JSON.stringify(r).slice(0, 120));

r = await as(ID.parentC, 'SELECT id FROM public.students WHERE id = $1', [ID.kidB1]);
check('C 看不到別人家的小孩', r.ok && r.count === 0, JSON.stringify(r).slice(0, 120));

r = await as(ID.parentC, 'SELECT id FROM public.exam_results WHERE student_id = $1', [ID.kidA1]);
check('C 看得到共同小孩的成績', r.ok && r.count >= 1, JSON.stringify(r).slice(0, 120));

r = await as(ID.parentC, 'SELECT id FROM public.exam_results WHERE student_id = $1', [ID.kidB1]);
check('C 看不到別人小孩的成績', r.ok && r.count === 0, JSON.stringify(r).slice(0, 120));

r = await as(ID.parentC, `SELECT public.is_parent_of($1) AS ok`, [ID.kidA1]);
check('RLS 認得 C 是共同小孩的家長', r.ok && r.rows[0]?.ok === true, JSON.stringify(r).slice(0, 120));

console.log('\n=== 3. 第一位家長 A 不受影響 ===');
r = await as(ID.parentA, 'SELECT id FROM public.students');
check('A 仍看得到自己的 2 個小孩', r.ok && r.count === 2, JSON.stringify(r).slice(0, 120));

r = await as(ID.parentA, 'SELECT id FROM public.students WHERE id = $1', [ID.kidA1]);
check('A 仍看得到被加綁的那個小孩', r.ok && r.count === 1, JSON.stringify(r).slice(0, 120));

console.log('\n=== 4. 第二位家長 C 的操作權限 ===');
r = await as(ID.parentC, `INSERT INTO public.leave_requests (student_id, type, reason, start_date, end_date, status)
  VALUES ($1, '事假', '雙親測試', '2026-07-20', '2026-07-20', 'pending') RETURNING id`, [ID.kidA1]);
check('C 可以幫共同小孩請假', r.ok && r.count === 1, JSON.stringify(r).slice(0, 150));

r = await as(ID.parentC, `INSERT INTO public.leave_requests (student_id, type, reason, start_date, end_date, status)
  VALUES ($1, '事假', '越權測試', '2026-07-20', '2026-07-20', 'pending') RETURNING id`, [ID.kidB1]);
check('C 不能幫別人小孩請假', !r.ok, JSON.stringify(r).slice(0, 150));

r = await as(ID.parentC, `INSERT INTO public.pickup_requests (student_id, parent_id, status)
  VALUES ($1, $2, 'notified') RETURNING id`, [ID.kidA1, ID.parentC]);
check('C 可以呼叫接送共同小孩', r.ok && r.count === 1, JSON.stringify(r).slice(0, 150));

r = await as(ID.parentC, `UPDATE public.students SET internal_note = 'x' WHERE id = $1`, [ID.kidB1]);
check('C 改不動別人家的學生資料', r.ok ? r.count === 0 : true, JSON.stringify(r).slice(0, 150));

console.log('\n=== 5. 兩位家長都滿了之後的防護 ===');
const full = (await client.query(`SELECT parent_id, parent_id_2 FROM public.students WHERE id = $1`, [ID.kidA1])).rows[0];
const wouldBlock = !!(full.parent_id && full.parent_id_2 && full.parent_id !== ID.parentB && full.parent_id_2 !== ID.parentB);
check('第三位家長會被後台擋下（雙欄位已滿）', wouldBlock,
  `parent_id=${full.parent_id?.slice(0,8)} parent_id_2=${full.parent_id_2?.slice(0,8)}`);

console.log('\n=== 清理測試資料 ===');
await client.query(`UPDATE public.students SET parent_id_2 = NULL WHERE id = $1`, [ID.kidA1]);
await client.query(`DELETE FROM public.users WHERE id = $1`, [ID.parentC]);
await client.query(`DELETE FROM auth.users WHERE id = $1`, [ID.parentC]);
console.log('   已還原（parent_id_2 清空、測試家長C 刪除）\n');

console.log('════════════════════════');
console.log(`結果：${pass} 通過 / ${fail} 失敗`);
if (fail > 0) console.log('失敗項目：\n - ' + failures.join('\n - '));
await client.end();
process.exit(fail > 0 ? 1 : 0);
