'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function PickupPage() {
    const [role, setRole] = useState<string | null>(null);
    const [myChildren, setMyChildren] = useState<any[]>([]); // 這裡面會多一個 pickupStatus 欄位
    const [loading, setLoading] = useState(true);

    const [queue, setQueue] = useState<any[]>([]);
    const [statusText, setStatusText] = useState('🔵 連線中...');
    const [audioEnabled, setAudioEnabled] = useState(false);

    const router = useRouter();

    useEffect(() => {
        init();

        // 📡 建立即時監聽 (同時監聽 新增、修改、刪除)
        const channel = supabase
            .channel('pickup_audio_v6') // 改個版號確保重新連線
            .on(
                'postgres_changes',
                {
                    event: '*', // 監聽所有事件 (INSERT, UPDATE)
                    schema: 'public',
                    table: 'pickup_requests',
                },
                async (payload) => {
                    console.log('⚡️ 收到訊號:', payload);

                    // --- 👨‍🏫 老師端邏輯 (更新排隊清單 & 語音) ---
                    if (payload.eventType === 'INSERT') {
                        // 有新家長呼叫 -> 重新抓取清單 + 廣播
                        setTimeout(() => {
                            fetchQueue();
                            setStatusText('⚡️ 有家長到了！');
                            setTimeout(() => setStatusText('🟢 即時連線正常'), 3000);
                        }, 200);

                        // 🔊 語音廣播
                        if (payload.new.status === 'notified') {
                            const studentId = payload.new.student_id;
                            const { data: student } = await supabase.from('students').select('chinese_name').eq('id', studentId).single();
                            if (student) {
                                speak(`${student.chinese_name}，家長接送。`);
                            }
                        }
                    } else if (payload.eventType === 'UPDATE') {
                        // 狀態改變 (例如老師按了已接走) -> 重新抓取清單
                        fetchQueue();
                    }

                    // --- 🏠 家長端邏輯 (更新按鈕狀態) ---
                    // 不管是誰呼叫，都檢查一下是不是我的小孩，如果是就更新按鈕
                    const relevantId = payload.new?.student_id || payload.old?.student_id;

                    setMyChildren(prev => prev.map(child => {
                        // 如果變動的資料跟這個小孩無關，就跳過
                        if (child.id !== relevantId) return child;

                        // 判斷新狀態
                        let newStatus = 'idle'; // 預設閒置

                        if (payload.eventType === 'INSERT') {
                            // 新增請求 -> 變成 "notified" (等待中)
                            newStatus = payload.new.status;
                        } else if (payload.eventType === 'UPDATE') {
                            // 更新請求
                            if (payload.new.status === 'completed') {
                                newStatus = 'idle'; // 已接走 -> 變回閒置 (按鈕恢復)
                            } else {
                                newStatus = payload.new.status;
                            }
                        }

                        return { ...child, pickupStatus: newStatus };
                    }));
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') setStatusText('🟢 即時連線正常');
                else if (status === 'CHANNEL_ERROR') setStatusText('🔴 連線失敗');
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // 🔊 語音合成函數
    function speak(text: string) {
        if (!window.speechSynthesis) return;
        const fullText = `${text} ... ${text}`; // 重複兩次
        const utterance = new SpeechSynthesisUtterance(fullText);
        utterance.lang = 'zh-TW';
        utterance.rate = 0.75;
        utterance.pitch = 1;
        utterance.volume = 1;
        window.speechSynthesis.speak(utterance);
    }

    function enableAudio() {
        speak('廣播系統啟動');
        setAudioEnabled(true);
    }

    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        const { data: profile } = await supabase.from('users').select('role').eq('id', session.user.id).single();
        const userRole = profile?.role || 'parent';
        setRole(userRole);

        if (userRole === 'parent') {
            await fetchMyChildrenStatus(session.user.id);
        } else {
            fetchQueue();
        }
    }

    // 🆕 新增：抓取小孩資料時，順便檢查「目前有沒有正在排隊」
    async function fetchMyChildrenStatus(parentId: string) {
        setLoading(true);
        // 1. 先抓小孩
        const { data: students } = await supabase.from('students').select('*').eq('parent_id', parentId);

        if (students && students.length > 0) {
            // 2. 再抓這些小孩目前有沒有「未完成」的接送請求
            const studentIds = students.map(s => s.id);
            const { data: requests } = await supabase
                .from('pickup_requests')
                .select('student_id, status')
                .in('student_id', studentIds)
                .neq('status', 'completed'); // 只找還沒接走的

            // 3. 合併狀態
            const merged = students.map(child => {
                const activeReq = requests?.find(r => r.student_id === child.id);
                return {
                    ...child,
                    pickupStatus: activeReq ? activeReq.status : 'idle' // 有單子就是 notified，沒單子就是 idle
                };
            });
            setMyChildren(merged);
        } else {
            setMyChildren([]);
        }
        setLoading(false);
    }

    async function fetchQueue() {
        const { data } = await supabase
            .from('pickup_requests')
            .select(`
                *,
                student:students (chinese_name, grade),
                parent:users (name, email)
            `)
            .neq('status', 'completed')
            .order('created_at', { ascending: true });

        if (data) setQueue(data);
        // 如果是老師，這時才關閉 loading，家長的話在 fetchMyChildrenStatus 就關了
        if (role !== 'parent') setLoading(false);
    }

    async function requestPickup(studentId: string, studentName: string) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // 1. 前端先偷跑 (讓使用者覺得很快) -> 按鈕馬上變色
        setMyChildren(prev => prev.map(c =>
            c.id === studentId ? { ...c, pickupStatus: 'notified' } : c
        ));

        // 2. 實際發送請求
        const { error } = await supabase.from('pickup_requests').insert({
            student_id: studentId,
            parent_id: session.user.id,
            status: 'notified'
        });

        if (error) {
            alert('❌ 呼叫失敗，請重試: ' + error.message);
            // 失敗的話把按鈕變回來
            setMyChildren(prev => prev.map(c =>
                c.id === studentId ? { ...c, pickupStatus: 'idle' } : c
            ));
        } else {
            // 成功不需做什麼，因為 Realtime 會再確認一次
        }
    }

    async function updateStatus(id: string, newStatus: string) {
        const { error } = await supabase
            .from('pickup_requests')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) alert('更新失敗');
        // 老師端會透過 Realtime 自動更新清單，這裡不用手動 setQueue
    }

    if (loading) return <div className="p-8 text-center animate-pulse font-bold text-gray-400">系統連線中...</div>;

    return (
        <div className="min-h-screen bg-yellow-50 p-4">
            <div className="max-w-2xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-black text-yellow-900 flex items-center gap-2">
                        🚌 接送管理中心
                    </h1>
                    <div className="flex gap-2">
                        {role !== 'parent' && (
                            <button
                                onClick={enableAudio}
                                className={`text-xs font-bold px-3 py-1 rounded shadow border transition ${audioEnabled ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-100 text-red-600 border-red-300 animate-pulse'}`}
                            >
                                {audioEnabled ? '🔊 廣播已開啟' : '🔇 點此開啟廣播'}
                            </button>
                        )}
                        <div className={`text-xs font-bold px-2 py-1 rounded shadow border ${statusText.includes('⚡️') ? 'bg-red-500 text-white animate-pulse' : 'bg-white text-gray-600'}`}>
                            {statusText}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end mb-4">
                    <button onClick={() => router.push('/')} className="px-3 py-1 bg-gray-400 text-white rounded text-sm font-bold shadow-sm">回首頁</button>
                </div>

                {/* 🏠 家長介面 */}
                {role === 'parent' && (
                    <div className="space-y-6">
                        <div className="bg-white p-6 rounded-xl shadow-lg border-t-4 border-yellow-400 text-center animate-fade-in">
                            <h2 className="text-xl font-bold text-gray-800 mb-2">您到達補習班了嗎？</h2>
                            <p className="text-gray-500 mb-6">點擊下方按鈕，系統將直接廣播學生。</p>
                            <div className="grid gap-4">
                                {myChildren.map(child => {
                                    // 判斷按鈕狀態
                                    const isWaiting = child.pickupStatus === 'notified';

                                    return (
                                        <button
                                            key={child.id}
                                            onClick={() => !isWaiting && requestPickup(child.id, child.chinese_name)}
                                            disabled={isWaiting} // 等待中就不能再按
                                            className={`w-full py-6 rounded-xl shadow-lg transform transition flex flex-col items-center justify-center gap-2 border-2
                                                ${isWaiting
                                                    ? 'bg-green-50 border-green-200 cursor-default scale-100' // 等待中樣式
                                                    : 'bg-gradient-to-r from-yellow-400 to-orange-500 border-yellow-500 text-white hover:scale-105 active:scale-95 cursor-pointer' // 可呼叫樣式
                                                }
                                            `}
                                        >
                                            {isWaiting ? (
                                                <>
                                                    <span className="text-3xl animate-bounce">⏳</span>
                                                    <span className="text-2xl font-black text-green-600">等待接送中...</span>
                                                    <span className="text-sm font-bold text-green-500">老師已收到通知，請稍候</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="text-3xl">📣</span>
                                                    <span className="text-2xl font-black">呼叫 {child.chinese_name}</span>
                                                    <span className="text-sm opacity-90 font-bold">({child.grade})</span>
                                                </>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* 👨‍🏫 老師介面 */}
                {role !== 'parent' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-end mb-2">
                            <h2 className="font-bold text-gray-700">等待接送中 ({queue.length} 人)</h2>
                        </div>

                        {queue.length === 0 ? (
                            <div className="bg-white p-10 rounded-xl shadow-sm text-center text-gray-400 flex flex-col items-center border border-dashed border-gray-300">
                                <span className="text-4xl mb-2">☕</span>
                                <p className="font-bold">目前沒有家長，休息一下吧！</p>
                            </div>
                        ) : (
                            queue.map((req, index) => (
                                <div key={req.id} className="bg-green-50 p-5 rounded-xl shadow-md border-l-8 border-green-500 flex justify-between items-center animate-slide-in">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-bounce shadow-sm">NOW</span>
                                            <span className="font-black text-3xl text-gray-800">{req.student?.chinese_name}</span>
                                        </div>
                                        <div className="text-sm text-gray-600 font-bold mt-1">
                                            班級: {req.student?.grade}
                                            <span className="mx-2 text-gray-300">|</span>
                                            家長: {req.parent?.name || req.parent?.email || '家長'}
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <button onClick={() => updateStatus(req.id, 'completed')} className="px-6 py-4 bg-gray-800 text-white font-bold rounded-xl shadow-lg hover:bg-black active:scale-95 transition flex items-center gap-2">
                                            <span>✅</span>
                                            <span>已接走</span>
                                        </button>
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