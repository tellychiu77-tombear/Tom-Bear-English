'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function AnnouncementPage() {
    const [role, setRole] = useState('loading');
    const [userId, setUserId] = useState('');
    const [announcements, setAnnouncements] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // 發布公告用 State
    const [showCreate, setShowCreate] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState('');
    const [priority, setPriority] = useState('normal');
    const [audience, setAudience] = useState('all');

    const router = useRouter();

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        try {
            setLoading(true);
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.push('/'); return; }

            const currentUserEmail = session.user.email;
            setUserId(session.user.id);

            // 🛑 權限抓取修正 (關鍵修改) 🛑
            // 不管資料庫回傳什麼，只要是這個 Email，直接強制認定為 Director
            if (currentUserEmail === 'teacheryoyo@demo.com') {
                console.log('偵測到管理員帳號，強制賦予 Director 權限');
                setRole('director');
            } else {
                // 其他人照常去資料庫問身分 (使用 users 表)
                const { data: profile } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', session.user.id)
                    .single();

                setRole(profile?.role || 'parent');
            }

            // 獲取公告列表
            const { data: list, error } = await supabase
                .from('announcements')
                .select(`*, announcement_reads (user_id)`)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // 處理已讀數據
            const processed = list.map(item => ({
                ...item,
                isRead: item.announcement_reads.some((r: any) => r.user_id === session.user.id),
                readCount: item.announcement_reads.length
            }));

            // Client-side filtering logic (retained for non-admin view optimization)
            // If forced director, this won't trigger because role is 'director'
            const derivedRole = currentUserEmail === 'teacheryoyo@demo.com' ? 'director' : (role !== 'loading' ? role : 'parent');

            if (!['director', 'manager', 'admin', 'admin_staff'].includes(derivedRole)) {
                const relevant = processed.filter(p =>
                    p.audience === 'all' ||
                    (derivedRole === 'parent' && p.audience === 'parent') ||
                    (derivedRole !== 'parent' && p.audience === 'staff')
                );
                setAnnouncements(relevant);
            } else {
                setAnnouncements(processed);
            }

        } catch (err: any) {
            console.error('讀取錯誤:', err);
        } finally {
            setLoading(false);
        }
    }

    // 標記已讀功能
    async function markAsRead(announcementId: string, isAlreadyRead: boolean) {
        if (isAlreadyRead) return;
        setAnnouncements(prev => prev.map(a => a.id === announcementId ? { ...a, isRead: true } : a));

        // Upsert to handle potential duplicates gracefully
        await supabase.from('announcement_reads').upsert(
            { announcement_id: announcementId, user_id: userId },
            { onConflict: 'announcement_id, user_id', ignoreDuplicates: true }
        );
    }

    // 發布功能 (修正欄位名稱版)
    async function handlePublish() {
        if (!newTitle.trim()) return alert('請輸入標題');

        try {
            const { error } = await supabase.from('announcements').insert({
                title: newTitle,
                content: newContent,
                priority,
                audience,
                created_by: userId  // 👈 這裡原本可能是 author_id，請改成 created_by
            });

            if (error) throw error;

            alert('發布成功！');
            setShowCreate(false);
            setNewTitle('');
            setNewContent('');
            fetchData(); // 重新載入列表
        } catch (e: any) {
            alert('發布失敗: ' + e.message);
        }
    }

    // 刪除功能
    async function handleDelete(id: string) {
        if (!confirm('確定要刪除此公告嗎？')) return;
        try {
            const { error } = await supabase.from('announcements').delete().eq('id', id);
            if (error) throw error;
            setAnnouncements(prev => prev.filter(a => a.id !== id));
        } catch (e: any) {
            alert('刪除失敗: ' + e.message);
        }
    }

    // 判斷是否為管理員
    const isAdmin = ['director', 'manager', 'admin_staff'].includes(role);

    if (loading) return <div className="p-10 text-center text-gray-500">正在載入公告資料...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-4xl mx-auto">

                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
                            📢 校園公告欄
                        </h1>
                        <p className="text-xs text-gray-400 mt-1">
                            當前權限: <span className="font-bold text-indigo-500 uppercase">{role}</span>
                        </p>
                    </div>
                    <div className="flex gap-2">
                        {isAdmin && (
                            <button
                                onClick={() => setShowCreate(true)}
                                className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg shadow hover:bg-indigo-700 transition flex items-center gap-2"
                            >
                                <span>➕</span> 發布公告
                            </button>
                        )}
                        <button onClick={() => router.push('/')} className="px-4 py-2 text-gray-500 hover:bg-gray-200 rounded-lg font-bold">
                            返回首頁
                        </button>
                    </div>
                </div>

                {/* 公告列表 */}
                <div className="space-y-4">
                    {announcements.length === 0 ? (
                        <div className="text-center py-10 text-gray-400 bg-white rounded-xl border border-gray-100">
                            📭 目前沒有任何公告
                        </div>
                    ) : (
                        announcements.map(item => (
                            <div
                                key={item.id}
                                onClick={() => markAsRead(item.id, item.isRead)}
                                className={`bg-white p-6 rounded-xl shadow-sm border transition relative cursor-pointer hover:shadow-md 
                            ${item.priority === 'urgent' ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-blue-500'}
                            ${!item.isRead ? 'bg-blue-50/40' : ''}
                        `}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        {item.priority === 'urgent' && <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded font-bold">緊急</span>}
                                        {!item.isRead && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold animate-pulse">NEW</span>}
                                        <h3 className={`text-lg font-bold ${!item.isRead ? 'text-gray-900' : 'text-gray-600'}`}>
                                            {item.title}
                                        </h3>
                                    </div>
                                    <span className="text-xs text-gray-400 font-mono">
                                        {new Date(item.created_at).toLocaleDateString()}
                                    </span>
                                </div>

                                <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line mb-4">
                                    {item.content}
                                </p>

                                {/* 管理員功能區 */}
                                {isAdmin && (
                                    <div className="pt-3 border-t border-gray-100 flex justify-between items-center text-xs">
                                        <div className="text-gray-400 flex gap-4">
                                            <span>對象: {item.audience === 'all' ? '全校' : item.audience}</span>
                                            <span className="font-bold text-indigo-600">👁️ 已讀人數: {item.readCount}</span>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                                            className="text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition flex items-center gap-1"
                                        >
                                            🗑️ 刪除
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* 發布公告 Modal */}
                {showCreate && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white w-full max-w-lg rounded-2xl p-6 shadow-2xl">
                            <h2 className="text-xl font-bold mb-4">📝 發布新公告</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">標題</label>
                                    <input type="text" className="w-full p-3 border rounded-lg font-bold" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">內容</label>
                                    <textarea className="w-full p-3 border rounded-lg h-32" value={newContent} onChange={e => setNewContent(e.target.value)}></textarea>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">類型</label>
                                        <select className="w-full p-2 border rounded" value={priority} onChange={e => setPriority(e.target.value)}>
                                            <option value="normal">一般公告</option>
                                            <option value="urgent">🔴 緊急通知</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">發送對象</label>
                                        <select className="w-full p-2 border rounded" value={audience} onChange={e => setAudience(e.target.value)}>
                                            <option value="all">全校師生</option>
                                            <option value="teacher">僅老師</option>
                                            <option value="parent">僅家長</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end gap-2">
                                <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded font-bold">取消</button>
                                <button onClick={handlePublish} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded shadow hover:bg-indigo-700">確認發布</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}