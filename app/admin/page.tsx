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
        if (!session) { router.push('/'); return; }

        // 園長驗證
        if (session.user.email === 'teacheryoyo@demo.com') {
            fetchProfiles();
            return;
        }

        const { data: profile } = await supabase
            .from('profiles').select('role').eq('id', session.user.id).single();

        if (profile?.role !== 'director') {
            alert('權限不足'); router.push('/');
        } else {
            fetchProfiles();
        }
    }

    async function fetchProfiles() {
        // 抓取所有資料
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });
        if (data) setProfiles(data);
        setLoading(false);
    }

    async function updateRole(id: string, newRole: string) {
        if (!confirm(`確定要將此人設為 ${newRole} 嗎？`)) return;
        await supabase.from('profiles').update({ role: newRole }).eq('id', id);
        fetchProfiles();
    }

    async function deleteUser(id: string) {
        if (confirm('確定要刪除此用戶嗎？(此操作無法復原)')) {
            await supabase.from('profiles').delete().eq('id', id);
            fetchProfiles();
        }
    }

    if (loading) return <div className="p-8 text-center">讀取中...</div>;

    return (
        <div className="min-h-screen bg-gray-100 p-4">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-800">👮‍♂️ 人事管理中心</h1>
                    <button onClick={() => router.push('/')} className="px-4 py-2 bg-gray-500 text-white rounded">回首頁</button>
                </div>

                <div className="bg-white rounded-xl shadow overflow-hidden overflow-x-auto">
                    <table className="min-w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">申請人資料</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">申請身分</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">小孩資訊</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">目前權限</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">審核操作</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {profiles.map((p) => (
                                <tr key={p.id} className={p.role === 'pending' ? 'bg-yellow-50' : ''}>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <div className="text-sm font-bold text-gray-900">{p.full_name || '(未填寫)'}</div>
                                        <div className="text-xs text-gray-500">{p.email}</div>
                                        <div className="text-xs text-gray-500">{p.phone}</div>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs rounded-full ${p.user_type === 'parent' ? 'bg-blue-100 text-blue-800' :
                                                p.user_type === 'teacher' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                            }`}>
                                            {p.user_type === 'parent' ? '家長' : p.user_type === 'teacher' ? '老師' : '未定'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {p.child_name ? (
                                            <div>
                                                <div className="font-medium text-gray-900">{p.child_name}</div>
                                                <div className="text-xs">{p.child_class}</div>
                                            </div>
                                        ) : '-'}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        {p.role === 'pending' ? <span className="text-yellow-600 font-bold">待審核</span> : p.role}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                        <button onClick={() => updateRole(p.id, 'parent')} className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600">家長</button>
                                        <button onClick={() => updateRole(p.id, 'teacher')} className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600">老師</button>
                                        <button onClick={() => deleteUser(p.id)} className="text-red-500 hover:text-red-700 border border-red-200 px-2 py-1 rounded">刪除</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}