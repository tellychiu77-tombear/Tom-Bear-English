'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
    const [loading, setLoading] = useState(true);
    const [profiles, setProfiles] = useState<any[]>([]);
    const router = useRouter();

    useEffect(() => {
        checkPermission();
    }, []);

    async function checkPermission() {
        const { data: { session } } = await supabase.auth.getSession();

        // 1. 如果沒登入，踢回首頁
        if (!session) {
            router.push('/');
            return;
        }

        // 👑 2. 園長無敵通道 (直接放行)
        if (session.user.email === 'teacheryoyo@demo.com') {
            fetchProfiles(); // 允許讀取資料
            return;
        }

        // 3. 其他人檢查資料庫
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single();

        if (profile?.role !== 'director') {
            alert('Access Denied: 只有園長可以進入此頁面');
            router.push('/'); // 踢回首頁
        } else {
            fetchProfiles();
        }
    }

    async function fetchProfiles() {
        // 讀取所有 pending 的申請
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (data) setProfiles(data);
        setLoading(false);
    }

    async function updateRole(id: string, newRole: string) {
        // 呼叫 API 更新 (這邊先用簡單寫法，正式版可用 API)
        await supabase.from('profiles').update({ role: newRole }).eq('id', id);
        fetchProfiles(); // 重新整理列表
        alert(`已將該用戶設定為 ${newRole}`);
    }

    async function deleteUser(id: string) {
        if (confirm('確定要刪除此用戶嗎？')) {
            await supabase.from('profiles').delete().eq('id', id);
            fetchProfiles();
        }
    }

    if (loading) return <div className="p-8 text-center">驗證權限與讀取資料中...</div>;

    return (
        <div className="min-h-screen bg-gray-100 p-4">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-800">👮‍♂️ 人事管理中心</h1>
                    <button onClick={() => router.push('/')} className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600">
                        回首頁
                    </button>
                </div>

                <div className="bg-white rounded-xl shadow overflow-hidden">
                    <table className="min-w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">目前身分</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {profiles.map((profile) => (
                                <tr key={profile.id} className={profile.role === 'pending' ? 'bg-yellow-50' : ''}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {profile.email}
                                        {profile.role === 'pending' && <span className="ml-2 text-xs text-yellow-600 font-bold">(待審核)</span>}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{profile.role}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                        <button onClick={() => updateRole(profile.id, 'teacher')} className="text-green-600 hover:text-green-900 border border-green-200 px-2 py-1 rounded">設為老師</button>
                                        <button onClick={() => updateRole(profile.id, 'manager')} className="text-blue-600 hover:text-blue-900 border border-blue-200 px-2 py-1 rounded">設為主任</button>
                                        <button onClick={() => deleteUser(profile.id)} className="text-red-600 hover:text-red-900 border border-red-200 px-2 py-1 rounded">刪除</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {profiles.length === 0 && <div className="p-8 text-center text-gray-500">目前沒有任何用戶資料</div>}
                </div>
            </div>
        </div>
    );
}