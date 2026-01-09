import { supabase } from '@/lib/supabaseClient';

/**
 * 記錄系統操作日誌 (Audit Log)
 * @param action 動作名稱 (e.g., '刪除學生', '修改成績')
 * @param details 詳細內容 (e.g., '移除了學生：王小明', '將分數從 60 改為 80')
 */
export async function logAction(action: string, details: string) {
    try {
        // 1. 取得當前使用者
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return; // 沒登入就不記 (或記為系統自動)

        // 2. 取得使用者姓名 (從 profiles)
        // 為了效能，這裡可以用 session metadata，但 profiles 更準確
        // 簡單起見，我們嘗試從 profiles 抓，若抓不到就用 email
        let userName = session.user.email;
        const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, name') // 兼容舊欄位
            .eq('id', session.user.id)
            .single();

        if (profile) {
            userName = profile.full_name || profile.name || session.user.email;
        }

        // 3. 寫入 Logs
        const { error } = await supabase.from('audit_logs').insert({
            action,
            details,
            user_id: session.user.id,
            user_name: userName,
            created_at: new Date().toISOString()
        });

        if (error) {
            console.error('Failed to write audit log:', error);
        }
    } catch (err) {
        console.error('Error in logAction:', err);
    }
}
