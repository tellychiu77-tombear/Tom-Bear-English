'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function SystemLogsPage() {
    const router = useRouter();
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    // 日期篩選：預設為空 (顯示全部)，使用者選了日期才會過濾
    const [selectedDate, setSelectedDate] = useState('');

    useEffect(() => {
        fetchLogs();
    }, [selectedDate]); // 當日期改變時重新抓取

    async function fetchLogs() {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        let query = supabase
            .from('system_logs')
            .select('*')
            .order('created_at', { ascending: false });

        // 如果有選日期，就只抓那一天的資料
        if (selectedDate) {
            // 設定當天的 00:00:00 到 23:59:59
            const start = new Date(selectedDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(selectedDate);
            end.setHours(23, 59, 59, 999);

            query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
        } else {
            // 沒選日期預設只抓最近 100 筆，避免爆掉
            query = query.limit(100);
        }

        const { data, error } = await query;
        if (error) console.error(error);
        setLogs(data || []);
        setLoading(false);
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-5xl mx-auto">
                {/* 頂部導覽 */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-black text-gray-800">🕵️‍♂️ 系統監控日誌</h1>
                        <p className="text-sm text-gray-500 font-bold mt-1">追蹤所有敏感權限操作</p>
                    </div>
                    <div className="flex gap-3">
                        {/* 這裡就是您要的篩選器 */}
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="border border-gray-300 rounded-xl px-4 py-2 font-bold text-gray-700 bg-white"
                        />
                        {/* 這裡就是您要的上一頁按鈕 */}
                        <button
                            onClick={() => router.push('/admin')}
                            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-xl font-bold hover:bg-gray-300"
                        >
                            ↩ 回人事管理
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="p-4 text-xs font-bold text-gray-400">時間</th>
                                <th className="p-4 text-xs font-bold text-gray-400">操作者</th>
                                <th className="p-4 text-xs font-bold text-gray-400">動作類型</th>
                                <th className="p-4 text-xs font-bold text-gray-400">詳細內容</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {logs.map(log => (
                                <tr key={log.id} className="hover:bg-gray-50">
                                    <td className="p-4 text-sm text-gray-500 font-mono">
                                        {new Date(log.created_at).toLocaleString('zh-TW')}
                                    </td>
                                    <td className="p-4 font-bold text-gray-700">{log.operator_email}</td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-black ${log.action.includes('DELETE') ? 'bg-red-100 text-red-700' :
                                                log.action.includes('ROLE') ? 'bg-purple-100 text-purple-700' :
                                                    'bg-blue-100 text-blue-700'
                                            }`}>
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="p-4 text-sm text-gray-600 font-medium">{log.details}</td>
                                </tr>
                            ))}
                            {logs.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="p-10 text-center text-gray-400 font-bold">
                                        無符合條件的紀錄
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}