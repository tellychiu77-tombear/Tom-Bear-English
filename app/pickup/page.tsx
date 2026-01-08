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

    // 連線狀態訊號燈
    const [statusText, setStatusText] = useState('🔵 連線中...');

    // 🔊 聲音開關狀態
    const [audioEnabled, setAudioEnabled] = useState(false);

    const router = useRouter();

    useEffect(() => {
        init();

        // 建立即時監聽頻道
        const channel = supabase
            .channel('pickup_audio_v4')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT', // 我們只監聽「新增」的事件，避免修改狀態時也亂叫
                    schema: 'public',
                    table: 'pickup_requests',
                },
                async (payload) => {
                    console.log('⚡️ 收到訊號:', payload);

                    // 1. 重新抓取清單 (更新畫面)
                    setTimeout(() => {
                        fetchQueue();
                        setStatusText('⚡️ 有家長到了！');
                        setTimeout(() => setStatusText('🟢 即時連線正常'), 3000);
                    }, 200);

                    // 2. 🔊 觸發語音廣播 (如果有開啟聲音)
                    // payload.new 裡面只有 student_id，我們需要去查名字
                    if (payload.new.status === 'notified') {
                        const studentId = payload.new.student_id;
                        // 快速查一下這個 ID 是誰
                        const { data: student } = await supabase.from('students').select('chinese_name, grade').eq('id', studentId).single();

                        if (student) {
                            // 這裡設定廣播詞，您可以自由修改
                            speak(`${student.chinese_name}，${student.chinese_name}，家長接送。`);
                        }
                    }
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

    // 🔊 語音合成函數 (讓電腦說話)
    function speak(text: string) {
        if (!window.speechSynthesis) return;

        // 建立發音物件
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-TW'; // 設定為中文
        utterance.rate = 0.9;     // 語速 (0.1 ~ 10)，0.9 稍微慢一點比較清楚
        utterance.pitch = 1;      // 音調
        utterance.volume = 1;     // 音量

        window.speechSynthesis.speak(utterance);
    }

    // 啟用聲音 (瀏覽器限制：必須由使用者點擊觸發)
    function enableAudio() {
        speak('語音廣播系統，啟動。');
        setAudioEnabled(true);
    }

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
            status: 'notified'
        });

        if (error) alert('呼叫失敗: ' + error.message);
        else alert(`✅ 已通知老師！${studentName} 即將出來。`);
    }

    // 老師功能
    async function updateStatus(id: string, newStatus: string) {
        const { error } = await supabase
            .from('pickup_requests')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) alert('更新失敗');
        // 注意：更新狀態不需要觸發 fetchQueue，因為 Realtime 會處理，且我們只監聽 INSERT 來發聲
        // 但為了讓畫面即時消失，手動 fetch 也無妨，或是等待下一次輪詢
        if (newStatus === 'completed') {
            setQueue(prev => prev.filter(q => q.id !== id));
        }
    }

    if (loading) return <div className="p-8 text-center">載入中...</div>;

    return (
        <div className="min-h-screen bg-yellow-50 p-4">
            <div className="max-w-2xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-yellow-900 flex items-center gap-2">
                        🚌 接送管理中心
                    </h1>
                    <div className="flex gap-2">
                        {/* 🔊 聲音開關按鈕 (僅老師可見) */}
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
                    <button onClick={() => router.push('/')} className="px-3 py-1 bg-gray-400 text-white rounded text-sm">回首頁</button>
                </div>

                {/* 家長介面 */}
                {role === 'parent' && (
                    <div className="space-y-6">
                        <div className="bg-white p-6 rounded-xl shadow-lg border-t-4 border-yellow-400 text-center animate-fade-in">
                            <h2 className="text-xl font-bold text-gray-800 mb-2">您到達補習班了嗎？</h2>
                            <p className="text-gray-500 mb-6">點擊下方按鈕，系統將直接廣播學生。</p>
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
                        </div>
                    </div>
                )}

                {/* 老師介面 */}
                {role !== 'parent' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-end mb-2">
                            <h2 className="font-bold text-gray-700">等待接送中 ({queue.length} 人)</h2>
                        </div>

                        {queue.length === 0 ? (
                            <div className="bg-white p-10 rounded-xl shadow-sm text-center text-gray-400 flex flex-col items-center">
                                <span className="text-4xl mb-2">☕</span>
                                <p>目前沒有家長，休息一下吧！</p>
                            </div>
                        ) : (
                            queue.map((req, index) => (
                                <div key={req.id} className="bg-green-50 p-5 rounded-xl shadow-md border-l-8 border-green-500 flex justify-between items-center animate-slide-in">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-bounce">NOW</span>
                                            <span className="font-black text-3xl text-gray-800">{req.student?.chinese_name}</span>
                                        </div>
                                        <div className="text-sm text-gray-600 font-bold mt-1">
                                            班級: {req.student?.grade}
                                            <span className="mx-2 text-gray-300">|</span>
                                            家長: {req.parent?.full_name}
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