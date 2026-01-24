'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

// 定義班級選項
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
    const [allStudents, setAllStudents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // 當前登入者資訊
    const [currentUser, setCurrentUser] = useState<any>(null);

    // Modal 狀態 (主視窗)
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<any>(null);
    const [selectedRole, setSelectedRole] = useState('parent');
    const [isApproved, setIsApproved] = useState(false);

    // --- 各身分專屬狀態 ---
    const [userChildren, setUserChildren] = useState<any[]>([]);
    const [newChildData, setNewChildData] = useState({ chinese_name: '', english_name: '', english_class: 'CEI-A', is_after_school: false });
    const [isEditChildOpen, setIsEditChildOpen] = useState(false);
    const [editingChild, setEditingChild] = useState<any>(null);
    const [teacherClasses, setTeacherClasses] = useState<string[]>([]);
    const [targetIsSuperAdmin, setTargetIsSuperAdmin] = useState(false);

    useEffect(() => {
        checkPermissionAndFetch();
    }, []);

    async function checkPermissionAndFetch() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        const { data: userData } = await supabase.from('users').select('*').eq('id', session.user.id).single();

        // 權限檢查：開放給所有主任與行政
        if (!userData || !['director', 'english_director', 'care_director', 'admin'].includes(userData.role)) {
            alert('⛔ 您沒有權限進入此頁面');
            router.push('/');
            return;
        }
        setCurrentUser(userData);
        fetchUsers();
    }

    async function fetchUsers() {
        setLoading(true);
        // 主任可以看到所有資料
        const { data: usersData, error: usersError } = await supabase.from('users').select('*').order('created_at', { ascending: false });
        const { data: studentsData } = await supabase.from('students').select('id, parent_id, parent_id_2, chinese_name, grade');

        if (usersError) alert('讀取失敗');
        else {
            setUsers(usersData || []);
            setAllStudents(studentsData || []);
        }
        setLoading(false);
    }

    async function logAction(action: string, details: string) {
        await supabase.from('system_logs').insert({
            operator_email: currentUser.email,
            action: action,
            details: details
        });
    }

    // --- 開啟編輯視窗 ---
    async function openEditModal(user: any) {
        setEditingUser(user);
        setSelectedRole(user.role);
        setTargetIsSuperAdmin(user.is_super_admin || false);
        setIsApproved(user.is_approved || false);

        try {
            const classes = user.responsible_classes ? JSON.parse(user.responsible_classes) : [];
            setTeacherClasses(classes);
        } catch { setTeacherClasses([]); }

        setNewChildData({ chinese_name: '', english_name: '', english_class: 'CEI-A', is_after_school: false });

        const { data: children } = await supabase
            .from('students')
            .select('*')
            .or(`parent_id.eq.${user.id},parent_id_2.eq.${user.id}`);
        setUserChildren(children || []);

        setIsModalOpen(true);
    }

    // --- 儲存使用者設定 ---
    async function handleSaveUserConfig() {
        if (!editingUser) return;
        try {
            const updates: any = { role: selectedRole, is_approved: isApproved };

            // 修改：讓老師、英文主任、安親主任都可以存班級資料
            if (['teacher', 'english_director', 'care_director'].includes(selectedRole)) {
                updates.responsible_classes = JSON.stringify(teacherClasses);
            }
            // 只有 Super Admin 可以賦予別人 Super 權限
            if (currentUser.is_super_admin) {
                if (['director', 'english_director', 'care_director', 'admin'].includes(selectedRole)) {
                    updates.is_super_admin = targetIsSuperAdmin;
                }
            }
            if (selectedRole === 'parent') updates.is_super_admin = false;

            const { error } = await supabase.from('users').update(updates).eq('id', editingUser.id);
            if (error) throw error;

            await logAction('更新用戶設定', `更新 ${editingUser.email} 為 ${selectedRole}`);
            alert('✅ 設定已更新');
            fetchUsers();
            setIsModalOpen(false);
        } catch (e: any) { alert('❌ 失敗: ' + e.message); }
    }

    async function handleAddChild() {
        if (!newChildData.chinese_name) return alert('請輸入姓名');
        try {
            let finalGrade = newChildData.english_class;
            if (finalGrade === 'NONE') finalGrade = newChildData.is_after_school ? '課後輔導' : '未分類';
            else if (newChildData.is_after_school) finalGrade += ', 課後輔導';

            const payload = {
                chinese_name: newChildData.chinese_name,
                english_name: newChildData.english_name,
                grade: finalGrade,
                parent_id: editingUser.id,
                school_grade: '國小 一年級'
            };
            const { data, error } = await supabase.from('students').insert(payload).select();
            if (error) throw error;

            await logAction('新增子女', `新增學生：${newChildData.chinese_name}`);
            setUserChildren([...userChildren, data[0]]);
            setNewChildData({ chinese_name: '', english_name: '', english_class: 'CEI-A', is_after_school: false });
            fetchUsers();
        } catch (e: any) { alert('❌ ' + e.message); }
    }

    function openEditChild(child: any) {
        let eng = 'CEI-A';
        let after = false;
        if (child.grade) {
            if (child.grade.includes('課後輔導')) after = true;
            let temp = child.grade.replace(', 課後輔導', '').replace('課後輔導', '').trim();
            if (temp.endsWith(',')) temp = temp.slice(0, -1);
            if (temp !== '' && temp !== '未分類') eng = temp;
            else eng = 'NONE';
        }
        setEditingChild({ id: child.id, chinese_name: child.chinese_name, english_name: child.english_name || '', english_class: eng, is_after_school: after });
        setIsEditChildOpen(true);
    }

    async function handleSaveChild() {
        if (!editingChild) return;
        try {
            let finalGrade = editingChild.english_class;
            if (finalGrade === 'NONE') finalGrade = editingChild.is_after_school ? '課後輔導' : '未分類';
            else if (editingChild.is_after_school) finalGrade += ', 課後輔導';

            const { error } = await supabase.from('students').update({
                chinese_name: editingChild.chinese_name,
                english_name: editingChild.english_name,
                grade: finalGrade
            }).eq('id', editingChild.id);

            if (error) throw error;
            await logAction('修改學生資料', `修改 ID ${editingChild.id}`);

            const updatedList = userChildren.map(c => c.id === editingChild.id ? { ...c, ...editingChild, grade: finalGrade } : c);
            setUserChildren(updatedList);
            setIsEditChildOpen(false);
            fetchUsers();
        } catch (e: any) { alert('❌ ' + e.message); }
    }

    async function handleUnbindChild(id: string, name: string) {
        if (!confirm(`確定要解除與 ${name} 的綁定嗎？`)) return;
        try {
            const child = userChildren.find(c => c.id === id);
            const updates: any = {};
            if (child.parent_id === editingUser.id) updates.parent_id = null;
            if (child.parent_id_2 === editingUser.id) updates.parent_id_2 = null;

            await supabase.from('students').update(updates).eq('id', id);
            await logAction('解除綁定', `解除 ${editingUser.email} 與 ${name}`);
            setUserChildren(userChildren.filter(c => c.id !== id));
            fetchUsers();
        } catch (e: any) { alert('❌ ' + e.message); }
    }

    function toggleClass(cls: string) {
        if (teacherClasses.includes(cls)) setTeacherClasses(teacherClasses.filter(c => c !== cls));
        else setTeacherClasses([...teacherClasses, cls]);
    }

    async function handleDeleteUser(id: string, email: string) {
        if (!confirm(`⚠️ 確定要刪除 ${email} 嗎？此動作無法復原。`)) return;
        if (currentUser.id === id) return alert('❌ 您不能刪除自己的帳號');

        const { error } = await supabase.from('users').delete().eq('id', id);
        if (error) alert('刪除失敗');
        else {
            await logAction('刪除用戶', `刪除使用者 ${email}`);
            fetchUsers();
        }
    }

    const getTeacherClasses = (jsonString: string) => {
        try {
            const classes = JSON.parse(jsonString || '[]');
            if (classes.length === 0) return <span className="text-gray-400 text-xs">尚無班級</span>;
            return classes.map((c: string) => (
                <span key={c} className="mr-1 inline-block bg-orange-100 text-orange-700 text-[10px] px-1.5 py-0.5 rounded border border-orange-200">
                    {c.replace('CEI-', '')}
                </span>
            ));
        } catch { return null; }
    };

    const getParentChildren = (userId: string) => {
        const children = allStudents.filter(s => s.parent_id === userId || s.parent_id_2 === userId);
        if (children.length === 0) return <span className="text-gray-400 text-xs">尚無綁定</span>;
        return children.map(c => (
            <span key={c.id} className="mr-1 inline-block bg-blue-50 text-blue-600 text-[10px] px-1.5 py-0.5 rounded border border-blue-100 font-bold">
                {c.chinese_name}
            </span>
        ));
    };

    const filteredUsers = users.filter(u => u.email.toLowerCase().includes(searchTerm.toLowerCase()) || u.role.includes(searchTerm));

    if (loading) return <div className="p-10 text-center font-bold">載入中...</div>;

    return (
        <div className="min-h-screen bg-[#F3F4F6] p-6 font-sans">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                    <h1 className="text-3xl font-black text-gray-800">👥 人事管理系統</h1>
                    <div className="flex gap-3 w-full md:w-auto">

                        {/* 🔥 新增：回首頁按鈕 */}
                        <button onClick={() => router.push('/')} className="bg-white text-gray-600 px-4 py-2 rounded-xl font-bold border border-gray-200 hover:bg-gray-50 transition whitespace-nowrap shadow-sm">
                            🏠 回首頁
                        </button>

                        {/* 只有 Super Admin 看得到日誌 */}
                        {currentUser?.is_super_admin && (
                            <button onClick={() => router.push('/admin/logs')} className="bg-gray-800 text-white px-4 py-2 rounded-xl font-bold hover:bg-black transition whitespace-nowrap shadow-lg">
                                📜 監控日誌
                            </button>
                        )}
                        <input type="text" placeholder="🔍 搜尋..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="p-2 w-full border rounded-xl font-bold" />
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="p-4 text-xs font-black text-gray-500 w-1/3">EMAIL / 帳號</th>
                                <th className="p-4 text-xs font-black text-gray-500 w-1/3">身份與詳細資訊 (Info)</th>
                                <th className="p-4 text-xs font-black text-gray-500 text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.map(u => (
                                <tr key={u.id} className="border-t hover:bg-gray-50">
                                    <td className="p-4">
                                        <div className="font-bold text-sm text-gray-800">{u.email}</div>
                                        {/* 只有 Super Admin 會顯示標籤 */}
                                        {u.is_super_admin && <span className="inline-block mt-1 text-[10px] bg-red-100 text-red-600 px-1.5 rounded font-bold border border-red-200">SUPER</span>}
                                    </td>

                                    <td className="p-4 align-middle">
                                        <div className="flex flex-col gap-1.5">
                                            <div>
                                                {/* 主任顏色標籤 */}
                                                <span className={`px-2 py-0.5 rounded text-xs font-black border inline-block ${u.role === 'parent' ? 'bg-green-100 text-green-700 border-green-200' :
                                                    u.role === 'teacher' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' :
                                                        u.role === 'director' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                                            u.role === 'english_director' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                                                                u.role === 'care_director' ? 'bg-pink-100 text-pink-700 border-pink-200' :
                                                                    'bg-gray-100 text-gray-700 border-gray-200'
                                                    }`}>
                                                    {u.role === 'parent' ? '🏠 家長' :
                                                        u.role === 'teacher' ? '👩‍🏫 老師' :
                                                            u.role === 'director' ? '👑 總園長' :
                                                                u.role === 'english_director' ? '🇬🇧 英文部主任' :
                                                                    u.role === 'care_director' ? '🧸 安親部主任' :
                                                                        u.role === 'admin' ? '💼 行政人員' : u.role}
                                                </span>
                                            </div>

                                            <div className="flex flex-wrap items-center">
                                                {u.role === 'parent' && (
                                                    <>
                                                        <span className="text-[10px] text-gray-400 font-bold mr-1">子女:</span>
                                                        {getParentChildren(u.id)}
                                                    </>
                                                )}
                                                {/* 修改：只要是老師或主任，都顯示負責班級 */}
                                                {['teacher', 'english_director', 'care_director'].includes(u.role) && (
                                                    <>
                                                        <span className="text-[10px] text-gray-400 font-bold mr-1">班級:</span>
                                                        {getTeacherClasses(u.responsible_classes)}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </td>

                                    <td className="p-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => openEditModal(u)} className="text-indigo-600 font-bold text-xs hover:bg-indigo-50 px-3 py-1.5 rounded border border-indigo-200 transition">⚙️ 設定</button>
                                            <button onClick={() => handleDeleteUser(u.id, u.email)} className="text-red-500 font-bold text-xs hover:bg-red-50 px-3 py-1.5 rounded border border-red-200 transition">刪除</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && editingUser && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 animate-fade-in">
                        <div className="flex justify-between items-center mb-6 border-b pb-4">
                            <div>
                                <h3 className="font-black text-xl text-gray-800">用戶設定</h3>
                                <p className="text-xs text-gray-500 font-bold">{editingUser.email}</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 font-bold">✕</button>
                        </div>

                        <div className="mb-6">
                            <label className="block text-xs font-black text-gray-400 mb-2 uppercase">1. 身份權限 (Role)</label>
                            <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)} className="w-full p-3 border rounded-xl font-bold bg-gray-50">
                                <option value="parent">🏠 家長 (Parent)</option>
                                <option value="teacher">👩‍🏫 老師 (Teacher)</option>
                                <option disabled>──────────</option>
                                <option value="director">👑 總園長 (Director)</option>
                                <option value="english_director">🇬🇧 英文部主任 (English Director)</option>
                                <option value="care_director">🧸 安親部主任 (Care Director)</option>
                                <option value="admin">💼 行政人員 (Admin)</option>
                            </select>

                            <div className={`mt-4 p-4 rounded-xl border flex items-center justify-between transition-colors ${isApproved ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                                <div>
                                    <h4 className={`font-black text-sm ${isApproved ? 'text-green-800' : 'text-gray-500'}`}>
                                        {isApproved ? '✅ 帳號已啟用 (Active)' : '⛔ 帳號停用/審核中 (Inactive)'}
                                    </h4>
                                    <p className="text-xs text-gray-400 font-bold mt-1">
                                        {isApproved ? '使用者可正常登入' : '使用者將看到審核中畫面'}
                                    </p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isApproved}
                                        onChange={e => setIsApproved(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                                </label>
                            </div>

                            {/* 只有 Super Admin 看得到授予 Super 權限的開關 */}
                            {currentUser.is_super_admin && ['director', 'english_director', 'care_director', 'admin'].includes(selectedRole) && (
                                <div className="mt-3 flex items-center gap-2 bg-red-50 p-3 rounded-xl border border-red-100">
                                    <input type="checkbox" checked={targetIsSuperAdmin} onChange={e => setTargetIsSuperAdmin(e.target.checked)} className="accent-red-600 w-5 h-5" />
                                    <span className="font-bold text-red-700 text-sm">👑 授予最高權限 (能看日誌/管理 Super Admin)</span>
                                </div>
                            )}
                        </div>

                        {/* 修改：讓老師、英文主任、安親主任都能看到班級勾選框 */}
                        {['teacher', 'english_director', 'care_director'].includes(selectedRole) && (
                            <div className="mb-6 bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                                <h4 className="font-black text-indigo-700 text-sm mb-3">📋 負責班級 (Responsible Classes)</h4>
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                    {ENGLISH_CLASS_OPTIONS.filter(o => o.value !== 'NONE').map(opt => (
                                        <label key={opt.value} className="flex items-center gap-2 bg-white p-2 rounded border cursor-pointer hover:border-indigo-400">
                                            <input type="checkbox" checked={teacherClasses.includes(opt.value)} onChange={() => toggleClass(opt.value)} className="accent-indigo-600" />
                                            <span className="text-xs font-bold">{opt.label.split('-')[1]}</span>
                                        </label>
                                    ))}
                                    <label className="flex items-center gap-2 bg-white p-2 rounded border cursor-pointer hover:border-indigo-400 col-span-2">
                                        <input type="checkbox" checked={teacherClasses.includes('課後輔導')} onChange={() => toggleClass('課後輔導')} className="accent-indigo-600" />
                                        <span className="text-xs font-bold">課後輔導</span>
                                    </label>
                                </div>
                            </div>
                        )}

                        {selectedRole === 'parent' && (
                            <div className="mb-6">
                                <h4 className="font-black text-gray-400 text-xs mb-3 uppercase">2. 子女管理 (Children)</h4>
                                <div className="space-y-2 mb-4">
                                    {userChildren.map(child => (
                                        <div key={child.id} className="flex justify-between items-center p-3 bg-white rounded-xl border border-gray-200 shadow-sm">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                                                    {child.chinese_name?.[0]}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-gray-800 text-sm">{child.chinese_name} <span className="text-gray-400 text-xs font-normal">{child.english_name}</span></div>
                                                    <div className="text-[10px] text-indigo-500 font-bold bg-indigo-50 px-1.5 py-0.5 rounded w-fit">{child.grade}</div>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => openEditChild(child)} className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-200 border">✏️ 編輯</button>
                                                <button onClick={() => handleUnbindChild(child.id, child.chinese_name)} className="bg-red-50 text-red-500 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 border border-red-100">解除</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                                    <h5 className="font-bold text-indigo-800 text-xs mb-3 flex items-center gap-2">➕ 新增子女並綁定</h5>
                                    <div className="flex gap-2 mb-2">
                                        <input placeholder="中文名 (必填)" value={newChildData.chinese_name} onChange={e => setNewChildData({ ...newChildData, chinese_name: e.target.value })} className="w-1/2 p-2 border rounded-lg text-sm font-bold" />
                                        <input placeholder="英文名 (選填)" value={newChildData.english_name} onChange={e => setNewChildData({ ...newChildData, english_name: e.target.value })} className="w-1/2 p-2 border rounded-lg text-sm font-bold" />
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2 mb-3">
                                        <select value={newChildData.english_class} onChange={e => setNewChildData({ ...newChildData, english_class: e.target.value })} className="flex-1 p-2 border rounded-lg text-sm font-bold">
                                            {ENGLISH_CLASS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                        </select>
                                        <label className="flex items-center gap-2 bg-white px-3 py-2 border rounded-lg cursor-pointer hover:border-indigo-300">
                                            <input type="checkbox" checked={newChildData.is_after_school} onChange={e => setNewChildData({ ...newChildData, is_after_school: e.target.checked })} className="accent-indigo-600" />
                                            <span className="text-xs font-bold whitespace-nowrap">參加課後輔導</span>
                                        </label>
                                    </div>
                                    <button onClick={handleAddChild} className="w-full bg-indigo-600 text-white py-2 rounded-lg font-bold text-sm hover:bg-indigo-700 shadow-sm">確認新增</button>
                                </div>
                            </div>
                        )}

                        <div className="pt-4 border-t">
                            <button onClick={handleSaveUserConfig} className="w-full py-3 bg-black text-white rounded-xl font-bold hover:bg-gray-800 shadow-lg transition transform active:scale-[0.98]">儲存所有設定</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 子女編輯視窗 (不變) */}
            {isEditChildOpen && editingChild && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 animate-fade-in border border-gray-200">
                        <h4 className="font-black text-lg mb-4 text-center text-gray-800">編輯學生資料</h4>
                        <div className="space-y-3 mb-6">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400">中文姓名</label>
                                <input value={editingChild.chinese_name} onChange={e => setEditingChild({ ...editingChild, chinese_name: e.target.value })} className="w-full p-2 border rounded-lg font-bold text-gray-800" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400">英文姓名</label>
                                <input value={editingChild.english_name} onChange={e => setEditingChild({ ...editingChild, english_name: e.target.value })} className="w-full p-2 border rounded-lg font-bold text-gray-800" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400">班級</label>
                                <select value={editingChild.english_class} onChange={e => setEditingChild({ ...editingChild, english_class: e.target.value })} className="w-full p-2 border rounded-lg font-bold text-gray-800">
                                    {ENGLISH_CLASS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100 cursor-pointer">
                                <input type="checkbox" checked={editingChild.is_after_school} onChange={e => setEditingChild({ ...editingChild, is_after_school: e.target.checked })} className="w-5 h-5 accent-indigo-600" />
                                <span className="font-bold text-sm text-gray-700">參加課後輔導</span>
                            </label>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setIsEditChildOpen(false)} className="flex-1 py-2.5 bg-gray-100 rounded-xl font-bold text-gray-500 hover:bg-gray-200">取消</button>
                            <button onClick={handleSaveChild} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-md">確認修改</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}