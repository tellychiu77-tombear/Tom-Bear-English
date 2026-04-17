'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function ChatPage() {
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [contacts, setContacts] = useState<any[]>([]);
    const [activeContactId, setActiveContactId] = useState<string | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    // 用來解決 Realtime 閉包問題
    const activeContactRef = useRef(activeContactId);
    const currentUserRef = useRef(currentUser);

    const router = useRouter();

    useEffect(() => {
        activeContactRef.current = activeContactId;
    }, [activeContactId]);

    useEffect(() => {
        currentUserRef.current = currentUser;
    }, [currentUser]);

    // Wrap functions in useCallback to satisfy dependency rules
    const fetchContacts = useCallback(async (user: any) => {
        const targetUser = user || currentUser;
        if (!targetUser) return;

        let query = supabase.from('users').select('*').order('name');

        // 家長只看老師/主任（不顯示行政人員）；員工只看家長
        if (targetUser.role === 'parent') {
            query = query.in('role', ['teacher', 'director', 'english_director', 'care_director']);
        } else {
            query = query.eq('role', 'parent');
        }

        const { data: people } = await query;
        if (!people) return;

        // 計算未讀
        const { data: unreadData } = await supabase
            .from('chat_messages')
            .select('sender_id')
            .eq('receiver_id', targetUser.id)
            .eq('is_read', false);

        const unreadMap: Record<string, number> = {};
        unreadData?.forEach((msg: any) => {
            unreadMap[msg.sender_id] = (unreadMap[msg.sender_id] || 0) + 1;
        });

        const contactsWithCount = people.map(p => ({
            ...p,
            unread: unreadMap[p.id] || 0
        }));

        contactsWithCount.sort((a: any, b: any) => b.unread - a.unread);
        setContacts(contactsWithCount);
    }, [currentUser]); // Depend on currentUser for default fallback, though explicit pass is better

    const markAsRead = useCallback(async (targetId: string) => {
        if (!currentUser) return;
        await supabase
            .from('chat_messages')
            .update({ is_read: true })
            .eq('sender_id', targetId)
            .eq('receiver_id', currentUser.id)
            .eq('is_read', false);

        // 這裡我們不呼叫 fetchContacts，避免畫面閃爍，反正 Realtime 會處理
    }, [currentUser]); // Depends on currentUser

    const fetchMessages = useCallback(async (targetId: string) => {
        if (!currentUser) return;
        const { data } = await supabase
            .from('chat_messages')
            .select('*')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: true });

        if (data) setMessages(data);
    }, [currentUser]); // Depends on currentUser

    const init = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        const { data: profile } = await supabase.from('users').select('*').eq('id', session.user.id).single();
        setCurrentUser(profile);
        await fetchContacts(profile); // Pass profile explicitly
        setLoading(false);
    }, [router, fetchContacts]); // Depends on fetchContacts

    useEffect(() => {
        init();

        // 🟢 建立即時監聽 (Realtime)
        const channel = supabase
            .channel('chat_turbo_v3')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
                // 1. 有新訊息，不管是不是給我的，先更新左邊紅點
                fetchContacts(currentUserRef.current);

                const newMsg = payload.new;
                const currentActive = activeContactRef.current;
                const myself = currentUserRef.current;

                // 2. 如果這則訊息是屬於「目前聊天視窗」的
                if (myself && currentActive && (newMsg.sender_id === currentActive || newMsg.receiver_id === currentActive)) {

                    // ⚡️ 關鍵優化：如果是「別人」傳來的，直接塞進陣列，不用重新 fetch (省時間)
                    // (如果是自己傳的，因為我們在 sendMessage 已經先塞進去了，所以這裡忽略，避免出現兩次)
                    if (newMsg.sender_id !== myself.id) {
                        setMessages(prev => [...prev, newMsg]);
                        markAsRead(currentActive); // 順便標已讀
                    }
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [init, fetchContacts, markAsRead]); // Added dependencies

    // 當訊息變多時，自動捲到底部
    useEffect(() => {
        scrollToBottom();
    }, [messages, activeContactId]);

    // 切換聯絡人時的動作
    useEffect(() => {
        if (activeContactId) {
            fetchMessages(activeContactId);
            markAsRead(activeContactId);
        }
    }, [activeContactId, fetchMessages, markAsRead]); // Added dependencies

    function scrollToBottom() {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }

    // 🚀 極速發送函數
    async function sendMessage(e: React.FormEvent) {
        e.preventDefault();
        if (!inputText.trim() || !activeContactId || !currentUser) return;

        const text = inputText;
        setInputText(''); // 1. 秒清空輸入框

        // 2. ⚡️ 樂觀更新 (Optimistic UI)：不管資料庫有沒有存成功，直接先假裝成功，顯示在畫面上！
        const tempMessage = {
            id: Date.now().toString(), // 暫時給個 ID
            sender_id: currentUser.id,
            receiver_id: activeContactId,
            message: text,
            created_at: new Date().toISOString(),
            is_read: false
        };

        // 直接塞進訊息列表 -> 使用者感覺「零延遲」
        setMessages(prev => [...prev, tempMessage]);

        // 3. 背景偷偷送出
        const { error } = await supabase.from('chat_messages').insert({
            sender_id: currentUser.id,
            receiver_id: activeContactId,
            message: text
        });

        if (error) {
            alert('發送失敗，請檢查網路');
            // 如果失敗，理論上要從列表移除，但這裡先假設網路穩定
        }
    }

    if (loading) return <div className="p-8 text-center">載入中...</div>;

    return (
        <div className="h-screen bg-gray-100 flex flex-col">
            <div className="bg-white border-b p-4 flex justify-between items-center shadow-sm flex-shrink-0 z-10">
                <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    💬 親師對話
                    <span className="text-sm bg-gray-100 px-2 py-1 rounded text-gray-500 font-normal">
                        {currentUser?.role === 'parent' ? '家長版' : '教師版'}
                    </span>
                </h1>
                <button onClick={() => router.push('/')} className="px-3 py-1 bg-gray-200 text-gray-600 rounded text-sm hover:bg-gray-300">回首頁</button>
            </div>

            <div className="flex-1 flex overflow-hidden max-w-6xl mx-auto w-full">
                {/* 左側列表 */}
                <div className={`w-full md:w-80 bg-white border-r flex flex-col ${activeContactId ? 'hidden md:flex' : 'flex'}`}>
                    <div className="p-4 border-b bg-gray-50 font-bold text-gray-500 text-sm">
                        聯絡人 ({contacts.length})
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {contacts.map(contact => (
                            <div
                                key={contact.id}
                                onClick={() => setActiveContactId(contact.id)}
                                className={`p-4 border-b cursor-pointer hover:bg-blue-50 transition flex justify-between items-center ${activeContactId === contact.id ? 'bg-blue-100 border-l-4 border-blue-500' : ''}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-lg font-bold text-gray-600">
                                        {(contact.name || contact.email)?.[0]?.toUpperCase() || 'U'}
                                    </div>
                                    <div>
                                        <div className="font-bold text-gray-800">{contact.name || contact.email}</div>
                                        <div className="text-xs text-gray-500">{contact.job_title || (contact.role === 'parent' ? '家長' : '老師/主任')}</div>
                                    </div>
                                </div>
                                {contact.unread > 0 && (
                                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse">
                                        {contact.unread}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* 右側聊天室 */}
                <div className={`flex-1 flex flex-col bg-gray-50 ${!activeContactId ? 'hidden md:flex' : 'flex'}`}>
                    {activeContactId ? (
                        <>
                            <div className="p-3 border-b bg-white flex items-center gap-2 shadow-sm">
                                <button onClick={() => setActiveContactId(null)} className="md:hidden text-gray-500 px-2 font-bold text-xl">←</button>
                                <div className="font-bold text-gray-800">
                                    與 <span className="text-blue-600">{contacts.find(c => c.id === activeContactId)?.name || contacts.find(c => c.id === activeContactId)?.email}</span> 的對話
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {messages.length === 0 ? (
                                    <div className="text-center text-gray-400 mt-10">尚無對話紀錄</div>
                                ) : (
                                    messages.map((msg, index) => {
                                        const isMe = msg.sender_id === currentUser?.id;
                                        return (
                                            <div key={msg.id || index} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                                                <div className={`max-w-[70%] p-3 rounded-xl shadow-sm relative ${isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-gray-800 border rounded-tl-none'}`}>
                                                    <div className="whitespace-pre-wrap break-words">{msg.message}</div>
                                                    <div className={`text-[10px] mt-1 text-right ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>
                                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            <form onSubmit={sendMessage} className="p-4 bg-white border-t flex gap-2">
                                <input
                                    type="text"
                                    className="flex-1 p-3 border rounded-full focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50"
                                    placeholder="輸入訊息..."
                                    value={inputText}
                                    onChange={e => setInputText(e.target.value)}
                                />
                                <button type="submit" disabled={!inputText.trim()} className="bg-blue-600 text-white px-6 py-2 rounded-full font-bold hover:bg-blue-700 disabled:opacity-50 transition transform active:scale-95">
                                    發送
                                </button>
                            </form>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                            <div className="text-6xl mb-4">💬</div>
                            <p>請選擇一位聯絡人</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}