'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function ResetPasswordPage() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [success, setSuccess] = useState(false);
    const [sessionReady, setSessionReady] = useState(false);
    const router = useRouter();

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') {
                setSessionReady(true);
            }
        });
        return () => subscription.unsubscribe();
    }, []);

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');

        if (password.length < 6) {
            setErrorMsg('⚠️ 密碼至少需要 6 個字元');
            return;
        }
        if (password !== confirmPassword) {
            setErrorMsg('❌ 兩次密碼不一致');
            return;
        }

        setLoading(true);
        const { error } = await supabase.auth.updateUser({ password });
        setLoading(false);

        if (error) {
            setErrorMsg('❌ 密碼更新失敗，請重新點選信件中的連結再試一次');
        } else {
            setSuccess(true);
            setTimeout(() => router.push('/'), 2500);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl p-10 max-w-sm w-full text-center animate-fade-in">
                    <div className="text-5xl mb-4">✅</div>
                    <h2 className="text-xl font-bold text-gray-800 mb-2">密碼已更新</h2>
                    <p className="text-gray-500 text-sm">即將跳轉至登入頁面…</p>
                </div>
            </div>
        );
    }

    if (!sessionReady) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl p-10 max-w-sm w-full text-center">
                    <div className="text-4xl mb-4">⏳</div>
                    <p className="text-gray-600 text-sm">驗證連結中，請稍候…</p>
                    <p className="text-gray-400 text-xs mt-2">若超過 10 秒仍無反應，請重新點選信件中的連結</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden max-w-md w-full animate-fade-in">
                <div className="bg-gradient-to-r from-indigo-700 to-blue-600 p-8 text-white text-center">
                    <div className="text-5xl mb-3">🔒</div>
                    <h1 className="text-xl font-bold">設定新密碼</h1>
                    <p className="text-blue-200 text-xs mt-1">Tom Bear 智慧補習班</p>
                </div>

                <div className="p-8">
                    <form onSubmit={handleReset} className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500">
                                新密碼 <span className="text-red-400">*</span>
                            </label>
                            <input
                                type="password" required
                                placeholder="至少 6 個字元"
                                className="w-full p-2 border rounded mt-1 focus:outline-none focus:border-indigo-500"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500">
                                確認新密碼 <span className="text-red-400">*</span>
                            </label>
                            <input
                                type="password" required
                                placeholder="再次輸入新密碼"
                                className={`w-full p-2 border rounded mt-1 focus:outline-none focus:border-indigo-500
                                    ${confirmPassword && password !== confirmPassword ? 'border-red-400' : ''}`}
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                            />
                            {confirmPassword && password !== confirmPassword && (
                                <p className="text-red-500 text-xs mt-1">密碼不一致</p>
                            )}
                        </div>

                        {errorMsg && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm font-medium">
                                {errorMsg}
                            </div>
                        )}

                        <button type="submit" disabled={loading}
                            className="w-full py-3 bg-indigo-700 text-white font-bold rounded-lg hover:bg-indigo-800 disabled:opacity-50 transition">
                            {loading ? '更新中...' : '確認更新密碼'}
                        </button>
                    </form>

                    <p className="text-center text-xs text-gray-400 mt-4">
                        回到{' '}
                        <button onClick={() => router.push('/')}
                            className="text-indigo-600 font-bold hover:underline">
                            登入頁面
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
}
