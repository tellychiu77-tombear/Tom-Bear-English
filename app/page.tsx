'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getEffectivePermissions } from '@/lib/permissions';
import type { PermissionsMap } from '@/lib/usePermissions';

// ✅ 新增：角色名稱對照表 (讓介面顯示正確的中文職稱)
const ROLE_MAP: Record<string, string> = {
    director: '總園長',
    english_director: '英文部主任',
    care_director: '安親部主任',
    admin: '行政人員', // 👈 這裡就是 yaya 的身份！
    teacher: '老師',
    parent: '家長',
    manager: '管理員'
};

export default function DashboardPage() {
    const [role, setRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [userName, setUserName] = useState('');
    const [jobTitle, setJobTitle] = useState('');

    // 計數器狀態
    const [counts, setCounts] = useState({ pickup: 0, leaves: 0, unreadChats: 0 });
    const [permissions, setPermissions] = useState<PermissionsMap | null>(null);
    const router = useRouter();

    useEffect(() => {
        init();
        // 實時監聽
        const channel = supabase.channel('dashboard_realtime')
            .on('postgres_changes', { event: '*', schema: 'public' }, () => fetchCounts())
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [role]);

    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setLoading(false); return; }

        // 🔴【關鍵修正】這裡原本是 'profiles'，改成讀取 'users' 表！
        // 這樣才能讀到您在人事系統 (AdminPage) 設定的最新權限
        const { data: userData } = await supabase.from('users').select('*').eq('id', session.user.id).single();

        if (userData) {
            // 雙重確認：如果 is_approved 是 false，強制視為 pending (審核中)
            if (userData.is_approved === false) {
                setRole('pending');
            } else {
                setRole(userData.role);
            }
            // 優先顯示真實姓名，沒有就顯示完整 email
            setUserName(userData.name || userData.email || 'User');
            setJobTitle(userData.job_title || '');

            // 計算有效權限（三層：硬編碼 → role_configs → 個人覆蓋）
            const { data: roleConfigRow } = await supabase
                .from('role_configs')
                .select('permissions')
                .eq('role', userData.role)
                .single();
            const effectivePerms = getEffectivePermissions(
                userData.role,
                roleConfigRow?.permissions ?? null,
                userData.extra_permissions ?? null
            );
            setPermissions(effectivePerms);

            fetchCounts(session.user.id, userData.role);
        } else {
            // 如果 users 表找不到人，可能是剛註冊還沒寫入，或是資料庫異常
            // 這裡可以視情況處理，暫時先設為 pending
            setRole('pending');
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
        let pickupCount = 0;

        if (userRole !== 'parent') {
            const { count: lCount } = await supabase.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending');
            leaveCount = lCount || 0;
            const { count: pCount } = await supabase.from('pickup_requests').select('*', { count: 'exact', head: true }).neq('status', 'completed');
            pickupCount = pCount || 0;
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

    const handleLogout = async () => {
        setRole(null);
        setUserName('');
        await supabase.auth.signOut();
        window.location.href = '/';
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50">載入中...</div>;

    // 1. 未登入狀態
    if (!role) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 to-blue-500 p-4">
                <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md animate-fade-in">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-black text-gray-800 mb-2">🐻 Tom Bear</h1>
                        <p className="text-gray-500">智慧補習班系統</p>
                    </div>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div><label className="block text-sm font-bold text-gray-700 mb-1">Email</label><input name="email" type="email" required className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" /></div>
                        <div><label className="block text-sm font-bold text-gray-700 mb-1">密碼</label><input name="password" type="password" required className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" /></div>
                        <button type="submit" className="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition">登入系統</button>
                    </form>
                    <div className="mt-4 text-center">
                        <p className="text-gray-500 text-sm">還沒有帳號？ <button type="button" onClick={() => router.push('/register')} className="text-indigo-600 font-bold hover:underline">立即註冊</button></p>
                    </div>
                </div>
            </div>
        );
    }

    // 2. 審核中狀態 (pending)
    if (role === 'pending') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center">
                    <div className="text-6xl mb-4">⏳</div>
                    <h1 className="text-2xl font-black text-gray-800 mb-2">帳號審核中</h1>
                    <p className="text-gray-500 mb-6">您好，<b className="text-gray-800">{userName}</b><br />您的申請已送出，請等待行政人員審核開通。</p>
                    <button onClick={handleLogout} className="w-full py-3 border border-gray-300 text-gray-600 font-bold rounded-lg hover:bg-gray-50">登出並返回</button>
                </div>
            </div>
        );
    }

    // 3. 已登入狀態
    return (
        <div className="min-h-screen bg-gray-50 pb-10">
            <div className="bg-white border-b sticky top-0 z-20 shadow-sm">
                <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">🐻</span>
                        <div>
                            <h1 className="font-bold text-gray-800">Tom Bear</h1>
                            {/* ✅ 修正重點：使用 ROLE_MAP 來顯示正確的職稱 (如：行政人員) */}
                            <div className="text-xs text-gray-500 flex items-center flex-wrap gap-1">
                                Hi, <span className="font-bold text-gray-700">{userName}</span>
                                <span className={`px-1.5 py-0.5 rounded text-white text-[10px] font-bold
                                    ${role === 'parent' ? 'bg-green-500' :
                                        role === 'teacher' ? 'bg-indigo-500' :
                                            role === 'admin' ? 'bg-gray-700' : 'bg-amber-500'}`}>
                                    {ROLE_MAP[role] || '使用者'}
                                </span>
                                {jobTitle && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700">
                                        {jobTitle}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-red-500 font-bold px-2 py-1">登出</button>
                </div>
            </div>

            <div className="max-w-6xl mx-auto p-4 space-y-6">
                {counts.pickup > 0 && role !== 'parent' && (
                    <div onClick={() => router.push('/pickup')} className="bg-red-500 text-white p-4 rounded-xl shadow-lg flex justify-between items-center cursor-pointer animate-pulse">
                        <div className="font-bold">🚌 目前有 {counts.pickup} 位學生等待接送！</div>
                        <div className="bg-white/20 px-3 py-1 rounded text-sm font-bold">查看</div>
                    </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {/* 接送：家長或有 viewPickupQueue 權限者 */}
                    {(role === 'parent' || permissions?.viewPickupQueue) && (
                        <DashboardCard
                            title={role === 'parent' ? '呼叫接送' : '接送戰情室'}
                            icon="🚌"
                            color="bg-yellow-400"
                            onClick={() => router.push('/pickup')}
                            badge={role !== 'parent' ? counts.pickup : 0}
                            desc={role === 'parent' ? '抵達補習班時點擊' : '管理放學接送隊列'}
                        />
                    )}

                    {/* 公告欄：所有人可看 */}
                    <div
                        onClick={() => router.push('/announcements')}
                        className="group bg-white p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl hover:border-indigo-100 transition-all cursor-pointer relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 w-24 h-24 bg-rose-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                        <div className="relative">
                            <div className="w-14 h-14 bg-rose-100 rounded-2xl flex items-center justify-center text-3xl mb-6 shadow-md shadow-rose-100">📢</div>
                            <h2 className="text-2xl font-bold text-slate-800 mb-2 group-hover:text-rose-600 transition-colors">公告欄</h2>
                            <p className="text-slate-500 font-medium">查看最新校園公告</p>
                        </div>
                    </div>

                    {/* 聯絡簿：家長或有 fillContactBook 權限者 */}
                    {(role === 'parent' || permissions?.fillContactBook) && (
                        <Link href="/contact-book" className="block p-6 bg-white rounded-xl shadow-sm border border-yellow-100 hover:shadow-md transition duration-200">
                            <div className="flex items-center gap-4 mb-3">
                                <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center text-xl">📒</div>
                                <h3 className="text-lg font-bold text-gray-800">數位聯絡簿</h3>
                            </div>
                            <p className="text-sm text-gray-500">每日課堂紀錄與家長回報</p>
                        </Link>
                    )}

                    {/* 親師對話：有 chatWithParents 權限者（含家長） */}
                    {permissions?.chatWithParents && (
                        <DashboardCard title="親師對話" icon="💬" color="bg-blue-500" onClick={() => router.push('/chat')} badge={counts.unreadChats} desc="即時溝通無障礙" />
                    )}

                    {/* 學生資料：家長看自己的孩子；有 viewAllStudents 者看全部 */}
                    {(role === 'parent' || permissions?.viewAllStudents) && (
                        <DashboardCard
                            title={role === 'parent' ? '我的孩子' : '學生兵籍資料'}
                            icon="📂"
                            color="bg-indigo-600"
                            onClick={() => router.push(role === 'parent' ? '/my-child' : '/students')}
                            desc="查看詳細檔案"
                        />
                    )}

                    {/* 請假中心：所有人 */}
                    <DashboardCard title="請假中心" icon="📅" color="bg-teal-500" onClick={() => router.push('/leave')} badge={role !== 'parent' ? counts.leaves : 0} desc="線上請假/審核" />

                    {/* 成績管理：有 viewGrades 者 */}
                    {permissions?.viewGrades && (
                        <DashboardCard title="成績管理" icon="📊" color="bg-purple-500" onClick={() => router.push('/grades')} desc="查看/登錄成績" />
                    )}

                    {/* 部門戰情室：有 viewManagerDashboard 者 */}
                    {permissions?.viewManagerDashboard && (
                        <DashboardCard title="部門戰情室" icon="💼" color="bg-cyan-600" onClick={() => router.push('/manager')} desc="查看績效與部門數據" />
                    )}

                    {/* 排課系統：有 viewManagerDashboard 者（主任/主管可排課） */}
                    {permissions?.viewManagerDashboard && (
                        <DashboardCard title="排課系統" icon="📅" color="bg-indigo-600" onClick={() => router.push('/schedule')} desc="管理課表・老師負責設定" />
                    )}

                    {/* 人事管理：有 manageUsers 者 */}
                    {permissions?.manageUsers && (
                        <DashboardCard title="人事管理" icon="👥" color="bg-gray-700" onClick={() => router.push('/admin')} desc="設定師資與班級" />
                    )}
                </div>
            </div>
        </div>
    );
}

function DashboardCard({ title, icon, color, onClick, badge = 0, desc }: any) {
    return (
        <button onClick={onClick} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition text-left relative overflow-hidden group">
            <div className={`w-12 h-12 ${color} text-white rounded-xl flex items-center justify-center text-2xl shadow-md mb-4`}>{icon}</div>
            <h3 className="font-bold text-gray-800 text-lg mb-1">{title}</h3>
            <p className="text-xs text-gray-400">{desc}</p>
            {badge > 0 && <div className="absolute top-4 right-4 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-bounce">{badge}</div>}
        </button>
    );
}