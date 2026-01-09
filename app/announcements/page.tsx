'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function AnnouncementPage() {
    const [role, setRole] = useState('');
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
            setUserId(session.user.id);

            // 獲取角色 (修正：使用 users 表)
            const { data: profile } = await supabase.from('users').select('role').eq('id', session.user.id).single();
            const userRole = profile?.role || 'parent';
            setRole(userRole); // 更新狀態

            // 獲取公告
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

            // Client-side filtering for non-admins to avoid checking "audience" in RLS complexity for now
            // If needed, we can move this to DB query RLS later
            if (!['director', 'manager', 'admin', 'admin_staff'].includes(userRole)) {
                const relevant = processed.filter(p =>
                    p.audience === 'all' ||
                    (userRole === 'parent' && p.audience === 'parent') ||
                    (userRole !== 'parent' && p.audience === 'staff')
                );
                setAnnouncements(relevant);
            } else {
                setAnnouncements(processed);
            }

        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function markAsRead(announcementId: string, isAlreadyRead: boolean) {
        if (isAlreadyRead) return;
        setAnnouncements(prev => prev.map(a => a.id === announcementId ? { ...a, isRead: true } : a));

        // Explicit ignoreDuplicates logic via upsert
        await supabase.from('announcement_reads').upsert(
            { announcement_id: announcementId, user_id: userId },
            { onConflict: 'announcement_id, user_id', ignoreDuplicates: true }
        );
    }

    async function handlePublish() {
        if (!newTitle.trim()) return alert('請輸入標題');
        try {
            // 修正：created_by -> author_id
            const { error } = await supabase.from('announcements').insert({
                title: newTitle, content: newContent, priority, audience, author_id: userId
            });
            if (error) throw error;
            alert('發布成功！');
            setShowCreate(false);
            setNewTitle(''); setNewContent('');
            fetchData();
        } catch (e: any) {
            alert('發布失敗: ' + e.message);
        }
    }

    // 新增：刪除公告功能
    async function handleDelete(id: string) {
        if (!confirm('確定要刪除此公告嗎？已讀紀錄也會一併消失。')) return;
        try {
            const { error } = await supabase.from('announcements').delete().eq('id', id);
            if (error) throw error;
            setAnnouncements(prev => prev.filter(a => a.id !== id));
        } catch (e: any) {
            alert('刪除失敗 (可能權限不足): ' + e.message);
        }
    }

    // 判斷是否為管理員
    const isAdmin = ['director', 'manager', 'admin_staff', 'admin'].includes(role);

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center animate-pulse">
                <div className="text-4xl mb-2">📢</div>
                <p className="text-gray-500 font-bold">載入公告中...</p>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-4xl mx-auto">

                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
                            📢 校園公告欄
                        </h1>
                        {/* Debug 用：顯示目前身分 */}
                        <p className="text-xs text-gray-400 mt-1">
                            當前帳號權限: <span className="font-bold text-indigo-500 uppercase">{role}</span>
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

                {/* List */}
                <div className="space-y-4">
                    {announcements.length === 0 ? (
                        <div className="text-center py-10 text-gray-400">目前沒有公告</div>
                    ) : (
                        announcements.map(item => (
                            <div
                                key={item.id}
                                onClick={() => markAsRead(item.id, item.isRead)}
                                className={`bg-white p-6 rounded-xl shadow-sm border transition relative cursor-pointer hover:shadow-md 
                            ${item.priority === 'urgent' ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-blue-500'}
                            ${!item.isRead ? 'bg-blue-50/50' : ''}
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

                                {/* 管理員專屬控制區 */}
                                {isAdmin && (
                                    <div className="pt-3 border-t border-gray-100 flex justify-between items-center text-xs">
                                        <div className="text-gray-400 flex gap-4">
                                            <span>對象: {item.audience}</span>
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

                {/* Modal (保持原本的發布視窗邏輯) */}
                {showCreate && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white w-full max-w-lg rounded-2xl p-6 shadow-2xl">
                            <h2 className="text-xl font-bold mb-4">📝 發布新公告</h2>
                            <div className="space-y-4">
                                <input type="text" className="w-full p-3 border rounded-lg font-bold" placeholder="標題" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
                                <textarea className="w-full p-3 border rounded-lg h-32" placeholder="內容..." value={newContent} onChange={e => setNewContent(e.target.value)}></textarea>
                                <div className="grid grid-cols-2 gap-4">
                                    <select className="w-full p-2 border rounded" value={priority} onChange={e => setPriority(e.target.value)}>
                                        <option value="normal">一般公告</option>
                                        <option value="urgent">🔴 緊急通知</option>
                                    </select>
                                    <select className="w-full p-2 border rounded" value={audience} onChange={e => setAudience(e.target.value)}>
                                        <option value="all">全校師生</option>
                                        <option value="teacher">僅老師</option>
                                        <option value="parent">僅家長</option>
                                    </select>
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end gap-2">
                                <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded font-bold">取消</button>
                                <button onClick={handlePublish} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded shadow hover:bg-indigo-700">發布</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}