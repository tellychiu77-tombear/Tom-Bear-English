'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function LeavePage() {
    const [role, setRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState('');

    // 資料狀態
    const [myChildren, setMyChildren] = useState<any[]>([]); // 家長用：我的小孩
    const [leaves, setLeaves] = useState<any[]>([]);         // 請假單列表

    // 表單狀態
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        studentId: '',
        type: '病假',
        reason: '',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
    });

    const router = useRouter();

    useEffect(() => {
        init();
    }, []);

    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }
        setUserId(session.user.id);

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        const userRole = profile?.role || 'parent';
        setRole(userRole);

        if (userRole === 'parent') {
            // 家長：先抓小孩，再抓歷史假單
            await fetchMyChildren(session.user.id);
        } else {
            // 老師：抓所有待審核的假單
            await fetchAllLeaves();
        }
        setLoading(false);
    }

    // --- 家長功能 ---

    async function fetchMyChildren(parentId: string) {
        // 1. 抓小孩
        const { data: kids } = await supabase.from('students').select('*').eq('parent_id', parentId);
        if (kids) {
            setMyChildren(kids);
            // 預設選第一個小孩
            if (kids.length > 0) setFormData(prev => ({ ...prev, studentId: kids[0].id }));

            // 2. 抓這些小孩的請假紀錄
            const kidIds = kids.map(k => k.id);
            if (kidIds.length > 0) {
                const { data: records } = await supabase
                    .from('leave_requests')
                    .select(`*, student:students(chinese_name)`)
                    .in('student_id', kidIds)
                    .order('created_at', { ascending: false });
                if (records) setLeaves(records);
            }
        }
    }

    async function submitLeave(e: React.FormEvent) {
        e.preventDefault();
        if (!formData.reason) return alert('請填寫請假事由');

        const { error } = await supabase.from('leave_requests').insert({
            student_id: formData.studentId, // 這裡是 bigint
            type: formData.type,
            reason: formData.reason,
            start_date: formData.startDate,
            end_date: formData.endDate,
            status: 'pending' // 預設待審核
        });

        if (error) {
            alert('送出失敗: ' + error.message);
        } else {
            alert('假單已送出，等待老師審核！');
            setShowForm(false);
            setFormData(prev => ({ ...prev, reason: '' })); // 清空理由
            fetchMyChildren(userId); // 刷新列表
        }
    }

    // --- 老師功能 ---

    async function fetchAllLeaves() {
        const { data } = await supabase
            .from('leave_requests')
            .select(`*, student:students(chinese_name, grade)`)
            .order('created_at', { ascending: false }); // 新的在上面

        if (data) setLeaves(data);
    }

    async function updateStatus(id: string, newStatus: string) {
        const confirmMsg = newStatus === 'approved' ? '確定核准嗎？' : '確定駁回嗎？';
        if (!confirm(confirmMsg)) return;

        const { error } = await supabase
            .from('leave_requests')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) alert('更新失敗');
        else fetchAllLeaves(); // 刷新
    }

    // 狀態標籤小元件
    const StatusBadge = ({ status }: { status: string }) => {
        if (status === 'approved') return <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">已核准</span>;
        if (status === 'rejected') return <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">已駁回</span>;
        return <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs font-bold animate-pulse">待審核</span>;
    };

    if (loading) return <div className="p-8 text-center">載入中...</div>;

    return (
        <div className="min-h-screen bg-blue-50 p-4">
            <div className="max-w-3xl mx-auto">

                {/* 標題列 */}
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-blue-900 flex items-center gap-2">
                        📅 請假中心
                        {role === 'parent' && <span className="text-sm bg-blue-200 text-blue-800 px-2 py-1 rounded">家長版</span>}
                    </h1>
                    <button onClick={() => router.push('/')} className="px-3 py-1 bg-gray-400 text-white rounded text-sm">回首頁</button>
                </div>

                {/* ============ 🏠 家長介面 ============ */}
                {role === 'parent' && (
                    <div className="space-y-6">

                        {/* 1. 請假按鈕 / 表單 */}
                        {!showForm ? (
                            <button
                                onClick={() => setShowForm(true)}
                                className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold shadow-lg hover:bg-blue-700 transition flex justify-center items-center gap-2 text-lg"
                            >
                                <span>➕</span> 我要請假
                            </button>
                        ) : (
                            <div className="bg-white p-6 rounded-xl shadow-lg border-t-4 border-blue-500 animate-fade-in">
                                <h2 className="font-bold text-lg mb-4 text-gray-800">填寫假單</h2>
                                <form onSubmit={submitLeave} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">請假學生</label>
                                        <select
                                            className="w-full p-2 border rounded bg-gray-50"
                                            value={formData.studentId}
                                            onChange={e => setFormData({ ...formData, studentId: e.target.value })}
                                        >
                                            {myChildren.map(child => (
                                                <option key={child.id} value={child.id}>{child.chinese_name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1">開始日期</label>
                                            <input
                                                type="date"
                                                required
                                                className="w-full p-2 border rounded"
                                                value={formData.startDate}
                                                onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1">結束日期</label>
                                            <input
                                                type="date"
                                                required
                                                className="w-full p-2 border rounded"
                                                value={formData.endDate}
                                                onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">假別</label>
                                        <div className="flex gap-4">
                                            {['病假', '事假', '公假', '其他'].map(type => (
                                                <label key={type} className="flex items-center gap-1 cursor-pointer">
                                                    <input
                                                        type="radio"
                                                        name="leaveType"
                                                        value={type}
                                                        checked={formData.type === type}
                                                        onChange={e => setFormData({ ...formData, type: e.target.value })}
                                                        className="accent-blue-600"
                                                    />
                                                    <span className="text-sm">{type}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">請假事由</label>
                                        <textarea
                                            required
                                            className="w-full p-2 border rounded h-20"
                                            placeholder="例如: 發燒感冒，需在家休息"
                                            value={formData.reason}
                                            onChange={e => setFormData({ ...formData, reason: e.target.value })}
                                        />
                                    </div>

                                    <div className="flex gap-2 pt-2">
                                        <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 bg-gray-200 text-gray-600 rounded-lg font-bold">取消</button>
                                        <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700">送出申請</button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {/* 2. 歷史紀錄 */}
                        <div>
                            <h3 className="font-bold text-gray-500 mb-2 ml-1 text-sm">申請紀錄</h3>
                            <div className="space-y-3">
                                {leaves.length === 0 ? <p className="text-gray-400 text-center py-4">尚無請假紀錄</p> :
                                    leaves.map(leave => (
                                        <div key={leave.id} className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-blue-200 flex justify-between items-center">
                                            <div>
                                                <div className="font-bold text-gray-800">
                                                    {leave.student?.chinese_name}
                                                    <span className="text-sm font-normal text-gray-500 ml-2">({leave.type})</span>
                                                </div>
                                                <div className="text-sm text-gray-500 mt-1">
                                                    {leave.start_date} ~ {leave.end_date}
                                                </div>
                                                <div className="text-sm text-gray-600 mt-1">理由: {leave.reason}</div>
                                            </div>
                                            <StatusBadge status={leave.status} />
                                        </div>
                                    ))
                                }
                            </div>
                        </div>
                    </div>
                )}

                {/* ============ 👮 老師/主任介面 ============ */}
                {role !== 'parent' && (
                    <div className="space-y-6">

                        {/* 待審核區 (只顯示 pending) */}
                        <div>
                            <h2 className="font-bold text-lg mb-3 flex items-center gap-2 text-red-600">
                                🔔 待審核 ({leaves.filter(l => l.status === 'pending').length})
                            </h2>
                            <div className="space-y-3">
                                {leaves.filter(l => l.status === 'pending').length === 0 ?
                                    <div className="bg-white p-6 rounded-xl text-center text-gray-400 shadow-sm">目前沒有待審假單 👍</div> :
                                    leaves.filter(l => l.status === 'pending').map(leave => (
                                        <div key={leave.id} className="bg-white p-5 rounded-xl shadow-md border-l-4 border-yellow-400">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <div className="text-xl font-bold text-gray-800">
                                                        {leave.student?.chinese_name}
                                                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded ml-2">{leave.student?.grade}</span>
                                                    </div>
                                                    <div className="text-blue-600 font-bold mt-1">{leave.type}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-mono text-gray-700 font-bold">{leave.start_date}</div>
                                                    <div className="text-xs text-gray-400">至</div>
                                                    <div className="font-mono text-gray-700 font-bold">{leave.end_date}</div>
                                                </div>
                                            </div>

                                            <div className="bg-gray-50 p-3 rounded text-gray-700 text-sm mb-4">
                                                <span className="font-bold">事由：</span>{leave.reason}
                                            </div>

                                            <div className="flex gap-3">
                                                <button
                                                    onClick={() => updateStatus(leave.id, 'approved')}
                                                    className="flex-1 py-2 bg-green-500 text-white rounded-lg font-bold hover:bg-green-600 shadow transition"
                                                >
                                                    ✅ 核准
                                                </button>
                                                <button
                                                    onClick={() => updateStatus(leave.id, 'rejected')}
                                                    className="flex-1 py-2 bg-red-100 text-red-600 rounded-lg font-bold hover:bg-red-200 transition"
                                                >
                                                    ❌ 駁回
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                }
                            </div>
                        </div>

                        <hr className="border-gray-300" />

                        {/* 歷史紀錄區 (已審核) */}
                        <div className="opacity-75">
                            <h2 className="font-bold text-gray-500 mb-3">📜 歷史紀錄</h2>
                            <div className="space-y-2">
                                {leaves.filter(l => l.status !== 'pending').map(leave => (
                                    <div key={leave.id} className="bg-gray-100 p-3 rounded-lg flex justify-between items-center border border-gray-200">
                                        <div>
                                            <span className="font-bold text-gray-700 mr-2">{leave.student?.chinese_name}</span>
                                            <span className="text-sm text-gray-500">{leave.start_date} ({leave.type})</span>
                                        </div>
                                        <StatusBadge status={leave.status} />
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>
                )}

            </div>
        </div>
    );
}