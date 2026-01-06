'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function ChatPage() {
    const [role, setRole] = useState<string | null>(null);
    const [userId, setUserId] = useState<string>('');
    const [assignedClass, setAssignedClass] = useState<string | null>(null); // 老師負責的班級

    // 資料
    const [students, setStudents] = useState<any[]>([]); // 學生列表
    const [selectedStudent, setSelectedStudent] = useState<any>(null); // 目前聊天的對象
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    useEffect(() => {
        init();
    }, []);

    // 監聽聊天室
    useEffect(() => {
        if (!selectedStudent) return;
        fetchMessages(selectedStudent.id);

        const channel = supabase
            .channel('chat_room')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `student_id=eq.${selectedStudent.id}`
            }, () => {
                fetchMessages(selectedStudent.id);
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [selectedStudent]);

    // 自動捲動
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }
        setUserId(session.user.id);

        // 1. 抓取使用者的身分 & 負責班級
        const { data: profile } = await supabase
            .from('profiles')
            .select('role, assigned_class') // 🟢 多抓這個欄位
            .eq('id', session.user.id)
            .single();

        const userRole = profile?.role || 'pending';
        const userClass = profile?.assigned_class || '';
        setRole(userRole);
        setAssignedClass(userClass);

        // 2. 根據身分決定要顯示哪些學生
        if (userRole === 'parent') {
            // 家長：只抓自己的小孩
            const { data } = await supabase.from('students').select('*').eq('parent_id', session.user.id);
            if (data && data.length > 0) setSelectedStudent(data[0]);

        } else if (userRole === 'director' || userRole === 'manager') {
            // 園長/主任：上帝視角，抓「所有」學生
            const { data } = await supabase.from('students').select('*').order('grade');
            setStudents(data || []);

        } else if (userRole === 'teacher') {
            // 老師：只抓「自己班級」的學生
            if (userClass) {
                const { data } = await supabase
                    .from('students')
                    .select('*')
                    .eq('grade', userClass) // 🟢 關鍵篩選：班級必須對上
                    .order('chinese_name');
                setStudents(data || []);
            } else {
                alert("您是老師帳號，但尚未分配班級，請聯繫園長。");
            }
        }
    }

    async function fetchMessages(studentId: string) {
        const { data } = await supabase.from('messages_view').select('*').eq('student_id', studentId).order('created_at', { ascending: true });
        setMessages(data || []);
    }

    async function handleSend(e: React.FormEvent) {
        e.preventDefault();
        if (!newMessage.trim() || !selectedStudent) return;

        const { error } = await supabase.from('messages').insert({
            student_id: selectedStudent.id,
            sender_id: userId,
            content: newMessage
        });

        if (error) alert('發送失敗: ' + error.message);
        else setNewMessage('');
    }

    return (
        <div className="h-screen flex flex-col bg-gray-100">
            <div className="bg-white p-4 shadow flex justify-between items-center z-10">
                <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold text-green-700">💬 親師對話</h1>
                    {role === 'teacher' && <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">班級: {assignedClass}</span>}
                    {role === 'director' && <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">身分: 園長 (全校檢視)</span>}
                </div>
                <button onClick={() => router.push('/')} className="px-3 py-1 bg-gray-400 text-white rounded text-sm">回首頁</button>
            </div>

            <div className="flex-1 flex overflow-hidden">

                {/* 左側列表：只有教職員看得到 */}
                {role !== 'parent' && (
                    <div className="w-1/3 bg-white border-r overflow-y-auto">
                        <div className="p-4 font-bold text-gray-500 border-b flex justify-between">
                            <span>學生列表</span>
                            <span className="text-xs font-normal bg-gray-100 px-2 rounded flex items-center">{students.length} 人</span>
                        </div>
                        {students.length === 0 ? (
                            <div className="p-4 text-center text-gray-400 text-sm">此班級尚無學生</div>
                        ) : (
                            students.map(s => (
                                <div
                                    key={s.id}
                                    onClick={() => setSelectedStudent(s)}
                                    className={`p-4 border-b cursor-pointer hover:bg-green-50 transition ${selectedStudent?.id === s.id ? 'bg-green-100 border-l-4 border-green-600' : ''}`}
                                >
                                    <div className="font-bold text-gray-800">{s.chinese_name}</div>
                                    <div className="text-xs text-gray-500 flex justify-between mt-1">
                                        <span>{s.grade}</span>
                                        <span>{s.english_name}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* 右側聊天區 */}
                <div className="flex-1 flex flex-col bg-gray-200">
                    {selectedStudent ? (
                        <>
                            <div className="bg-green-50 p-2 text-center text-sm text-green-800 border-b shadow-sm">
                                正在與 <strong>{selectedStudent.chinese_name}</strong> 的家長 ({role === 'parent' ? '您' : '已連線'}) 對話
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {messages.length === 0 && <div className="text-center text-gray-400 mt-10">👋 這裡是 {selectedStudent.chinese_name} 的專屬親師溝通頻道</div>}

                                {messages.map(m => {
                                    const isMe = m.sender_id === userId;
                                    return (
                                        <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[80%]`}>
                                                {/* 顯示發言者名字 (如果不是自己) */}
                                                {!isMe && <span className="text-[10px] text-gray-500 mb-1 ml-1">{m.sender_role === 'parent' ? '家長' : m.sender_name}</span>}

                                                <div className={`px-4 py-2 rounded-xl shadow-sm ${isMe ? 'bg-green-500 text-white rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none'
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

                            <form onSubmit={handleSend} className="p-4 bg-white border-t flex gap-2">
                                <input
                                    type="text"
                                    className="flex-1 p-3 border rounded-full focus:outline-none focus:border-green-500"
                                    placeholder="輸入訊息..."
                                    value={newMessage}
                                    onChange={e => setNewMessage(e.target.value)}
                                />
                                <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded-full font-bold hover:bg-green-700 transition">
                                    發送
                                </button>
                            </form>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-400 flex-col gap-2">
                            <div className="text-4xl">👈</div>
                            <div>請選擇一位學生開始對話</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}