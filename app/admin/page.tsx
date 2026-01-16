'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
    const router = useRouter();
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // 使用 useCallback 解決依賴報錯
    const fetchUsers = useCallback(async () => {
        const { data } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        if (data) setUsers(data);
        setLoading(false);
    }, []);

    useEffect(() => {
        async function init() {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.push('/'); return; }

            const { data: me } = await supabase.from('users').select('role').eq('id', session.user.id).single();
            if (me?.role !== 'director') { // 只有主管能進來
                router.push('/');
                return;
            }
            fetchUsers();
        }
        init();
    }, [router, fetchUsers]); // ✅ 依賴已修復

    async function handleRoleChange(userId: string, newRole: string) {
        if (!confirm(`確定修改權限為 ${newRole}?`)) return;
        await supabase.from('users').update({ role: newRole }).eq('id', userId);
        fetchUsers();
    }

    if (loading) return <div className="p-10 text-center">載入中...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-black text-gray-800">👥 人事管理後台</h1>
                    <button onClick={() => router.push('/')} className="bg-white px-4 py-2 rounded-lg border hover:bg-gray-50">回首頁</button>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    {/* 🔥 UI 修正：加入 overflow-x-auto 讓表格在手機上可以左右滑動 */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left whitespace-nowrap">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="p-4">Email</th>
                                    <th className="p-4">目前身份</th>
                                    <th className="p-4">權限操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {users.map(user => (
                                    <tr key={user.id}>
                                        <td className="p-4 font-bold text-gray-700">{user.email}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${user.role === 'director' ? 'bg-purple-100 text-purple-700' :
                                                    user.role === 'teacher' ? 'bg-indigo-100 text-indigo-700' :
                                                        'bg-green-100 text-green-700'
                                                }`}>
                                                {user.role}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <select
                                                value={user.role}
                                                onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                                className="border rounded p-1 text-sm"
                                            >
                                                <option value="parent">Parent</option>
                                                <option value="teacher">Teacher</option>
                                                <option value="director">Director</option>
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}