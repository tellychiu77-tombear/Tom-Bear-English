'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
    const [role, setRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [userName, setUserName] = useState('');

    // 🔴 通知計數器
    const [counts, setCounts] = useState({
        pickup: 0,
        leaves: 0,
        unreadChats: 0,
    });

    const router = useRouter();

    useEffect(() => {
        init();

        const channel = supabase
            .channel('dashboard_realtime')
            .on('postgres_changes', { event: '*', schema: 'public' }, () => {
                fetchCounts();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [role]);

    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            setLoading(false);
            return;
        }

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        if (profile) {
            setRole(profile.role);
            setUserName(profile.full_name || profile.email);
            fetchCounts(session.user.id, profile.role);
        }
        setLoading(false);
    }

    async function fetchCounts(userId?: string, userRole?: string) {
        if (!userId) {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            userId = session.user.id;
            if (!userRole && role) userRole = role;
        }

        const { count: chatCount } = await supabase.from('chat_messages').select('*', { count: 'exact', head: true }).eq('receiver_id', userId).eq('is_read', false);

        let leaveCount = 0;
        if (userRole !== 'parent') {
            const { count } = await supabase.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending');
            leaveCount = count || 0;
        }

        let pickupCount = 0;
        if (userRole !== 'parent') {
            const { count } = await supabase.from('pickup_requests').select('*', { count: 'exact', head: true }).neq('status', 'completed');
            pickupCount = count || 0;
        }

        setCounts({ unreadChats: chatCount || 0, leaves: leaveCount, pickup: pickupCount });
    }

    const handleLogin = async (e: any) => {
        e.preventDefault();
        const email = e.target.email.value;
        const password = e.target.password.value;
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) alert(error.message);
        else window.location.reload();
    };

    // 🟢 修復：強力登出函式
    const handleLogout = async () => {
        // 1. 不管後端成不成功，先清空本地顯示狀態 (讓使用者覺得已經登出了)
        setRole(null);
        setUserName('');

        // 2. 執行真正的登出
        await supabase.auth.signOut();

        // 3. 強制轉跳回首頁並刷新，確保沒有殘留
        router.replace('/');
        window.location.href = '/';
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50">載入中...</div>;

    // =========== 尚未登入畫面 ===========
    if (!role) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 p-4">
                <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md animate-fade-in">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-black text-gray-800 mb-2">🐻 Tom Bear</h1>
                        <p className="text-gray-500">智慧補習班管理系統</p>
                    </div>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Email</label>
                            <input name="email" type="email" required className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none" placeholder="輸入帳號" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">密碼</label>
                            <input name="password" type="password" required className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none" placeholder="輸入密碼" />
                        </div>
                        <button type="submit" className="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg shadow-lg hover:bg-indigo-700 transition transform active:scale-95">
                            登入系統
                        </button>
                    </form>

                    {/* 註冊連結 */}
                    <div className="mt-4 text-center">
                        <p className="text-gray-500 text-sm">
                            還沒有帳號嗎？
                            <button
                                type="button"
                                onClick={() => router.push('/register')}
                                className="text-indigo-600 font-bold hover:underline ml-1"
                            >
                                立即註冊
                            </button>
                        </p>
                    </div>

                    <div className="mt-6 text-center text-xs text-gray-400">
                        Protected by Supabase Security
                    </div>
                </div>
            </div>
        );
    }

    // 🔴 新增：審核中擋修畫面
    if (role === 'pending') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center animate-fade-in">
                    <div className="text-6xl mb-4">⏳</div>
                    <h1 className="text-2xl font-black text-gray-800 mb-2">帳號審核中</h1>
                    <p className="text-gray-500 mb-6 leading-relaxed">
                        您好，<span className="font-bold text-gray-700">{userName}</span><br />
                        您的註冊申請已送出，目前正在等待行政人員審核。<br />
                        <span className="text-xs text-gray-400">(為了確保校園資訊安全，請耐心等候)</span>
                    </p>
                    <div className="bg-yellow-50 text-yellow-800 text-sm p-4 rounded-xl mb-6 text-left">
                        <strong>💡 提示：</strong><br />
                        如果您急需使用，請直接聯繫櫃檯老師或是撥打補習班電話，告知您的姓名以加速開通。
                    </div>
                    <button onClick={handleLogout} className="w-full py-3 border border-gray-300 text-gray-600 font-bold rounded-lg hover:bg-gray-50">
                        登出並返回
                    </button>
                </div>
            </div>
        );
    }

    // =========== 已登入：戰情儀表板 ===========
    return (
        <div className="min-h-screen bg-gray-50 pb-10">

            {/* 頂部導航 */}
            <div className="bg-white border-b sticky top-0 z-20 shadow-sm">
                <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">🐻</span>
                        <div>
                            <h1 className="font-bold text-gray-800 leading-tight">Tom Bear</h1>
                            <div className="text-xs text-gray-500 font-medium">
                                Hi, {userName}
                                <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] text-white ${role === 'parent' ? 'bg-orange-400' : role === 'teacher' ? 'bg-blue-500' : 'bg-purple-600'}`}>
                                    {role === 'parent' ? '家長' : role === 'teacher' ? '老師' : '管理員'}
                                </span>
                            </div>
                        </div>
                    </div>
                    {/* 🔴 這裡綁定了新的登出函式 */}
                    <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-red-500 font-bold px-2 py-1">登出</button>
                </div>
            </div>

            <div className="max-w-6xl mx-auto p-4 space-y-6">

                {/* 📢 頂部狀態通知 */}
                {counts.pickup > 0 && role !== 'parent' && (
                    <div
                        onClick={() => router.push('/pickup')}
                        className="bg-gradient-to-r from-orange-400 to-red-500 text-white p-4 rounded-xl shadow-lg flex justify-between items-center cursor-pointer hover:shadow-xl transition animate-pulse"
                    >
                        <div className="flex items-center gap-3 font-bold text-lg">
                            <span className="bg-white text-orange-600 w-8 h-8 flex items-center justify-center rounded-full text-xl">🚌</span>
                            目前有 {counts.pickup} 位學生正在等待接送！
                        </div>
                        <div className="bg-white/20 px-3 py-1 rounded text-sm font-bold">前往處理 →</div>
                    </div>
                )}

                {/* 📱 功能按鈕網格 */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">

                    {/* 1. 接送系統 */}
                    <DashboardCard
                        title={role === 'parent' ? '呼叫接送' : '接送戰情室'}
                        icon="🚌"
                        color="bg-yellow-400"
                        onClick={() => router.push('/pickup')}
                        badge={role !== 'parent' ? counts.pickup : 0}
                        desc={role === 'parent' ? '抵達補習班時點擊' : '管理放學接送隊列'}
                    />

                    {/* 2. 親師對話 */}
                    <DashboardCard
                        title="親師對話"
                        icon="💬"
                        color="bg-blue-500"
                        onClick={() => router.push('/chat')}
                        badge={counts.unreadChats}
                        desc="即時溝通無障礙"
                    />

                    {/* 3. 兵籍資料 */}
                    <DashboardCard
                        title={role === 'parent' ? '我的孩子' : '學生兵籍資料'}
                        icon="📂"
                        color="bg-indigo-600"
                        onClick={() => router.push(role === 'parent' ? '/grades' : '/students')}
                        desc={role === 'parent' ? '查看成績與紀錄' : '全校學生檔案與分析'}
                    />

                    {/* 4. 請假中心 */}
                    <DashboardCard
                        title="請假中心"
                        icon="📅"
                        color="bg-teal-500"
                        onClick={() => router.push('/leave')}
                        badge={role !== 'parent' ? counts.leaves : 0}
                        desc={role === 'parent' ? '線上請假申請' : '審核學生請假單'}
                    />

                    {/* 5. 成績管理 */}
                    <DashboardCard
                        title="成績管理"
                        icon="📊"
                        color="bg-purple-500"
                        onClick={() => router.push('/grades')}
                        desc={role === 'parent' ? '查看詳細成績單' : '批次登錄與分析'}
                    />

                    {/* 6. 人事管理 */}
                    {role !== 'parent' && role !== 'teacher' && (
                        <DashboardCard
                            title="人事權限"
                            icon="👥"
                            color="bg-gray-700"
                            onClick={() => router.push('/admin')}
                            desc="設定師資與班級"
                        />
                    )}
                </div>

                <div className="text-center text-gray-400 text-xs mt-8">
                    Tom Bear Education System © 2026
                </div>
            </div>
        </div>
    );
}

// ✨ 精美卡片元件
function DashboardCard({ title, icon, color, onClick, badge = 0, desc }: any) {
    return (
        <button
            onClick={onClick}
            className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-left relative overflow-hidden group"
        >
            <div className={`w-12 h-12 ${color} text-white rounded-xl flex items-center justify-center text-2xl shadow-md mb-4 group-hover:scale-110 transition`}>
                {icon}
            </div>
            <h3 className="font-bold text-gray-800 text-lg mb-1">{title}</h3>
            <p className="text-xs text-gray-400 font-medium">{desc}</p>

            {badge > 0 && (
                <div className="absolute top-4 right-4 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-bounce shadow-lg border-2 border-white">
                    {badge}
                </div>
            )}
        </button>
    );
}