import { supabase } from '@/lib/supabaseClient';

/**
 * 記錄系統操作日誌 (Audit Log)
 *
 * 2026-07-02 起主寫 audit_logs（Telly 於 migration 003 授權保留的正式稽核表；
 * system_logs 將在 003 套用時移除）。
 * 過渡期 fallback：audit_logs 寫入失敗（例如現行 production 該表 RLS 鎖死）時
 * 改寫 system_logs，確保 003 套用前稽核不中斷。
 */
export async function logAction(action: string, details: string) {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        let userName = session.user.email ?? '未知帳號';
        const { data: profile } = await supabase
            .from('users')
            .select('name, email')
            .eq('id', session.user.id)
            .single();
        if (profile?.name) userName = `${profile.name} (${profile.email ?? ''})`;
        else if (profile?.email) userName = profile.email;

        const { error } = await supabase.from('audit_logs').insert({
            user_id: session.user.id,
            user_name: userName,
            action,
            details,
        });

        if (error) {
            // 過渡期 fallback（003 套用後 system_logs 不存在，此寫入會靜默失敗，屆時 audit_logs 應已可寫）
            await supabase.from('system_logs').insert({
                operator_email: userName,
                action,
                details,
            });
        }
    } catch (err) {
        // 日誌失敗不影響主流程
        console.error('logAction error:', err);
    }
}
