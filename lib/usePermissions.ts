'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { getEffectivePermissions, PermissionKey } from './permissions';

export type PermissionsMap = Record<PermissionKey, boolean>;

export interface UsePermissionsResult {
    user: any | null;
    permissions: PermissionsMap | null;
    loading: boolean;
}

/**
 * 共用 Hook：載入目前登入使用者的有效權限
 *
 * 三層計算：
 *   1. 程式碼內建預設 (HARDCODED_DEFAULTS)
 *   2. DB role_configs 職位預設（總園長可調整）
 *   3. users.extra_permissions 個人覆蓋（only true/false, null = follow role）
 *
 * 使用方式：
 *   const { user, permissions, loading } = usePermissions();
 *   if (permissions?.editGrades) { ... }
 */
export function usePermissions(): UsePermissionsResult {
    const [user, setUser] = useState<any | null>(null);
    const [permissions, setPermissions] = useState<PermissionsMap | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                setLoading(false);
                return;
            }

            const { data: userData } = await supabase
                .from('users')
                .select('*')
                .eq('id', session.user.id)
                .single();

            if (!userData) {
                setLoading(false);
                return;
            }

            setUser(userData);

            // 讀取職位預設
            const { data: roleConfigRow } = await supabase
                .from('role_configs')
                .select('permissions')
                .eq('role', userData.role)
                .single();

            const perms = getEffectivePermissions(
                userData.role,
                roleConfigRow?.permissions ?? null,
                userData.extra_permissions ?? null
            );

            setPermissions(perms);
            setLoading(false);
        }

        load();
    }, []);

    return { user, permissions, loading };
}
