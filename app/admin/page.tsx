'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

// 預設的班級選單 (CEI-A ~ Z + 安親班)
const CLASS_OPTIONS = ['安親班'];
for (let i = 65; i <= 90; i++) {
    CLASS_OPTIONS.push(`CEI-${String.fromCharCode(i)}`);
}

export default function AdminPage() {
    const router = useRouter();
    const [users, setUsers] = useState<any[]>([]);
    const [students, setStudents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // 編輯視窗狀態
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<any>(null);
    const [formData, setFormData] = useState({ role: 'parent', email: '' });

    // 學生表單狀態 (新增或編輯模式)
    const [studentForm, setStudentForm] = useState({ id: '', name: '', grade: 'CEI-A', mode: 'add' });

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

    useEffect(() => {
        async function init() {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.push('/'); return; }
            const { data: me } = await supabase.from('users').select('role').eq('id', session.user.id).single();
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

    function openEditModal(user: any) {
        setEditingUser(user);
        setFormData({ role: user.role, email: user.email });
        // 重置學生表單為新增模式
        setStudentForm({ id: '', name: '', grade: 'CEI-A', mode: 'add' });
        setIsModalOpen(true);
    }

    // 準備編輯學生 (轉班)
    function handleEditStudent(student: any) {
        setStudentForm({
            id: student.id,
            name: student.chinese_name,
            grade: student.grade || 'CEI-A',
            mode: 'edit'
        });
    }

    // 取消編輯學生，回到新增模式
    function cancelEditStudent() {
        setStudentForm({ id: '', name: '', grade: 'CEI-A', mode: 'add' });
    }

    // 儲存學生 (新增或更新)
    async function handleSaveStudent() {
        if (!studentForm.name) return alert('請輸入學生姓名');
        if (!editingUser) return;

        try {
            if (studentForm.mode === 'add') {
                // 新增模式
                const { error } = await supabase.from('students').insert({
                    chinese_name: studentForm.name,
                    grade: studentForm.grade,
                    parent_id: editingUser.id
                });
                if (error) throw error;
                alert(`✅ 已新增學生「${studentForm.name}」`);
            } else {
                // 編輯模式 (轉班/改名)
                const { error } = await supabase.from('students').update({
                    chinese_name: studentForm.name,
                    grade: studentForm.grade
                }).eq('id', studentForm.id);
                if (error) throw error;
                alert(`✅ 學生資料已更新 (已轉班至 ${studentForm.grade})`);
            }

            setStudentForm({ id: '', name: '', grade: 'CEI-A', mode: 'add' }); // 重置
            fetchData();
        } catch (e: any) {
            alert('❌ 操作失敗: ' + e.message);
        }
    }

    async function handleSaveRole() {
        if (!editingUser) return;
        try {
            await supabase.from('users').update({ role: formData.role }).eq('id', editingUser.id);
            alert('✅ 身份已更新');
            fetchData();
        } catch (e: any) {
            alert('❌ 更新失敗: ' + e.message);
        }
    }

    async function handleUnlinkStudent(studentId: string) {
        if (!confirm('確定要解除連結嗎？(學生資料不會消失)')) return;
        try {
            await supabase.from('students').update({ parent_id: null }).eq('id', studentId);
            fetchData();
        } catch (e: any) {
            alert('失敗: ' + e.message);
        }
    }

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

    function getLinkedChildren(userId: string) {
        return students.filter(s => s.parent_id === userId || s.parent_id_2 === userId);
    }

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
                        <button onClick={() => router.push('/admin/logs')} className="bg-orange-50 text-orange-600 border border-orange-200 px-4 py-2 rounded-xl font-bold hover:bg-orange-100">
                            🕵️‍♂️ 監控日誌
                        </button>
                        <button onClick={() => router.push('/')} className="bg-white border px-4 py-2 rounded-xl font-bold hover:bg-gray-50">回首頁</button>
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
                                            <div className="flex flex-wrap gap-1">
                                                {getLinkedChildren(user.id).map(kid => (
                                                    <span key={kid.id} className="bg-green-50 text-green-700 text-xs px-2 py-1 rounded border border-green-200 font-bold">
                                                        {kid.chinese_name} <span className="text-green-500 font-normal">({kid.grade})</span>
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

            {isModalOpen && editingUser && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-black text-gray-800">編輯用戶設定</h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 font-bold text-xl">✕</button>
                        </div>

                        {/* 1. 身份設定 */}
                        <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
                            <h3 className="text-xs font-black text-gray-400 uppercase mb-2">1. 身份權限 (Role)</h3>
                            <div className="flex gap-2">
                                <select
                                    value={formData.role}
                                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                                    className="flex-1 p-2 border rounded-xl font-bold text-gray-700 text-sm"
                                >
                                    <option value="parent">🏠 家長 (Parent)</option>
                                    <option value="teacher">👨‍🏫 老師 (Teacher)</option>
                                    <option value="admin">👩‍💼 行政 (Admin)</option>
                                    <option value="english_director">🔤 英文主任</option>
                                    <option value="care_director">🧸 安親主任</option>
                                    <option value="director">👑 總園長 (Director)</option>
                                </select>
                                <button onClick={handleSaveRole} className="bg-black text-white px-3 rounded-xl font-bold text-sm hover:bg-gray-800">更新</button>
                            </div>
                        </div>

                        {/* 2. 學生管理 */}
                        <div>
                            <h3 className="text-xs font-black text-gray-400 uppercase mb-2">2. 學生/子女管理 (Students)</h3>

                            {/* 現有學生列表 */}
                            <div className="space-y-2 mb-4">
                                {getLinkedChildren(editingUser.id).map(kid => (
                                    <div key={kid.id} className="flex justify-between items-center bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-gray-700">👶 {kid.chinese_name}</span>
                                            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-500 font-mono">{kid.grade}</span>
                                        </div>
                                        <div className="flex gap-2 text-xs font-bold">
                                            <button onClick={() => handleEditStudent(kid)} className="text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded">
                                                🔄 轉班/修改
                                            </button>
                                            <button onClick={() => handleUnlinkStudent(kid.id)} className="text-red-500 hover:bg-red-50 px-2 py-1 rounded">
                                                ✕ 解綁
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* 新增/編輯學生表單 */}
                            <div className={`p-4 rounded-xl border-2 ${studentForm.mode === 'edit' ? 'border-indigo-100 bg-indigo-50' : 'border-dashed border-gray-200 bg-gray-50'}`}>
                                <div className="flex justify-between items-center mb-2">
                                    <p className={`text-xs font-bold ${studentForm.mode === 'edit' ? 'text-indigo-600' : 'text-gray-400'}`}>
                                        {studentForm.mode === 'edit' ? '✏️ 編輯中 (修改姓名或轉班)' : '➕ 新增學生並連結'}
                                    </p>
                                    {studentForm.mode === 'edit' && (
                                        <button onClick={cancelEditStudent} className="text-xs text-gray-400 hover:text-gray-600 underline">取消編輯</button>
                                    )}
                                </div>

                                <div className="flex gap-2 mb-2">
                                    <input
                                        type="text"
                                        placeholder="學生姓名"
                                        value={studentForm.name}
                                        onChange={e => setStudentForm({ ...studentForm, name: e.target.value })}
                                        className="flex-1 p-2 border rounded-lg text-sm font-bold"
                                    />
                                    {/* 這裡就是您要的下拉選單！ */}
                                    <select
                                        value={studentForm.grade}
                                        onChange={e => setStudentForm({ ...studentForm, grade: e.target.value })}
                                        className="w-32 p-2 border rounded-lg text-sm font-bold"
                                    >
                                        {CLASS_OPTIONS.map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    onClick={handleSaveStudent}
                                    className={`w-full py-2 rounded-lg font-bold text-sm transition ${studentForm.mode === 'edit'
                                            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                            : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                                        }`}
                                >
                                    {studentForm.mode === 'edit' ? '確認修改 (Save)' : '新增並連結 (Add)'}
                                </button>
                            </div>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
}