'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getEffectivePermissions } from '@/lib/permissions';
import type { PermissionsMap } from '@/lib/usePermissions';

// ✅ Issue #2：登入錯誤中文化
function getChineseLoginError(message: string): string {
    if (message.includes('Invalid login credentials')) return '電子郵件或密碼錯誤，請再確認';
    if (message.includes('Email not confirmed')) return '請先到信箱確認驗證信';
    if (message.includes('Too many requests')) return '嘗試次數過多，請稍後再試';
    if (message.includes('User not found')) return '找不到此帳號，請確認電子郵件';
    return '登入失敗，請稍後再試';
}

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

    // ✅ Issue #2：行內錯誤狀態
    const [loginError, setLoginError] = useState('');
    const [loginLoading, setLoginLoading] = useState(false);

    // ✅ Issue #1：忘記密碼狀態
    const [showForgotPw, setShowForgotPw] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotSent, setForgotSent] = useState(false);
    const [forgotLoading, setForgotLoading] = useState(false);
    const [forgotError, setForgotError] = useState('');

    // ✅ Issue #4：審核頁角色偵測
    const [pendingRole, setPendingRole] = useState<'parent' | 'teacher' | null>(null);

    // 計數器狀態
    const [counts, setCounts] = useState({ pickup: 0, leaves: 0, unreadChats: 0 });
    const [permissions, setPermissions] = useState<PermissionsMap | null>(null);
    const router = useRouter();

    useEffect(() => {
        init();
        // 實時監聽（針對性表格監聽，比廣播式更可靠）
        const channel = supabase.channel('dashboard_realtime_v3')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, () => fetchCounts())
            .on('postgres_changes', { event: '*',      schema: 'public', table: 'leave_requests' },  () => fetchCounts())
            .on('postgres_changes', { event: '*',      schema: 'public', table: 'pickup_requests' }, () => fetchCounts())
            // ✅ 監聽審核狀態：管理員審核通過時自動刷新，家長不需要手動重新整理
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, (payload) => {
                if (payload.new?.is_approved === true) { init(); }
            })
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
            // 審核判斷：role 仍是 'pending' → 尚未開通；role 已是正式角色 → 放行（不管 is_approved flag）
            if (userData.role === 'pending' || userData.role == null) {
                setRole('pending');
                detectPendingRole(session.user.id);
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
            setRole('pending');
        }
        setLoading(false);
    }

    // ✅ Issue #4：pending 時偵測是家長或老師
    async function detectPendingRole(userId: string) {
        const { data } = await supabase.from('students').select('id').eq('parent_id', userId).limit(1);
        setPendingRole(data && data.length > 0 ? 'parent' : 'teacher');
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

    // ✅ Issue #2：移除 alert()，改為行內中文錯誤
    const handleLogin = async (e: any) => {
        e.preventDefault();
        setLoginError('');
        setLoginLoading(true);
        const email = e.target.email.value;
        const password = e.target.password.value;
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setLoginError(getChineseLoginError(error.message));
        else window.location.reload();
        setLoginLoading(false);
    };

    // ✅ Issue #1：忘記密碼寄信
    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setForgotError('');
        setForgotLoading(true);
        const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
            redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) setForgotError('發送失敗，請確認電子郵件地址是否正確');
        else setForgotSent(true);
        setForgotLoading(false);
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
        // ✅ Issue #1：忘記密碼面板
        if (showForgotPw) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-[#F5F7F5] p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
                        <div className="bg-[#1A4B2E] px-8 py-6 flex flex-col items-center">
                            <img src="/logo.png" alt="Tom Bear English School" className="h-20 w-auto object-contain" />
                        </div>
                        <div className="p-8">
                            {forgotSent ? (
                                <div className="text-center">
                                    <div className="text-5xl mb-4">📧</div>
                                    <h2 className="text-xl font-bold text-[#1A4B2E] mb-2">重設信已寄出</h2>
                                    <p className="text-gray-500 text-sm mb-6">請到 <strong>{forgotEmail}</strong> 的信箱，點選連結設定新密碼。</p>
                                    <p className="text-xs text-gray-400 mb-6">（若未收到，請檢查垃圾郵件）</p>
                                    <button onClick={() => { setShowForgotPw(false); setForgotSent(false); setForgotEmail(''); }}
                                        className="w-full py-2 bg-[#1A4B2E] text-white font-bold rounded-xl hover:bg-[#163D24] transition">
                                        回到登入
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <button onClick={() => setShowForgotPw(false)}
                                        className="text-gray-400 hover:text-[#1A4B2E] text-sm mb-6 flex items-center gap-1">
                                        ← 回到登入
                                    </button>
                                    <h2 className="text-xl font-bold text-[#1A4B2E] mb-1">忘記密碼</h2>
                                    <p className="text-gray-500 text-sm mb-6">輸入您的電子郵件，我們會寄送密碼重設連結。</p>
                                    <form onSubmit={handleForgotPassword} className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1">電子郵件</label>
                                            <input type="email" required
                                                className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-[#2D7A4A]"
                                                placeholder="name@example.com"
                                                value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} />
                                        </div>
                                        {forgotError && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">{forgotError}</div>}
                                        <button type="submit" disabled={forgotLoading}
                                            className="w-full py-3 bg-[#1A4B2E] text-white font-bold rounded-xl hover:bg-[#163D24] disabled:opacity-50 transition">
                                            {forgotLoading ? '發送中...' : '發送重設連結'}
                                        </button>
                                    </form>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F5F7F5] p-4">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                    <div className="bg-[#1A4B2E] px-8 py-6 flex flex-col items-center">
                        <img src="/logo.png" alt="Tom Bear English School" className="h-24 w-auto object-contain" />
                    </div>
                    <div className="p-8">
                        <h2 className="text-xl font-bold text-[#1A4B2E] mb-1">歡迎回來</h2>
                        <p className="text-gray-400 text-sm mb-6">請登入您的帳號</p>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">電子郵件</label>
                                <input name="email" type="email" required className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-[#2D7A4A]" />
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-sm font-bold text-gray-700">密碼</label>
                                    <button type="button" onClick={() => setShowForgotPw(true)}
                                        className="text-xs text-[#2D7A4A] hover:underline">忘記密碼？</button>
                                </div>
                                <input name="password" type="password" required className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-[#2D7A4A]" />
                            </div>
                            {loginError && (
                                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm font-medium">❌ {loginError}</div>
                            )}
                            <button type="submit" disabled={loginLoading}
                                className="w-full py-3 bg-[#1A4B2E] text-white font-bold rounded-xl hover:bg-[#163D24] disabled:opacity-50 transition">
                                {loginLoading ? '處理中...' : '登入系統'}
                            </button>
                        </form>
                        <div className="mt-5 text-center border-t border-gray-100 pt-5">
                            <p className="text-gray-500 text-sm">還沒有帳號？ <button type="button" onClick={() => router.push('/register')} className="text-[#1A4B2E] font-bold hover:underline">立即註冊</button></p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // 2. 審核中狀態 (pending) — ✅ Issue #4：顯示角色專屬說明
    if (role === 'pending') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center">
                    <div className="text-6xl mb-4">⏳</div>
                    <h1 className="text-2xl font-black text-gray-800 mb-2">帳號審核中</h1>
                    <p className="text-gray-500 mb-4">
                        您好，<b className="text-gray-800">{userName}</b><br />
                        您的申請已送出，請等待行政人員審核開通。
                    </p>
                    {/* ✅ Issue #4：依角色顯示不同說明 */}
                    <div className="bg-blue-50 rounded-xl p-4 mb-6 text-left">
                        {pendingRole === 'parent' ? (
                            <>
                                <p className="text-sm font-bold text-blue-700 mb-1">👨‍👩‍👧‍👦 家長帳號</p>
                                <p className="text-xs text-blue-600">行政人員將核對您的孩子資料後開通帳號，通常需要 1～2 個工作天。</p>
                            </>
                        ) : pendingRole === 'teacher' ? (
                            <>
                                <p className="text-sm font-bold text-blue-700 mb-1">🧑‍🏫 老師帳號</p>
                                <p className="text-xs text-blue-600">主任或行政人員審核後將開通您的帳號，通常需要 1～2 個工作天。</p>
                            </>
                        ) : (
                            <p className="text-xs text-blue-600">通常需要 1～2 個工作天，請耐心等候。</p>
                        )}
                    </div>
                    <button onClick={handleLogout} className="w-full py-3 border border-gray-300 text-gray-600 font-bold rounded-lg hover:bg-gray-50">登出並返回</button>
                </div>
            </div>
        );
    }

    // 3. 已登入狀態
    return (
        <div className="min-h-screen bg-[#F5F7F5] pb-10">
            <div className="bg-[#1A4B2E] sticky top-0 z-20 shadow-md">
                <div className="max-w-6xl mx-auto px-4 py-2 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <img src="/logo.png" alt="Tom Bear" className="h-10 w-auto object-contain" />
                        <div className="text-xs text-green-200 flex items-center flex-wrap gap-1">
                            Hi, <span className="font-bold text-white">{userName}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold
                                ${role === 'parent' ? 'bg-green-300 text-green-900' :
                                    role === 'teacher' ? 'bg-white/20 text-white' :
                                        role === 'admin' ? 'bg-white/20 text-white' : 'bg-amber-400 text-amber-900'}`}>
                                {ROLE_MAP[role] || '使用者'}
                            </span>
                            {jobTitle && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/20 text-white">
                                    {jobTitle}
                                </span>
                            )}
                        </div>
                    </div>
                    <button onClick={handleLogout} className="text-sm text-green-200 hover:text-white font-bold px-2 py-1 transition">登出</button>
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
                    <DashboardCard title="公告欄" icon="📢" color="bg-rose-500" onClick={() => router.push('/announcements')} desc="查看最新校園公告" />

                    {/* 聯絡簿：家長、行政或有 fillContactBook 權限者 */}
                    {(role === 'parent' || role === 'admin' || permissions?.fillContactBook) && (
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

                    {/* 學生資料：家長看自己的孩子；老師看自己班；有 viewAllStudents 者看全部 */}
                    {(role === 'parent' || role === 'teacher' || permissions?.viewAllStudents) && (
                        <DashboardCard
                            title={role === 'parent' ? '我的孩子' : '學生兵籍資料'}
                            icon="📂"
                            color="bg-[#1A4B2E]"
                            onClick={() => router.push(role === 'parent' ? '/my-child' : '/students')}
                            desc={role === 'teacher' ? '查看您負責班級的學生' : '查看詳細檔案'}
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

                    {/* 排課系統：有 viewManagerDashboard 者（主任/主管/行政可排課） */}
                    {(permissions?.viewManagerDashboard || role === 'admin') && (
                        <DashboardCard title="排課系統" icon="🗓️" color="bg-[#1A4B2E]" onClick={() => router.push('/schedule')} desc="管理課表・老師負責設定" />
                    )}

                    {/* 出缺席點名：權限控制 */}
                    {permissions?.viewAttendance && (
                        <DashboardCard title="出缺席點名" icon="📋" color="bg-[#1A4B2E]" onClick={() => router.push('/attendance')} desc="每日到課記錄・請假自動標記" />
                    )}

                    {/* 課程進度：權限控制 */}
                    {permissions?.viewProgress && (
                        <DashboardCard
                            title={role === 'parent' ? '課程進度查看' : '課程進度記錄'}
                            icon="📖"
                            color="bg-[#1A4B2E]"
                            onClick={() => router.push('/progress')}
                            desc={role === 'parent' ? '查看孩子班級課程進度與作業' : '記錄每節課教學主題與作業'}
                        />
                    )}

                    {/* 繳費紀錄：權限控制 */}
                    {permissions?.viewPayments && (
                        <DashboardCard
                            title={role === 'parent' ? '繳費查詢' : '繳費紀錄'}
                            icon="💰"
                            color="bg-[#1A4B2E]"
                            onClick={() => router.push('/payment')}
                            desc={role === 'parent' ? '查看孩子繳費狀況' : '學費收款登錄・待繳查詢'}
                        />
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
        <button onClick={onClick} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 text-left relative overflow-hidden group w-full">
            <div className={`w-11 h-11 ${color} text-white rounded-xl flex items-center justify-center text-xl shadow-sm mb-3`}>{icon}</div>
            <h3 className="font-bold text-gray-800 text-base mb-1 group-hover:text-[#1A4B2E] transition-colors">{title}</h3>
            <p className="text-xs text-gray-400 leading-relaxed">{desc}</p>
            {badge > 0 && (
                <div className="absolute top-3 right-3 min-w-[22px] h-[22px] bg-red-500 text-white text-[11px] font-black px-1.5 rounded-full flex items-center justify-center shadow-sm">
                    {badge > 99 ? '99+' : badge}
                </div>
            )}
        </button>
    );
}
