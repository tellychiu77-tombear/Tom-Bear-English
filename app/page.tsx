'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Home() {
    const [role, setRole] = useState<string | null>(null);
    const [userName, setUserName] = useState('');
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ total_students: 0, pending_leaves: 0, pickup_queue: 0 });

    const router = useRouter();

    useEffect(() => {
        init();
    }, []);

    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/login'); return; }

        const { data: profile } = await supabase.from('profiles').select('role, full_name, email').eq('id', session.user.id).single();

        if (profile) {
            // 檢查是否已完成註冊申請 (名字有無備註)
            const isApplicationSubmitted = profile.full_name && (profile.full_name.includes('申請') || profile.full_name.includes('家長') || profile.full_name.includes('老師'));

            if (!profile.role || (profile.role === 'pending' && !isApplicationSubmitted)) {
                router.push('/onboarding');
                return;
            }

            setRole(profile.role);
            setUserName(profile.full_name || profile.email?.split('@')[0] || 'User');

            if (['director', 'manager', 'teacher'].includes(profile.role)) {
                const { data } = await supabase.rpc('get_dashboard_stats');
                if (data) setStats(data);
            }
        }
        setLoading(false);
    }

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50">載入中...</div>;

    // ⏳ 審核中畫面
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

    return (
        <div className="min-h-screen bg-gray-100 font-sans">
            <div className="bg-white p-6 shadow-sm border-b">
                <div className="max-w-md mx-auto flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">早安，{userName.split('(')[0]} ☀️</h1>
                        <p className="text-gray-500 text-sm">
                            {role === 'director' || role === 'manager' ? '校務戰情中心' : role === 'teacher' ? '教學管理後台' : '家長專區'}
                        </p>
                    </div>
                    <button onClick={async () => { await supabase.auth.signOut(); router.push('/login'); }} className="text-sm text-red-500 border border-red-200 px-3 py-1 rounded hover:bg-red-50">登出</button>
                </div>
            </div>

            <div className="max-w-md mx-auto p-4 space-y-6">
                {role !== 'parent' && (
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white p-3 rounded-xl shadow-sm border-l-4 border-blue-500 text-center">
                            <div className="text-xs text-gray-500 font-bold mb-1">全校學生</div>
                            <div className="text-2xl font-black text-gray-800">{stats.total_students}</div>
                        </div>
                        <div className="bg-white p-3 rounded-xl shadow-sm border-l-4 border-orange-500 text-center">
                            <div className="text-xs text-gray-500 font-bold mb-1">今日接送</div>
                            <div className="text-2xl font-black text-gray-800">{stats.pickup_queue}</div>
                        </div>
                        <Link href="/leave" className="bg-white p-3 rounded-xl shadow-sm border-l-4 border-red-500 text-center relative hover:bg-red-50 cursor-pointer">
                            <div className="text-xs text-gray-500 font-bold mb-1">待審假單</div>
                            <div className="text-2xl font-black text-red-600">{stats.pending_leaves}</div>
                            {stats.pending_leaves > 0 && (
                                <span className="absolute top-2 right-2 flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                </span>
                            )}
                        </Link>
                    </div>
                )}

                <div className="space-y-3">
                    <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider ml-1">快速入口</h2>
                    <Link href="/pickup" className="block bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 hover:shadow-md transition border border-transparent hover:border-yellow-300">
                        <div className="bg-yellow-100 p-3 rounded-full text-2xl">🚌</div>
                        <div className="flex-1"><div className="font-bold text-gray-800 text-lg">接送管理</div></div>
                    </Link>
                    <Link href="/chat" className="block bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 hover:shadow-md transition border border-transparent hover:border-green-300">
                        <div className="bg-green-100 p-3 rounded-full text-2xl">💬</div>
                        <div className="flex-1"><div className="font-bold text-gray-800 text-lg">親師對話</div></div>
                    </Link>

                    {/* 🟢 修正：這裡把 href 改成 /contact 以符合您的資料夾名稱 */}
                    <Link href="/contact" className="block bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 hover:shadow-md transition border border-transparent hover:border-orange-300">
                        <div className="bg-orange-100 p-3 rounded-full text-2xl">📝</div>
                        <div className="flex-1"><div className="font-bold text-gray-800 text-lg">電子聯絡簿</div></div>
                    </Link>

                    <Link href="/grades" className="block bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 hover:shadow-md transition border border-transparent hover:border-purple-300">
                        <div className="bg-purple-100 p-3 rounded-full text-2xl">📊</div>
                        <div className="flex-1"><div className="font-bold text-gray-800 text-lg">成績管理</div></div>
                    </Link>
                    <Link href="/leave" className="block bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 hover:shadow-md transition border border-transparent hover:border-blue-300">
                        <div className="bg-blue-100 p-3 rounded-full text-2xl">📅</div>
                        <div className="flex-1"><div className="font-bold text-gray-800 text-lg">請假中心</div></div>
                    </Link>
                    {['director', 'manager', 'admin', 'teacher'].includes(role || '') && (
                        <Link href="/students" className="block bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 hover:shadow-md transition border border-transparent hover:border-gray-400 mt-6">
                            <div className="bg-gray-200 p-3 rounded-full text-2xl">📂</div>
                            <div className="flex-1"><div className="font-bold text-gray-800 text-lg">學生檔案管理</div></div>
                        </Link>
                    )}
                    {['director', 'manager', 'admin'].includes(role || '') && (
                        <Link href="/admin" className="block bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 hover:shadow-md transition border border-transparent hover:border-red-300 mt-2">
                            <div className="bg-red-100 p-3 rounded-full text-2xl">👥</div>
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