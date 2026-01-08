'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

// 定義班級選項 (純英文班級)
const ENGLISH_CLASSES = Array.from({ length: 26 }, (_, i) => `CEI-${String.fromCharCode(65 + i)}`);

export default function AdminPage() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // 編輯模式的狀態
    const [editingUser, setEditingUser] = useState<any>(null);

    // 新增小孩的暫存狀態
    const [newChildName, setNewChildName] = useState('');
    const [newChildGrade, setNewChildGrade] = useState('CEI-A'); // 預設英文班級
    const [isAfterSchool, setIsAfterSchool] = useState(false);   // 是否參加課輔 (Checkbox)

    const router = useRouter();

    useEffect(() => {
        checkAdmin();
        fetchUsers();
    }, []);

    async function checkAdmin() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        // 檢查權限 (只有 admin, director, manager 能進來)
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        if (!['admin', 'director', 'manager'].includes(profile?.role || '')) {
            alert('權限不足');
            router.push('/');
        }
    }

    // 抓取所有使用者與學生資料
    async function fetchUsers() {
        setLoading(true);
        // 這裡我們做一個 join query，抓出 user 同時抓出底下的 students
        const { data: profiles, error } = await supabase
            .from('profiles')
            .select(`
        *,
        students (*)
      `)
            .order('created_at', { ascending: false });

        if (profiles) setUsers(profiles);
        setLoading(false);
    }

    // 開啟編輯視窗
    function openEditModal(user: any) {
        setEditingUser(user);
        // 重置新增小孩的表單
        setNewChildName('');
        setNewChildGrade('CEI-A');
        setIsAfterSchool(false);
    }

    // 儲存變更 (包含修改角色、刪除學生、新增學生)
    async function handleSaveUser() {
        if (!editingUser) return;

        try {
            // 1. 更新角色 (Role)
            const { error: roleError } = await supabase
                .from('profiles')
                .update({ role: editingUser.role })
                .eq('id', editingUser.id);

            if (roleError) throw roleError;

            // 2. 如果有填寫「新增小孩」，則執行插入動作
            if (newChildName.trim()) {
                // 組合班級字串
                // 如果有勾課輔 -> "CEI-A, 課後輔導班"
                // 如果沒勾 -> "CEI-A"
                let finalGrade = newChildGrade;
                if (isAfterSchool) {
                    finalGrade += ', 課後輔導班';
                }

                const { error: childError } = await supabase.from('students').insert({
                    parent_id: editingUser.id,
                    chinese_name: newChildName,
                    grade: finalGrade
                });

                if (childError) throw childError;
            }

            alert('儲存成功！');
            setEditingUser(null); // 關閉視窗
            await fetchUsers();   // 🟢 關鍵：強制刷新列表，讓新資料顯示出來

        } catch (error: any) {
            alert('更新失敗: ' + error.message);
        }
    }

    // 刪除學生 (解綁)
    async function deleteStudent(studentId: string) {
        if (!confirm('確定要刪除這位學生嗎？(資料將無法復原)')) return;

        const { error } = await supabase.from('students').delete().eq('id', studentId);
        if (error) {
            alert('刪除失敗');
        } else {
            // 更新目前的編輯狀態 (讓畫面上的學生立刻消失)
            setEditingUser({
                ...editingUser,
                students: editingUser.students.filter((s: any) => s.id !== studentId)
            });
            // 也要刷新背後的大列表
            fetchUsers();
        }
    }

    if (loading) return <div className="p-8 text-center">載入中...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-800">👥 人事與權限管理</h1>
                    <button onClick={() => router.push('/')} className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">回首頁</button>
                </div>

                {/* 使用者列表表格 */}
                <div className="bg-white rounded-xl shadow overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-gray-100 border-b">
                            <tr>
                                <th className="p-4 text-left font-bold text-gray-600">姓名 / Email</th>
                                <th className="p-4 text-left font-bold text-gray-600">目前身分</th>
                                <th className="p-4 text-left font-bold text-gray-600">綁定學生</th>
                                <th className="p-4 text-right font-bold text-gray-600">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {users.map(user => (
                                <tr key={user.id} className="hover:bg-gray-50 transition">
                                    <td className="p-4">
                                        <div className="font-bold text-gray-800">{user.full_name || '未填寫'}</div>
                                        <div className="text-sm text-gray-500">{user.email}</div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${user.role === 'admin' || user.role === 'director' ? 'bg-purple-100 text-purple-700' :
                                                user.role === 'teacher' ? 'bg-blue-100 text-blue-700' :
                                                    user.role === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                                        'bg-green-100 text-green-700'
                                            }`}>
                                            {user.role === 'director' ? '主任' :
                                                user.role === 'manager' ? '管理者' :
                                                    user.role === 'teacher' ? '老師' :
                                                        user.role === 'parent' ? '家長' :
                                                            user.role === 'pending' ? '待審核' : user.role}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        {user.students && user.students.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {user.students.map((s: any) => (
                                                    <span key={s.id} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs border">
                                                        {s.chinese_name}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-gray-300 text-sm">- 無 -</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        <button
                                            onClick={() => openEditModal(user)}
                                            className="px-3 py-1 bg-blue-50 text-blue-600 rounded border border-blue-200 hover:bg-blue-100 text-sm font-bold"
                                        >
                                            編輯 / 補登
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* 編輯 User Modal */}
                {editingUser && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden animate-fade-in">
                            <div className="p-6 border-b bg-gray-50">
                                <h3 className="text-xl font-bold text-gray-800">編輯用戶資料</h3>
                                <div className="text-sm text-gray-500 mt-1">{editingUser.full_name} ({editingUser.email})</div>
                            </div>

                            <div className="p-6 space-y-6">

                                {/* 1. 修改角色權限 */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">設定身分權限</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {['parent', 'teacher', 'manager', 'director'].map(r => (
                                            <button
                                                key={r}
                                                onClick={() => setEditingUser({ ...editingUser, role: r })}
                                                className={`py-2 rounded border text-sm font-bold transition ${editingUser.role === r
                                                        ? 'bg-blue-600 text-white border-blue-600'
                                                        : 'bg-white text-gray-600 hover:bg-gray-50'
                                                    }`}
                                            >
                                                {r === 'parent' ? '家長' : r === 'teacher' ? '老師' : r === 'manager' ? '行政' : '主任'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <hr className="border-gray-100" />

                                {/* 2. 已綁定的學生 (可刪除) */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">🐣 該帳號綁定的學生</label>
                                    <div className="bg-orange-50 p-3 rounded-lg border border-orange-100 space-y-2">
                                        {editingUser.students && editingUser.students.length > 0 ? (
                                            editingUser.students.map((s: any) => (
                                                <div key={s.id} className="flex justify-between items-center bg-white p-2 rounded shadow-sm">
                                                    <span className="font-bold text-gray-800">
                                                        {s.chinese_name}
                                                        <span className="text-xs text-gray-400 font-normal ml-2">({s.grade})</span>
                                                    </span>
                                                    <button
                                                        onClick={() => deleteStudent(s.id)}
                                                        className="text-red-500 text-xs hover:underline"
                                                    >
                                                        移除
                                                    </button>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-gray-400 text-sm text-center">尚未綁定任何學生</div>
                                        )}
                                    </div>
                                </div>

                                {/* 3. 補登新小孩 (新增資料) */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">➕ 補登其他小孩 (選填)</label>
                                    <div className="flex gap-2 mb-2">
                                        <input
                                            type="text"
                                            placeholder="姓名"
                                            className="flex-1 p-2 border rounded"
                                            value={newChildName}
                                            onChange={e => setNewChildName(e.target.value)}
                                        />

                                        {/* 英文班級選單 */}
                                        <select
                                            className="w-24 p-2 border rounded bg-white"
                                            value={newChildGrade}
                                            onChange={e => setNewChildGrade(e.target.value)}
                                        >
                                            {ENGLISH_CLASSES.map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* 是否參加課輔勾選框 */}
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 accent-blue-600"
                                            checked={isAfterSchool}
                                            onChange={e => setIsAfterSchool(e.target.checked)}
                                        />
                                        <span className="text-sm text-gray-700 font-bold">參加課後輔導 (安親)</span>
                                    </label>

                                    {newChildName && (
                                        <div className="text-xs text-blue-600 mt-1">
                                            預覽：{newChildName} ({newChildGrade}{isAfterSchool ? ', 課後輔導班' : ''})
                                        </div>
                                    )}
                                </div>

                            </div>

                            <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
                                <button
                                    onClick={() => setEditingUser(null)}
                                    className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-200 rounded"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={handleSaveUser}
                                    className="px-6 py-2 bg-blue-600 text-white font-bold rounded shadow hover:bg-blue-700"
                                >
                                    儲存變更
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}