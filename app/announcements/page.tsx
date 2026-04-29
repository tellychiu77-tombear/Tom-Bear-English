'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { getEffectivePermissions } from '../../lib/permissions';
import { logAction } from '../../lib/logService';

function relativeTime(dateStr: string) {
    const now = new Date();
    const date = new Date(dateStr);
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return '剛剛';
    if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
    return date.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
}

const AUD: Record<string, { label: string; color: string }> = {
    all:     { label: '全員公告', color: 'bg-emerald-100 text-emerald-700' },
    parent:  { label: '家長專屬', color: 'bg-blue-100 text-blue-700' },
    teacher: { label: '教師內部', color: 'bg-purple-100 text-purple-700' },
};

export default function AnnouncementsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [role, setRole] = useState('parent');
    const [userId, setUserId] = useState('');
    const [canManage, setCanManage] = useState(false);

    const [announcements, setAnnouncements] = useState<any[]>([]);
    const [authors, setAuthors] = useState<Record<string, string>>({});
    const [readIds, setReadIds] = useState<Set<string>>(new Set());
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const [search, setSearch] = useState('');
    const [filterTab, setFilterTab] = useState('all');

    const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({ title: '', content: '', target_audience: 'all', is_pinned: false });
    const [saving, setSaving] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const showToast = (type: 'success' | 'error', text: string) => {
        setToast({ type, text });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchAll = useCallback(async (userRole: string, uid: string) => {
        let q = supabase.from('announcements').select('*')
            .order('is_pinned', { ascending: false })
            .order('created_at', { ascending: false });
        if (userRole === 'parent') q = q.or('target_audience.eq.all,target_audience.eq.parent');

        const { data, error } = await q;
        if (error) { console.error(error); return; }
        const list = data || [];
        setAnnouncements(list);

        // Author names
        const ids = [...new Set(list.map((a: any) => a.author_id).filter(Boolean))] as string[];
        if (ids.length > 0) {
            const { data: users } = await supabase.from('users').select('id, name, email').in('id', ids);
            const map: Record<string, string> = {};
            users?.forEach((u: any) => { map[u.id] = u.name || u.email?.split('@')[0] || '?'; });
            setAuthors(map);
        }

        // Read status
        if (uid && list.length > 0) {
            const annIds = list.map((a: any) => a.id);
            const { data: reads } = await supabase.from('announcement_reads')
                .select('announcement_id').eq('user_id', uid).in('announcement_id', annIds);
            setReadIds(new Set(reads?.map((r: any) => r.announcement_id) || []));
        }
    }, []);

    useEffect(() => {
        async function init() {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.push('/'); return; }
            const uid = session.user.id;
            setUserId(uid);

            const { data: user } = await supabase.from('users').select('role, extra_permissions').eq('id', uid).single();
            const r = user?.role || 'parent';
            setRole(r);

            const { data: roleConfigRow } = await supabase.from('role_configs').select('permissions').eq('role', r).single();
            const perms = getEffectivePermissions(r, roleConfigRow?.permissions ?? null, user?.extra_permissions ?? null);
            setCanManage(perms.manageAnnouncements);

            await fetchAll(r, uid);
            setLoading(false);
        }
        init();
    }, [router, fetchAll]);

    const markAsRead = async (annId: string) => {
        if (readIds.has(annId) || !userId) return;
        await supabase.from('announcement_reads').upsert(
            { announcement_id: annId, user_id: userId },
            { onConflict: 'announcement_id,user_id' }
        );
        setReadIds(prev => new Set([...prev, annId]));
    };

    const handleSave = async () => {
        if (!formData.title.trim() || !formData.content.trim()) {
            showToast('error', '標題和內容不能為空');
            return;
        }
        setSaving(true);
        const payload = { ...formData, author_id: userId };
        const { error } = editingId
            ? await supabase.from('announcements').update(payload).eq('id', editingId)
            : await supabase.from('announcements').insert(payload);
        setSaving(false);
        if (error) { showToast('error', '儲存失敗，請稍後再試'); return; }
        showToast('success', editingId ? '公告已更新' : '公告已發布');
        await logAction(editingId ? '編輯公告' : '發布公告', `標題：${formData.title}，對象：${formData.target_audience}`);
        setIsModalOpen(false);
        setEditingId(null);
        setFormData({ title: '', content: '', target_audience: 'all', is_pinned: false });
        fetchAll(role, userId);
    };

    const handleDelete = async (id: string) => {
        const ann = announcements.find(a => a.id === id);
        const { error } = await supabase.from('announcements').delete().eq('id', id);
        setConfirmDeleteId(null);
        if (error) { showToast('error', '刪除失敗'); return; }
        showToast('success', '公告已刪除');
        await logAction('刪除公告', `標題：${ann?.title ?? id}`);
        setAnnouncements(prev => prev.filter(a => a.id !== id));
    };

    function openModal(ann: any = null) {
        if (ann) {
            setEditingId(ann.id);
            setFormData({ title: ann.title, content: ann.content, target_audience: ann.target_audience, is_pinned: ann.is_pinned });
        } else {
            setEditingId(null);
            setFormData({ title: '', content: '', target_audience: 'all', is_pinned: false });
        }
        setIsModalOpen(true);
    }

    const filtered = announcements.filter(a => {
        if (search && !a.title.includes(search) && !a.content.includes(search)) return false;
        if (filterTab === 'all_aud' && a.target_audience !== 'all') return false;
        if (filterTab === 'parent' && a.target_audience !== 'parent') return false;
        if (filterTab === 'teacher' && a.target_audience !== 'teacher') return false;
        if (filterTab === 'pinned' && !a.is_pinned) return false;
        return true;
    });

    const unreadCount = announcements.filter(a => !readIds.has(a.id)).length;

    const TABS = [
        { key: 'all', label: '全部' },
        { key: 'all_aud', label: '全員' },
        { key: 'parent', label: '家長' },
        ...(role !== 'parent' ? [{ key: 'teacher', label: '教師' }] : []),
        { key: 'pinned', label: '📌 置頂' },
    ];

    if (loading) return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="text-center">
                <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-500 text-sm">載入公告中...</p>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/30">

            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-xl text-white font-bold text-sm
                    ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}>
                    {toast.type === 'success' ? '✅ ' : '❌ '}{toast.text}
                </div>
            )}

            {/* Sticky header */}
            <div className="bg-white/90 backdrop-blur border-b border-gray-100 sticky top-0 z-30 shadow-sm">
                <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => router.push('/')}
                            className="text-gray-400 hover:text-gray-700 text-sm font-bold transition">
                            ← 首頁
                        </button>
                        <div className="w-px h-4 bg-gray-200" />
                        <div className="flex items-center gap-2">
                            <span className="text-lg">📢</span>
                            <h1 className="text-lg font-black text-gray-800">園所公告</h1>
                            {unreadCount > 0 && (
                                <span className="bg-red-500 text-white text-xs font-black px-1.5 py-0.5 rounded-full leading-none">
                                    {unreadCount}
                                </span>
                            )}
                        </div>
                    </div>
                    {canManage && (
                        <button onClick={() => openModal()}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-indigo-700 transition shadow-sm">
                            + 發布公告
                        </button>
                    )}
                </div>
            </div>

            <div className="max-w-3xl mx-auto px-4 py-5">

                {/* Search bar */}
                <div className="relative mb-3">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-base">🔍</span>
                    <input
                        className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm
                            focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent shadow-sm"
                        placeholder="搜尋公告標題或內容..."
                        value={search} onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button onClick={() => setSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg">
                            ×
                        </button>
                    )}
                </div>

                {/* Filter tabs */}
                <div className="flex gap-2 overflow-x-auto pb-1 mb-5">
                    {TABS.map(tab => (
                        <button key={tab.key} onClick={() => setFilterTab(tab.key)}
                            className={`px-3.5 py-1.5 rounded-lg text-sm font-bold whitespace-nowrap transition-all
                                ${filterTab === tab.key
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'bg-white text-gray-500 border border-gray-200 hover:border-indigo-300 hover:text-indigo-600'}`}>
                            {tab.label}
                            {tab.key === 'all' && unreadCount > 0 && (
                                <span className="ml-1.5 bg-red-100 text-red-600 text-xs px-1 rounded-full">{unreadCount}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* List */}
                <div className="space-y-3">
                    {filtered.length === 0 && (
                        <div className="text-center py-16 text-gray-400">
                            <div className="text-5xl mb-3">📭</div>
                            <p className="font-bold text-gray-500">
                                {search ? `找不到含「${search}」的公告` : '目前沒有公告'}
                            </p>
                            {search && (
                                <button onClick={() => setSearch('')} className="mt-2 text-sm text-indigo-600 hover:underline">
                                    清除搜尋
                                </button>
                            )}
                        </div>
                    )}

                    {filtered.map(item => {
                        const isRead = readIds.has(item.id);
                        const aud = AUD[item.target_audience] || AUD.all;
                        const isExpanded = expandedIds.has(item.id);
                        const isLong = item.content.length > 150;
                        const authorName = authors[item.author_id] || '系統管理員';
                        const authorInitial = authorName[0]?.toUpperCase() || 'S';

                        return (
                            <div key={item.id}
                                onClick={() => markAsRead(item.id)}
                                className={`bg-white rounded-2xl border overflow-hidden transition-all
                                    ${item.is_pinned
                                        ? 'border-l-4 border-l-orange-400 border-r border-t border-b border-orange-100 shadow-md'
                                        : isRead ? 'border-gray-100 shadow-sm' : 'border-indigo-100 shadow-md'}`}>

                                {/* Top bar */}
                                <div className="px-4 pt-4 pb-0">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1">
                                            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                                {item.is_pinned && (
                                                    <span className="text-xs bg-orange-100 text-orange-600 font-bold px-2 py-0.5 rounded-full">📌 置頂</span>
                                                )}
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${aud.color}`}>
                                                    {aud.label}
                                                </span>
                                                {!isRead && (
                                                    <span className="w-2 h-2 rounded-full bg-red-500 inline-block" title="未讀" />
                                                )}
                                            </div>
                                            <h2 className={`font-black leading-snug ${isRead ? 'text-gray-600 text-sm' : 'text-gray-800 text-base'}`}>
                                                {item.title}
                                            </h2>
                                        </div>

                                        {canManage && (
                                            <div className="flex gap-1 shrink-0 -mt-0.5">
                                                <button onClick={e => { e.stopPropagation(); openModal(item); }}
                                                    className="text-xs text-gray-400 hover:text-indigo-600 px-2 py-1.5 hover:bg-indigo-50 rounded-lg transition">
                                                    編輯
                                                </button>
                                                <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(item.id); }}
                                                    className="text-xs text-gray-400 hover:text-red-600 px-2 py-1.5 hover:bg-red-50 rounded-lg transition">
                                                    刪除
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="px-4 py-3">
                                    <p className={`text-sm text-gray-600 whitespace-pre-wrap leading-relaxed ${!isExpanded && isLong ? 'line-clamp-3' : ''}`}>
                                        {item.content}
                                    </p>
                                    {isLong && (
                                        <button
                                            onClick={e => {
                                                e.stopPropagation();
                                                setExpandedIds(prev => {
                                                    const s = new Set(prev);
                                                    isExpanded ? s.delete(item.id) : s.add(item.id);
                                                    return s;
                                                });
                                            }}
                                            className="mt-1.5 text-xs text-indigo-600 font-bold hover:underline">
                                            {isExpanded ? '收起 ▲' : '查看全部 ▼'}
                                        </button>
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="px-4 py-2.5 bg-gray-50/60 border-t border-gray-100 flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-xs shrink-0">
                                        {authorInitial}
                                    </div>
                                    <span className="text-xs font-bold text-gray-600">{authorName}</span>
                                    <span className="text-gray-300 text-xs">·</span>
                                    <span className="text-xs text-gray-400">{relativeTime(item.created_at)}</span>
                                    {isRead && <span className="ml-auto text-xs text-gray-300">已讀 ✓</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Stats footer */}
                {announcements.length > 0 && (
                    <p className="text-center text-xs text-gray-400 mt-6">
                        共 {announcements.length} 則公告 · {unreadCount > 0 ? `${unreadCount} 則未讀` : '全部已讀 ✓'}
                    </p>
                )}
            </div>

            {/* Delete confirm */}
            {confirmDeleteId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
                        <div className="text-5xl mb-3">🗑️</div>
                        <h3 className="text-lg font-black text-gray-800 mb-1">確定刪除此公告？</h3>
                        <p className="text-sm text-gray-400 mb-6">刪除後無法復原</p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmDeleteId(null)}
                                className="flex-1 py-3 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition">
                                取消
                            </button>
                            <button onClick={() => handleDelete(confirmDeleteId)}
                                className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 transition">
                                確定刪除
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create / Edit modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
                        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
                            <h2 className="text-lg font-black text-white">
                                {editingId ? '✏️ 編輯公告' : '📢 發布新公告'}
                            </h2>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5">標題 *</label>
                                <input
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    placeholder="輸入公告標題..."
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5">內容 *</label>
                                <textarea
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm h-36 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    placeholder="輸入公告內容..."
                                    value={formData.content}
                                    onChange={e => setFormData({ ...formData, content: e.target.value })}
                                />
                            </div>
                            <div className="flex gap-3 items-end">
                                <div className="flex-1">
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">發送對象</label>
                                    <select
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                        value={formData.target_audience}
                                        onChange={e => setFormData({ ...formData, target_audience: e.target.value })}>
                                        <option value="all">📢 全員可見</option>
                                        <option value="parent">👨‍👩‍👧 僅家長</option>
                                        <option value="teacher">👩‍🏫 僅教師</option>
                                    </select>
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer px-3 py-2.5 border border-gray-200 rounded-xl hover:bg-orange-50 transition whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        checked={formData.is_pinned}
                                        onChange={e => setFormData({ ...formData, is_pinned: e.target.checked })}
                                        className="accent-orange-500 w-4 h-4"
                                    />
                                    <span className="text-sm font-bold text-gray-700">📌 置頂</span>
                                </label>
                            </div>
                        </div>

                        <div className="px-6 pb-6 flex gap-3">
                            <button onClick={() => setIsModalOpen(false)}
                                className="flex-1 py-3 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition">
                                取消
                            </button>
                            <button onClick={handleSave} disabled={saving}
                                className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-50 transition">
                                {saving ? '儲存中...' : editingId ? '更新公告' : '發布公告'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
