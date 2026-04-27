'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

// ===== 工具函數 =====

function getRoleLabel(role: string, jobTitle?: string): string {
    if (jobTitle) return jobTitle;
    const map: Record<string, string> = {
        parent: '家長',
        teacher: '老師',
        director: '主任',
        english_director: '英文主任',
        care_director: '安親主任',
        admin: '行政人員',
    };
    return map[role] || '老師';
}

function relativeTime(dateStr: string): string {
    const d    = new Date(dateStr);
    const now  = new Date();
    const diff = now.getTime() - d.getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins < 1)    return '剛剛';
    if (mins < 60)   return `${mins}分`;
    if (hours < 24)  return `${hours}時`;
    if (days === 1)  return '昨天';
    if (days < 7)    return `${days}天前`;
    return d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
}

function formatDateLabel(dateStr: string): string {
    const d    = new Date(dateStr);
    const now  = new Date();
    const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (days === 0) return '今天';
    if (days === 1) return '昨天';
    return d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
}

const AVATAR_COLORS = [
    'bg-indigo-500', 'bg-violet-500', 'bg-pink-500', 'bg-rose-500',
    'bg-orange-500', 'bg-amber-600', 'bg-teal-500', 'bg-cyan-600',
    'bg-blue-500',   'bg-green-600',
];

function avatarColor(id: string): string {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name: string, email: string): string {
    return (name || email || 'U')[0].toUpperCase();
}

// ===== 主元件 =====

export default function ChatPage() {
    const [currentUser, setCurrentUser]           = useState<any>(null);
    const [contacts, setContacts]                 = useState<any[]>([]);
    const [activeContactId, setActiveContactId]   = useState<string | null>(null);
    const [messages, setMessages]                 = useState<any[]>([]);
    const [inputText, setInputText]               = useState('');
    const [loading, setLoading]                   = useState(true);
    const [searchText, setSearchText]             = useState('');
    const [sendError, setSendError]               = useState('');
    const [lastMsgMap, setLastMsgMap]             = useState<Record<string, { text: string; time: string }>>({});

    const messagesEndRef    = useRef<HTMLDivElement>(null);
    const activeContactRef  = useRef(activeContactId);
    const currentUserRef    = useRef(currentUser);
    const router            = useRouter();

    useEffect(() => { activeContactRef.current = activeContactId; }, [activeContactId]);
    useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

    // ----- 上次訊息快取 -----
    const loadLastMessages = useCallback(async (uid: string) => {
        const { data } = await supabase
            .from('chat_messages')
            .select('sender_id, receiver_id, message, created_at')
            .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)
            .order('created_at', { ascending: false });
        if (!data) return;
        const map: Record<string, { text: string; time: string }> = {};
        data.forEach((msg: any) => {
            const other = msg.sender_id === uid ? msg.receiver_id : msg.sender_id;
            if (!map[other]) map[other] = { text: msg.message, time: msg.created_at };
        });
        setLastMsgMap(map);
    }, []);

    // ----- 聯絡人列表 -----
    const fetchContacts = useCallback(async (user: any) => {
        const u = user || currentUser;
        if (!u) return;

        let query = supabase.from('users').select('*').order('name');
        if (u.role === 'parent') {
            query = query.in('role', ['teacher', 'director', 'english_director', 'care_director']);
        } else {
            query = query.eq('role', 'parent');
        }
        const { data: people } = await query;
        if (!people) return;

        const { data: unreadData } = await supabase
            .from('chat_messages')
            .select('sender_id')
            .eq('receiver_id', u.id)
            .eq('is_read', false);

        const unreadMap: Record<string, number> = {};
        unreadData?.forEach((msg: any) => {
            unreadMap[msg.sender_id] = (unreadMap[msg.sender_id] || 0) + 1;
        });

        const list = people.map(p => ({ ...p, unread: unreadMap[p.id] || 0 }));
        list.sort((a: any, b: any) => b.unread - a.unread);
        setContacts(list);
        loadLastMessages(u.id);
    }, [currentUser, loadLastMessages]);

    // ----- 標已讀 -----
    const markAsRead = useCallback(async (targetId: string) => {
        if (!currentUser) return;
        await supabase.from('chat_messages')
            .update({ is_read: true })
            .eq('sender_id', targetId)
            .eq('receiver_id', currentUser.id)
            .eq('is_read', false);
    }, [currentUser]);

    // ----- 取訊息 -----
    const fetchMessages = useCallback(async (targetId: string) => {
        if (!currentUser) return;
        const { data } = await supabase
            .from('chat_messages')
            .select('*')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: true });
        if (data) setMessages(data);
    }, [currentUser]);

    // ----- 初始化 + Realtime -----
    const init = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }
        const { data: profile } = await supabase.from('users').select('*').eq('id', session.user.id).single();
        setCurrentUser(profile);
        await fetchContacts(profile);
        setLoading(false);
    }, [router, fetchContacts]);

    useEffect(() => {
        init();
        const channel = supabase
            .channel('chat_v5')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
                fetchContacts(currentUserRef.current);
                const newMsg = payload.new as any;
                const active = activeContactRef.current;
                const myself = currentUserRef.current;
                if (myself && active &&
                    (newMsg.sender_id === active || newMsg.receiver_id === active) &&
                    newMsg.sender_id !== myself.id) {
                    setMessages(prev => [...prev, newMsg]);
                    markAsRead(active);
                }
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [init, fetchContacts, markAsRead]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, activeContactId]);

    useEffect(() => {
        if (activeContactId) {
            fetchMessages(activeContactId);
            markAsRead(activeContactId);
            setContacts(prev => prev.map(c => c.id === activeContactId ? { ...c, unread: 0 } : c));
        }
    }, [activeContactId, fetchMessages, markAsRead]);

    // ----- 發送訊息 -----
    const sendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputText.trim() || !activeContactId || !currentUser) return;
        setSendError('');
        const text = inputText;
        setInputText('');

        const tempId  = `temp-${Date.now()}`;
        const tempMsg = {
            id: tempId,
            sender_id: currentUser.id,
            receiver_id: activeContactId,
            message: text,
            created_at: new Date().toISOString(),
            is_read: false
        };
        setMessages(prev => [...prev, tempMsg]);

        const { error } = await supabase.from('chat_messages').insert({
            sender_id: currentUser.id,
            receiver_id: activeContactId,
            message: text
        });

        if (error) {
            setSendError('發送失敗，請確認網路連線');
            setMessages(prev => prev.filter(m => m.id !== tempId));
        } else {
            setLastMsgMap(prev => ({
                ...prev,
                [activeContactId]: { text, time: new Date().toISOString() }
            }));
        }
    };

    // ----- 日期分隔線 -----
    const getDateSep = (msgs: any[], idx: number): string | null => {
        if (idx === 0) return formatDateLabel(msgs[0].created_at);
        const curr = new Date(msgs[idx].created_at).toDateString();
        const prev = new Date(msgs[idx - 1].created_at).toDateString();
        return curr !== prev ? formatDateLabel(msgs[idx].created_at) : null;
    };

    // ----- 篩選 -----
    const filteredContacts = contacts.filter(c =>
        !searchText || (c.name || c.email || '').toLowerCase().includes(searchText.toLowerCase())
    );
    const totalUnread    = contacts.reduce((s, c) => s + (c.unread || 0), 0);
    const activeContact  = contacts.find(c => c.id === activeContactId);

    if (loading) return (
        <div className="h-screen flex items-center justify-center text-gray-400 animate-pulse text-lg">
            載入中...
        </div>
    );

    return (
        <div className="h-screen bg-gray-100 flex flex-col">

            {/* ===== 頂部 Header ===== */}
            <div className="bg-gradient-to-r from-indigo-700 to-blue-700 text-white px-5 py-3 flex justify-between items-center shadow-lg flex-shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">💬</span>
                    <div>
                        <h1 className="text-base font-black leading-tight">親師對話</h1>
                        <p className="text-indigo-200 text-xs leading-tight">
                            {currentUser?.role === 'parent' ? '家長版' : '教師版'} · {currentUser?.name || ''}
                        </p>
                    </div>
                    {totalUnread > 0 && (
                        <span className="bg-red-500 text-white text-xs font-black px-2 py-0.5 rounded-full animate-pulse">
                            {totalUnread}
                        </span>
                    )}
                </div>
                <button onClick={() => router.push('/')}
                    className="px-4 py-1.5 bg-white/20 hover:bg-white/30 rounded-full text-sm font-bold transition">
                    ← 首頁
                </button>
            </div>

            <div className="flex-1 flex overflow-hidden max-w-5xl mx-auto w-full">

                {/* ===== 左側聯絡人 ===== */}
                <div className={`w-full md:w-72 bg-white border-r flex flex-col shadow-sm flex-shrink-0
                    ${activeContactId ? 'hidden md:flex' : 'flex'}`}>

                    {/* 搜尋欄 */}
                    <div className="p-3 border-b bg-gray-50">
                        <div className="bg-white border border-gray-200 rounded-full px-3 py-2 flex items-center gap-2 shadow-sm">
                            <span className="text-gray-400 text-sm">🔍</span>
                            <input
                                type="text"
                                placeholder="搜尋聯絡人..."
                                className="bg-transparent outline-none text-sm w-full text-gray-700 placeholder-gray-400"
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                            />
                            {searchText && (
                                <button onClick={() => setSearchText('')} className="text-gray-400 hover:text-gray-600 font-bold text-xs">✕</button>
                            )}
                        </div>
                    </div>

                    {/* 聯絡人清單 */}
                    <div className="flex-1 overflow-y-auto">
                        {filteredContacts.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 text-sm">查無聯絡人</div>
                        ) : (
                            filteredContacts.map(contact => {
                                const last  = lastMsgMap[contact.id];
                                const color = avatarColor(contact.id);
                                const init_ = initials(contact.name, contact.email);
                                const isActive = activeContactId === contact.id;
                                return (
                                    <div
                                        key={contact.id}
                                        onClick={() => setActiveContactId(contact.id)}
                                        className={`px-4 py-3 border-b cursor-pointer transition-all
                                            ${isActive
                                                ? 'bg-indigo-50 border-l-4 border-indigo-500'
                                                : 'border-l-4 border-transparent hover:bg-gray-50'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            {/* Avatar */}
                                            <div className={`w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center text-base font-black text-white ${color}`}>
                                                {init_}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-baseline gap-1">
                                                    <span className={`font-bold text-sm truncate ${contact.unread ? 'text-gray-900' : 'text-gray-700'}`}>
                                                        {contact.name || contact.email}
                                                    </span>
                                                    {last && (
                                                        <span className="text-[11px] text-gray-400 flex-shrink-0">
                                                            {relativeTime(last.time)}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex justify-between items-center mt-0.5">
                                                    <span className={`text-xs truncate max-w-[145px] ${contact.unread ? 'text-gray-700 font-semibold' : 'text-gray-400'}`}>
                                                        {last
                                                            ? last.text
                                                            : getRoleLabel(contact.role, contact.job_title)}
                                                    </span>
                                                    {contact.unread > 0 && (
                                                        <span className="bg-indigo-600 text-white text-[11px] font-black min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center flex-shrink-0 ml-1">
                                                            {contact.unread > 9 ? '9+' : contact.unread}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* ===== 右側聊天區 ===== */}
                <div className={`flex-1 flex flex-col min-w-0 ${!activeContactId ? 'hidden md:flex' : 'flex'}`}>
                    {activeContactId && activeContact ? (
                        <>
                            {/* 聊天 header */}
                            <div className="px-4 py-3 border-b bg-white flex items-center gap-3 shadow-sm flex-shrink-0">
                                <button onClick={() => setActiveContactId(null)}
                                    className="md:hidden text-gray-500 font-bold text-xl mr-1">←</button>
                                <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-black text-white ${avatarColor(activeContact.id)}`}>
                                    {initials(activeContact.name, activeContact.email)}
                                </div>
                                <div>
                                    <div className="font-bold text-gray-800 text-sm leading-tight">
                                        {activeContact.name || activeContact.email}
                                    </div>
                                    <div className="text-xs text-gray-400 leading-tight">
                                        {getRoleLabel(activeContact.role, activeContact.job_title)}
                                    </div>
                                </div>
                            </div>

                            {/* 訊息列表 */}
                            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-0.5">
                                {messages.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                        <div className="text-6xl mb-3">👋</div>
                                        <p className="font-bold text-gray-500">開始對話吧！</p>
                                    </div>
                                ) : (
                                    messages.map((msg, idx) => {
                                        const isMe   = msg.sender_id === currentUser?.id;
                                        const isTemp = String(msg.id).startsWith('temp-');
                                        const dateSep = getDateSep(messages, idx);
                                        return (
                                            <div key={msg.id || idx}>
                                                {/* 日期分隔線 */}
                                                {dateSep && (
                                                    <div className="flex items-center gap-3 my-4">
                                                        <div className="flex-1 h-px bg-gray-200" />
                                                        <span className="text-xs text-gray-400 font-bold px-3 whitespace-nowrap">
                                                            {dateSep}
                                                        </span>
                                                        <div className="flex-1 h-px bg-gray-200" />
                                                    </div>
                                                )}
                                                <div className={`flex items-end gap-2 mb-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                    {/* 對方頭像 */}
                                                    {!isMe && (
                                                        <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black text-white mb-1 ${avatarColor(activeContact.id)}`}>
                                                            {initials(activeContact.name, activeContact.email)}
                                                        </div>
                                                    )}
                                                    <div className="max-w-[68%]">
                                                        <div className={`px-4 py-2.5 rounded-2xl text-sm shadow-sm leading-relaxed
                                                            ${isMe
                                                                ? `bg-indigo-600 text-white rounded-tr-sm ${isTemp ? 'opacity-60' : ''}`
                                                                : 'bg-white text-gray-800 border border-gray-100 rounded-tl-sm'
                                                            }`}>
                                                            <div className="whitespace-pre-wrap break-words">{msg.message}</div>
                                                        </div>
                                                        <div className={`flex items-center gap-1 mt-0.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                            <span className="text-[10px] text-gray-400">
                                                                {new Date(msg.created_at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                            {isMe && isTemp && (
                                                                <span className="text-[10px] text-gray-400">傳送中…</span>
                                                            )}
                                                            {isMe && !isTemp && (
                                                                <span className={`text-[11px] font-bold ${msg.is_read ? 'text-indigo-400' : 'text-gray-400'}`}>
                                                                    {msg.is_read ? '✓✓' : '✓'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* 發送錯誤提示 */}
                            {sendError && (
                                <div className="px-4 py-2 bg-red-50 border-t border-red-100 flex justify-between items-center">
                                    <span className="text-red-500 text-xs font-bold">❌ {sendError}</span>
                                    <button onClick={() => setSendError('')} className="text-red-400 hover:text-red-600 font-bold text-xs">✕</button>
                                </div>
                            )}

                            {/* 輸入框 */}
                            <form onSubmit={sendMessage} className="p-3 bg-white border-t flex gap-2 items-center flex-shrink-0">
                                <input
                                    type="text"
                                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-400 outline-none bg-gray-50 text-sm"
                                    placeholder="輸入訊息..."
                                    value={inputText}
                                    onChange={e => setInputText(e.target.value)}
                                    autoComplete="off"
                                />
                                <button type="submit" disabled={!inputText.trim()}
                                    className="bg-indigo-600 text-white px-5 py-2.5 rounded-2xl font-bold hover:bg-indigo-700 disabled:opacity-40 transition active:scale-95 text-sm flex-shrink-0">
                                    發送
                                </button>
                            </form>
                        </>
                    ) : (
                        /* 未選聯絡人 */
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50">
                            <div className="text-7xl mb-4">💬</div>
                            <p className="font-bold text-lg text-gray-500">選擇聯絡人開始對話</p>
                            <p className="text-sm mt-1">共 {contacts.length} 位聯絡人</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
