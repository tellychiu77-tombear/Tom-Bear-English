'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
    const [loading, setLoading] = useState(true);
    const [profiles, setProfiles] = useState<any[]>([]);
    const router = useRouter();

    useEffect(() => {
        fetchProfiles();
    }, []);

    async function fetchProfiles() {
        try {
            setLoading(true);

            // 👇 這是除錯關鍵：最單純的抓取，不排序，不篩選
            const { data, error } = await supabase
                .from('profiles')
                .select('*');

            if (error) {
                alert('抓取失敗: ' + error.message);
                console.error('Error:', error);
            } else {
                if (!data || data.length === 0) {
                    alert('抓取成功，但資料庫回傳 0 筆資料 (Empty)');
                }
                setProfiles(data || []);
            }
        } catch (err: any) {
            alert('發生意外錯誤: ' + err.message);
        } finally {
            setLoading(false);
        }
    }

    async function updateRole(id: string, newRole: string) {
        if (!confirm(`確定設為 ${newRole} 嗎？`)) return;
        const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', id);
        if (error) alert(error.message);
        else fetchProfiles();
    }

    async function deleteUser(id: string) {
        if (confirm('確定刪除？')) {
            await supabase.from('profiles').delete().eq('id', id);
            fetchProfiles();
        }
    }

    return (
        <div className="min-h-screen bg-gray-100 p-4">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-800">👮‍♂️ 人事管理中心 (除錯版)</h1>
                    <button onClick={() => router.push('/')} className="px-4 py-2 bg-gray-500 text-white rounded">回首頁</button>
                </div>

                <div className="bg-white rounded-xl shadow overflow-hidden overflow-x-auto">
                    <table className="min-w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left">Email / 姓名</th>
                                <th className="px-4 py-3 text-left">身分</th>
                                <th className="px-4 py-3 text-left">小孩</th>
                                <th className="px-4 py-3 text-left">操作</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {profiles.map((p) => (
                                <tr key={p.id} className={p.role === 'pending' ? 'bg-yellow-50' : ''}>
                                    <td className="px-4 py-4">
                                        <div className="font-bold">{p.email}</div>
                                        <div className="text-sm text-gray-500">{p.full_name || '(無姓名)'}</div>
                                        <div className="text-xs text-gray-400">ID: {p.id.substring(0, 6)}...</div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="bg-gray-100 px-2 py-1 rounded text-sm">{p.role || '無權限'}</span>
                                        <div className="text-xs text-blue-500 mt-1">{p.user_type}</div>
                                    </td>
                                    <td className="px-4 py-4">
                                        {p.child_name ? `${p.child_name} (${p.child_class})` : '-'}
                                    </td>
                                    <td className="px-4 py-4 space-x-2">
                                        <button onClick={() => updateRole(p.id, 'parent')} className="text-blue-600 border px-2 rounded">設為家長</button>
                                        <button onClick={() => updateRole(p.id, 'teacher')} className="text-green-600 border px-2 rounded">設為老師</button>
                                        <button onClick={() => deleteUser(p.id)} className="text-red-600 border px-2 rounded">刪除</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {profiles.length === 0 && !loading && (
                        <div className="p-10 text-center text-red-500 font-bold">
                            ⚠️ 真的抓不到資料，請檢查 Supabase 是否有資料
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}