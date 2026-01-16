'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
    const router = useRouter();
    const [users, setUsers] = useState<any[]>([]);
    const [students, setStudents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // 編輯視窗狀態
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<any>(null);
    const [formData, setFormData] = useState({ role: 'parent', email: '' });

    // 新增小孩的表單狀態
    const [newStudent, setNewStudent] = useState({ name: '', grade: '' });

    // 1. 抓取資料
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const { data: usersData } = await supabase.from('users').select('*').order('role').order('email');
            const { data: studentsData } = await supabase.from('students').select('*').order('chinese_name');
            setUsers(usersData || []);
            setStudents(studentsData || []);
        } catch (e: any) {
            console.error('Error:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    // 2. 權限檢查 (包含所有主任)
    useEffect(() => {
        async function init() {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.push('/'); return; }
            const { data: me } = await supabase.from('users').select('role').eq('id', session.user.id).single();

            // 允許所有管理職進入
            const allowed = ['director', 'english_director', 'care_director', 'admin'];
            if (!allowed.includes(me?.role)) {
                alert('權限不足');
                router.push('/');
                return;
            }
            fetchData();
        }
        init();
    }, [router, fetchData]);

    // 3. 開啟編輯視窗
    function openEditModal(user: any) {
        setEditingUser(user);
        setFormData({ role: user.role, email: user.email });
        setNewStudent({ name: '', grade: '' }); // 重置小孩表單
        setIsModalOpen(true);
    }

    // 4. 儲存身份修改
    async function handleSaveRole() {
        if (!editingUser) return;
        try {
            await supabase.from('users').update({ role: formData.role }).eq('id', editingUser.id);
            alert('✅ 身份已更新');
            // 不關閉視窗，讓使用者可以繼續編輯小孩
            fetchData();
        } catch (e: any) {
            alert('❌ 更新失敗: ' + e.message);
        }
    }

    // 5. 新增小孩功能 (直接綁定)
    async function handleAddStudent() {
        if (!newStudent.name) return alert('請輸入學生姓名');
        if (!editingUser) return;

        try {
            // 建立新學生並連結到當前編輯的家長 (parent_id)
            const { error } = await supabase.from('students').insert({
                chinese_name: newStudent.name,
                grade: newStudent.grade || '未分類',
                parent_id: editingUser.id // 自動連結
            });

            if (error) throw error;

            alert(`✅ 已新增學生「${newStudent.name}」並連結至此帳號`);
            setNewStudent({ name: '', grade: '' });
            fetchData(); // 重整資料以顯示
        } catch (e: any) {
            alert('❌ 新增失敗: ' + e.message);
        }
    }

    // 6. 解除學生連結 (不刪除學生，只是移除親子關係)
    async function handleUnlinkStudent(studentId: string) {
        if (!confirm('確定要解除連結嗎？(學生資料不會消失)')) return;
        try {
            await supabase.from('students').update({ parent_id: null }).eq('id', studentId);
            fetchData();
        } catch (e: any) {
            alert('失敗: ' + e.message);
        }
    }

    // 7. 刪除帳號
    async function handleDeleteUser(userId: string, email: string) {
        if (!confirm(`⚠️ 確定要刪除「${email}」嗎？`)) return;
        try {
            await supabase.from('users').delete().eq('id', userId);
            alert('🗑️ 帳號已刪除');
            fetchData();
        } catch (e: any) {
            alert('❌ 刪除失敗: ' + e.message);
        }
    }

    // 輔助顯示：找出連結的學生
    function getLinkedChildren(userId: string) {
        return students.filter(s => s.parent_id === userId || s.parent_id_2 === userId);
    }

    // 身份標籤
    function RoleBadge({ role }: { role: string }) {
        const map: any = {
            director: { label: '👑 總園長', color: 'bg-purple-100 text-purple-700 border-purple-200' },
            english_director: { label: '🔤 英文主任', color: 'bg-blue-100 text-blue-700 border-blue-200' },
            care_director: { label: '🧸 安親主任', color: 'bg-teal-100 text-teal-700 border-teal-200' },
            admin: { label: '👩‍💼 行政', color: 'bg-pink-100 text-pink-700 border-pink-200' },
            teacher: { label: '👨‍🏫 老師', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
            parent: { label: '🏠 家長', color: 'bg-gray-100 text-gray-600 border-gray-200' }
        };
        const conf = map[role] || map['parent'];
        return <span className={`px-3 py-1 rounded-full text-xs font-black uppercase border ${conf.color}`}>{conf.label}</span>;
    }

    if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-500">載入中...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-black text-gray-800">👥 人事管理系統</h1>
                    <div className="flex gap-2">
                        <button onClick={() => router.push('/admin/logs')} className="bg-orange-50 text-orange-600 border border-orange-200 px-4 py-2 rounded-xl font-bold">監控日誌</button>
                        <button onClick={() => router.push('/')} className="bg-white border px-4 py-2 rounded-xl font-bold">回首頁</button>
                    </div>
                </div>

                <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left whitespace-nowrap">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="p-5 text-xs font-bold text-gray-400">EMAIL</th>
                                    <th className="p-5 text-xs font-bold text-gray-400">身份</th>
                                    <th className="p-5 text-xs font-bold text-gray-400">連結學生</th>
                                    <th className="p-5 text-right text-xs font-bold text-gray-400">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {users.map(user => (
                                    <tr key={user.id} className="hover:bg-gray-50 transition">
                                        <td className="p-5 font-bold text-gray-700">{user.email}</td>
                                        <td className="p-5"><RoleBadge role={user.role} /></td>
                                        <td className="p-5">
                                            <div className="flex gap-1">
                                                {getLinkedChildren(user.id).map(kid => (
                                                    <span key={kid.id} className="bg-green-50 text-green-700 text-xs px-2 py-1 rounded border border-green-200">
                                                        {kid.chinese_name}
                                                    </span>
                                                ))}
                                                {getLinkedChildren(user.id).length === 0 && <span className="text-gray-300 text-xs">-</span>}
                                            </div>
                                        </td>
                                        <td className="p-5 text-right">
                                            <button onClick={() => openEditModal(user)} className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-indigo-100 mr-2">
                                                ✏️ 編輯
                                            </button>
                                            <button onClick={() => handleDeleteUser(user.id, user.email)} className="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-red-100">
                                                🗑️
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* 編輯視窗 (含小孩管理) */}
            {isModalOpen && editingUser && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-black text-gray-800">編輯用戶</h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                        </div>

                        {/* 1. 身份設定 */}
                        <div className="mb-8 p-4 bg-gray-50 rounded-xl border border-gray-100">
                            <h3 className="text-sm font-black text-gray-500 uppercase mb-3">1. 身份權限</h3>
                            <div className="flex gap-2">
                                <select
                                    value={formData.role}
                                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                                    className="flex-1 p-3 border rounded-xl font-bold text-gray-700 outline-none"
                                >
                                    <option value="parent">🏠 家長 (Parent)</option>
                                    <option value="teacher">👨‍🏫 老師 (Teacher)</option>
                                    <option value="admin">👩‍💼 行政 (Admin)</option>
                                    <option value="english_director">🔤 英文主任</option>
                                    <option value="care_director">🧸 安親主任</option>
                                    <option value="director">👑 總園長 (Director)</option>
                                </select>
                                <button onClick={handleSaveRole} className="bg-black text-white px-4 rounded-xl font-bold hover:bg-gray-800">更新</button>
                            </div>
                        </div>

                        {/* 2. 小孩管理 (只有非管理職才需要連結小孩) */}
                        <div className="mb-4">
                            <h3 className="text-sm font-black text-gray-500 uppercase mb-3">2. 學生/子女管理</h3>

                            {/* 現有連結列表 */}
                            <div className="space-y-2 mb-4">
                                {getLinkedChildren(editingUser.id).length === 0 ? (
                                    <p className="text-sm text-gray-400 italic">目前無連結學生</p>
                                ) : (
                                    getLinkedChildren(editingUser.id).map(kid => (
                                        <div key={kid.id} className="flex justify-between items-center bg-green-50 p-3 rounded-lg border border-green-100">
                                            <span className="font-bold text-green-800">👶 {kid.chinese_name} <span className="text-xs font-normal text-green-600">({kid.grade})</span></span>
                                            <button onClick={() => handleUnlinkStudent(kid.id)} className="text-xs text-red-500 hover:underline font-bold">解綁</button>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* 新增小孩表單 */}
                            <div className="p-4 border-2 border-dashed border-gray-200 rounded-xl">
                                <p className="text-xs font-bold text-gray-400 mb-2">➕ 新增學生並連結至此帳號</p>
                                <div className="flex gap-2 mb-2">
                                    <input
                                        type="text"
                                        placeholder="學生姓名"
                                        value={newStudent.name}
                                        onChange={e => setNewStudent({ ...newStudent, name: e.target.value })}
                                        className="flex-1 p-2 border rounded-lg text-sm font-bold"
                                    />
                                    <input
                                        type="text"
                                        placeholder="班級/年級"
                                        value={newStudent.grade}
                                        onChange={e => setNewStudent({ ...newStudent, grade: e.target.value })}
                                        className="w-24 p-2 border rounded-lg text-sm"
                                    />
                                </div>
                                <button onClick={handleAddStudent} className="w-full py-2 bg-indigo-50 text-indigo-600 rounded-lg font-bold text-sm hover:bg-indigo-100">
                                    新增並連結
                                </button>
                            </div>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
}