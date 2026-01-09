'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function AnnouncementPage() {
    const [role, setRole] = useState('');
    const [userId, setUserId] = useState('');
    const [announcements, setAnnouncements] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // 發布公告用
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
            // 1. 獲取當前用戶
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.push('/'); return; }
            setUserId(session.user.id);

            // 2. 獲取角色
            const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
            const userRole = profile?.role || 'parent';
            setRole(userRole);

            // 3. 獲取公告 (並關聯已讀紀錄)
            // 注意：這裡我們簡單抓取所有公告，並標記是否已讀
            const { data: list, error } = await supabase
                .from('announcements')
                .select(`
            *,
            announcement_reads (user_id)
        `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // 處理資料：判斷這個 user 有沒有讀過
            const processed = list.map(item => ({
                ...item,
                isRead: item.announcement_reads.some((r: any) => r.user_id === session.user.id),
                readCount: item.announcement_reads.length // 簡單統計已讀人數
            }));

            setAnnouncements(processed);

        } catch (err: any) {
            console.error('Error fetching announcements:', err);
            // 這裡可以選擇是否 alert 錯誤，目前先安靜處理
        } finally {
            // 🟢 關鍵：不管成功失敗，最後一定要關掉 Loading
            setLoading(false);
        }
    }

    // 標記已讀
    async function markAsRead(announcementId: string, isAlreadyRead: boolean) {
        if (isAlreadyRead) return; // 讀過就不再寫入

        // 前端先更新 UI (看起來比較快)
        setAnnouncements(prev => prev.map(a => a.id === announcementId ? { ...a, isRead: true } : a));

        // 後端寫入
        await supabase.from('announcement_reads').insert({
            announcement_id: announcementId,
            user_id: userId
        });
    }

    // 發布公告
    async function handlePublish() {
        if (!newTitle.trim()) return alert('請輸入標題');

        try {
            const { error } = await supabase.from('announcements').insert({
                title: newTitle,
                content: newContent,
                priority,
                audience,
                created_by: userId
            });

            if (error) throw error;

            alert('發布成功！');
            setShowCreate(false);
            setNewTitle('');
            setNewContent('');
            fetchData(); // 重新整理列表

        } catch (e: any) {
            alert('發布失敗: ' + e.message);
        }
    }

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center animate-pulse">
                <div className="text-4xl mb-2">📢</div>
                <p className="text-gray-500 font-bold">載入公告中...</p>
            </div>
        </div>
    );

    const isAdmin = ['director', 'manager', 'admin_staff'].includes(role);

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-4xl mx-auto">

                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
                            📢 校園公告欄
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">最新消息通知與重要事項發布</p>
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
                        <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-100">
                            <div className="text-5xl mb-4 opacity-30">📭</div>
                            <p className="text-gray-400 font-bold">目前沒有任何公告</p>
                        </div>
                    ) : (
                        announcements.map(item => (
                            <div
                                key={item.id}
                                onClick={() => markAsRead(item.id, item.isRead)}
                                className={`bg-white p-6 rounded-xl shadow-sm border transition relative group cursor-pointer hover:shadow-md 
                            ${item.priority === 'urgent' ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-blue-500'}
                            ${!item.isRead ? 'bg-blue-50/30' : ''}
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

                                <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">
                                    {item.content}
                                </p>

                                {/* 管理員才看得到的統計數據 */}
                                {isAdmin && (
                                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-400">
                                        <span>發送對象: {item.audience === 'all' ? '全校' : item.audience}</span>
                                        <span className="font-bold text-indigo-600">👁️ 已讀人數: {item.readCount} 人</span>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* 發布公告 Modal */}
                {showCreate && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white w-full max-w-lg rounded-2xl p-6 shadow-2xl animate-fade-in-up">
                            <h2 className="text-xl font-bold mb-4">📝 發布新公告</h2>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">標題</label>
                                    <input type="text" className="w-full p-3 border rounded-lg font-bold" placeholder="例如：本週五停課通知" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">內容</label>
                                    <textarea className="w-full p-3 border rounded-lg h-32" placeholder="請輸入詳細內容..." value={newContent} onChange={e => setNewContent(e.target.value)}></textarea>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">重要性</label>
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