'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const router = useRouter();

    async function handleAuth(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            alert('登入失敗: ' + error.message);
        } else {
            router.push('/'); // 登入成功，回首頁
        }
        setLoading(false);
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
                            <label className="block text-xs font-bold text-gray-600 mb-1">Email</label>
                            <input
                                type="email" required
                                className="w-full p-2 border rounded focus:outline-none focus:border-blue-500 bg-gray-50"
                                placeholder="name@example.com"
                                value={email} onChange={e => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">密碼</label>
                            <input
                                type="password" required
                                className="w-full p-2 border rounded focus:outline-none focus:border-blue-500 bg-gray-50"
                                placeholder="••••••"
                                value={password} onChange={e => setPassword(e.target.value)}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition disabled:opacity-50"
                        >
                            {loading ? '處理中...' : '登入'}
                        </button>
                    </form>

                    {/* 切換模式按鈕 */}
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
