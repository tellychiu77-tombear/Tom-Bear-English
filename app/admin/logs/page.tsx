'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function SystemLogsPage() {
    const router = useRouter();
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // 1. 使用 useCallback 包裹 fetchLogs
    const fetchLogs = useCallback(async () => {
        const { data, error } = await supabase
            .from('system_logs') // 假設您有這個表，如果沒有可以先忽略
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (!error && data) {
            setLogs(data);
        }
        setLoading(false);
    }, []);

    // 2. 權限檢查與資料抓取
    useEffect(() => {
        async function init() {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.push('/'); return; }

            const { data: user } = await supabase.from('users').select('role').eq('id', session.user.id).single();
            if (user?.role !== 'director') {
                alert('權限不足');
                router.push('/');
                return;
            }

            fetchLogs();
        }
        init();
    }, [router, fetchLogs]); // ✅ 補上依賴，解決 Build Error

    if (loading) return <div className="p-10 text-center">載入紀錄中...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-2xl font-black text-gray-800 mb-6">🕵️♂️ 系統操作紀錄</h1>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    {/* ⚠️ 第三步的手機版型修正也包含在這裡 (overflow-x-auto) */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left whitespace-nowrap">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="p-4">時間</th>
                                    <th className="p-4">操作者</th>
                                    <th className="p-4">動作</th>
                                    <th className="p-4">詳情</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {logs.length === 0 ? (
                                    <tr><td colSpan={4} className="p-4 text-center text-gray-400">尚無紀錄</td></tr>
                                ) : (
                                    logs.map(log => (
                                        <tr key={log.id}>
                                            <td className="p-4 text-sm text-gray-500">{new Date(log.created_at).toLocaleString()}</td>
                                            <td className="p-4 font-bold">{log.operator_email}</td>
                                            <td className="p-4"><span className="bg-gray-100 px-2 py-1 rounded text-xs">{log.action}</span></td>
                                            <td className="p-4 text-sm text-gray-600">{log.details}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
