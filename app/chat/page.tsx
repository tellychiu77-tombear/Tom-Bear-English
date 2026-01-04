'use client';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function Chat() {
    const router = useRouter();
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [userId, setUserId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Get current user
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                setUserId(session.user.id);
            }
        });

        fetchMessages();

        // Realtime Subscription
        const channel = supabase
            .channel('public:messages')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages' },
                (payload) => {
                    setMessages((current) => [...current, payload.new]);
                    scrollToBottom();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const fetchMessages = async () => {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) console.error('Error fetching messages:', error);
        else setMessages(data || []);
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !userId) return;

        const { error } = await (supabase.from('messages') as any).insert([
            { content: newMessage, sender_id: userId }
        ]);

        if (error) {
            console.error('Error sending message:', error);
            alert('Error sending message');
        } else {
            setNewMessage('');
        }
    };

    return (
        <div className="flex flex-col h-screen bg-gray-100 font-sans">
            {/* Header */}
            <div className="bg-white px-4 py-3 shadow-sm flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.push('/')}
                        className="text-gray-500 hover:bg-gray-100 p-2 rounded-full transition-colors"
                    >
                        ←
                    </button>
                    <h1 className="text-xl font-bold text-gray-800">💬 親師對話 (Live)</h1>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, index) => {
                    const isMyMessage = msg.sender_id === userId;
                    return (
                        <div
                            key={msg.id}
                            className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}
                        >
                            <div className={`
                                max-w-[70%] px-4 py-2 rounded-2xl shadow-sm
                                ${isMyMessage
                                    ? 'bg-green-500 text-white rounded-br-none'
                                    : 'bg-white text-gray-800 rounded-bl-none'}
                            `}>
                                <p className="text-sm md:text-base leading-relaxed">{msg.content}</p>
                                <p className={`text-[10px] mt-1 ${isMyMessage ? 'text-green-100' : 'text-gray-400'} text-right`}>
                                    {new Date(msg.created_at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSendMessage} className="bg-white p-4 border-t border-gray-200">
                <div className="flex gap-2 max-w-4xl mx-auto">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="輸入訊息..."
                        className="flex-1 bg-gray-100 border-0 rounded-full px-5 py-3 focus:ring-2 focus:ring-green-500 focus:bg-white transition-all outline-none"
                    />
                    <button
                        type="submit"
                        disabled={!newMessage.trim()}
                        className="bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full p-3 w-12 h-12 flex items-center justify-center transition-all shadow-md active:scale-95"
                    >
                        ➤
                    </button>
                </div>
            </form>
        </div>
    );
}