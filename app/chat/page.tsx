'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function ChatPage() {
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [contacts, setContacts] = useState<any[]>([]);
    const [activeContactId, setActiveContactId] = useState<string | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);

    // 用來自動捲動到底部
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const router = useRouter();

    useEffect(() => {
        init();

        // 🟢 建立即時監聽 (不管是聯絡人列表或聊天內容變更，都重抓)
        const channel = supabase
            .channel('chat_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => {
                // 當有新訊息時：
                // 1. 如果正在跟這個人聊，就更新聊天內容
                // 2. 更新聯絡人列表 (為了更新未讀紅點)
                refreshData();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    // 當聊天對象改變，或訊息更新時，自動捲動到底部
    useEffect(() => {
        scrollToBottom();
    }, [messages, activeContactId]);

    // 當切換聯絡人時，標記為已讀
    useEffect(() => {
        if (activeContactId && currentUser) {
            markAsRead(activeContactId);
            fetchMessages(activeContactId);
        }
    }, [activeContactId]);

    function scrollToBottom() {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }

    // 共用的刷新數據函數 (給 Realtime 呼叫用)
    function refreshData() {
        // 這裡我們用一個小技巧：透過 closure 取得當下的 activeContactId 有點難，
        // 所以我們簡單粗暴地：重抓聯絡人，如果現在有選中人，也重抓訊息。
        // (在 React useEffect 閉包陷阱中，這裡簡化處理，實際建議用 ref 或 dependency)
        // 為了簡單穩健，我們這裡只觸發一個全域的狀態更新信號，或者直接重整。
        // 但為了效能，我們這裡選擇直接呼叫 fetchContacts。
        // *注意：因為閉包關係，這裡的 activeContactId 可能是舊的，所以我們先只更新列表*
        fetchContacts();
    }

    // 這一招是為了解決 Realtime 閉包問題，讓它可以存取到最新的 activeContactId
    const activeContactRef = useRef(activeContactId);
    useEffect(() => { activeContactRef.current = activeContactId; }, [activeContactId]);

    // 修改後的 Realtime 監聽器 (放在 init 裡或獨立 useEffect)
    useEffect(() => {
        const channel = supabase
            .channel('chat_realtime_v2')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
                fetchContacts(); // 更新左側紅點

                // 如果新訊息是傳給目前視窗的，或是目前視窗傳出去的，就更新右側
                const newMsg = payload.new;
                const currentActive = activeContactRef.current;

                if (currentActive && (newMsg.sender_id === currentActive || newMsg.receiver_id === currentActive)) {
                    fetchMessages(currentActive);
                    if (newMsg.sender_id === currentActive) {
                        markAsRead(currentActive); // 如果是對方傳來的，且我正在看，就標已讀
                    }
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);


    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        // 1. 取得自己是誰
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        setCurrentUser(profile);

        // 2. 取得聯絡人列表
        await fetchContacts(profile);
        setLoading(false);
    }

    // 抓取聯絡人 (根據角色)
    async function fetchContacts(user = currentUser) {
        if (!user) return;

        // 邏輯：
        // 如果我是家長 -> 我可以看到所有老師 (role != parent)
        // 如果我是老師 -> 我可以看到所有家長 (role = parent)
        const targetRoleCondition = user.role === 'parent' ? 'neq' : 'eq';
        const targetRoleValue = 'parent';

        // 1. 抓人
        let query = supabase.from('profiles').select('*').order('full_name');

        if (user.role === 'parent') {
            // 家長找老師 (role != parent)
            query = query.neq('role', 'parent');
        } else {
            // 老師找家長 (role == parent)
            query = query.eq('role', 'parent');
        }

        const { data: people } = await query;
        if (!people) return;

        // 2. 抓未讀數量 (這是最精彩的地方)
        // 我們要算：sender 是這個人，receiver 是我，且 is_read 是 false
        const { data: unreadData } = await supabase
            .from('chat_messages')
            .select('sender_id')
            .eq('receiver_id', user.id)
            .eq('is_read', false);

        // 統計每個人的未讀數
        const unreadMap: Record<string, number> = {};
        unreadData?.forEach((msg: any) => {
            unreadMap[msg.sender_id] = (unreadMap[msg.sender_id] || 0) + 1;
        });

        // 組合資料
        const contactsWithCount = people.map(p => ({
            ...p,
            unread: unreadMap[p.id] || 0
        }));

        // 排序：有未讀的排前面
        contactsWithCount.sort((a, b) => b.unread - a.unread);

        setContacts(contactsWithCount);
    }

    // 抓取聊天紀錄
    async function fetchMessages(targetId: string) {
        if (!currentUser) return;

        // 抓取 A->B 和 B->A 的所有訊息
        const { data } = await supabase
            .from('chat_messages')
            .select('*')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: true });

        if (data) setMessages(data);
    }

    // 標記已讀
    async function markAsRead(targetId: string) {
        if (!currentUser) return;
        await supabase
            .from('chat_messages')
            .update({ is_read: true })
            .eq('sender_id', targetId) // 對方傳給我的
            .eq('receiver_id', currentUser.id)
            .eq('is_read', false);

        // 更新一下左側紅點 (會消失)
        fetchContacts();
    }

    // 發送訊息
    async function sendMessage(e: React.FormEvent) {
        e.preventDefault();
        if (!inputText.trim() || !activeContactId || !currentUser) return;

        const text = inputText;
        setInputText(''); // 秒清空，體驗好

        const { error } = await supabase.from('chat_messages').insert({
            sender_id: currentUser.id,
            receiver_id: activeContactId,
            message: text
        });

        if (error) alert('發送失敗');
        // 不需要手動 fetchMessages，因為 Realtime 會幫忙
    }

    if (loading) return <div className="p-8 text-center">載入中...</div>;

    return (
        <div className="h-screen bg-gray-100 flex flex-col">
            {/* 頂部導覽列 */}
            <div className="bg-white border-b p-4 flex justify-between items-center shadow-sm flex-shrink-0 z-10">
                <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    💬 親師對話
                    <span className="text-sm bg-gray-100 px-2 py-1 rounded text-gray-500 font-normal">
                        {currentUser.role === 'parent' ? '家長版' : '教師版'}
                    </span>
                </h1>
                <button onClick={() => router.push('/')} className="px-3 py-1 bg-gray-200 text-gray-600 rounded text-sm hover:bg-gray-300">回首頁</button>
            </div>

            <div className="flex-1 flex overflow-hidden max-w-6xl mx-auto w-full">

                {/* 左側：聯絡人列表 */}
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
                                        {contact.full_name?.[0] || 'U'}
                                    </div>
                                    <div>
                                        <div className="font-bold text-gray-800">{contact.full_name}</div>
                                        <div className="text-xs text-gray-500">{contact.role === 'parent' ? '家長' : '老師/主任'}</div>
                                    </div>
                                </div>
                                {/* 未讀紅點 */}
                                {contact.unread > 0 && (
                                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse">
                                        {contact.unread}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* 右側：聊天視窗 */}
                <div className={`flex-1 flex flex-col bg-gray-50 ${!activeContactId ? 'hidden md:flex' : 'flex'}`}>
                    {activeContactId ? (
                        <>
                            {/* 聊天對象標題 (手機版有返回按鈕) */}
                            <div className="p-3 border-b bg-white flex items-center gap-2 shadow-sm">
                                <button onClick={() => setActiveContactId(null)} className="md:hidden text-gray-500 px-2 font-bold text-xl">←</button>
                                <div className="font-bold text-gray-800">
                                    與 <span className="text-blue-600">{contacts.find(c => c.id === activeContactId)?.full_name}</span> 的對話
                                </div>
                            </div>

                            {/* 訊息顯示區 */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {messages.length === 0 ? (
                                    <div className="text-center text-gray-400 mt-10">尚無對話紀錄，打個招呼吧！👋</div>
                                ) : (
                                    messages.map(msg => {
                                        const isMe = msg.sender_id === currentUser.id;
                                        return (
                                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`max-w-[70%] p-3 rounded-xl shadow-sm relative ${isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-gray-800 border rounded-tl-none'}`}>
                                                    <div className="whitespace-pre-wrap break-words">{msg.message}</div>
                                                    <div className={`text-[10px] mt-1 text-right ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>
                                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        {isMe && (
                                                            <span className="ml-1">{msg.is_read ? '已讀' : '未讀'}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                {/* 隱形元素，用來自動捲動到底部 */}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* 輸入框 */}
                            <form onSubmit={sendMessage} className="p-4 bg-white border-t flex gap-2">
                                <input
                                    type="text"
                                    className="flex-1 p-3 border rounded-full focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50"
                                    placeholder="輸入訊息..."
                                    value={inputText}
                                    onChange={e => setInputText(e.target.value)}
                                />
                                <button type="submit" disabled={!inputText.trim()} className="bg-blue-600 text-white px-6 py-2 rounded-full font-bold hover:bg-blue-700 disabled:opacity-50 transition">
                                    發送
                                </button>
                            </form>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                            <div className="text-6xl mb-4">💬</div>
                            <p>請從左側選擇一位聯絡人開始對話</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}