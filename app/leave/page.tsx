'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function LeavePage() {
    const [role, setRole] = useState<string | null>(null);
    const [myStudentId, setMyStudentId] = useState<string>(''); // 家長用
    const [leaves, setLeaves] = useState<any[]>([]); // 請假列表

    // 表單
    const [form, setForm] = useState({
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
        type: '病假',
        reason: ''
    });

    const router = useRouter();

    useEffect(() => {
        init();
    }, []);

    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        const userRole = profile?.role || 'pending';
        setRole(userRole);

        if (userRole === 'parent') {
            // 家長：抓自己小孩 ID
            const { data } = await supabase.from('students').select('id').eq('parent_id', session.user.id).single();
            if (data) {
                setMyStudentId(data.id);
                fetchLeaves(userRole, data.id); // 抓歷史紀錄
            }
        } else {
            // 老師：直接抓所有紀錄
            fetchLeaves(userRole);
        }
    }

    async function fetchLeaves(currentRole?: string, studentId?: string) {
        let query = supabase.from('leave_requests_view').select('*').order('created_at', { ascending: false });

        // 家長只看自己的
        if (currentRole === 'parent' && studentId) {
            query = query.eq('student_id', studentId);
        }

        const { data } = await query;
        setLeaves(data || []);
    }

    // 家長：送出假單
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!myStudentId) return;

        const { error } = await supabase.from('leave_requests').insert({
            student_id: myStudentId,
            start_date: form.start_date,
            end_date: form.end_date,
            type: form.type,
            reason: form.reason
        });

        if (error) alert('送出失敗: ' + error.message);
        else {
            alert('假單已送出，等待老師審核');
            setForm({ ...form, reason: '' }); // 清空原因
            fetchLeaves('parent', myStudentId); // 刷新列表
        }
    }

    // 老師：審核假單
    async function handleApprove(id: string, newStatus: string) {
        const { error } = await supabase
            .from('leave_requests')
            .update({ status: newStatus })
            .eq('id', id);

        if (!error) fetchLeaves();
    }

    return (
        <div className="min-h-screen bg-blue-50 p-4">
            <div className="max-w-3xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    {/* 🟢 這裡的標題只有中文，如果您看到 (Leave Request) 代表檔案沒更新成功 */}
                    <h1 className="text-2xl font-bold text-blue-900">📅 請假中心</h1>
                    <button onClick={() => router.push('/')} className="px-3 py-1 bg-gray-400 text-white rounded text-sm">回首頁</button>
                </div>

                {/* ============ 家長介面：填寫假單 (這一塊最重要！) ============ */}
                {role === 'parent' && (
                    <div className="bg-white p-6 rounded-xl shadow-lg border-t-4 border-blue-500 mb-8">
                        <h2 className="text-lg font-bold mb-4">✍️ 填寫請假單</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">開始日期</label>
                                    <input type="date" className="w-full p-2 border rounded" required
                                        value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">結束日期</label>
                                    <input type="date" className="w-full p-2 border rounded" required
                                        value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">假別</label>
                                <select className="w-full p-2 border rounded bg-white"
                                    value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                                    <option value="病假">🤒 病假</option>
                                    <option value="事假">📝 事假</option>
                                    <option value="喪假">⚫ 喪假</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">請假原因</label>
                                <input type="text" placeholder="例如: 發燒去看醫生" className="w-full p-2 border rounded" required
                                    value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
                            </div>

                            <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition">
                                送出申請 📤
                            </button>
                        </form>
                    </div>
                )}

                {/* ============ 共用列表：顯示假單紀錄 ============ */}
                <div className="space-y-3">
                    <h3 className="text-xl font-bold text-gray-700 pl-2 border-l-4 border-gray-400">
                        {role === 'parent' ? '我的請假紀錄' : '待審核假單'}
                    </h3>

                    {leaves.length === 0 ? (
                        <div className="text-center py-10 text-gray-400 bg-white rounded-xl border border-dashed border-gray-300">
                            尚無紀錄
                        </div>
                    ) : (
                        leaves.map(item => (
                            <div key={item.id} className="bg-white p-5 rounded-xl shadow-sm flex justify-between items-center relative overflow-hidden">
                                <div className={`absolute left-0 top-0 bottom-0 w-2 ${item.status === 'approved' ? 'bg-green-500' : item.status === 'rejected' ? 'bg-red-500' : 'bg-yellow-400'
                                    }`} />

                                <div className="pl-4">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-bold text-lg text-gray-800">
                                            {item.type}
                                            {role !== 'parent' && <span className="text-sm font-normal text-gray-500 ml-2">({item.student_name})</span>}
                                        </span>
                                        <span className={`text-xs px-2 py-0.5 rounded text-white ${item.status === 'approved' ? 'bg-green-500' : item.status === 'rejected' ? 'bg-red-500' : 'bg-yellow-400 text-yellow-900'
                                            }`}>
                                            {item.status === 'approved' ? '已准假' : item.status === 'rejected' ? '已駁回' : '審核中'}
                                        </span>
                                    </div>
                                    <div className="text-sm text-gray-600">
                                        📅 {item.start_date} ~ {item.end_date}
                                    </div>
                                    <div className="text-sm text-gray-500 mt-1">
                                        💬 原因: {item.reason}
                                    </div>
                                </div>

                                {role !== 'parent' && item.status === 'pending' && (
                                    <div className="flex gap-2">
                                        <button onClick={() => handleApprove(item.id, 'approved')} className="px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 font-bold">准假 ✅</button>
                                        <button onClick={() => handleApprove(item.id, 'rejected')} className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200">駁回 ❌</button>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

            </div>
        </div>
    );
}