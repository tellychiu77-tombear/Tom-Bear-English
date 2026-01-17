'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

// 定義英文班級選項 (必須與學生頁面完全一致)
const ENGLISH_CLASS_OPTIONS = [
    { value: 'NONE', label: '❌ 無英文主修 (純課後輔導)' },
    ...Array.from({ length: 26 }, (_, i) => ({
        value: `CEI-${String.fromCharCode(65 + i)}`,
        label: `CEI-${String.fromCharCode(65 + i)}`
    }))
];

export default function AdminPage() {
    const router = useRouter();
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // 🔍 搜尋與篩選
    const [searchTerm, setSearchTerm] = useState('');
    const [currentUserEmail, setCurrentUserEmail] = useState('');

    // Modal 狀態
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<any>(null);
    const [selectedRole, setSelectedRole] = useState('parent');

    // 子女管理狀態
    const [userChildren, setUserChildren] = useState<any[]>([]);
    const [newChildData, setNewChildData] = useState({
        chinese_name: '',
        english_name: '',
        english_class: 'CEI-A', // 預設值
        is_after_school: false
    });

    useEffect(() => {
        checkPermissionAndFetch();
    }, []);

    async function checkPermissionAndFetch() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        setCurrentUserEmail(session.user.email || 'Unknown');

        // 檢查管理員權限
        const { data: currentUser } = await supabase.from('users').select('role').eq('id', session.user.id).single();
        if (!currentUser || !['director', 'admin'].includes(currentUser.role)) {
            alert('⛔ 您沒有權限進入此頁面');
            router.push('/');
            return;
        }
        fetchUsers();
    }

    async function fetchUsers() {
        setLoading(true);
        const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
        if (error) {
            console.error('Error fetching users:', error);
            alert('讀取使用者失敗');
        } else {
            setUsers(data || []);
        }
        setLoading(false);
    }

    // --- 📝 系統日誌記錄功能 (Log) ---
    async function logAction(action: string, details: string) {
        await supabase.from('system_logs').insert({
            operator_email: currentUserEmail,
            action: action,
            details: details
        });
    }

    // --- 👥 編輯使用者視窗 ---

    async function openEditModal(user: any) {
        setEditingUser(user);
        setSelectedRole(user.role);
        // 重置新增表單
        setNewChildData({ chinese_name: '', english_name: '', english_class: 'CEI-A', is_after_school: false });

        // 抓取該使用者綁定的學生 (Parent 1 或 Parent 2)
        const { data: children } = await supabase
            .from('students')
            .select('*')
            .or(`parent_id.eq.${user.id},parent_id_2.eq.${user.id}`);

        setUserChildren(children || []);
        setIsModalOpen(true);
    }

    async function handleUpdateRole() {
        if (!editingUser) return;
        try {
            const { error } = await supabase
                .from('users')
                .update({ role: selectedRole })
                .eq('id', editingUser.id);

            if (error) throw error;

            await logAction('變更權限', `將用戶 ${editingUser.email} 的權限更改為 ${selectedRole}`);
            alert('✅ 身份權限更新成功！');
            fetchUsers();
        } catch (e: any) {
            alert('❌ 更新失敗: ' + e.message);
        }
    }

    // --- 👶 新增並綁定子女 (核心邏輯) ---
    async function handleAddChild() {
        if (!newChildData.chinese_name) return alert('請輸入中文姓名');
        if (!editingUser) return;

        try {
            // 1. 組合班級字串 (與學生頁面邏輯完全同步)
            // 邏輯：如果選 NONE + 勾選安親 = "課後輔導"
            // 邏輯：如果選 CEI-A + 勾選安親 = "CEI-A, 課後輔導"
            let finalGrade = newChildData.english_class;

            if (finalGrade === 'NONE') {
                if (newChildData.is_after_school) {
                    finalGrade = '課後輔導';
                } else {
                    finalGrade = '未分類';
                }
            } else {
                if (newChildData.is_after_school) {
                    finalGrade = `${finalGrade}, 課後輔導`;
                }
            }

            // 2. 寫入資料庫 (自動綁定)
            const payload = {
                chinese_name: newChildData.chinese_name,
                english_name: newChildData.english_name,
                grade: finalGrade,
                parent_id: editingUser.id, // 自動綁定為第一家長
                school_grade: '國小 一年級' // 預設值，避免空白
            };

            const { data, error } = await supabase.from('students').insert(payload).select();
            if (error) throw error;

            const newChild = data[0];

            // 3. 寫入日誌
            await logAction('新增學生並綁定', `為家長 ${editingUser.email} 新增學生：${newChildData.chinese_name} (${finalGrade})`);

            alert(`✅ 已新增學生：${newChildData.chinese_name}`);

            // 4. 更新畫面
            setUserChildren([...userChildren, newChild]);
            setNewChildData({ chinese_name: '', english_name: '', english_class: 'CEI-A', is_after_school: false });

        } catch (e: any) {
            alert('❌ 新增失敗: ' + e.message);
        }
    }

    // --- 🔓 解除綁定 ---
    async function handleUnbindChild(studentId: string, studentName: string) {
        if (!confirm(`確定要解除與學生「${studentName}」的綁定嗎？\n(學生資料不會刪除，僅解除連結)`)) return;

        try {
            const child = userChildren.find(c => c.id === studentId);
            const updatePayload: any = {};

            // 判斷是家長1還是家長2
            if (child.parent_id === editingUser.id) updatePayload.parent_id = null;
            if (child.parent_id_2 === editingUser.id) updatePayload.parent_id_2 = null;

            const { error } = await supabase.from('students').update(updatePayload).eq('id', studentId);
            if (error) throw error;

            await logAction('解除綁定', `解除家長 ${editingUser.email} 與學生 ${studentName} 的連結`);

            setUserChildren(userChildren.filter(c => c.id !== studentId));
        } catch (e: any) {
            alert('❌ 解除失敗: ' + e.message);
        }
    }

    // --- 🗑️ 刪除使用者 ---
    async function handleDeleteUser(userId: string, userEmail: string) {
        if (!confirm(`⚠️ 危險操作\n確定要刪除帳號 ${userEmail} 嗎？\n此動作無法復原。`)) return;

        try {
            const { error } = await supabase.from('users').delete().eq('id', userId);
            if (error) throw error;

            await logAction('刪除用戶', `刪除使用者帳號：${userEmail}`);
            alert('✅ 使用者資料已刪除');
            fetchUsers();
        } catch (e: any) {
            alert('❌ 刪除失敗: ' + e.message);
        }
    }

    // 搜尋過濾
    const filteredUsers = users.filter(u =>
        u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.role.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return <div className="p-10 text-center font-bold text-gray-400">系統載入中...</div>;

    return (
        <div className="min-h-screen bg-[#F3F4F6] p-6 font-sans">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-gray-800 flex items-center gap-2">👥 人事管理系統</h1>
                        <p className="text-sm text-gray-500 font-bold mt-1">管理權限與家長子女綁定 (總人數: {users.length})</p>
                    </div>
                    {/* 🔍 搜尋列 */}
                    <input
                        type="text"
                        placeholder="🔍 搜尋 Email 或身份..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="p-3 w-full md:w-80 rounded-xl border border-gray-300 shadow-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>

                {/* 使用者列表 */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left whitespace-nowrap">
                            <thead className="bg-gray-100 border-b border-gray-200">
                                <tr>
                                    <th className="p-4 text-xs font-black text-gray-500 uppercase">Email / 註冊日期</th>
                                    <th className="p-4 text-xs font-black text-gray-500 uppercase">身份權限 (Role)</th>
                                    <th className="p-4 text-xs font-black text-gray-500 uppercase text-right">管理操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredUsers.map(user => (
                                    <tr key={user.id} className="hover:bg-indigo-50/30 transition group">
                                        <td className="p-4">
                                            <div className="font-bold text-gray-800 text-sm">{user.email}</div>
                                            <div className="text-[10px] text-gray-400 font-bold">{new Date(user.created_at).toLocaleDateString()}</div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-black border ${user.role === 'parent' ? 'bg-green-100 text-green-700 border-green-200' :
                                                    user.role === 'teacher' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' :
                                                        'bg-orange-100 text-orange-700 border-orange-200'
                                                }`}>
                                                {user.role === 'parent' ? '🏠 家長' :
                                                    user.role === 'teacher' ? '👩‍🏫 老師' :
                                                        user.role === 'english_director' ? '🇬🇧 英文主任' :
                                                            user.role === 'care_director' ? '🧸 安親主任' :
                                                                user.role === 'admin' ? '🔧 管理員' : user.role}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => openEditModal(user)}
                                                    className="bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded-lg font-bold text-xs transition shadow-sm"
                                                >
                                                    ⚙️ 設定/綁定
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteUser(user.id, user.email)}
                                                    className="bg-white border border-red-200 text-red-500 hover:bg-red-500 hover:text-white px-3 py-1.5 rounded-lg font-bold text-xs transition shadow-sm"
                                                >
                                                    刪除
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredUsers.length === 0 && (
                            <div className="p-10 text-center text-gray-400 font-bold">沒有找到符合的使用者</div>
                        )}
                    </div>
                </div>
            </div>

            {/* ⚙️ 編輯 Modal (排版優化版) */}
            {isModalOpen && editingUser && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-fade-in">

                        {/* 標題區 */}
                        <div className="p-5 border-b bg-gray-50 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="font-black text-xl text-gray-800">用戶設定面板</h3>
                                <p className="text-xs text-gray-500 font-bold mt-1">{editingUser.email}</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 rounded-full bg-white border border-gray-200 hover:bg-gray-100 flex items-center justify-center font-bold transition">✕</button>
                        </div>

                        {/* 內容捲動區 */}
                        <div className="p-6 overflow-y-auto custom-scrollbar">

                            {/* 1. 權限設定 */}
                            <div className="mb-8">
                                <label className="text-xs font-black text-indigo-500 mb-2 block uppercase tracking-wider">1. 身份權限 (Role Setting)</label>
                                <div className="flex gap-2">
                                    <select
                                        value={selectedRole}
                                        onChange={(e) => setSelectedRole(e.target.value)}
                                        className="flex-1 p-3 border border-gray-300 rounded-xl font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
                                    >
                                        <option value="parent">🏠 家長 (Parent)</option>
                                        <option value="teacher">👩‍🏫 老師 (Teacher)</option>
                                        <option value="english_director">🇬🇧 英文部主任</option>
                                        <option value="care_director">🧸 安親部主任</option>
                                        <option value="admin">🔧 系統管理員</option>
                                    </select>
                                    <button onClick={handleUpdateRole} className="bg-gray-900 text-white px-5 py-2 rounded-xl font-bold text-sm hover:bg-gray-700 transition shadow-lg">
                                        更新權限
                                    </button>
                                </div>
                            </div>

                            <div className="border-t border-gray-100 my-6"></div>

                            {/* 2. 子女列表 */}
                            <div className="mb-6">
                                <h4 className="text-xs font-black text-indigo-500 mb-3 block uppercase tracking-wider">2. 已綁定子女 (Linked Children)</h4>
                                {userChildren.length > 0 ? (
                                    <div className="grid gap-3">
                                        {userChildren.map(child => (
                                            <div key={child.id} className="flex justify-between items-center p-3 bg-white border border-indigo-100 rounded-xl shadow-sm hover:border-indigo-300 transition">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-sm border border-indigo-100">
                                                        {child.chinese_name?.[0]}
                                                    </div>
                                                    <div>
                                                        <div className="font-black text-gray-800 text-sm">
                                                            {child.chinese_name}
                                                            <span className="text-gray-400 ml-2 font-bold text-xs">{child.english_name}</span>
                                                        </div>
                                                        <div className="text-[10px] text-indigo-500 font-bold bg-indigo-50 px-2 py-0.5 rounded w-fit mt-1">
                                                            {child.grade}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleUnbindChild(child.id, child.chinese_name)}
                                                    className="text-red-400 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg text-xs font-bold transition border border-transparent hover:border-red-100"
                                                >
                                                    解除連結
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-4 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-center text-sm text-gray-400 font-bold">
                                        尚未綁定任何學生
                                    </div>
                                )}
                            </div>

                            {/* 3. 新增學生表單 */}
                            <div className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100">
                                <h5 className="text-sm font-black text-indigo-800 mb-4 flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">＋</span>
                                    新增子女並綁定 (Add & Link)
                                </h5>

                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 ml-1 mb-1 block">中文姓名 (必填)</label>
                                        <input
                                            type="text"
                                            placeholder="例：王小明"
                                            value={newChildData.chinese_name}
                                            onChange={e => setNewChildData({ ...newChildData, chinese_name: e.target.value })}
                                            className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-300 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 ml-1 mb-1 block">英文姓名 (選填)</label>
                                        <input
                                            type="text"
                                            placeholder="例：Leo"
                                            value={newChildData.english_name}
                                            onChange={e => setNewChildData({ ...newChildData, english_name: e.target.value })}
                                            className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-300 outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="mb-4">
                                    <label className="text-[10px] font-bold text-gray-500 ml-1 mb-1 block">班級設定 (Class Setup)</label>
                                    <div className="flex flex-col sm:flex-row gap-3">
                                        <select
                                            value={newChildData.english_class}
                                            onChange={e => setNewChildData({ ...newChildData, english_class: e.target.value })}
                                            className="flex-1 p-2.5 bg-white border border-indigo-200 rounded-xl text-sm font-bold outline-none"
                                        >
                                            {ENGLISH_CLASS_OPTIONS.map(opt => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                        <label className="flex items-center gap-2 px-4 py-2 bg-white border border-indigo-200 rounded-xl cursor-pointer hover:border-indigo-400 transition select-none">
                                            <input
                                                type="checkbox"
                                                checked={newChildData.is_after_school}
                                                onChange={e => setNewChildData({ ...newChildData, is_after_school: e.target.checked })}
                                                className="w-4 h-4 accent-indigo-600 rounded"
                                            />
                                            <span className="text-sm font-bold text-gray-700">參加課後輔導</span>
                                        </label>
                                    </div>
                                </div>

                                <button
                                    onClick={handleAddChild}
                                    className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black text-sm hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 active:scale-[0.98]"
                                >
                                    確認新增並立即綁定
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}