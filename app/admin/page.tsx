'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

// 產生班級選項
const ENGLISH_CLASSES = Array.from({ length: 26 }, (_, i) => `CEI-${String.fromCharCode(65 + i)}`);

export default function AdminPage() {
    const [myRole, setMyRole] = useState<string>(''); // 我是誰
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // 編輯視窗狀態
    const [isEditing, setIsEditing] = useState(false);
    const [editingUser, setEditingUser] = useState<any>(null);

    // 表單資料
    const [form, setForm] = useState({
        role: 'parent',
        full_name: '',

        // 老師專用 (多選班級)
        assigned_classes: [] as string[],

        // 家長專用
        child_name: '',
        child_grade: 'CEI-A'
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

    function handleEdit(user: any) {
        // 🛡️ 權限防呆：行政人員 (admin) 不能編輯 主任 (director/manager)
        if (myRole === 'admin' && ['director', 'manager'].includes(user.role)) {
            alert('權限不足：行政人員無法編輯主任資料');
            return;
        }

        setEditingUser(user);

        // 解析老師的班級 (將字串 "CEI-A, CEI-B" 轉為陣列)
        let currentClasses: string[] = [];
        if (user.assigned_class) {
            currentClasses = user.assigned_class.split(',').map((c: string) => c.trim());
        }

        setForm({
            role: user.role || 'parent',
            full_name: user.full_name || '',
            assigned_classes: currentClasses,
            child_name: '',
            child_grade: 'CEI-A'
        });
        setIsEditing(true);
    }

    // 處理老師班級勾選
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

        const updates: any = {
            role: form.role,
            full_name: form.full_name,
        };

        // 如果是老師，儲存班級字串 (逗號分隔)
        if (form.role === 'teacher') {
            updates.assigned_class = form.assigned_classes.join(', ');
        }

        const { error } = await supabase.from('profiles').update(updates).eq('id', editingUser.id);

        if (error) {
            alert('更新失敗: ' + error.message);
            return;
        }

        // 家長快速建檔邏輯 (維持不變)
        if (form.role === 'parent' && form.child_name) {
            await supabase.from('students').insert({
                parent_id: editingUser.id,
                chinese_name: form.child_name,
                grade: form.child_grade
            });
            alert(`已將 ${form.full_name} 設為家長並綁定學生 ${form.child_name}。`);
        } else {
            alert('權限與資料更新成功！');
        }

        setIsEditing(false);
        fetchUsers();
    }

    // 顯示權限說明文字
    function getRoleDescription(role: string) {
        switch (role) {
            case 'parent': return '只能查看自己小孩的成績、聯絡簿，並使用請假與接送功能。無法接觸其他資料。';
            case 'teacher': return '可管理「負責班級」的學生、發送聯絡簿、登記成績、審核假單。';
            case 'admin': return '可進入「人事中心」設定家長與老師，管理所有學生檔案。❌ 無法設定主任權限，❌ 無法刪除帳號。';
            case 'manager':
            case 'director': return '👑 最高權限。可管理所有帳號、刪除資料、設定行政人員。';
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
                                <th className="p-4 text-sm font-bold text-gray-600">目前身分</th>
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
                                            {u.role === 'director' || u.role === 'manager' ? '👑 主任' :
                                                u.role === 'admin' ? '🛡️ 行政' :
                                                    u.role === 'teacher' ? '👩‍🏫 老師' : '🏠 家長'}
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
                                        {/* 權限控制：行政不能動主任 */}
                                        {!(myRole === 'admin' && ['director', 'manager'].includes(u.role)) && (
                                            <button onClick={() => handleEdit(u)} className="text-blue-600 hover:text-blue-800 font-bold text-sm">
                                                ⚙️ 設定
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* ============ 權限編輯視窗 ============ */}
                {isEditing && editingUser && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
                            <div className="bg-blue-600 p-4 text-white flex justify-between items-center shrink-0">
                                <h3 className="font-bold text-lg">⚙️ 權限設定: {editingUser.email}</h3>
                                <button onClick={() => setIsEditing(false)} className="text-white/80 hover:text-white">✕</button>
                            </div>

                            <div className="p-6 space-y-5 overflow-y-auto flex-1">

                                {/* 1. 姓名設定 */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">使用者姓名</label>
                                    <input type="text" className="w-full p-2 border rounded" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="例: 王大明" />
                                </div>

                                {/* 2. 身分選擇 (附帶權限說明) */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">賦予身分與權限</label>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                        <button onClick={() => setForm({ ...form, role: 'parent' })} className={`p-2 rounded border text-sm font-bold transition ${form.role === 'parent' ? 'bg-orange-100 border-orange-500 text-orange-800 ring-2 ring-orange-200' : 'hover:bg-gray-50'}`}>🏠 家長</button>
                                        <button onClick={() => setForm({ ...form, role: 'teacher' })} className={`p-2 rounded border text-sm font-bold transition ${form.role === 'teacher' ? 'bg-green-100 border-green-500 text-green-800 ring-2 ring-green-200' : 'hover:bg-gray-50'}`}>👩‍🏫 老師</button>

                                        {/* 只有主任能指派行政或主任 */}
                                        {['director', 'manager'].includes(myRole) && (
                                            <>
                                                <button onClick={() => setForm({ ...form, role: 'admin' })} className={`p-2 rounded border text-sm font-bold transition ${form.role === 'admin' ? 'bg-blue-100 border-blue-500 text-blue-800 ring-2 ring-blue-200' : 'hover:bg-gray-50'}`}>🛡️ 行政</button>
                                                <button onClick={() => setForm({ ...form, role: 'manager' })} className={`p-2 rounded border text-sm font-bold transition ${form.role === 'manager' ? 'bg-purple-100 border-purple-500 text-purple-800 ring-2 ring-purple-200' : 'hover:bg-gray-50'}`}>👑 主任</button>
                                            </>
                                        )}
                                    </div>
                                    {/* 動態顯示權限說明 */}
                                    <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600 flex gap-2 items-start">
                                        <span className="text-lg">💡</span>
                                        <span>{getRoleDescription(form.role)}</span>
                                    </div>
                                </div>

                                <hr className="border-gray-100" />

                                {/* 3. 老師：多班級選擇器 */}
                                {form.role === 'teacher' && (
                                    <div className="bg-green-50 p-4 rounded border border-green-100">
                                        <h4 className="font-bold text-green-800 text-sm mb-3">📋 勾選負責班級 (可多選)</h4>
                                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto pr-2">
                                            {/* 安親班選項 */}
                                            <label className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-xs font-bold ${form.assigned_classes.includes('課後輔導班') ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600'}`}>
                                                <input type="checkbox" className="hidden"
                                                    checked={form.assigned_classes.includes('課後輔導班')}
                                                    onChange={() => toggleClass('課後輔導班')}
                                                />
                                                課後輔導班
                                            </label>
                                            {/* 英文班選項 */}
                                            {ENGLISH_CLASSES.map(cls => (
                                                <label key={cls} className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-xs font-bold ${form.assigned_classes.includes(cls) ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600'}`}>
                                                    <input type="checkbox" className="hidden"
                                                        checked={form.assigned_classes.includes(cls)}
                                                        onChange={() => toggleClass(cls)}
                                                    />
                                                    {cls}
                                                </label>
                                            ))}
                                        </div>
                                        <div className="mt-2 text-xs text-green-700">
                                            已選: {form.assigned_classes.length > 0 ? form.assigned_classes.join(', ') : '(尚未選擇)'}
                                        </div>
                                    </div>
                                )}

                                {/* 4. 家長：快速建檔 */}
                                {form.role === 'parent' && (
                                    <div className="bg-orange-50 p-4 rounded border border-orange-100">
                                        <h4 className="font-bold text-orange-800 text-sm mb-2">🚀 快速綁定學生</h4>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600">學生姓名</label>
                                                <input type="text" className="w-full p-2 border rounded text-sm" value={form.child_name} onChange={e => setForm({ ...form, child_name: e.target.value })} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600">班級</label>
                                                <select className="w-full p-2 border rounded text-sm" value={form.child_grade} onChange={e => setForm({ ...form, child_grade: e.target.value })}>
                                                    {ENGLISH_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                                                    <option value="課後輔導班">課後輔導班</option>
                                                </select>
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