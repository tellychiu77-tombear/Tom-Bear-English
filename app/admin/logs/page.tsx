'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function AuditLogsPage() {
    const router = useRouter();
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [searchUser, setSearchUser] = useState('');
    const [filterAction, setFilterAction] = useState('');
    const [dateFrom, setDateFrom] = useState('');

    // Pagination
    const [page, setPage] = useState(0);
    const pageSize = 20;
    const [hasMore, setHasMore] = useState(true);

    useEffect(() => {
        checkPermission();
    }, []);

    useEffect(() => {
        fetchLogs();
    }, [page, searchUser, filterAction, dateFrom]);

    const checkPermission = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        if (profile?.role !== 'director') {
            alert('權限不足：僅班主任可查看日誌');
            router.push('/');
        }
    };

    const fetchLogs = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('audit_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .range(page * pageSize, (page + 1) * pageSize - 1);

            if (searchUser) {
                query = query.ilike('user_name', `%${searchUser}%`);
            }
            if (filterAction) {
                query = query.eq('action', filterAction);
            }
            if (dateFrom) {
                query = query.gte('created_at', `${dateFrom}T00:00:00`);
            }

            const { data } = await query;

            if (data) {
                if (page === 0) {
                    setLogs(data);
                } else {
                    // 如果是載入更多，應該 append，但這裡我們先做簡單的分頁切換
                    setLogs(data); // 這裡是取代，若要做 Infinite Scroll 則 append
                }
                setHasMore(data.length === pageSize);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const getActionColor = (action: string) => {
        if (action.includes('刪除') || action.includes('移除')) return 'bg-red-100 text-red-700';
        if (action.includes('修改') || action.includes('更新')) return 'bg-blue-100 text-blue-700';
        if (action.includes('新增') || action.includes('建立')) return 'bg-green-100 text-green-700';
        return 'bg-gray-100 text-gray-700';
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                            🛡️ 系統操作日誌 <span className="text-sm font-normal text-gray-400 bg-gray-100 px-2 py-1 rounded-full">Audit Logs</span>
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">監控所有系統操作與變更紀錄</p>
                    </div>
                    <button onClick={() => router.push('/admin')} className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 font-bold shadow-sm">
                        返回管理
                    </button>
                </div>

                {/* Filters */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[200px]">
                        <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">搜尋操作者</label>
                        <input
                            type="text"
                            placeholder="姓名..."
                            className="w-full p-2 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-lg font-bold outline-none"
                            value={searchUser}
                            onChange={e => { setSearchUser(e.target.value); setPage(0); }}
                        />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">動作類型</label>
                        <select
                            className="w-full p-2 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-lg font-bold outline-none"
                            value={filterAction}
                            onChange={e => { setFilterAction(e.target.value); setPage(0); }}
                        >
                            <option value="">全部動作</option>
                            <option value="修改成績">修改成績</option>
                            <option value="刪除學生">刪除學生</option>
                            <option value="新增學生">新增學生</option>
                            <option value="核准請假">核准請假</option>
                            {/* 可根據實際 logAction 的字串擴充 */}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">起始日期</label>
                        <input
                            type="date"
                            className="w-full p-2 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-lg font-bold outline-none text-gray-600"
                            value={dateFrom}
                            onChange={e => { setDateFrom(e.target.value); setPage(0); }}
                        />
                    </div>
                    <button
                        onClick={() => { setSearchUser(''); setFilterAction(''); setDateFrom(''); setPage(0); }}
                        className="px-4 py-2 bg-gray-100 text-gray-500 rounded-lg font-bold hover:bg-gray-200"
                    >
                        重置
                    </button>
                </div>

                {/* Table */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="p-4 text-xs font-black text-gray-400 uppercase">時間</th>
                                <th className="p-4 text-xs font-black text-gray-400 uppercase">操作者</th>
                                <th className="p-4 text-xs font-black text-gray-400 uppercase">動作</th>
                                <th className="p-4 text-xs font-black text-gray-400 uppercase">詳細內容</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {loading ? (
                                <tr><td colSpan={4} className="p-10 text-center text-gray-400 animate-pulse">載入紀錄中...</td></tr>
                            ) : logs.length === 0 ? (
                                <tr><td colSpan={4} className="p-10 text-center text-gray-400">查無紀錄</td></tr>
                            ) : (
                                logs.map(log => (
                                    <tr key={log.id} className="hover:bg-gray-50 transition">
                                        <td className="p-4 font-mono text-sm text-gray-500 whitespace-nowrap">
                                            {new Date(log.created_at).toLocaleString('zh-TW')}
                                        </td>
                                        <td className="p-4 font-bold text-gray-800">
                                            {log.user_name}
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded-lg text-xs font-bold ${getActionColor(log.action)}`}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="p-4 text-gray-600 text-sm">
                                            {log.details}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>

                    {/* Pagination */}
                    <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                        <button
                            disabled={page === 0}
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-600 disabled:opacity-50 hover:bg-gray-50"
                        >
                            ← 上一頁
                        </button>
                        <span className="text-gray-400 text-sm font-mono">Page {page + 1}</span>
                        <button
                            disabled={!hasMore}
                            onClick={() => setPage(p => p + 1)}
                            className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-600 disabled:opacity-50 hover:bg-gray-50"
                        >
                            下一頁 →
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
