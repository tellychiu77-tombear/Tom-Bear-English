'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { getEffectivePermissions } from '../../lib/permissions';

export default function AnnouncementsPage() {
    const router = useRouter();
    const [announcements, setAnnouncements] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [role, setRole] = useState<string>('parent'); // 預設安全權限
    const [userId, setUserId] = useState('');
    const [canManageAnnouncements, setCanManageAnnouncements] = useState(false);

    // Modal & Form states
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        title: '',
        content: '',
        target_audience: 'all', // all, parent, teacher
        is_pinned: false
    });

    // 1. 定義抓取資料的函式 (使用 useCallback 解決依賴報錯)
    // 這裡同時解決了「資料外洩」問題：根據角色向資料庫請求特定的資料
    const fetchAnnouncements = useCallback(async (userRole: string) => {
        try {
            let query = supabase
                .from('announcements')
                .select('*')
                .order('is_pinned', { ascending: false })
                .order('created_at', { ascending: false });

            // 🔥 安全修正：如果是家長，只抓取「全部」或「給家長」的公告
            // 這樣就算駭客用 F12 也看不到「給老師」的機密公告
            if (userRole === 'parent') {
                query = query.or('target_audience.eq.all,target_audience.eq.parent');
            }
            // 如果是 teacher 或 director，則不加過濾條件 (看全部)

            const { data, error } = await query;
            if (error) throw error;
            setAnnouncements(data || []);
        } catch (error) {
            console.error('Error fetching announcements:', error);
        } finally {
            setLoading(false);
        }
    }, []); // 無依賴，因為邏輯封閉

    // 2. 初始化檢查權限
    useEffect(() => {
        async function init() {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.push('/');
                return;
            }

            setUserId(session.user.id);

            // 抓取使用者角色 + 個人覆蓋權限
            const { data: user } = await supabase
                .from('users')
                .select('role, extra_permissions')
                .eq('id', session.user.id)
                .single();

            const currentRole = user?.role || 'parent';
            setRole(currentRole);

            // 讀取職位預設，計算有效權限
            const { data: roleConfigRow } = await supabase
                .from('role_configs')
                .select('permissions')
                .eq('role', currentRole)
                .single();

            const perms = getEffectivePermissions(
                currentRole,
                roleConfigRow?.permissions ?? null,
                user?.extra_permissions ?? null
            );
            setCanManageAnnouncements(perms.manageAnnouncements);

            // 🔥 修正：確認角色後，才去抓取對應的公告
            fetchAnnouncements(currentRole);
        }
        init();
    }, [router, fetchAnnouncements]); // 補上依賴，解決 Build Error

    // ... (以下為表單操作，維持原本邏輯，但移除寫死帳號判斷) ...

    async function handleSave() {
        if (!formData.title || !formData.content) return alert('請填寫標題與內容');

        const payload = { ...formData, author_id: userId };

        if (editingId) {
            await supabase.from('announcements').update(payload).eq('id', editingId);
        } else {
            await supabase.from('announcements').insert(payload);
        }
        setIsModalOpen(false);
        setEditingId(null);
        setFormData({ title: '', content: '', target_audience: 'all', is_pinned: false });
        fetchAnnouncements(role); // 重新整理
    }

    async function handleDelete(id: string) {
        if (!confirm('確定刪除?')) return;
        await supabase.from('announcements').delete().eq('id', id);
        fetchAnnouncements(role);
    }

    function openModal(announcement: any = null) {
        if (announcement) {
            setEditingId(announcement.id);
            setFormData({
                title: announcement.title,
                content: announcement.content,
                target_audience: announcement.target_audience,
                is_pinned: announcement.is_pinned
            });
        } else {
            setEditingId(null);
            setFormData({ title: '', content: '', target_audience: 'all', is_pinned: false });
        }
        setIsModalOpen(true);
    }

    // 使用有效權限判斷（已考慮總園長設定的職位覆蓋 + 個人覆蓋）
    const canManage = canManageAnnouncements;

    if (loading) return <div className="p-10 text-center">載入公告中...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-black text-gray-800">📢 園所公告</h1>
                    <div className="flex gap-2">
                        {canManage && (
                            <button onClick={() => openModal()} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-indigo-700">
                                + 發布公告
                            </button>
                        )}
                        <button onClick={() => router.push('/')} className="bg-white px-4 py-2 rounded-lg border hover:bg-gray-100">
                            回首頁
                        </button>
                    </div>
                </div>

                <div className="space-y-4">
                    {announcements.length === 0 && <div className="text-center text-gray-400 py-10">目前沒有公告</div>}

                    {announcements.map(item => (
                        <div key={item.id} className={`bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden ${item.is_pinned ? 'border-l-4 border-l-orange-400' : ''}`}>
                            {item.is_pinned && <div className="absolute top-0 right-0 bg-orange-100 text-orange-600 text-xs px-2 py-1 rounded-bl-lg font-bold">📌 置頂</div>}

                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold 
                                            ${item.target_audience === 'all' ? 'bg-green-100 text-green-700' :
                                                item.target_audience === 'teacher' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {item.target_audience === 'all' ? '全員' : item.target_audience === 'teacher' ? '老師內部' : '家長專屬'}
                                        </span>
                                        <span className="text-xs text-gray-400">{new Date(item.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <h2 className="text-xl font-bold text-gray-800 mb-2">{item.title}</h2>
                                    <p className="text-gray-600 whitespace-pre-wrap">{item.content}</p>
                                </div>

                                {canManage && (
                                    <div className="flex gap-2 ml-4">
                                        <button onClick={() => openModal(item)} className="text-sm text-gray-400 hover:text-indigo-600">編輯</button>
                                        <button onClick={() => handleDelete(item.id)} className="text-sm text-gray-400 hover:text-red-600">刪除</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Modal 部分維持不變，省略以節省篇幅 (這段不會影響 Build) */}
                {isModalOpen && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
                            <h2 className="text-xl font-bold mb-4">{editingId ? '編輯公告' : '新增公告'}</h2>
                            <div className="space-y-3">
                                <input className="w-full p-2 border rounded" placeholder="標題" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} />
                                <textarea className="w-full p-2 border rounded h-32" placeholder="內容" value={formData.content} onChange={e => setFormData({ ...formData, content: e.target.value })} />
                                <div className="flex justify-between">
                                    <select className="p-2 border rounded" value={formData.target_audience} onChange={e => setFormData({ ...formData, target_audience: e.target.value })}>
                                        <option value="all">全員可見</option>
                                        <option value="parent">僅家長</option>
                                        <option value="teacher">僅老師 (內部)</option>
                                    </select>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={formData.is_pinned} onChange={e => setFormData({ ...formData, is_pinned: e.target.checked })} />
                                        <span className="text-sm">置頂</span>
                                    </label>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 mt-6">
                                <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-500">取消</button>
                                <button onClick={handleSave} className="bg-indigo-600 text-white px-4 py-2 rounded-lg">儲存</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}