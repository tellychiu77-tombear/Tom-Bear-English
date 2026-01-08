'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function PickupPage() {
    const [role, setRole] = useState<string | null>(null);
    const [myChildren, setMyChildren] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // 老師看的排隊清單
    const [queue, setQueue] = useState<any[]>([]);

    // 🟢 新增：連線狀態訊號燈
    const [statusText, setStatusText] = useState('🔵 連線中...');

    const router = useRouter();

    useEffect(() => {
        init();

        // 建立即時監聽頻道
        const channel = supabase
            .channel('pickup_realtime_v2') // 改個名字確保不會撞頻
            .on(
                'postgres_changes',
                {
                    event: '*', // 監聽所有動作 (新增/修改/刪除)
                    schema: 'public',
                    table: 'pickup_requests',
                },
                (payload) => {
                    console.log('⚡️ 收到訊號:', payload);
                    // 收到訊號後，為了保險，我們等 0.5 秒再抓資料，確保資料庫寫入完成
                    setTimeout(() => {
                        fetchQueue();
                        // 讓訊號燈閃一下，告訴您「收到訊號了」
                        const oldText = statusText;
                        setStatusText('⚡️ 資料更新！');
                        setTimeout(() => setStatusText('🟢 即時連線正常'), 2000);
                    }, 500);
                }
            )
            .subscribe((status) => {
                // 監聽連線狀態
                if (status === 'SUBSCRIBED') {
                    setStatusText('🟢 即時連線正常');
                } else if (status === 'CHANNEL_ERROR') {
                    setStatusText('🔴 連線失敗 (請重新整理)');
                } else if (status === 'TIMED_OUT') {
                    setStatusText('🟡 連線逾時 (網路不穩)');
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        const userRole = profile?.role || 'parent';
        setRole(userRole);

        if (userRole === 'parent') {
            const { data } = await supabase.from('students').select('*').eq('parent_id', session.user.id);
            setMyChildren(data || []);
            setLoading(false);
        } else {
            fetchQueue();
        }
    }

    async function fetchQueue() {
        const { data } = await supabase
            .from('pickup_requests')
            .select(`
        *,
        student:students (chinese_name, grade),
        parent:profiles (full_name)
      `)
            .neq('status', 'completed')
            .order('created_at', { ascending: true });

        if (data) setQueue(data);
        setLoading(false);
    }

    // 家長功能
    async function requestPickup(studentId: string, studentName: string) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: existing } = await supabase
            .from('pickup_requests')
            .select('*')
            .eq('student_id', studentId)
            .neq('status', 'completed')
            .single();

        if (existing) {
            alert(`您已經呼叫過 ${studentName} 了，老師正在處理中！`);
            return;
        }

        const { error } = await supabase.from('pickup_requests').insert({
            student_id: studentId,
            parent_id: session.user.id,
            status: 'pending'
        });

        if (error) alert('呼叫失敗: ' + error.message);
        else alert(`已通知老師！請稍候，${studentName} 馬上出來。`);
    }

    // 老師功能
    async function updateStatus(id: string, newStatus: string) {
        const { error } = await supabase
            .from('pickup_requests')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) alert('更新失敗');
        // 注意：這裡不用手動 fetchQueue，因為資料庫更新後，Realtime 會自動觸發上面的監聽器
    }

    if (loading) return <div className="p-8 text-center">載入中...</div>;

    return (
        <div className="min-h-screen bg-yellow-50 p-4">
            <div className="max-w-2xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-yellow-900 flex items-center gap-2">
                        🚌 接送管理中心
                    </h1>
                    {/* 顯示連線狀態 */}
                    <div className="text-xs font-bold px-2 py-1 rounded bg-white shadow border">
                        {statusText}
                    </div>
                </div>

                <div className="flex justify-end mb-4">
                    <button onClick={() => router.push('/')} className="px-3 py-1 bg-gray-400 text-white rounded text-sm">回首頁</button>
                </div>

                {/* 家長介面 */}
                {role === 'parent' && (
                    <div className="space-y-6">
                        <div className="bg-white p-6 rounded-xl shadow-lg border-t-4 border-yellow-400 text-center">
                            <h2 className="text-xl font-bold text-gray-800 mb-2">您到達補習班了嗎？</h2>
                            <p className="text-gray-500 mb-6">點擊下方按鈕，我們會廣播學生出來。</p>
                            <div className="grid gap-4">
                                {myChildren.map(child => (
                                    <button
                                        key={child.id}
                                        onClick={() => requestPickup(child.id, child.chinese_name)}
                                        className="w-full py-6 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-xl shadow-lg transform transition hover:scale-105 active:scale-95 flex flex-col items-center justify-center gap-2"
                                    >
                                        <span className="text-3xl">📣</span>
                                        <span className="text-2xl font-black">呼叫 {child.chinese_name}</span>
                                        <span className="text-sm opacity-90">({child.grade})</span>
                                    </button>
                                ))}
                            </div>
                            {myChildren.length === 0 && <p className="text-red-500 py-4">⚠️ 尚未綁定學生資料。</p>}
                        </div>
                    </div>
                )}

                {/* 老師介面 */}
                {role !== 'parent' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-end mb-2">
                            <h2 className="font-bold text-gray-700">目前等待接送 ({queue.length} 人)</h2>
                        </div>

                        {queue.length === 0 ? (
                            <div className="bg-white p-10 rounded-xl shadow-sm text-center text-gray-400 flex flex-col items-center">
                                <span className="text-4xl mb-2">☕</span>
                                <p>目前沒有家長在門口，休息一下吧！</p>
                            </div>
                        ) : (
                            queue.map((req, index) => (
                                <div key={req.id} className={`bg-white p-5 rounded-xl shadow-md border-l-8 flex justify-between items-center transition-all duration-500 ${req.status === 'notified' ? 'border-green-500 bg-green-50' : 'border-yellow-400'}`}>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="bg-gray-800 text-white text-xs font-bold px-2 py-1 rounded-full">{index + 1}</span>
                                            <span className="font-black text-2xl text-gray-800">{req.student?.chinese_name}</span>
                                        </div>
                                        <div className="text-sm text-gray-600">
                                            班級: <span className="font-bold">{req.student?.grade}</span>
                                            <span className="mx-2">|</span>
                                            家長: {req.parent?.full_name || '家長'}
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        {req.status === 'pending' && (
                                            <button onClick={() => updateStatus(req.id, 'notified')} className="px-6 py-2 bg-blue-600 text-white font-bold rounded shadow hover:bg-blue-700 active:scale-95 transition">📢 廣播</button>
                                        )}
                                        <button onClick={() => updateStatus(req.id, 'completed')} className={`px-6 py-2 font-bold rounded shadow active:scale-95 transition ${req.status === 'notified' ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>✅ 已接走</button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}