'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Home() {
    const [role, setRole] = useState<string | null>(null);
    const [userName, setUserName] = useState('');
    const [loading, setLoading] = useState(true);

    // 🟢 戰情數據狀態 (預設都是 0)
    const [stats, setStats] = useState({
        total_students: 0,
        pending_leaves: 0,
        pickup_queue: 0,
        unread_chats: 0
    });

    const router = useRouter();

    useEffect(() => {
        init();

        // 設定一個定時器，每 30 秒自動更新一次數據 (讓畫面像活的一樣)
        const interval = setInterval(fetchStats, 30000);
        return () => clearInterval(interval);
    }, []);

    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/login'); return; }

        const { data: profile } = await supabase.from('profiles').select('role, full_name, email').eq('id', session.user.id).single();

        if (profile) {
            const isApplicationSubmitted = profile.full_name && (profile.full_name.includes('申請') || profile.full_name.includes('家長') || profile.full_name.includes('老師'));

            if (!profile.role || (profile.role === 'pending' && !isApplicationSubmitted)) {
                router.push('/onboarding');
                return;
            }

            setRole(profile.role);
            setUserName(profile.full_name || profile.email?.split('@')[0] || 'User');

            // 只要登入成功，就去抓取戰情數據
            fetchStats();
        }
        setLoading(false);
    }

    // 🟢 抓取所有未讀數字 (呼叫我們剛剛修好的資料庫函數)
    async function fetchStats() {
        const { data, error } = await supabase.rpc('get_dashboard_stats');
        if (data && !error) setStats(data);
    }

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50">載入中...</div>;

    if (role === 'pending') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
                <div className="bg-white p-8 rounded-xl shadow-lg max-w-md text-center animate-fade-in">
                    <div className="text-6xl mb-4">⏳</div>
                    <h1 className="text-2xl font-bold text-gray-800 mb-2">帳號審核中</h1>
                    <p className="text-gray-500 mb-6">您的註冊申請已送出，請耐心等待行政人員開通權限。<br />如果您急需使用，請聯繫櫃檯。</p>
                    <div className="text-sm bg-gray-100 p-3 rounded text-gray-600 border border-gray-200">
                        申請人：<span className="font-bold text-blue-600">{userName}</span>
                    </div>
                    <button onClick={async () => { await supabase.auth.signOut(); router.push('/login'); }} className="mt-6 text-red-500 underline text-sm hover:text-red-700">登出</button>
                </div>
            </div>
        );
    }

    // Helper: 產生紅色通知氣泡元件
    const Badge = ({ count, color = 'bg-red-500' }: { count: number, color?: string }) => {
        if (count <= 0) return null;
        return (
            <span className={`absolute -top-2 -right-2 ${color} text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-md animate-bounce-slow border-2 border-white`}>
                {count > 99 ? '99+' : count}
            </span>
        );
    };

    return (
        <div className="min-h-screen bg-gray-100 font-sans">
            <div className="bg-white p-6 shadow-sm border-b sticky top-0 z-10">
                <div className="max-w-md mx-auto flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">早安，{userName.split('(')[0]} ☀️</h1>
                        <p className="text-gray-500 text-sm flex items-center gap-2">
                            {role === 'director' || role === 'manager' ? '校務戰情中心' : role === 'teacher' ? '教學管理後台' : '家長專區'}
                            {/* 總未讀紅點 */}
                            {(stats.pickup_queue + stats.pending_leaves + stats.unread_chats) > 0 && (
                                <span className="h-2 w-2 bg-red-500 rounded-full animate-pulse"></span>
                            )}
                        </p>
                    </div>
                    <button onClick={async () => { await supabase.auth.signOut(); router.push('/login'); }} className="text-sm text-red-500 border border-red-200 px-3 py-1 rounded hover:bg-red-50">登出</button>
                </div>
            </div>

            <div className="max-w-md mx-auto p-4 space-y-6">

                {/* 🟢 戰情數據儀表板 (僅教職員) */}
                {role !== 'parent' && (
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white p-3 rounded-xl shadow-sm border-l-4 border-blue-500 text-center relative">
                            <div className="text-xs text-gray-500 font-bold mb-1">全校學生</div>
                            <div className="text-2xl font-black text-gray-800">{stats.total_students}</div>
                        </div>

                        <Link href="/pickup" className="bg-white p-3 rounded-xl shadow-sm border-l-4 border-yellow-500 text-center relative hover:bg-yellow-50 cursor-pointer transition">
                            <div className="text-xs text-gray-500 font-bold mb-1">等待接送</div>
                            <div className={`text-2xl font-black ${stats.pickup_queue > 0 ? 'text-red-600' : 'text-gray-800'}`}>
                                {stats.pickup_queue}
                            </div>
                            <Badge count={stats.pickup_queue} />
                        </Link>

                        <Link href="/leave" className="bg-white p-3 rounded-xl shadow-sm border-l-4 border-red-500 text-center relative hover:bg-red-50 cursor-pointer transition">
                            <div className="text-xs text-gray-500 font-bold mb-1">待審假單</div>
                            <div className="text-2xl font-black text-red-600">{stats.pending_leaves}</div>
                            <Badge count={stats.pending_leaves} />
                        </Link>
                    </div>
                )}

                <div className="space-y-3">
                    <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider ml-1">快速入口</h2>

                    {/* 接送管理按鈕 (帶紅點) */}
                    <Link href="/pickup" className="block bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 hover:shadow-md transition border border-transparent hover:border-yellow-300 relative group">
                        <div className="bg-yellow-100 p-3 rounded-full text-2xl group-hover:scale-110 transition">🚌</div>
                        <div className="flex-1">
                            <div className="font-bold text-gray-800 text-lg">接送管理</div>
                            {role !== 'parent' && stats.pickup_queue > 0 && <div className="text-xs text-red-500 font-bold">⚠️ 有 {stats.pickup_queue} 位家長等待中</div>}
                        </div>
                        <Badge count={stats.pickup_queue} />
                    </Link>

                    {/* 親師對話按鈕 (帶紅點) */}
                    <Link href="/chat" className="block bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 hover:shadow-md transition border border-transparent hover:border-green-300 relative group">
                        <div className="bg-green-100 p-3 rounded-full text-2xl group-hover:scale-110 transition">💬</div>
                        <div className="flex-1">
                            <div className="font-bold text-gray-800 text-lg">親師對話</div>
                            {stats.unread_chats > 0 && <div className="text-xs text-green-600 font-bold">您有新訊息</div>}
                        </div>
                        <Badge count={stats.unread_chats} color="bg-green-500" />
                    </Link>

                    {/* 聯絡簿 (修正為 contact-book) */}
                    <Link href="/contact-book" className="block bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 hover:shadow-md transition border border-transparent hover:border-orange-300 relative group">
                        <div className="bg-orange-100 p-3 rounded-full text-2xl group-hover:scale-110 transition">📝</div>
                        <div className="flex-1"><div className="font-bold text-gray-800 text-lg">電子聯絡簿</div></div>
                    </Link>

                    <Link href="/grades" className="block bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 hover:shadow-md transition border border-transparent hover:border-purple-300 group">
                        <div className="bg-purple-100 p-3 rounded-full text-2xl group-hover:scale-110 transition">📊</div>
                        <div className="flex-1"><div className="font-bold text-gray-800 text-lg">成績管理</div></div>
                    </Link>

                    <Link href="/leave" className="block bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 hover:shadow-md transition border border-transparent hover:border-blue-300 relative group">
                        <div className="bg-blue-100 p-3 rounded-full text-2xl group-hover:scale-110 transition">📅</div>
                        <div className="flex-1"><div className="font-bold text-gray-800 text-lg">請假中心</div></div>
                        {role !== 'parent' && <Badge count={stats.pending_leaves} />}
                    </Link>

                    {/* 只有教職員看得到的按鈕 */}
                    {['director', 'manager', 'admin', 'teacher'].includes(role || '') && (
                        <Link href="/students" className="block bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 hover:shadow-md transition border border-transparent hover:border-gray-400 mt-6 group">
                            <div className="bg-gray-200 p-3 rounded-full text-2xl group-hover:scale-110 transition">📂</div>
                            <div className="flex-1"><div className="font-bold text-gray-800 text-lg">學生檔案管理</div></div>
                        </Link>
                    )}
                    {['director', 'manager', 'admin'].includes(role || '') && (
                        <Link href="/admin" className="block bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 hover:shadow-md transition border border-transparent hover:border-red-300 mt-2 group">
                            <div className="bg-red-100 p-3 rounded-full text-2xl group-hover:scale-110 transition">👥</div>
                            <div className="flex-1">
                                <div className="font-bold text-gray-800 text-lg">人事與權限</div>
                                <div className="text-xs text-gray-500">審核開通新帳號</div>
                            </div>
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
}