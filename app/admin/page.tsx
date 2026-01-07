'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

const ENGLISH_CLASSES = Array.from({ length: 26 }, (_, i) => `CEI-${String.fromCharCode(65 + i)}`);

export default function AdminPage() {
    const [myRole, setMyRole] = useState<string>('');
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // 編輯視窗狀態
    const [isEditing, setIsEditing] = useState(false);
    const [editingUser, setEditingUser] = useState<any>(null);
    const [userChildren, setUserChildren] = useState<any[]>([]); // 🟢 該家長名下的小孩列表

    // 表單資料
    const [form, setForm] = useState({
        role: 'parent',
        full_name: '',

        // 老師專用
        assigned_classes: [] as string[],

        // 家長專用 (新增小孩)
        child_name: '',
        child_english_grade: '', // 英文班
        child_is_after_school: false, // 課輔班
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
        const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
        if (data) setUsers(data);
        setLoading(false);
    }

    async function handleEdit(user: any) {
        if (myRole === 'admin' && ['director', 'manager'].includes(user.role)) {
            alert('權限不足：行政人員無法編輯主任資料');
            return;
        }

        setEditingUser(user);

        // 解析老師班級
        let currentClasses: string[] = [];
        if (user.assigned_class) {
            currentClasses = user.assigned_class.split(',').map((c: string) => c.trim());
        }

        // 🟢 如果是家長，抓取他目前的小孩
        let children: any[] = [];
        if (user.role === 'parent') {
            const { data } = await supabase.from('students').select('*').eq('parent_id', user.id);
            children = data || [];
        }
        setUserChildren(children);

        setForm({
            role: user.role || 'parent',
            full_name: user.full_name || '',
            assigned_classes: currentClasses,

            // 重置小孩表單
            child_name: '',
            child_english_grade: 'CEI-A',
            child_is_after_school: false,
        });
        setIsEditing(true);
    }

    function toggleClass(className: string) {
        setForm(prev => {
            const exists = prev.assigned_classes.includes(className);
            if (exists) {
                return { ...prev, assigned_classes: prev.assigned_classes.filter(c => c !== className) };
            } else {
                return { ...prev, assigned_classes: [...prev.assigned_classes, className] };
            }
        });
    }

    async function handleSave() {
        if (!editingUser) return;

        // 1. 更新使用者身分
        const updates: any = {
            role: form.role,
            full_name: form.full_name,
        };

        if (form.role === 'teacher') {
            updates.assigned_class = form.assigned_classes.join(', ');
        }

        const { error } = await supabase.from('profiles').update(updates).eq('id', editingUser.id);
        if (error) { alert('更新失敗: ' + error.message); return; }

        // 2. 如果有填寫「新增小孩」欄位，則建立學生
        if (form.role === 'parent' && form.child_name) {
            // 組合班級字串
            const parts = [];
            if (form.child_english_grade) parts.push(form.child_english_grade);
            if (form.child_is_after_school) parts.push('課後輔導班');
            const finalGrade = parts.join(', ') || '未分班';

            const { error: childError } = await supabase.from('students').insert({
                parent_id: editingUser.id,
                chinese_name: form.child_name,
                grade: finalGrade
            });

            if (childError) alert('小孩建立失敗: ' + childError.message);
            else alert(`成功！已更新 ${form.full_name} 資料，並新增小孩：${form.child_name}`);
        } else {
            alert('資料更新成功！');
        }

        setIsEditing(false);
        fetchUsers();
    }

    function getRoleDescription(role: string) {
        switch (role) {
            case 'parent': return '家長帳號。一個帳號可綁定多位子女 (請在下方設定)。';
            case 'teacher': return '老師帳號。可勾選多個負責班級。';
            case 'admin': return '行政帳號。可管理家長與老師，無法管理主任。';
            case 'manager':
            case 'director': return '👑 主任帳號。擁有最高管理權限。';
            default: return '';
        }
    }

    if (loading) return <div className="p-8 text-center">載入中...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">👥 人事權限管理中心</h1>
                        <p className="text-sm text-gray-500">當前身分：{myRole === 'admin' ? '🛡️ 行政 (受限)' : '👑 主任 (完全控制)'}</p>
                    </div>
                    <button onClick={() => router.push('/')} className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500">回首頁</button>
                </div>

                {/* 使用者列表 */}
                <div className="bg-white rounded-xl shadow overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-gray-100 border-b">
                            <tr>
                                <th className="p-4 text-sm font-bold text-gray-600">使用者</th>
                                <th className="p-4 text-sm font-bold text-gray-600">身分</th>
                                <th className="p-4 text-sm font-bold text-gray-600">負責範圍 / 備註</th>
                                <th className="p-4 text-sm font-bold text-gray-600 text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {users.map(u => (
                                <tr key={u.id} className="hover:bg-blue-50 transition">
                                    <td className="p-4">
                                        <div className="font-bold text-gray-800">{u.full_name || '(未設定姓名)'}</div>
                                        <div className="text-xs text-gray-400">{u.email}</div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${u.role === 'director' || u.role === 'manager' ? 'bg-purple-100 text-purple-800' :
                                                u.role === 'admin' ? 'bg-blue-100 text-blue-800' :
                                                    u.role === 'teacher' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                                            }`}>
                                            {u.role === 'director' ? '👑 主任' : u.role === 'admin' ? '🛡️ 行政' : u.role === 'teacher' ? '👩‍🏫 老師' : '🏠 家長'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-sm text-gray-600">
                                        {u.role === 'teacher' && u.assigned_class && (
                                            <div className="flex flex-wrap gap-1">
                                                {u.assigned_class.split(',').map((c: string) => (
                                                    <span key={c} className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded border border-green-200">{c.trim()}</span>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        {!(myRole === 'admin' && ['director', 'manager'].includes(u.role)) && (
                                            <button onClick={() => handleEdit(u)} className="text-blue-600 hover:text-blue-800 font-bold text-sm">⚙️ 設定</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* ============ 編輯視窗 ============ */}
                {isEditing && editingUser && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
                            <div className="bg-blue-600 p-4 text-white flex justify-between items-center shrink-0">
                                <h3 className="font-bold text-lg">⚙️ 權限設定: {editingUser.email}</h3>
                                <button onClick={() => setIsEditing(false)} className="text-white/80 hover:text-white">✕</button>
                            </div>

                            <div className="p-6 space-y-5 overflow-y-auto flex-1">

                                {/* 1. 姓名 */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">使用者姓名</label>
                                    <input type="text" className="w-full p-2 border rounded" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="例: 王大明" />
                                </div>

                                {/* 2. 身分選擇 */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">身分與權限</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {['parent', 'teacher', 'admin', 'manager'].map(r => {
                                            if (['admin', 'manager'].includes(r) && !['director', 'manager'].includes(myRole)) return null;
                                            return (
                                                <button key={r} onClick={() => setForm({ ...form, role: r })}
                                                    className={`p-2 rounded border text-sm font-bold capitalize ${form.role === r ? 'bg-blue-100 border-blue-500 text-blue-800 ring-2' : 'hover:bg-gray-50'}`}>
                                                    {r === 'manager' ? '主任' : r === 'admin' ? '行政' : r === 'teacher' ? '老師' : '家長'}
                                                </button>
                                            )
                                        })}
                                    </div>
                                    <div className="mt-2 text-xs text-gray-500 bg-gray-50 p-2 rounded">💡 {getRoleDescription(form.role)}</div>
                                </div>

                                <hr className="border-gray-100" />

                                {/* 3. 老師：多班級 */}
                                {form.role === 'teacher' && (
                                    <div className="bg-green-50 p-4 rounded border border-green-100">
                                        <h4 className="font-bold text-green-800 text-sm mb-3">📋 負責班級 (可多選)</h4>
                                        <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                                            <label className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-xs font-bold ${form.assigned_classes.includes('課後輔導班') ? 'bg-green-600 text-white' : 'bg-white'}`}>
                                                <input type="checkbox" className="hidden" checked={form.assigned_classes.includes('課後輔導班')} onChange={() => toggleClass('課後輔導班')} />
                                                課後輔導班
                                            </label>
                                            {ENGLISH_CLASSES.map(cls => (
                                                <label key={cls} className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-xs font-bold ${form.assigned_classes.includes(cls) ? 'bg-green-600 text-white' : 'bg-white'}`}>
                                                    <input type="checkbox" className="hidden" checked={form.assigned_classes.includes(cls)} onChange={() => toggleClass(cls)} />
                                                    {cls}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* 4. 家長：小孩管理 (支援多寶) */}
                                {form.role === 'parent' && (
                                    <div className="bg-orange-50 p-4 rounded border border-orange-100 space-y-4">

                                        {/* 顯示已綁定的小孩 */}
                                        <div>
                                            <h4 className="font-bold text-orange-800 text-sm mb-2">👶 目前已綁定 ({userChildren.length} 位)</h4>
                                            {userChildren.length === 0 ? <p className="text-xs text-gray-400">尚無資料</p> : (
                                                <ul className="space-y-1">
                                                    {userChildren.map(child => (
                                                        <li key={child.id} className="text-xs bg-white px-2 py-1 rounded border flex justify-between">
                                                            <span>{child.chinese_name}</span>
                                                            <span className="text-gray-500">{child.grade}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>

                                        {/* 新增小孩表單 */}
                                        <div className="border-t border-orange-200 pt-3">
                                            <h4 className="font-bold text-orange-800 text-sm mb-2">➕ 新增另一位子女</h4>
                                            <div className="space-y-3">
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-600">姓名</label>
                                                    <input type="text" className="w-full p-2 border rounded text-sm" value={form.child_name} onChange={e => setForm({ ...form, child_name: e.target.value })} placeholder="輸入小孩名字" />
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-600">英文班級</label>
                                                        <select className="w-full p-2 border rounded text-sm" value={form.child_english_grade} onChange={e => setForm({ ...form, child_english_grade: e.target.value })}>
                                                            <option value="">(無)</option>
                                                            {ENGLISH_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                                                        </select>
                                                    </div>
                                                    <div className="flex items-end">
                                                        <label className="flex items-center gap-2 cursor-pointer bg-white px-2 py-2 border rounded w-full">
                                                            <input type="checkbox" checked={form.child_is_after_school} onChange={e => setForm({ ...form, child_is_after_school: e.target.checked })} />
                                                            <span className="text-xs font-bold text-gray-700">參加課後輔導</span>
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="p-4 bg-gray-50 flex justify-end gap-3 border-t shrink-0">
                                <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-200 rounded">取消</button>
                                <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 shadow">儲存設定</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}