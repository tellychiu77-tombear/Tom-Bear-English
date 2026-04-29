import { supabase } from '@/lib/supabaseClient';

/**
 * 記錄系統操作日誌 (Audit Log)
 * 寫入 system_logs 表，供監控日誌頁面查閱
 */
export async function logAction(action: string, details: string) {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        let operatorEmail = session.user.email ?? '未知帳號';
        const { data: profile } = await supabase
            .from('users')
            .select('name, email')
            .eq('id', session.user.id)
            .single();
        if (profile?.name) operatorEmail = `${profile.name} (${profile.email ?? ''})`;
        else if (profile?.email) operatorEmail = profile.email;

        await supabase.from('system_logs').insert({
            operator_email: operatorEmail,
            action,
            details,
        });
    } catch (err) {
        // 日誌失敗不影響主流程
        console.error('logAction error:', err);
    }
}
