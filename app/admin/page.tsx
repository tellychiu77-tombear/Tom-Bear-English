'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

const ENGLISH_CLASSES = Array.from({ length: 26 }, (_, i) => `CEI-${String.fromCharCode(65 + i)}`);

export default function AdminPage() {
    const [myRole, setMyRole] = useState<string>('');
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // 編輯視窗
    const [isEditing, setIsEditing] = useState(false);
    const [editingUser, setEditingUser] = useState<any>(null);
    const [userChildren, setUserChildren] = useState<any[]>([]);

    // 表單
    const [form, setForm] = useState({
        role: 'parent',
        full_name: '',
        assigned_classes: [] as string[],
        child_name: '',
        child_english_grade: '',
        child_is_after_school: false,
    });

    const router = useRouter();

    useEffect(() => {
        init();
    }, []);

    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        const role = profile?.role || '';
        setMyRole(role);

        if (!['director', 'manager', 'admin'].includes(role)) {
            alert('權限不足');
            router.push('/');
            return;
        }
        fetchUsers();
    }

    async function fetchUsers() {
        setLoading(true);
        // 🟢 排序優化：pending (待審核) 排最前面，方便主任看到
        const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });

        if (data) {
            // 把 pending 的移到陣列最前面
            const pending = data.filter(u => u.role === 'pending');
            const others = data.filter(u => u.role !== 'pending');
            setUsers([...pending, ...others]);
        }
        setLoading(false);
    }

    async function handleEdit(user: any) {
        if (myRole === 'admin' && ['director', 'manager'].includes(user.role)) {
            alert('權限不足');
            return;
        }

        setEditingUser(user);

        let currentClasses: string[] = [];
        if (user.assigned_class) {
            currentClasses = user.assigned_class.split(',').map((c: string) => c.trim());
        }

        let children: any[] = [];
        // 即使是 pending，如果他申請家長，我們也要抓小孩資料給主任看
        const { data } = await supabase.from('students').select('*').eq('parent_id', user.id);
        children = data || [];
        setUserChildren(children);

        setForm({
            // 如果原本是 pending，我們不預設 role，強迫管理者選一個
            role: user.role === 'pending' ? 'parent' : user.role,
            full_name: user.full_name || '',
            assigned_classes: currentClasses,
            child_name: '',
            child_english_grade: 'CEI-A',
            child_is_after_school: false,
        });
        setIsEditing(true);
    }

    function toggleClass(className: string) {
        setForm(prev => {
            const exists = prev.assigned_classes.includes(className);
            if (exists) return { ...prev, assigned_classes: prev.assigned_classes.filter(c => c !== className) };
            else return { ...prev, assigned_classes: [...prev.assigned_classes, className] };
        });
    }

    async function handleSave() {
        if (!editingUser) return;

        // 如果管理者沒有把 role 改掉 (還是 pending)，提醒他
        if (form.role === 'pending') {
            alert('請為此使用者選擇一個正式身分 (家長/老師/行政)');
            return;
        }

        // 1. 如果名字裡有 "(申請家長)" 這種備註，我們可以幫忙清掉，只留名字
        let cleanName = form.full_name;
        if (cleanName.includes('(')) {
            cleanName = cleanName.split('(')[0].trim();
        }

        const updates: any = {
            role: form.role,
            full_name: cleanName,
        };

        if (form.role === 'teacher') {
            updates.assigned_class = form.assigned_classes.join(', ');
        }

        const { error } = await supabase.from('profiles').update(updates).eq('id', editingUser.id);
        if (error) { alert('更新失敗: ' + error.message); return; }

        // 2. 新增小孩邏輯
        if (form.role === 'parent' && form.child_name) {
            const parts = [];
            if (form.child_english_grade) parts.push(form.child_english_grade);
            if (form.child_is_after_school) parts.push('課後輔導班');
            const finalGrade = parts.join(', ') || '未分班';

            await supabase.from('students').insert({
                parent_id: editingUser.id,
                chinese_name: form.child_name,
                grade: finalGrade
            });
        }

        alert('設定成功！該帳號已開通。');
        setIsEditing(false);
        fetchUsers();
    }

    if (loading) return <div className="p-8 text-center">載入中...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-800">👥 人事權限審核</h1>
                    <button onClick={() => router.push('/')} className="px-4 py-2 bg-gray-400 text-white rounded">回首頁</button>
                </div>

                <div className="bg-white rounded-xl shadow overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-gray-100 border-b">
                            <tr>
                                <th className="p-4 text-sm font-bold text-gray-600">使用者</th>
                                <th className="p-4 text-sm font-bold text-gray-600">身分狀態</th>
                                <th className="p-4 text-sm font-bold text-gray-600">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {users.map(u => (
                                <tr key={u.id} className={`transition ${u.role === 'pending' ? 'bg-yellow-50 animate-pulse-slow' : 'hover:bg-blue-50'}`}>
                                    <td className="p-4">
                                        <div className="font-bold text-gray-800">{u.full_name || '(未設定)'}</div>
                                        <div className="text-xs text-gray-400">{u.email}</div>
                                    </td>
                                    <td className="p-4">
                                        {/* 🟢 待審核標籤 */}
                                        {u.role === 'pending' ? (
                                            <span className="px-3 py-1 rounded-full text-sm font-black bg-yellow-400 text-yellow-900 shadow-sm blink">
                                                ⚠️ 待審核 (點此開通)
                                            </span>
                                        ) : (
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${u.role === 'director' ? 'bg-purple-100 text-purple-800' :
                                                    u.role === 'admin' ? 'bg-blue-100 text-blue-800' :
                                                        u.role === 'teacher' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                                                }`}>
                                                {u.role === 'director' ? '👑 主任' : u.role === 'admin' ? '🛡️ 行政' : u.role === 'teacher' ? '👩‍🏫 老師' : '🏠 家長'}
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4">
                                        <button onClick={() => handleEdit(u)} className={`font-bold text-sm px-4 py-2 rounded ${u.role === 'pending' ? 'bg-blue-600 text-white shadow hover:bg-blue-700' : 'text-blue-600 hover:bg-blue-50'}`}>
                                            {u.role === 'pending' ? '✏️ 審核/開通' : '⚙️ 設定'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* 編輯/審核視窗 */}
                {isEditing && editingUser && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
                            <div className={`p-4 text-white flex justify-between items-center ${editingUser.role === 'pending' ? 'bg-yellow-500' : 'bg-blue-600'}`}>
                                <h3 className="font-bold text-lg">
                                    {editingUser.role === 'pending' ? '⚠️ 帳號審核中' : '⚙️ 權限設定'} : {editingUser.email}
                                </h3>
                                <button onClick={() => setIsEditing(false)} className="text-white/80 hover:text-white">✕</button>
                            </div>

                            <div className="p-6 space-y-5 overflow-y-auto flex-1">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">姓名 (可修改)</label>
                                    <input type="text" className="w-full p-2 border rounded" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
                                </div>

                                <div className="bg-gray-50 p-4 rounded border">
                                    <label className="block text-sm font-bold text-gray-700 mb-2">請選擇正式身分 (開通)</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {['parent', 'teacher', 'admin', 'manager'].map(r => (
                                            <button key={r} onClick={() => setForm({ ...form, role: r })}
                                                className={`p-2 rounded border text-sm font-bold capitalize ${form.role === r ? 'bg-blue-600 text-white ring-2 ring-blue-300' : 'bg-white hover:bg-gray-100'}`}>
                                                {r === 'manager' ? '主任' : r === 'admin' ? '行政' : r === 'teacher' ? '老師' : '家長'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* 家長資料預覽區 */}
                                {form.role === 'parent' && (
                                    <div className="space-y-4">
                                        <h4 className="font-bold text-orange-800 text-sm border-b pb-1">👶 該帳號綁定的學生 (預覽)</h4>
                                        {userChildren.length > 0 ? (
                                            <ul className="space-y-1 bg-orange-50 p-2 rounded">
                                                {userChildren.map(c => (
                                                    <li key={c.id} className="text-sm">・{c.chinese_name} ({c.grade})</li>
                                                ))}
                                            </ul>
                                        ) : <p className="text-xs text-gray-400">尚無資料</p>}

                                        {/* 補登功能 */}
                                        <div className="pt-2">
                                            <label className="block text-xs font-bold text-gray-600">補登其他小孩 (選填)</label>
                                            <div className="flex gap-2 mt-1">
                                                <input type="text" className="border p-1 rounded text-sm" placeholder="姓名" value={form.child_name} onChange={e => setForm({ ...form, child_name: e.target.value })} />
                                                <select className="border p-1 rounded text-sm" value={form.child_english_grade} onChange={e => setForm({ ...form, child_english_grade: e.target.value })}>
                                                    <option value="">(無)</option>
                                                    {ENGLISH_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* 老師班級區 */}
                                {form.role === 'teacher' && (
                                    <div>
                                        <h4 className="font-bold text-green-800 text-sm mb-2">📋 負責班級</h4>
                                        <div className="grid grid-cols-3 gap-2 h-32 overflow-y-auto border p-2 rounded">
                                            {['課後輔導班', ...ENGLISH_CLASSES].map(cls => (
                                                <label key={cls} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={form.assigned_classes.includes(cls)} onChange={() => toggleClass(cls)} /> {cls}</label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="p-4 border-t flex justify-end gap-3">
                                <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-gray-600 font-bold">取消</button>
                                <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 shadow-lg">
                                    {editingUser.role === 'pending' ? '✅ 確認開通' : '儲存變更'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}