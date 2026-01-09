'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { logAction } from '@/lib/logService';

// --- Types ---
type Announcement = {
    id: string;
    title: string;
    content: string;
    priority: 'normal' | 'urgent';
    audience: 'all' | 'staff' | 'parent';
    author_id: string;
    created_at: string;
    author_name?: string; // Loaded via join or separate fetch
    is_read?: boolean; // For receiver view
    read_count?: number; // For admin view
    total_target?: number; // For admin rate calc
};

type UserProfile = {
    id: string;
    role: string;
    name: string;
};

export default function AnnouncementsPage() {
    const router = useRouter();
    const [user, setUser] = useState<UserProfile | null>(null);
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);

    // Admin State
    const [showCreate, setShowCreate] = useState(false);
    const [showReadList, setShowReadList] = useState<string | null>(null); // ID of announcement to show detailed read list

    // Form State
    const [formData, setFormData] = useState({
        title: '',
        content: '',
        priority: 'normal',
        audience: 'all'
    });

    useEffect(() => {
        checkUser();
    }, []);

    const checkUser = async () => {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) return router.push('/login');

        const { data: profile } = await supabase
            .from('users')
            .select('id, role, name')
            .eq('id', authUser.id)
            .single();

        if (profile) {
            setUser(profile);
            fetchAnnouncements(profile);
        }
    };

    const fetchAnnouncements = async (profile: UserProfile) => {
        setLoading(true);
        try {
            let query = supabase
                .from('announcements')
                .select(`
                    *,
                    author:users(name)
                `)
                .order('created_at', { ascending: false });

            // Ensure logic matches role
            // Admins see all. Parents/Staff see only relevant + 'all'
            if (!['director', 'manager', 'admin'].includes(profile.role)) {
                // Client-side filter or complex OR query. 
                // Simple approach: Fetch all matching audience OR author is me (not really needed for receiver)
                // Since Supabase raw OR with text mix is tricky, let's filter in memory if dataset is small, 
                // OR use a .or() query.
                // audience.in.('all', 'parent') etc.
                const audiences = ['all'];
                if (['teacher', 'admin_staff'].includes(profile.role)) audiences.push('staff');
                if (profile.role === 'parent') audiences.push('parent');

                query = query.in('audience', audiences);
            }

            const { data, error } = await query;
            if (error) throw error;

            let formatted: Announcement[] = (data || []).map(a => ({
                ...a,
                author_name: a.author?.name || 'Unknown',
                read_count: 0,
                total_target: 0
            }));

            // 1. Fetch Read Status (For Receivers: "Have I read this?")
            if (profile) {
                const { data: reads } = await supabase
                    .from('announcement_reads')
                    .select('announcement_id')
                    .eq('user_id', profile.id);

                const readIds = new Set(reads?.map(r => r.announcement_id));
                formatted = formatted.map(a => ({ ...a, is_read: readIds.has(a.id) }));
            }

            // 2. Fetch Stats (For Publishers: Read Rate)
            if (['director', 'manager', 'admin'].includes(profile.role)) {
                // Fetch actual read counts for all fetched announcements
                const { data: allReads } = await supabase
                    .from('announcement_reads')
                    .select('announcement_id');

                // Count per ID
                const readCounts: Record<string, number> = {};
                allReads?.forEach(r => {
                    readCounts[r.announcement_id] = (readCounts[r.announcement_id] || 0) + 1;
                });

                // Get Total Audience Counts (Approximate for now to save query cost)
                // In a real app we'd query exact counts per role. 
                const { count: totalParents } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'parent');
                const { count: totalStaff } = await supabase.from('users').select('*', { count: 'exact', head: true }).neq('role', 'parent').neq('role', 'pending');
                const totalAll = (totalParents || 0) + (totalStaff || 0);

                formatted = formatted.map(a => ({
                    ...a,
                    read_count: readCounts[a.id] || 0,
                    total_target: a.audience === 'parent' ? (totalParents || 1) :
                        a.audience === 'staff' ? (totalStaff || 1) : totalAll
                }));
            }

            setAnnouncements(formatted);

        } catch (err) {
            console.error('Fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!user) return;
        if (!formData.title || !formData.content) return alert('請填寫完整內容');

        try {
            const { error } = await supabase.from('announcements').insert({
                title: formData.title,
                content: formData.content,
                priority: formData.priority,
                audience: formData.audience,
                author_id: user.id
            });

            if (error) throw error;

            await logAction('發布公告', `發布了新的公告：[${formData.title}] 給 [${formData.audience}]`);

            setShowCreate(false);
            setFormData({ title: '', content: '', priority: 'normal', audience: 'all' });
            fetchAnnouncements(user);
            alert('發布成功！');
        } catch (e: any) {
            alert('發布失敗: ' + e.message);
        }
    };

    const markAsRead = async (id: string) => {
        // Only mark if not already read
        const target = announcements.find(a => a.id === id);
        if (target?.is_read) return;

        // UI Optimistic Update
        setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, is_read: true } : a));

        // DB Update
        if (user) {
            await supabase.from('announcement_reads').upsert({
                announcement_id: id,
                user_id: user.id
            }, { onConflict: 'announcement_id, user_id', ignoreDuplicates: true });
        }
    };

    const getAudienceLabel = (aud: string) => {
        switch (aud) {
            case 'parent': return '僅家長';
            case 'staff': return '僅員工';
            default: return '全校';
        }
    };

    // --- Render ---

    const isPublisher = ['director', 'manager', 'admin'].includes(user?.role || '');

    return (
        <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">
            {/* Header */}
            <div className="max-w-4xl mx-auto flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
                        📢 校園公告欄
                        {isPublisher && <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded-full">管理模式</span>}
                    </h1>
                    <p className="text-slate-500 mt-1">最新消息通知與重要事項發布</p>
                </div>

                <div className="flex gap-3">
                    <button onClick={() => router.push('/')} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition">
                        返回首頁
                    </button>
                    {isPublisher && (
                        <button
                            onClick={() => setShowCreate(true)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl shadow-lg shadow-indigo-200 transition-all transform hover:-translate-y-0.5 font-bold flex items-center gap-2"
                        >
                            <span>+</span> 發布新公告
                        </button>
                    )}
                </div>
            </div>

            {/* List */}
            <div className="max-w-4xl mx-auto space-y-4">
                {loading ? (
                    <div className="text-center py-20 text-slate-400">載入中...</div>
                ) : announcements.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-slate-100">
                        <p className="text-xl text-slate-400">目前沒有任何公告 🎉</p>
                    </div>
                ) : (
                    announcements.map(ann => (
                        <div
                            key={ann.id}
                            onClick={() => !isPublisher && markAsRead(ann.id)}
                            className={`
                                group bg-white rounded-2xl p-6 transition-all duration-300 border border-slate-100 hover:shadow-xl relative overflow-hidden cursor-pointer
                                ${!ann.is_read && !isPublisher ? 'border-l-4 border-l-rose-500 bg-rose-50/10' : ''}
                            `}
                        >
                            {/* Urgent Background Effect */}
                            {ann.priority === 'urgent' && (
                                <div className="absolute top-0 right-0 bg-red-100 text-red-600 text-xs px-3 py-1 rounded-bl-xl font-bold">
                                    🔴 緊急公告
                                </div>
                            )}

                            <div className="flex justify-between items-start mb-3">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        {!ann.is_read && !isPublisher && (
                                            <span className="animate-pulse w-2 h-2 rounded-full bg-rose-500 block"></span>
                                        )}
                                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                            {new Date(ann.created_at).toLocaleDateString()}
                                        </span>
                                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                                            {ann.author_name}
                                        </span>
                                        {isPublisher && (
                                            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                                                To: {getAudienceLabel(ann.audience)}
                                            </span>
                                        )}
                                    </div>
                                    <h3 className={`text-xl font-bold ${!ann.is_read && !isPublisher ? 'text-slate-900' : 'text-slate-700'}`}>
                                        {ann.priority === 'urgent' && !isPublisher && <span className="text-red-500 mr-2">!</span>}
                                        {ann.title}
                                    </h3>
                                </div>

                                {/* READ RATE stats for Publisher */}
                                {isPublisher && (
                                    <div className="text-right">
                                        <div className="text-2xl font-black text-slate-700">
                                            {Math.round((ann.read_count! / (ann.total_target || 1)) * 100)}%
                                        </div>
                                        <div className="text-xs text-slate-400 font-medium">
                                            已讀率 ({ann.read_count}/{ann.total_target})
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Content - Collapsible logic could go here, currently just showing full text pre-wrap */}
                            <p className="text-slate-600 whitespace-pre-wrap leading-relaxed pl-4 border-l-2 border-slate-100 group-hover:border-indigo-200 transition-colors">
                                {ann.content}
                            </p>

                            {/* Unread indicator text */}
                            {!ann.is_read && !isPublisher && (
                                <div className="mt-4 flex items-center gap-2 text-rose-500 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span>點擊標記為已讀</span>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Create Modal */}
            {showCreate && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl animate-fade-in-up">
                        <h2 className="text-2xl font-bold mb-6 text-slate-800">發布新公告</h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-2">公告標題</label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                                    placeholder="輸入標題..."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-2">公告內容</label>
                                <textarea
                                    value={formData.content}
                                    onChange={e => setFormData({ ...formData, content: e.target.value })}
                                    rows={5}
                                    className="w-full px-4 py-3 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                    placeholder="輸入詳細內容..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-2">重要性</label>
                                    <select
                                        value={formData.priority}
                                        onChange={e => setFormData({ ...formData, priority: e.target.value as any })}
                                        className="w-full px-4 py-3 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="normal">一般公告</option>
                                        <option value="urgent">🔴 緊急重要</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-2">發送對象</label>
                                    <select
                                        value={formData.audience}
                                        onChange={e => setFormData({ ...formData, audience: e.target.value as any })}
                                        className="w-full px-4 py-3 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="all">全校 (所有人)</option>
                                        <option value="parent">僅家長</option>
                                        <option value="staff">僅教職員</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button
                                onClick={() => setShowCreate(false)}
                                className="flex-1 py-3 text-slate-500 hover:bg-slate-100 rounded-xl font-bold transition"
                            >
                                取消發布
                            </button>
                            <button
                                onClick={handleCreate}
                                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-200 font-bold transition"
                            >
                                確認送出
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
