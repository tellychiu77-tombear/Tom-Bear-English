'use client';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function ChatPage() {
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [currentUserEmail, setCurrentUserEmail] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    // 1. 載入歷史訊息
    const fetchMessages = async () => {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) console.error('Error:', error);
        else setMessages(data || []);
    };

    // 2. 初始化與監聽
    useEffect(() => {
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                // 如果沒登入，暫時不踢人，方便您測試 (但實務上要踢)
                // router.push('/'); 
                setCurrentUserEmail('Guest');
            } else {
                setCurrentUserEmail(session.user.email || 'Unknown');
            }
            fetchMessages();
        };
        init();

        // 開啟即時監聽
        const channel = supabase
            .channel('realtime_chat')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                setMessages((prev) => [...prev, payload.new]);
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    // 3. 自動捲動到底部
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // 4. 發送訊息
    const handleSendMessage = async () => {
        if (!newMessage.trim()) return;

        const msgToSend = newMessage;
        setNewMessage(''); // 秒清空，提升體驗

        // 寫入資料庫
        const { error } = await supabase
            .from('messages')
            .insert([{
                content: msgToSend,
                user_email: currentUserEmail
            }]);

        if (error) {
            alert('發送失敗: ' + error.message);
            console.error(error);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-gray-100 font-sans">
            {/* 標題列 */}
            <div className="bg-white p-4 shadow-md flex justify-between items-center z-10">
                <h1 className="text-xl font-bold text-gray-800">💬 親師溝通室 (Chat)</h1>
                <button onClick={() => router.push('/dashboard')} className="text-blue-500 font-medium hover:underline">
                    回儀表板
                </button>
            </div>

            {/* 訊息顯示區 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => {
                    // 判斷是不是自己傳的
                    const isMyMessage = msg.user_email === currentUserEmail;

                    return (
                        <div key={msg.id} className={`flex flex-col ${isMyMessage ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[75%] px-4 py-2 rounded-xl shadow-sm text-lg ${isMyMessage
                                    ? 'bg-blue-500 text-white rounded-br-none'
                                    : 'bg-white text-gray-800 rounded-bl-none'
                                }`}>
                                {msg.content}
                            </div>
                            {/* 這裡就是修正的關鍵：改顯示 user_email，並加了防呆 (?.) */}
                            <span className="text-xs text-gray-400 mt-1 px-1">
                                {isMyMessage ? '我' : (msg.user_email?.split('@')[0] || 'System')}
                            </span>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* 輸入區 */}
            <div className="bg-white p-4 border-t border-gray-200">
                <div className="flex gap-2 max-w-4xl mx-auto">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="輸入訊息..."
                        className="flex-1 border border-gray-300 rounded-full px-4 py-3 focus:outline-none focus:border-blue-500 bg-gray-50 text-lg"
                    />
                    <button
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim()}
                        className="bg-blue-600 text-white rounded-full px-6 py-2 font-bold hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
                    >
                        傳送
                    </button>
                </div>
            </div>
        </div>
    );
}