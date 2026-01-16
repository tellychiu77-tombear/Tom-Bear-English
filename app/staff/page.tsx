'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function StaffManagementPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState<any[]>([]);
    const [classes, setClasses] = useState<any[]>([]);
    const [assignments, setAssignments] = useState<any[]>([]);
    const [searchEmail, setSearchEmail] = useState('');

    useEffect(() => {
        checkPermissionAndFetch();
    }, []);

    async function checkPermissionAndFetch() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        const { data: me } = await supabase.from('users').select('role').eq('id', session.user.id).single();
        if (me?.role !== 'director') {
            alert('權限不足：只有主管(Director)可以進入此頁面');
            router.push('/');
            return;
        }

        await Promise.all([fetchUsers(), fetchClasses(), fetchAssignments()]);
        setLoading(false);
    }

    async function fetchUsers() {
        const { data } = await supabase.from('users').select('*').order('created_at', { ascending: false });
        if (data) setUsers(data);
    }

    async function fetchClasses() {
        const { data } = await supabase.from('classes').select('name').order('name');
        if (data) setClasses(data);
    }

    async function fetchAssignments() {
        const { data } = await supabase.from('class_assignments').select('*');
        if (data) setAssignments(data);
    }

    async function handleRoleChange(userId: string, newRole: string) {
        if (!confirm(`確定要將此用戶身份修改為 ${newRole} 嗎？`)) return;
        try {
            const { error } = await supabase.from('users').update({ role: newRole }).eq('id', userId);
            if (error) throw error;
            alert('職位更新成功！');
            setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
        } catch (e: any) {
            alert('更新失敗: ' + e.message);
        }
    }

    async function handleAssignClass(teacherId: string, className: string) {
        if (!className) return;
        try {
            const exists = assignments.find(a => a.teacher_id === teacherId && a.class_name === className);
            if (exists) { alert('該老師已經負責此班級了'); return; }

            const { data, error } = await supabase
                .from('class_assignments')
                .insert({ teacher_id: teacherId, class_name: className })
                .select()
                .single();

            if (error) throw error;
            setAssignments([...assignments, data]);
        } catch (e: any) {
            alert('指派失敗: ' + e.message);
        }
    }

    async function handleRemoveAssignment(assignmentId: string) {
        if (!confirm('確定要移除這個班級指派嗎？')) return;
        try {
            const { error } = await supabase.from('class_assignments').delete().eq('id', assignmentId);
            if (error) throw error;
            setAssignments(assignments.filter(a => a.id !== assignmentId));
        } catch (e: any) {
            alert('移除失敗: ' + e.message);
        }
    }

    const filteredUsers = users.filter(u =>
        (u.email || '').toLowerCase().includes(searchEmail.toLowerCase()) ||
        (u.name || '').toLowerCase().includes(searchEmail.toLowerCase())
    );

    if (loading) return <div className="p-10 text-center">載入員工名單中...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-black text-gray-800">👥 人事與班級管理</h1>
                    <button onClick={() => router.push('/')} className="bg-white px-4 py-2 rounded-lg border hover:bg-gray-50">⬅️ 回首頁</button>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex gap-4">
                    <span className="text-2xl">🔍</span>
                    <input type="text" placeholder="搜尋 Email 或姓名..." className="flex-1 outline-none font-bold text-gray-700" value={searchEmail} onChange={e => setSearchEmail(e.target.value)} />
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-100 text-gray-500">
                            <tr>
                                <th className="p-4 w-1/4">員工資訊</th>
                                <th className="p-4 w-1/4">職位設定</th>
                                <th className="p-4 w-1/2">負責班級 (僅老師)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredUsers.map(user => {
                                const myAssignments = assignments.filter(a => a.teacher_id === user.id);
                                return (
                                    <tr key={user.id} className="hover:bg-gray-50 transition">
                                        <td className="p-4 font-bold text-gray-800">
                                            {user.email}
                                            <div className="text-xs text-gray-400 font-normal">{user.name || '未設定姓名'}</div>
                                        </td>
                                        <td className="p-4">
                                            <select
                                                value={user.role || 'parent'}
                                                onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                                className={`p-2 border rounded-lg text-sm font-bold cursor-pointer
                                                    ${user.role === 'director' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                        user.role === 'teacher' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-gray-600'}
                                                `}
                                            >
                                                <option value="parent">🏠 家長</option>
                                                <option value="teacher">👨‍🏫 老師</option>
                                                <option value="director">👑 主管</option>
                                            </select>
                                        </td>
                                        <td className="p-4">
                                            {user.role === 'teacher' ? (
                                                <div className="flex flex-wrap gap-2 items-center">
                                                    {myAssignments.map(a => (
                                                        <span key={a.id} className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                                                            {a.class_name}
                                                            <button onClick={() => handleRemoveAssignment(a.id)} className="text-green-900 hover:text-red-500 hover:bg-red-100 rounded-full w-4 h-4 flex items-center justify-center transition">×</button>
                                                        </span>
                                                    ))}
                                                    <select
                                                        className="bg-gray-50 border border-dashed border-gray-300 text-gray-500 text-xs rounded-full px-3 py-1 outline-none hover:border-indigo-400 hover:text-indigo-600 transition cursor-pointer"
                                                        onChange={(e) => {
                                                            handleAssignClass(user.id, e.target.value);
                                                            e.target.value = '';
                                                        }}
                                                    >
                                                        <option value="">+ 指派班級</option>
                                                        {classes.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                                    </select>
                                                </div>
                                            ) : <span className="text-gray-300 text-xs">-</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
