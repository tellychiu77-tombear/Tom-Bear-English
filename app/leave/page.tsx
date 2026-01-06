'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function LeavePage() {
    const [role, setRole] = useState<string | null>(null);
    const [myStudentId, setMyStudentId] = useState<string>(''); // For Parent: Child's ID
    const [leaves, setLeaves] = useState<any[]>([]); // Leave list data

    // Form state
    const [form, setForm] = useState({
        start_date: new Date().toISOString().split('T')[0], // Default today
        end_date: new Date().toISOString().split('T')[0],   // Default today
        type: '病假',
        reason: ''
    });

    const router = useRouter();

    // Init: Check Role
    useEffect(() => {
        init();
    }, []);

    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        // 1. Get User Role
        // Note: Using 'profiles' table which is effectively 'users' table in our schema logic, assume 'users' table is queried or 'profiles' view
        // Based on previous code, we query 'users' table sometimes or 'profiles'. 'users' table was created in schema.
        // Let's stick to 'users' table as per schema.sql line 5. But some earlier code used 'profiles'. 
        // Let's use 'users' table for consistency with recent Admin page.
        const { data: profile } = await supabase.from('users').select('role').eq('id', session.user.id).single();
        const userRole = profile?.role || 'pending';
        setRole(userRole);

        if (userRole === 'parent') {
            // 2. If Parent: Get their student ID
            const { data } = await supabase.from('students').select('id').eq('parent_id', session.user.id).single();
            if (data) {
                setMyStudentId(data.id);
                fetchLeaves(userRole, data.id); // Fetch history
            }
        } else {
            // 3. If Teacher/Director: Fetch all
            fetchLeaves(userRole);
        }
    }

    // Fetch Leave List
    async function fetchLeaves(currentRole?: string, studentId?: string) {
        // Query the VIEW to get student names
        let query = supabase.from('leave_requests_view').select('*').order('created_at', { ascending: false });

        // If Parent, filter by student_id
        if (currentRole === 'parent' && studentId) {
            query = query.eq('student_id', studentId);
        }

        const { data, error } = await query;
        if (error) console.error(error);
        setLeaves(data || []);
    }

    // Parent: Submit Form
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!myStudentId) {
            alert('找不到您的學生資料，無法請假 / Student profile not found.');
            return;
        }

        const { error } = await supabase.from('leave_requests').insert({
            student_id: myStudentId,
            start_date: form.start_date,
            end_date: form.end_date,
            type: form.type,
            reason: form.reason
        });

        if (error) {
            alert('送出失敗 / Failed: ' + error.message);
        } else {
            alert('假單已送出，請等待老師審核！ / Submitted successfully!');
            setForm({ ...form, reason: '' }); // Clear reason
            fetchLeaves('parent', myStudentId); // Refresh list
        }
    }

    // Teacher/Director: Approve/Reject
    async function handleApprove(id: string, newStatus: string) {
        if (!confirm(`Are you sure you want to set status to ${newStatus}?`)) return;

        const { error } = await supabase
            .from('leave_requests')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) {
            alert('操作失敗 / Failed');
        } else {
            fetchLeaves(); // Refresh list
        }
    }

    if (!role) return <div className="p-8 text-center text-gray-500">Loading...</div>;

    return (
        <div className="min-h-screen bg-blue-50 p-4 font-sans">
            <div className="max-w-3xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-blue-900 flex items-center gap-2">
                        📅 請假中心 <span className="text-sm font-normal text-blue-600">(Leave Request)</span>
                    </h1>
                    <button
                        onClick={() => router.push('/')}
                        className="px-4 py-2 bg-white text-gray-600 rounded-lg shadow-sm hover:bg-gray-100 transition"
                    >
                        回首頁 / Home
                    </button>
                </div>

                {/* ============ Parent Interface: Submit Form ============ */}
                {role === 'parent' && (
                    <div className="bg-white p-6 rounded-xl shadow-lg border-t-4 border-blue-500 mb-8">
                        <h2 className="text-lg font-bold mb-4 text-gray-800">✍️ 填寫請假單 (New Request)</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">開始日期 (Start)</label>
                                    <input type="date" className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-200 focus:border-blue-500" required
                                        value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">結束日期 (End)</label>
                                    <input type="date" className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-200 focus:border-blue-500" required
                                        value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">假別 (Type)</label>
                                <select className="w-full p-2 border border-gray-300 rounded bg-white focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
                                    value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                                    <option value="病假">🤒 病假 (Sick Leave)</option>
                                    <option value="事假">📝 事假 (Personal Leave)</option>
                                    <option value="喪假">⚫ 喪假 (Funeral Leave)</option>
                                    <option value="公假">🏫 公假 (Official Leave)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">請假原因 (Reason)</label>
                                <input type="text" placeholder="例如: 發燒去看醫生 / 家裡有事" className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-200 focus:border-blue-500" required
                                    value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
                            </div>

                            <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition shadow-md active:scale-95 transform">
                                送出申請 📤
                            </button>
                        </form>
                    </div>
                )}

                {/* ============ Shared List: Leave History ============ */}
                <div className="bg-white rounded-xl shadow-md overflow-hidden">
                    <div className="bg-gray-100 px-6 py-4 border-b border-gray-200">
                        <h2 className="text-lg font-bold text-gray-700">📋 請假紀錄 ({leaves.length})</h2>
                    </div>

                    <div className="divide-y divide-gray-100">
                        {leaves.length === 0 ? (
                            <div className="p-8 text-center text-gray-400">目前沒有請假紀錄。</div>
                        ) : (
                            leaves.map(leave => (
                                <div key={leave.id} className="p-6 hover:bg-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`px-2 py-1 rounded text-xs font-bold text-white
                                                ${leave.type === '病假' ? 'bg-red-400' : 'bg-gray-500'}
                                            `}>
                                                {leave.type}
                                            </span>
                                            {/* Show student name if Teacher/Director viewing */}
                                            {role !== 'parent' && (
                                                <span className="font-bold text-gray-900">{leave.student_name}</span>
                                            )}
                                            <span className="text-sm text-gray-500">
                                                {new Date(leave.start_date).toLocaleDateString()} ~ {new Date(leave.end_date).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <p className="text-gray-700 font-medium mb-1">{leave.reason}</p>
                                        <div className="text-xs text-gray-400">
                                            申請時間: {new Date(leave.created_at).toLocaleString()}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        {/* Status Badge */}
                                        <span className={`px-3 py-1 rounded-full text-sm font-bold border
                                            ${leave.status === 'pending' ? 'bg-yellow-50 text-yellow-600 border-yellow-200' :
                                                leave.status === 'approved' ? 'bg-green-50 text-green-600 border-green-200' :
                                                    'bg-red-50 text-red-600 border-red-200'}
                                        `}>
                                            {leave.status === 'pending' ? '⏳ 待審核' :
                                                leave.status === 'approved' ? '✅ 已批准' : '❌ 已駁回'}
                                        </span>

                                        {/* Teacher Actions */}
                                        {(role === 'teacher' || role === 'director') && leave.status === 'pending' && (
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleApprove(leave.id, 'approved')}
                                                    className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600 shadow-sm transition"
                                                >
                                                    准假
                                                </button>
                                                <button
                                                    onClick={() => handleApprove(leave.id, 'rejected')}
                                                    className="bg-red-400 text-white px-3 py-1 rounded text-sm hover:bg-red-500 shadow-sm transition"
                                                >
                                                    駁回
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
