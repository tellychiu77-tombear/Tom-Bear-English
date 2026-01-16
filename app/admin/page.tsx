'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
    const router = useRouter();
    const [users, setUsers] = useState<any[]>([]);
    const [students, setStudents] = useState<any[]>([]); // 找回學生資料
    const [loading, setLoading] = useState(true);

    // 1. 抓取資料 (包含使用者與學生關聯)
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // A. 抓所有使用者
            const { data: usersData, error: userError } = await supabase
                .from('users')
                .select('*')
                .order('role', { ascending: true }) // 讓 director/teacher 排前面
                .order('email');

            if (userError) throw userError;

            // B. 抓所有學生 (為了對照家長是誰)
            const { data: studentsData, error: studentError } = await supabase
                .from('students')
                .select('id, chinese_name, parent_id, parent_id_2');

            if (studentError) throw studentError;

            setUsers(usersData || []);
            setStudents(studentsData || []);

        } catch (e: any) {
            console.error('Error:', e);
            alert('載入失敗: ' + e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    // 2. 權限檢查
    useEffect(() => {
        async function init() {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.push('/'); return; }

            const { data: me } = await supabase.from('users').select('role').eq('id', session.user.id).single();
            // 雙重保險：如果是 director 或是 hardcode 的管理員 email
            if (me?.role !== 'director' && session.user.email !== 'teacheryoyo@demo.com') {
                alert('權限不足：您不是主管');
                router.push('/');
                return;
            }
            fetchData();
        }
        init();
    }, [router, fetchData]);

    // 3. 修改權限功能
    async function handleRoleChange(userId: string, newRole: string) {
        if (!confirm(`確定要將此用戶身份修改為 ${newRole}?`)) return;

        try {
            const { error } = await supabase.from('users').update({ role: newRole }).eq('id', userId);
            if (error) throw error;

            // 寫入操作日誌 (恢復監控功能)
            const { data: { session } } = await supabase.auth.getSession();
            await supabase.from('system_logs').insert({
                operator_email: session?.user.email,
                action: 'CHANGE_ROLE',
                details: `將用戶 ${userId} 權限改為 ${newRole}`
            });

            alert('✅ 權限已更新');
            fetchData(); // 重新整理列表
        } catch (e: any) {
            alert('❌ 更新失敗: ' + e.message);
        }
    }

    // 4. 輔助函式：找出這個家長的小孩
    function findChildren(userId: string) {
        const myKids = students.filter(s => s.parent_id === userId || s.parent_id_2 === userId);
        if (myKids.length === 0) return <span className="text-gray-300 text-xs">無連結學生</span>;

        return (
            <div className="flex flex-wrap gap-1">
                {myKids.map(kid => (
                    <span key={kid.id} className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full font-bold">
                        👶 {kid.chinese_name}
                    </span>
                ))}
            </div>
        );
    }

    if (loading) return <div className="p-10 text-center text-gray-500 font-bold">正在讀取人事資料庫...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto">
                {/* 頂部功能列 */}
                <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-gray-800">👥 人事管理後台</h1>
                        <p className="text-gray-500 text-sm mt-1">管理所有帳號權限與關聯學生</p>
                    </div>
                    <div className="flex gap-3">
                        {/* 找回日誌按鈕 */}
                        <button
                            onClick={() => router.push('/admin/logs')}
                            className="bg-orange-100 text-orange-700 px-4 py-2 rounded-xl font-bold hover:bg-orange-200 transition flex items-center gap-2"
                        >
                            🕵️‍♂️ 查看監控日誌
                        </button>
                        <button onClick={() => router.push('/')} className="bg-white px-4 py-2 rounded-xl border font-bold hover:bg-gray-50">
                            回首頁
                        </button>
                    </div>
                </div>

                {/* 主要表格區 */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left whitespace-nowrap">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="p-5 text-gray-400 font-bold text-xs uppercase tracking-wider">使用者 Email</th>
                                    <th className="p-5 text-gray-400 font-bold text-xs uppercase tracking-wider">目前身份</th>
                                    <th className="p-5 text-gray-400 font-bold text-xs uppercase tracking-wider">連結學生 (家長)</th>
                                    <th className="p-5 text-gray-400 font-bold text-xs uppercase tracking-wider text-right">權限管理</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {users.map(user => (
                                    <tr key={user.id} className="hover:bg-gray-50 transition">
                                        <td className="p-5">
                                            <div className="font-bold text-gray-700">{user.email}</div>
                                            <div className="text-xs text-gray-400 mt-0.5 font-mono">{user.id}</div>
                                        </td>
                                        <td className="p-5">
                                            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide ${user.role === 'director' ? 'bg-purple-100 text-purple-700' :
                                                    user.role === 'teacher' ? 'bg-indigo-100 text-indigo-700' :
                                                        'bg-gray-100 text-gray-600'
                                                }`}>
                                                {user.role}
                                            </span>
                                        </td>
                                        {/* 這裡就是找回原本功能的關鍵：顯示對應的學生 */}
                                        <td className="p-5">
                                            {findChildren(user.id)}
                                        </td>
                                        <td className="p-5 text-right">
                                            <select
                                                value={user.role}
                                                onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                                className="bg-white border border-gray-200 text-gray-700 text-sm rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-200 font-bold cursor-pointer hover:border-indigo-300"
                                            >
                                                <option value="parent">🏠 家長 (Parent)</option>
                                                <option value="teacher">👨‍🏫 老師 (Teacher)</option>
                                                <option value="director">👑 主管 (Director)</option>
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {users.length === 0 && (
                        <div className="p-10 text-center text-gray-400">
                            查無使用者資料，請確認資料庫連線。
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}