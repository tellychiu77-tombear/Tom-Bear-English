'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

const BRAND = '#1A4B2E';

function getActionStyle(action: string) {
    if (action.includes('刪除')) return { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' };
    if (action.includes('批次')) return { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA' };
    if (action.includes('修改') || action.includes('更新') || action.includes('編輯'))
        return { bg: '#FFFBEB', text: '#B45309', border: '#FDE68A' };
    if (action.includes('新增') || action.includes('發布'))
        return { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' };
    if (action.includes('審核') || action.includes('批准') || action.includes('退回'))
        return { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' };
    return { bg: '#F9FAFB', text: '#6B7280', border: '#E5E7EB' };
}

function getActionIcon(action: string) {
    if (action.includes('刪除')) return '🗑️';
    if (action.includes('批次')) return '📋';
    if (action.includes('修改') || action.includes('更新') || action.includes('編輯')) return '✏️';
    if (action.includes('新增') || action.includes('發布')) return '➕';
    if (action.includes('批准')) return '✅';
    if (action.includes('退回')) return '↩️';
    if (action.includes('權限')) return '🔐';
    return '📌';
}

export default function SystemLogsPage() {
    const router = useRouter();
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [calDate, setCalDate] = useState(new Date());
    const [filterAction, setFilterAction] = useState('');
    const [searchUser, setSearchUser] = useState('');

    useEffect(() => { checkPermission(); }, [selectedDate]);

    async function checkPermission() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }
        const { data: user } = await supabase.from('users').select('is_super_admin').eq('id', session.user.id).single();
        if (!user?.is_super_admin) { router.push('/admin'); return; }
        fetchLogs();
    }

    async function fetchLogs() {
        setLoading(true);
        const start = new Date(selectedDate); start.setHours(0, 0, 0, 0);
        const end = new Date(selectedDate); end.setHours(23, 59, 59, 999);
        const { data } = await supabase
            .from('system_logs').select('*')
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString())
            .order('created_at', { ascending: false });
        setLogs(data ?? []);
        setLoading(false);
    }

    const daysInMonth = new Date(calDate.getFullYear(), calDate.getMonth() + 1, 0).getDate();
    const firstDay = new Date(calDate.getFullYear(), calDate.getMonth(), 1).getDay();

    const actionTypes = Array.from(new Set(logs.map(l => l.action))).sort();
    const filtered = logs.filter(l =>
        (!filterAction || l.action === filterAction) &&
        (!searchUser || l.operator_email?.toLowerCase().includes(searchUser.toLowerCase()))
    );

    const deleteCount = filtered.filter(l => l.action.includes('刪除')).length;
    const editCount = filtered.filter(l => l.action.includes('修改') || l.action.includes('編輯') || l.action.includes('更新')).length;
    const addCount = filtered.filter(l => l.action.includes('新增') || l.action.includes('發布')).length;
    const uniqueUsers = Array.from(new Set(logs.map(l => l.operator_email)));

    const fmt = (iso: string) => new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const fmtDate = (d: Date) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;

    return (
        <div className="min-h-screen pb-12" style={{ backgroundColor: '#F5F7F5' }}>
            {/* Header */}
            <div className="sticky top-0 z-20 shadow-md" style={{ backgroundColor: BRAND }}>
                <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">📜</span>
                        <div>
                            <h1 className="font-black text-white text-lg leading-tight">系統監控日誌</h1>
                            <p className="text-xs text-green-200">最高權限稽核・操作追蹤</p>
                        </div>
                    </div>
                    <button onClick={() => router.push('/admin')}
                        className="text-sm font-bold px-4 py-2 rounded-xl border border-white/30 text-white hover:bg-white/10 transition">
                        ↩ 回人事管理
                    </button>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 py-5">

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                    {[
                        { label: '今日總操作', value: filtered.length, icon: '📊', color: BRAND, light: '#EBF4EE' },
                        { label: '新增 / 發布', value: addCount, icon: '➕', color: '#15803D', light: '#F0FDF4' },
                        { label: '修改操作', value: editCount, icon: '✏️', color: '#B45309', light: '#FFFBEB' },
                        { label: '刪除操作', value: deleteCount, icon: '🗑️', color: '#DC2626', light: '#FEF2F2' },
                    ].map(s => (
                        <div key={s.label} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                                style={{ backgroundColor: s.light }}>{s.icon}</div>
                            <div>
                                <p className="text-xs text-gray-400 font-bold">{s.label}</p>
                                <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                    {/* Calendar + user list */}
                    <div className="space-y-4">
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="px-5 py-3 flex justify-between items-center" style={{ backgroundColor: BRAND }}>
                                <button onClick={() => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() - 1, 1))}
                                    className="text-white hover:text-green-200 font-bold text-xl w-8">‹</button>
                                <h2 className="text-sm font-black text-white">{calDate.getFullYear()}年 {calDate.getMonth() + 1}月</h2>
                                <button onClick={() => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() + 1, 1))}
                                    className="text-white hover:text-green-200 font-bold text-xl w-8">›</button>
                            </div>
                            <div className="p-4">
                                <div className="grid grid-cols-7 text-center mb-2">
                                    {['日','一','二','三','四','五','六'].map(d =>
                                        <div key={d} className="text-xs font-black text-gray-400 py-1">{d}</div>)}
                                </div>
                                <div className="grid grid-cols-7 gap-1">
                                    {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                                    {Array.from({ length: daysInMonth }).map((_, i) => {
                                        const d = new Date(calDate.getFullYear(), calDate.getMonth(), i + 1);
                                        const sel = d.toDateString() === selectedDate.toDateString();
                                        const tod = d.toDateString() === new Date().toDateString();
                                        return (
                                            <button key={i} onClick={() => setSelectedDate(d)}
                                                className={`h-9 w-9 mx-auto rounded-full flex items-center justify-center text-sm font-bold transition
                                                    ${sel ? 'text-white shadow-md' : tod ? 'border-2 font-black' : 'hover:bg-gray-100 text-gray-700'}`}
                                                style={sel ? { backgroundColor: BRAND } : tod ? { borderColor: BRAND, color: BRAND } : {}}>
                                                {i + 1}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="px-4 pb-4">
                                <button onClick={() => { setSelectedDate(new Date()); setCalDate(new Date()); }}
                                    className="w-full py-2 text-xs font-bold rounded-xl border transition"
                                    style={{ borderColor: BRAND, color: BRAND }}>
                                    回到今天
                                </button>
                            </div>
                        </div>

                        {uniqueUsers.length > 0 && (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                                <h3 className="text-xs font-black text-gray-400 mb-3 uppercase tracking-wider">當日操作人員</h3>
                                {uniqueUsers.map(email => {
                                    const cnt = logs.filter(l => l.operator_email === email).length;
                                    const delCnt = logs.filter(l => l.operator_email === email && l.action.includes('刪除')).length;
                                    return (
                                        <div key={email as string} className="flex justify-between items-center py-2.5 border-b border-gray-50 last:border-0">
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-gray-800 truncate">{(email as string).split(' (')[0]}</p>
                                                {delCnt > 0 && <p className="text-[10px] text-red-500 font-bold">含 {delCnt} 筆刪除操作 ⚠️</p>}
                                            </div>
                                            <span className="text-xs font-black px-2 py-0.5 rounded-full ml-2 shrink-0"
                                                style={{ backgroundColor: '#EBF4EE', color: BRAND }}>{cnt} 筆</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Log timeline */}
                    <div className="lg:col-span-2 space-y-4">
                        {/* Filter */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3 items-center">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-gray-700">📅 {fmtDate(selectedDate)}</span>
                                <span className="px-2 py-0.5 rounded-full text-xs font-black"
                                    style={{ backgroundColor: '#EBF4EE', color: BRAND }}>{filtered.length} 筆</span>
                            </div>
                            <div className="flex gap-2 flex-1 justify-end flex-wrap">
                                <input type="text" placeholder="🔍 搜尋操作者..." value={searchUser}
                                    onChange={e => setSearchUser(e.target.value)}
                                    className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none w-36" />
                                <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
                                    className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none">
                                    <option value="">全部動作</option>
                                    {actionTypes.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Timeline list */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            {loading ? (
                                <div className="flex items-center justify-center py-16">
                                    <div className="w-8 h-8 rounded-full border-4 border-gray-200 animate-spin"
                                        style={{ borderTopColor: BRAND }} />
                                </div>
                            ) : filtered.length === 0 ? (
                                <div className="py-16 text-center">
                                    <div className="text-5xl mb-3 opacity-30">📭</div>
                                    <p className="text-sm font-bold text-gray-400">當日無操作紀錄</p>
                                    <p className="text-xs text-gray-300 mt-1">請選擇其他日期</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
                                    {filtered.map((log, idx) => {
                                        const s = getActionStyle(log.action);
                                        const icon = getActionIcon(log.action);
                                        return (
                                            <div key={log.id ?? idx} className="px-5 py-4 hover:bg-gray-50 transition flex gap-4 items-start">
                                                <span className="text-xs font-bold text-gray-400 tabular-nums shrink-0 w-16 pt-0.5 text-right">
                                                    {fmt(log.created_at)}
                                                </span>
                                                <div className="shrink-0 flex flex-col items-center mt-1.5">
                                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.text }} />
                                                    {idx < filtered.length - 1 &&
                                                        <div className="w-px mt-1" style={{ height: 28, backgroundColor: '#E5E7EB' }} />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                                        <span className="text-xs font-black px-2 py-0.5 rounded-full border"
                                                            style={{ backgroundColor: s.bg, color: s.text, borderColor: s.border }}>
                                                            {icon} {log.action}
                                                        </span>
                                                        <span className="text-xs text-gray-500 font-bold">{log.operator_email}</span>
                                                    </div>
                                                    <p className="text-xs text-gray-600 leading-relaxed">{log.details}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
