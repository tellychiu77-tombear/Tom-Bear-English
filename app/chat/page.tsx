'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function ChatPage() {
    const [role, setRole] = useState<string | null>(null);
    const [userId, setUserId] = useState<string>('');
    const [assignedClass, setAssignedClass] = useState<string | null>(null);

    // 狀態
    const [students, setStudents] = useState<any[]>([]);       // 老師用：學生列表
    const [selectedStudent, setSelectedStudent] = useState<any>(null); // 目前聊天的學生
    const [activeChannel, setActiveChannel] = useState<'teacher' | 'director'>('teacher'); // 🟢 目前的頻道

    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    useEffect(() => {
        init();
    }, []);

    // 監聽聊天室 (當 學生 或 頻道 改變時)
    useEffect(() => {
        if (!selectedStudent) return;
        fetchMessages(selectedStudent.id, activeChannel);

        const channel = supabase
            .channel('chat_room')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `student_id=eq.${selectedStudent.id}`
            }, (payload) => {
                // 當有新訊息，若是屬於當前頻道的，才更新
                if (payload.new.channel === activeChannel) {
                    fetchMessages(selectedStudent.id, activeChannel);
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [selectedStudent, activeChannel]); // 🟢 頻道改變也要重抓

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }
        setUserId(session.user.id);

        const { data: profile } = await supabase
            .from('profiles')
            .select('role, assigned_class')
            .eq('id', session.user.id)
            .single();

        const userRole = profile?.role || 'pending';
        const userClass = profile?.assigned_class || '';
        setRole(userRole);
        setAssignedClass(userClass);

        // 根據身分初始化
        if (userRole === 'parent') {
            // 家長：抓自己小孩，並預設選擇第一個
            const { data } = await supabase.from('students').select('*').eq('parent_id', session.user.id);
            if (data && data.length > 0) {
                setSelectedStudent(data[0]);
            }
        } else if (userRole === 'director' || userRole === 'manager') {
            // 園長：抓所有學生
            const { data } = await supabase.from('students').select('*').order('grade');
            setStudents(data || []);
        } else if (userRole === 'teacher') {
            // 老師：只抓自己班級，且強制鎖定在 'teacher' 頻道
            setActiveChannel('teacher');
            if (userClass) {
                const { data } = await supabase.from('students').select('*').eq('grade', userClass).order('chinese_name');
                setStudents(data || []);
            }
        }
    }

    // 🟢 抓取訊息時，多加一個 channel 篩選
    async function fetchMessages(studentId: string, channel: string) {
        const { data } = await supabase
            .from('messages_view')
            .select('*')
            .eq('student_id', studentId)
            .eq('channel', channel) // 只抓當前頻道的
            .order('created_at', { ascending: true });
        setMessages(data || []);
    }

    async function handleSend(e: React.FormEvent) {
        e.preventDefault();
        if (!newMessage.trim() || !selectedStudent) return;

        const { error } = await supabase.from('messages').insert({
            student_id: selectedStudent.id,
            sender_id: userId,
            content: newMessage,
            channel: activeChannel // 🟢 寫入當前頻道
        });

        if (error) alert('發送失敗: ' + error.message);
        else setNewMessage('');
    }

    return (
        <div className="h-screen flex flex-col bg-gray-100">
            <div className="bg-white p-4 shadow flex justify-between items-center z-10">
                <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold text-green-700">💬 親師對話</h1>
                    {role === 'parent' && <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">家長端</span>}
                    {role === 'teacher' && <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">班導師: {assignedClass}</span>}
                    {role === 'director' && <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">園長 (全校檢視)</span>}
                </div>
                <button onClick={() => router.push('/')} className="px-3 py-1 bg-gray-400 text-white rounded text-sm">回首頁</button>
            </div>

            <div className="flex-1 flex overflow-hidden">

                {/* ============ 左側選單 ============ */}

                {/* 1. 如果是家長：顯示「聯絡對象」選擇 */}
                {role === 'parent' && (
                    <div className="w-1/3 max-w-[250px] bg-white border-r overflow-y-auto flex flex-col">
                        <div className="p-4 font-bold text-gray-500 border-b">選擇聯絡對象</div>

                        {/* 選項 A: 班導師 */}
                        <div
                            onClick={() => setActiveChannel('teacher')}
                            className={`p-4 border-b cursor-pointer transition flex items-center gap-3 ${activeChannel === 'teacher' ? 'bg-green-100 border-l-4 border-green-600' : 'hover:bg-gray-50'}`}
                        >
                            <div className="bg-green-200 p-2 rounded-full text-xl">👩‍🏫</div>
                            <div>
                                <div className="font-bold text-gray-800">班級導師</div>
                                <div className="text-xs text-gray-500">一般事務、作業請假</div>
                            </div>
                        </div>

                        {/* 選項 B: 園長/主任 */}
                        <div
                            onClick={() => setActiveChannel('director')}
                            className={`p-4 border-b cursor-pointer transition flex items-center gap-3 ${activeChannel === 'director' ? 'bg-purple-100 border-l-4 border-purple-600' : 'hover:bg-gray-50'}`}
                        >
                            <div className="bg-purple-200 p-2 rounded-full text-xl">🏫</div>
                            <div>
                                <div className="font-bold text-gray-800">園長 / 主任</div>
                                <div className="text-xs text-gray-500">學費、投訴、行政</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. 如果是老師/園長：顯示「學生列表」 */}
                {role !== 'parent' && (
                    <div className="w-1/3 max-w-[250px] bg-white border-r overflow-y-auto">
                        <div className="p-4 font-bold text-gray-500 border-b">學生列表 ({activeChannel === 'director' ? '行政頻道' : '班級頻道'})</div>
                        {/* 園長可以切換頻道看不同訊息 */}
                        {role === 'director' && (
                            <div className="flex p-2 gap-2 border-b bg-gray-50">
                                <button onClick={() => setActiveChannel('teacher')} className={`flex-1 text-xs py-1 rounded ${activeChannel === 'teacher' ? 'bg-green-500 text-white' : 'bg-gray-200'}`}>看班級對話</button>
                                <button onClick={() => setActiveChannel('director')} className={`flex-1 text-xs py-1 rounded ${activeChannel === 'director' ? 'bg-purple-600 text-white' : 'bg-gray-200'}`}>看行政對話</button>
                            </div>
                        )}

                        {students.map(s => (
                            <div
                                key={s.id}
                                onClick={() => setSelectedStudent(s)}
                                className={`p-4 border-b cursor-pointer hover:bg-green-50 transition ${selectedStudent?.id === s.id ? 'bg-green-100 border-l-4 border-green-600' : ''}`}
                            >
                                <div className="font-bold text-gray-800">{s.chinese_name}</div>
                                <div className="text-xs text-gray-500">{s.grade}</div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ============ 右側聊天區 ============ */}
                <div className="flex-1 flex flex-col bg-gray-200 relative">
                    {/* 背景浮水印 (選填) */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
                        <div className="text-6xl font-bold text-gray-400">
                            {activeChannel === 'director' ? '行政專線' : '親師熱線'}
                        </div>
                    </div>

                    {selectedStudent ? (
                        <>
                            {/* 頂部標題 */}
                            <div className={`p-3 text-center text-sm border-b shadow-sm z-10 flex justify-between items-center px-6 ${activeChannel === 'director' ? 'bg-purple-100 text-purple-900' : 'bg-green-100 text-green-900'
                                }`}>
                                <span>
                                    {role === 'parent' ? '正在聯絡：' : '對話對象：'}
                                    <strong className="text-lg mx-2">
                                        {activeChannel === 'director' ? '🏫 園長/行政主任' : `👩‍🏫 ${selectedStudent.grade} 班導師`}
                                    </strong>
                                </span>
                                {role !== 'parent' && <span className="text-xs bg-white/50 px-2 py-1 rounded">學生: {selectedStudent.chinese_name}</span>}
                            </div>

                            {/* 訊息列表 */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4 z-10">
                                {messages.length === 0 && (
                                    <div className="text-center text-gray-400 mt-10 p-8 bg-white/50 rounded-xl mx-10 border border-dashed">
                                        👋 這裡是
                                        {activeChannel === 'director' ? '【行政專用頻道】' : '【班級親師頻道】'} <br />
                                        {role === 'parent' && activeChannel === 'director' && '任何學費、行政問題請在此提出，班導師不會看到。'}
                                        {role === 'parent' && activeChannel === 'teacher' && '作業、請假、班級事務請在此與老師溝通。'}
                                    </div>
                                )}

                                {messages.map(m => {
                                    const isMe = m.sender_id === userId;
                                    return (
                                        <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[80%]`}>
                                                {!isMe && <span className="text-[10px] text-gray-500 mb-1 ml-1">{m.sender_role === 'parent' ? '家長' : m.sender_name}</span>}

                                                <div className={`px-4 py-2 rounded-xl shadow-sm ${isMe
                                                        ? (activeChannel === 'director' ? 'bg-purple-600 text-white rounded-tr-none' : 'bg-green-500 text-white rounded-tr-none')
                                                        : 'bg-white text-gray-800 rounded-tl-none'
                                                    }`}>
                                                    <div className="text-sm break-words">{m.content}</div>
                                                </div>
                                                <span className="text-[10px] text-gray-400 mt-1 mx-1">
                                                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* 輸入框 */}
                            <form onSubmit={handleSend} className="p-4 bg-white border-t flex gap-2 z-10">
                                <input
                                    type="text"
                                    className={`flex-1 p-3 border rounded-full focus:outline-none border-gray-300 ${activeChannel === 'director' ? 'focus:border-purple-500' : 'focus:border-green-500'
                                        }`}
                                    placeholder={`傳送訊息給${activeChannel === 'director' ? '園長' : '老師'}...`}
                                    value={newMessage}
                                    onChange={e => setNewMessage(e.target.value)}
                                />
                                <button type="submit" className={`px-6 py-2 rounded-full font-bold text-white transition ${activeChannel === 'director' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-green-600 hover:bg-green-700'
                                    }`}>
                                    發送
                                </button>
                            </form>
                        </>
                    ) : (
                        // 未選擇學生時 (老師/園長端)
                        <div className="flex-1 flex items-center justify-center text-gray-400 flex-col gap-2">
                            <div className="text-4xl">👈</div>
                            <div>請從左側選擇一位學生</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}