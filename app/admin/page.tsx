'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

// 1. 定義英文班級 (CEI-A ~ CEI-Z)
const ENGLISH_CLASSES = Array.from({ length: 26 }, (_, i) => `CEI-${String.fromCharCode(65 + i)}`);

// 2. 定義所有選項 (給家長下拉選單用)
const ALL_OPTIONS = ['課後輔導班', ...ENGLISH_CLASSES];

export default function AdminPage() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // 編輯模式
    const [editingUser, setEditingUser] = useState<any>(null);
    const [editName, setEditName] = useState('');

    // 老師專用：負責班級
    const [teacherClasses, setTeacherClasses] = useState<string[]>([]);

    // 家長專用：新增小孩
    const [newChildName, setNewChildName] = useState('');
    const [newChildGrade, setNewChildGrade] = useState('CEI-A');
    const [isAfterSchool, setIsAfterSchool] = useState(false);

    const router = useRouter();

    useEffect(() => {
        checkAdmin();
        fetchUsers();
    }, []);

    async function checkAdmin() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        if (!['admin', 'director', 'manager'].includes(profile?.role || '')) {
            alert('權限不足');
            router.push('/');
        }
    }

    async function fetchUsers() {
        setLoading(true);
        const { data: profiles } = await supabase
            .from('profiles')
            .select(`*, students (*)`)
            .order('created_at', { ascending: false });

        if (profiles) setUsers(profiles);
        setLoading(false);
    }

    function openEditModal(user: any) {
        setEditingUser(user);
        setEditName(user.full_name || '');
        setTeacherClasses(user.responsible_classes || []);

        // 重置家長表單
        setNewChildName('');
        setNewChildGrade('CEI-A');
        setIsAfterSchool(false);
    }

    function toggleTeacherClass(cls: string) {
        if (teacherClasses.includes(cls)) {
            setTeacherClasses(prev => prev.filter(c => c !== cls));
        } else {
            setTeacherClasses(prev => [...prev, cls]);
        }
    }

    async function handleSaveUser() {
        if (!editingUser) return;

        try {
            // 1. 更新資料
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    role: editingUser.role,
                    full_name: editName,
                    // 只有老師需要存班級，其他人存 null
                    responsible_classes: editingUser.role === 'teacher' ? teacherClasses : null
                })
                .eq('id', editingUser.id);

            if (profileError) throw profileError;

            // 2. 家長新增小孩
            if (editingUser.role === 'parent' && newChildName.trim()) {
                let finalGrade = newChildGrade;

                // 邏輯：有勾選課輔就不重複加
                if (isAfterSchool && !finalGrade.includes('課後輔導班')) {
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
            setEditingUser(null);
            await fetchUsers();

        } catch (error: any) {
            alert('更新失敗: ' + error.message);
        }
    }

    async function deleteStudent(studentId: string) {
        if (!confirm('確定要刪除這位學生嗎？')) return;
        const { error } = await supabase.from('students').delete().eq('id', studentId);
        if (!error) {
            setEditingUser({
                ...editingUser,
                students: editingUser.students.filter((s: any) => s.id !== studentId)
            });
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

                <div className="bg-white rounded-xl shadow overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-gray-100 border-b">
                            <tr>
                                <th className="p-4 text-left font-bold text-gray-600">姓名 / Email</th>
                                <th className="p-4 text-left font-bold text-gray-600">身分</th>
                                <th className="p-4 text-left font-bold text-gray-600">負責班級 / 綁定學生</th>
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
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${user.role === 'teacher' ? 'bg-blue-100 text-blue-700' :
                                                user.role === 'parent' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                                            }`}>
                                            {user.role === 'teacher' ? '老師' : user.role === 'parent' ? '家長' : user.role}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        {/* 老師顯示負責班級 */}
                                        {user.role === 'teacher' && user.responsible_classes && (
                                            <div className="flex flex-wrap gap-1">
                                                {user.responsible_classes.map((cls: string) => (
                                                    <span key={cls} className={`px-2 py-0.5 rounded text-xs border ${cls === '課後輔導班'
                                                            ? 'bg-amber-100 text-amber-800 border-amber-300 font-bold' // 🟡 列表上也用明顯的橘黃色
                                                            : 'bg-blue-50 text-blue-600 border-blue-100'
                                                        }`}>
                                                        {cls}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {/* 家長顯示學生 */}
                                        {user.role === 'parent' && user.students && (
                                            <div className="flex flex-wrap gap-1">
                                                {user.students.map((s: any) => (
                                                    <span key={s.id} className="bg-orange-50 text-orange-600 px-2 py-0.5 rounded text-xs border border-orange-100">
                                                        {s.chinese_name}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        <button onClick={() => openEditModal(user)} className="px-3 py-1 bg-white text-gray-600 rounded border hover:bg-gray-50 text-sm font-bold shadow-sm">
                                            設定
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
                        <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
                            <div className="p-6 border-b bg-gray-50 flex-shrink-0">
                                <h3 className="text-xl font-bold text-gray-800">編輯用戶資料</h3>
                                <div className="text-sm text-gray-500 mt-1">{editingUser.email}</div>
                            </div>

                            <div className="p-6 space-y-6 overflow-y-auto">
                                {/* 1. 身分 */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">設定身分</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {['parent', 'teacher', 'manager', 'director'].map(r => (
                                            <button key={r} onClick={() => setEditingUser({ ...editingUser, role: r })} className={`py-2 rounded border text-sm font-bold transition ${editingUser.role === r ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`}>
                                                {r === 'parent' ? '家長' : r === 'teacher' ? '老師' : r === 'manager' ? '行政' : '主任'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* 2. 姓名 */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">顯示名稱</label>
                                    <input type="text" className="w-full p-2 border rounded" value={editName} onChange={e => setEditName(e.target.value)} />
                                </div>

                                <hr className="border-gray-100" />

                                {/* 🟢 老師專區：高對比分區顯示 */}
                                {editingUser.role === 'teacher' && (
                                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                        <h4 className="font-bold text-gray-800 mb-3">🧑‍🏫 老師負責班級</h4>

                                        {/* 區域 A: 特殊班級 (高亮顯示) */}
                                        <div className="mb-4">
                                            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">安親 / 課輔專區</label>
                                            <button
                                                onClick={() => toggleTeacherClass('課後輔導班')}
                                                className={`w-full py-3 rounded-xl font-bold border-2 transition text-lg flex items-center justify-center gap-2 ${teacherClasses.includes('課後輔導班')
                                                        ? 'bg-amber-400 text-white border-amber-500 shadow-md transform scale-[1.02]' // 🟡 選中：明顯的橘黃色
                                                        : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'
                                                    }`}
                                            >
                                                {teacherClasses.includes('課後輔導班') ? '✅' : '🏫'} 課後輔導班
                                            </button>
                                        </div>

                                        {/* 區域 B: 英文班級 (網格顯示) */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">英文班級 (English Classes)</label>
                                            <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto pr-1">
                                                {ENGLISH_CLASSES.map(cls => (
                                                    <button
                                                        key={cls}
                                                        onClick={() => toggleTeacherClass(cls)}
                                                        className={`py-1.5 rounded-lg text-xs font-bold border transition ${teacherClasses.includes(cls)
                                                                ? 'bg-blue-600 text-white border-blue-600' // 🔵 英文班級維持藍色
                                                                : 'bg-white text-gray-400 border-gray-200 hover:border-blue-300'
                                                            }`}
                                                    >
                                                        {cls}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* 家長專區 */}
                                {editingUser.role === 'parent' && (
                                    <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                                        <h4 className="font-bold text-orange-800 mb-4">👶 綁定學生</h4>
                                        <div className="space-y-2 mb-4">
                                            {editingUser.students?.map((s: any) => (
                                                <div key={s.id} className="flex justify-between items-center bg-white p-2 rounded shadow-sm">
                                                    <span className="font-bold text-gray-800">{s.chinese_name} <span className="text-xs text-gray-400">({s.grade})</span></span>
                                                    <button onClick={() => deleteStudent(s.id)} className="text-red-500 text-xs hover:underline">移除</button>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="bg-white p-3 rounded-lg border border-orange-200">
                                            <label className="block text-xs font-bold text-gray-500 mb-2">➕ 新增</label>
                                            <div className="flex gap-2 mb-2">
                                                <input type="text" placeholder="學生姓名" className="flex-1 p-2 border rounded" value={newChildName} onChange={e => setNewChildName(e.target.value)} />
                                                <select className="w-32 p-2 border rounded bg-white" value={newChildGrade} onChange={e => setNewChildGrade(e.target.value)}>
                                                    {ALL_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </div>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={isAfterSchool} onChange={e => setIsAfterSchool(e.target.checked)} />
                                                <span className="text-sm text-gray-700 font-bold">額外參加課輔 (雙修)</span>
                                            </label>
                                        </div>
                                    </div>
                                )}

                            </div>

                            <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 flex-shrink-0">
                                <button onClick={() => setEditingUser(null)} className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-200 rounded">取消</button>
                                <button onClick={handleSaveUser} className="px-6 py-2 bg-blue-600 text-white font-bold rounded shadow hover:bg-blue-700">儲存變更</button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}