# 學生個資 git 歷史清理 — 後續步驟（GitHub 端）

## 已完成（2026-07-06，本機）

1. ✅ `supabase/seed_students.sql`（146 位真實學生姓名＋家長電話）已從**本機 git 全部歷史**移除
   （連同 `.env.local`、`tsconfig.tsbuildinfo`、`.trash_*` 一併清除）。
2. ✅ 檔案本體仍在你的資料夾（未刪除），已加入 `.gitignore`，永遠不會再被 commit。
3. ✅ 假資料範本：`supabase/seed_students.example.sql`（開發測試用）。
4. ✅ 清理前的完整備份：`backup-before-pii-purge-20260706.bundle`（repo 根目錄，已 gitignore）。
   還原方式：`git clone backup-before-pii-purge-20260706.bundle restored-repo`

## ⚠️ 你需要做的：GitHub 端清理

GitHub 上的 `tellychiu77-tombear/Tom-Bear-English` **仍保有含個資的舊歷史**。

### 方法 A：強制推送（保留 repo）
```bash
cd mom-call-app
git push --force --all origin
git push --force --tags origin
```
之後到 GitHub Settings → 確認沒有其他 branch／PR 殘留舊 commit。
⚠️ GitHub 的快取與 dangling commits 不會立刻消失，需要聯絡 GitHub Support
請求執行 garbage collection（官方流程：https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository）。

### 方法 B：刪掉重建（最乾淨，推薦——如果沒有 PR／issue 需要保留）
1. GitHub 上刪除 Tom-Bear-English repo
2. 建立同名新 repo（**設 Private**）
3. `git push -u origin main`

### 檢查清單
- [ ] 確認 repo 是 **Private**（含學生資料的專案不該是 public）
- [ ] force-push 或重建完成
- [ ] 曾 clone 過此 repo 的其他電腦：刪掉重 clone
- [ ] 依 docs/pii-protection-plan.md 評估是否需要通報（若 repo 曾經 public）
