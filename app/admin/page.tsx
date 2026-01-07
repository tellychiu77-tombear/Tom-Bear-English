'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
    const [myRole, setMyRole] = useState<string>(''); // 我是誰 (主任/行政)
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // 編輯視窗狀態
    const [isEditing, setIsEditing] = useState(false);
    const [editingUser, setEditingUser] = useState<any>(null);

    // 表單資料
    const [form, setForm] = useState({
        role: 'parent',
        full_name: '',
        // 教職員專用
        assigned_class: '',
        // 家長專用 (快速建檔學生)
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

        // 1. 檢查我的權限
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        const role = profile?.role || '';
        setMyRole(role);

        // 只有 主任(manager/director) 或 行政(admin) 可以進來
        if (!['director', 'manager', 'admin'].includes(role)) {
            alert('您無權限進入人事管理中心');
            router.push('/');
            return;
        }

        fetchUsers();
    }

    async function fetchUsers() {
        setLoading(true);
        // 抓取所有使用者，並按照身分排序 (主任 -> 行政 -> 老師 -> 家長)
        const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
        if (data) setUsers(data);
        setLoading(false);
    }

    // 打開編輯視窗
    function handleEdit(user: any) {
        // 🛡️ 權限防呆：行政人員 (admin) 不能編輯 主任 (director/manager)
        if (myRole === 'admin' && ['director', 'manager'].includes(user.role)) {
            alert('權限不足：行政人員無法編輯主任資料');
            return;
        }

        setEditingUser(user);
        setForm({
            role: user.role || 'parent',
            full_name: user.full_name || '',
            assigned_class: user.assigned_class || '',
            child_name: '',    // 預設空 (若要編輯家長，通常是去學生檔案那邊改，這裡主要用於「新設定」)
            child_grade: 'CEI-A'
        });
        setIsEditing(true);
    }

    // 儲存設定
    async function handleSave() {
        if (!editingUser) return;

        // 1. 更新使用者身分 (profiles)
        const updates: any = {
            role: form.role,
            full_name: form.full_name,
        };

        // 如果是老師，更新負責班級
        if (form.role === 'teacher') {
            updates.assigned_class = form.assigned_class;
        }

        const { error } = await supabase.from('profiles').update(updates).eq('id', editingUser.id);

        if (error) {
            alert('更新失敗: ' + error.message);
            return;
        }

        // 2. 特殊功能：如果是設定為「家長」，且有填寫小孩資料 -> 自動建立學生檔案！
        if (form.role === 'parent' && form.child_name) {
            const { error: studentError } = await supabase.from('students').insert({
                parent_id: editingUser.id,       // 綁定這個人
                chinese_name: form.child_name,   // 小孩名字
                grade: form.child_grade          // 直接分班！
            });
            if (studentError) {
                alert('身分已更新，但學生建立失敗 (可能已存在): ' + studentError.message);
            } else {
                alert(`成功！已將 ${form.full_name} 設為家長，並將學生 ${form.child_name} 分配至 ${form.child_grade} 班。`);
            }
        } else {
            alert('人事資料更新成功！');
        }

        setIsEditing(false);
        fetchUsers();
    }

    // 刪除帳號 (僅主任可執行)
    async function handleDelete(id: string, role: string) {
        if (myRole === 'admin') {
            alert('權限不足：僅主任可以刪除帳號');
            return;
        }
        if (role === 'director' || role === 'manager') {
            alert('無法刪除最高權限管理者');
            return;
        }

        if (!confirm('確定要刪除此帳號嗎？')) return;

        // 這裡通常是呼叫 Supabase Admin API 刪除 Auth，但前端只能刪除 profiles 資料
        // 為了安全，我們先做「軟刪除」或清除 profile 資料
        const { error } = await supabase.from('profiles').delete().eq('id', id);
        if (error) alert('刪除失敗');
        else fetchUsers();
    }

    // 產生角色標籤顏色
    function getRoleBadge(role: string) {
        switch (role) {
            case 'director':
            case 'manager': return <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs font-bold">👑 主任/園長</span>;
            case 'admin': return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold">🛡️ 行政人員</span>;
            case 'teacher': return <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-bold">👩‍🏫 老師</span>;
            case 'parent': return <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-bold">🏠 家長</span>;
            default: return <span className="bg-gray-100 text-gray-500 px-2 py-1 rounded text-xs">未設定</span>;
        }
    }

    if (loading) return <div className="p-8 text-center">載入中...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto">

                {/* 頂部標題 */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">👥 人事管理中心</h1>
                        <p className="text-sm text-gray-500">當前身分：{getRoleBadge(myRole)}</p>
                    </div>
                    <button onClick={() => router.push('/')} className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500">回首頁</button>
                </div>

                {/* 使用者列表 */}
                <div className="bg-white rounded-xl shadow overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-gray-100 border-b">
                            <tr>
                                <th className="p-4 text-sm font-bold text-gray-600">Email / 姓名</th>
                                <th className="p-4 text-sm font-bold text-gray-600">目前身分</th>
                                <th className="p-4 text-sm font-bold text-gray-600">詳細資訊</th>
                                <th className="p-4 text-sm font-bold text-gray-600 text-right">權限設定</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {users.map(u => (
                                <tr key={u.id} className="hover:bg-blue-50 transition">
                                    <td className="p-4">
                                        <div className="font-bold text-gray-800">{u.email}</div>
                                        <div className="text-xs text-gray-500">{u.full_name || '(未設定姓名)'}</div>
                                    </td>
                                    <td className="p-4">{getRoleBadge(u.role)}</td>
                                    <td className="p-4 text-sm text-gray-600">
                                        {u.role === 'teacher' && <span className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded">班級: {u.assigned_class || '未分班'}</span>}
                                    </td>
                                    <td className="p-4 text-right">
                                        <button
                                            onClick={() => handleEdit(u)}
                                            className="text-blue-600 hover:text-blue-800 font-bold text-sm mr-4"
                                        >
                                            ⚙️ 設定權限
                                        </button>
                                        {/* 只有主任能看到刪除按鈕 */}
                                        {['director', 'manager'].includes(myRole) && (
                                            <button onClick={() => handleDelete(u.id, u.role)} className="text-red-400 hover:text-red-600 text-sm">刪除</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* ============ 權限編輯視窗 (Modal) ============ */}
                {isEditing && editingUser && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden animate-fade-in">
                            <div className="bg-blue-600 p-4 text-white flex justify-between items-center">
                                <h3 className="font-bold text-lg">⚙️ 權限設定: {editingUser.email}</h3>
                                <button onClick={() => setIsEditing(false)} className="text-white/80 hover:text-white">✕</button>
                            </div>

                            <div className="p-6 space-y-4">

                                {/* 1. 設定姓名 */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">使用者姓名</label>
                                    <input
                                        type="text"
                                        className="w-full p-2 border rounded"
                                        placeholder="例: 王大明"
                                        value={form.full_name}
                                        onChange={e => setForm({ ...form, full_name: e.target.value })}
                                    />
                                </div>

                                {/* 2. 選擇身分 */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">賦予身分</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {/* 家長 (所有人都能設) */}
                                        <button
                                            onClick={() => setForm({ ...form, role: 'parent' })}
                                            className={`p-2 rounded border text-sm font-bold ${form.role === 'parent' ? 'bg-orange-100 border-orange-500 text-orange-800' : 'hover:bg-gray-50'}`}
                                        >
                                            🏠 家長 (Parent)
                                        </button>

                                        {/* 老師 (所有人都能設 - 假設行政也能排班) */}
                                        <button
                                            onClick={() => setForm({ ...form, role: 'teacher' })}
                                            className={`p-2 rounded border text-sm font-bold ${form.role === 'teacher' ? 'bg-green-100 border-green-500 text-green-800' : 'hover:bg-gray-50'}`}
                                        >
                                            👩‍🏫 老師 (Teacher)
                                        </button>

                                        {/* 行政/主任 (只有主任能設) */}
                                        {['director', 'manager'].includes(myRole) && (
                                            <>
                                                <button
                                                    onClick={() => setForm({ ...form, role: 'admin' })}
                                                    className={`p-2 rounded border text-sm font-bold ${form.role === 'admin' ? 'bg-blue-100 border-blue-500 text-blue-800' : 'hover:bg-gray-50'}`}
                                                >
                                                    🛡️ 行政 (Admin)
                                                </button>
                                                <button
                                                    onClick={() => setForm({ ...form, role: 'manager' })}
                                                    className={`p-2 rounded border text-sm font-bold ${form.role === 'manager' ? 'bg-purple-100 border-purple-500 text-purple-800' : 'hover:bg-gray-50'}`}
                                                >
                                                    👑 主任 (Manager)
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <hr className="border-gray-100 my-2" />

                                {/* 3. 動態欄位：根據選擇的身分顯示不同輸入框 */}

                                {/* A. 如果選「家長」 -> 顯示快速建檔學生 */}
                                {form.role === 'parent' && (
                                    <div className="bg-orange-50 p-4 rounded border border-orange-100">
                                        <h4 className="font-bold text-orange-800 text-sm mb-2">🚀 快速綁定學生 (建立連結)</h4>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600">學生姓名</label>
                                                <input type="text" className="w-full p-2 border rounded text-sm" placeholder="輸入小孩名字..."
                                                    value={form.child_name} onChange={e => setForm({ ...form, child_name: e.target.value })} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600">分配班級 (老師馬上看得到)</label>
                                                <select className="w-full p-2 border rounded text-sm"
                                                    value={form.child_grade} onChange={e => setForm({ ...form, child_grade: e.target.value })}>
                                                    <option value="CEI-A">CEI-A</option>
                                                    <option value="CEI-B">CEI-B</option>
                                                    <option value="CEI-C">CEI-C</option>
                                                    {/* ...更多班級... */}
                                                    <option value="CEI-Z">CEI-Z</option>
                                                    <option value="課後輔導班">課後輔導班</option>
                                                </select>
                                            </div>
                                            <p className="text-[10px] text-orange-600">* 若學生已存在，此操作將會建立一筆新資料，請謹慎使用。</p>
                                        </div>
                                    </div>
                                )}

                                {/* B. 如果選「老師」 -> 顯示分配班級 */}
                                {form.role === 'teacher' && (
                                    <div className="bg-green-50 p-4 rounded border border-green-100">
                                        <h4 className="font-bold text-green-800 text-sm mb-2">📋 老師負責班級</h4>
                                        <input type="text" className="w-full p-2 border rounded text-sm" placeholder="例如: CEI-A"
                                            value={form.assigned_class} onChange={e => setForm({ ...form, assigned_class: e.target.value })} />
                                    </div>
                                )}

                            </div>

                            {/* 底部按鈕 */}
                            <div className="p-4 bg-gray-50 flex justify-end gap-3 border-t">
                                <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-200 rounded">取消</button>
                                <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 shadow">
                                    儲存設定
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}