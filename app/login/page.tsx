'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

function getChineseLoginError(message: string): string {
    if (message.includes('Invalid login credentials')) return '電子郵件或密碼錯誤，請再確認';
    if (message.includes('Email not confirmed')) return '請先到信箱確認驗證信';
    if (message.includes('Too many requests')) return '嘗試次數過多，請稍後再試';
    if (message.includes('User not found')) return '找不到此帳號，請確認電子郵件';
    return '登入失敗，請稍後再試';
}

export default function LoginPage() {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState('');

    // 忘記密碼
    const [showForgotPw, setShowForgotPw] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotSent, setForgotSent] = useState(false);
    const [forgotLoading, setForgotLoading] = useState(false);
    const [forgotError, setForgotError] = useState('');

    const router = useRouter();

    async function handleAuth(e: React.FormEvent) {
        e.preventDefault();
        setLoginError('');
        setLoading(true);

        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            setLoginError(getChineseLoginError(error.message));
        } else {
            router.push('/');
        }
        setLoading(false);
    }

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setForgotError('');
        setForgotLoading(true);
        const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
            redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) {
            setForgotError('發送失敗，請確認電子郵件地址是否正確');
        } else {
            setForgotSent(true);
        }
        setForgotLoading(false);
    };

    // 忘記密碼面板
    if (showForgotPw) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
                <div className="bg-white max-w-sm w-full rounded-2xl shadow-xl p-8 animate-fade-in">
                    {forgotSent ? (
                        <div className="text-center">
                            <div className="text-5xl mb-4">📧</div>
                            <h2 className="text-xl font-bold text-gray-800 mb-2">重設信已寄出</h2>
                            <p className="text-gray-500 text-sm mb-6">
                                請到 <strong>{forgotEmail}</strong> 的信箱，點選信件中的連結來設定新密碼。
                            </p>
                            <p className="text-xs text-gray-400 mb-6">（若未收到，請檢查垃圾郵件資料夾）</p>
                            <button
                                onClick={() => { setShowForgotPw(false); setForgotSent(false); setForgotEmail(''); }}
                                className="w-full py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition"
                            >
                                回到登入
                            </button>
                        </div>
                    ) : (
                        <>
                            <button
                                onClick={() => setShowForgotPw(false)}
                                className="text-gray-400 hover:text-blue-600 text-sm mb-6 flex items-center gap-1"
                            >
                                ← 回到登入
                            </button>
                            <h2 className="text-xl font-bold text-gray-800 mb-1">忘記密碼</h2>
                            <p className="text-gray-500 text-sm mb-6">
                                輸入您的電子郵件，我們會寄送密碼重設連結。
                            </p>
                            <form onSubmit={handleForgotPassword} className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500">電子郵件</label>
                                    <input
                                        type="email" required
                                        className="w-full p-2 border rounded mt-1 focus:outline-none focus:border-blue-500 bg-gray-50"
                                        placeholder="name@example.com"
                                        value={forgotEmail}
                                        onChange={e => setForgotEmail(e.target.value)}
                                    />
                                </div>
                                {forgotError && (
                                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm">
                                        {forgotError}
                                    </div>
                                )}
                                <button
                                    type="submit"
                                    disabled={forgotLoading}
                                    className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition disabled:opacity-50"
                                >
                                    {forgotLoading ? '發送中...' : '發送重設連結'}
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="bg-white max-w-md w-full rounded-2xl shadow-xl overflow-hidden animate-fade-in flex flex-col md:flex-row">

                {/* 左側/上方 視覺區 */}
                <div className="bg-blue-600 p-8 flex flex-col justify-center items-center text-white md:w-2/5">
                    <div className="text-6xl mb-4">🏫</div>
                    <h1 className="text-xl font-bold text-center">補習班<br />管理系統</h1>
                    <p className="text-xs text-blue-200 mt-2 text-center">親師溝通 x 行政管理</p>
                </div>

                {/* 右側/下方 表單區 */}
                <div className="p-8 md:w-3/5">
                    <h2 className="text-2xl font-bold text-gray-800 mb-6">
                        歡迎回來
                    </h2>

                    <form onSubmit={handleAuth} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">電子郵件</label>
                            <input
                                type="email" required
                                className="w-full p-2 border rounded focus:outline-none focus:border-blue-500 bg-gray-50"
                                placeholder="name@example.com"
                                value={email} onChange={e => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-xs font-bold text-gray-600">密碼</label>
                                <button
                                    type="button"
                                    onClick={() => { setShowForgotPw(true); setForgotEmail(email); }}
                                    className="text-xs text-blue-500 hover:underline"
                                >
                                    忘記密碼？
                                </button>
                            </div>
                            <input
                                type="password" required
                                className="w-full p-2 border rounded focus:outline-none focus:border-blue-500 bg-gray-50"
                                placeholder="••••••"
                                value={password} onChange={e => setPassword(e.target.value)}
                            />
                        </div>

                        {loginError && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm font-medium">
                                ❌ {loginError}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition disabled:opacity-50"
                        >
                            {loading ? '處理中...' : '登入'}
                        </button>
                    </form>

                    <div className="mt-6 text-center text-sm text-gray-500">
                        還沒有帳號？
                        <button
                            onClick={() => router.push('/register')}
                            className="text-blue-600 font-bold ml-1 hover:underline focus:outline-none"
                        >
                            免費註冊
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
