'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function SystemLogsPage() {
    const router = useRouter();
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // 日曆狀態
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());

    useEffect(() => {
        checkPermission();
    }, [selectedDate]);

    async function checkPermission() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        // 嚴格檢查 Super Admin 權限
        const { data: user } = await supabase.from('users').select('is_super_admin').eq('id', session.user.id).single();
        if (!user || !user.is_super_admin) {
            alert('⛔ 權限不足：只有最高管理員可查看日誌');
            router.push('/admin');
            return;
        }
        fetchLogs();
    }

    async function fetchLogs() {
        setLoading(true);
        // 設定時間範圍：當日 00:00 ~ 23:59
        const start = new Date(selectedDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(selectedDate);
        end.setHours(23, 59, 59, 999);

        const { data, error } = await supabase
            .from('system_logs')
            .select('*')
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString())
            .order('created_at', { ascending: false });

        if (error) console.error(error);
        else setLogs(data || []);
        setLoading(false);
    }

    // 日曆邏輯
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

    return (
        <div className="min-h-screen bg-gray-50 p-6 font-sans">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-black text-gray-800 flex items-center gap-2">📜 系統監控日誌</h1>
                    <button onClick={() => router.push('/admin')} className="bg-white border px-4 py-2 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition shadow-sm">
                        ↩ 回人事管理
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* 📅 日曆 */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 h-fit">
                        <div className="flex justify-between items-center mb-4">
                            <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className="p-2 hover:bg-gray-100 rounded-full">◀</button>
                            <h2 className="text-lg font-black text-gray-800">{currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月</h2>
                            <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))} className="p-2 hover:bg-gray-100 rounded-full">▶</button>
                        </div>
                        <div className="grid grid-cols-7 text-center mb-2 font-bold text-gray-400 text-xs">
                            {['日', '一', '二', '三', '四', '五', '六'].map(d => <div key={d}>{d}</div>)}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`} />)}
                            {Array.from({ length: daysInMonth }).map((_, i) => {
                                const day = i + 1;
                                const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
                                const isSelected = date.toDateString() === selectedDate.toDateString();
                                const isToday = date.toDateString() === new Date().toDateString();

                                return (
                                    <button
                                        key={day}
                                        onClick={() => setSelectedDate(date)}
                                        className={`
                                            h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold transition
                                            ${isSelected ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-gray-100 text-gray-700'}
                                            ${isToday && !isSelected ? 'border-2 border-indigo-600 text-indigo-600' : ''}
                                        `}
                                    >
                                        {day}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="mt-4 text-center text-xs font-bold text-gray-400">點選日期查看當日紀錄</div>
                    </div>

                    {/* 📝 列表 */}
                    <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px]">
                        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                            <h3 className="font-black text-gray-800">{selectedDate.toLocaleDateString()} 的操作紀錄</h3>
                            <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-xs font-bold">共 {logs.length} 筆</span>
                        </div>
                        <div className="overflow-y-auto max-h-[600px] p-0">
                            {logs.length === 0 ? <div className="p-10 text-center text-gray-400 font-bold">無紀錄</div> : (
                                <table className="w-full text-left">
                                    <thead className="bg-gray-50 border-b">
                                        <tr>
                                            <th className="p-3 text-xs font-black text-gray-400">時間</th>
                                            <th className="p-3 text-xs font-black text-gray-400">操作者</th>
                                            <th className="p-3 text-xs font-black text-gray-400">動作</th>
                                            <th className="p-3 text-xs font-black text-gray-400">詳細</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {logs.map(log => (
                                            <tr key={log.id} className="hover:bg-gray-50 transition">
                                                <td className="p-3 text-xs font-bold text-gray-500 whitespace-nowrap">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                                <td className="p-3 text-xs font-bold text-gray-800">{log.operator_email}</td>
                                                <td className="p-3"><span className={`px-2 py-0.5 rounded text-[10px] font-black border ${log.action.includes('刪除') ? 'bg-red-50 text-red-600 border-red-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>{log.action}</span></td>
                                                <td className="p-3 text-xs font-bold text-gray-600">{log.details}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}