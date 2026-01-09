'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [passMatch, setPassMatch] = useState(true);

    const router = useRouter();

    useEffect(() => {
        if (confirmPassword) {
            setPassMatch(password === confirmPassword);
        } else {
            setPassMatch(true);
        }
    }, [password, confirmPassword]);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setLoading(true);

        if (password !== confirmPassword) {
            setErrorMsg('❌ 兩次輸入的密碼不一致');
            setLoading(false);
            return;
        }
        if (password.length < 6) {
            setErrorMsg('⚠️ 密碼長度至少需要 6 個字元');
            setLoading(false);
            return;
        }

        const { error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) {
            setErrorMsg('註冊失敗: ' + error.message);
            setLoading(false);
        } else {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                // Corrected table name from 'profiles' to 'users' and column 'full_name' to 'name'
                await supabase.from('users').insert({
                    id: user.id,
                    // email: email, // 'users' table in schema doesn't strictly require email based on my view, but usually it's good to store if column exists. 
                    // My schema dump doesn't show an email column in 'users', only id, role, name, contact_info. 
                    // However, Supabase auth stores email. Let's just store what we have columns for.
                    role: 'pending',
                    name: email.split('@')[0]
                });
            }

            alert('🎉 註冊成功！系統將自動登入。');
            router.push('/');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <div className="bg-white w-full max-w-4xl h-[500px] rounded-2xl shadow-2xl overflow-hidden flex animate-fade-in-up">

                <div className="hidden md:flex w-1/2 bg-gradient-to-br from-blue-600 to-indigo-700 items-center justify-center text-white p-8 relative overflow-hidden">
                    <div className="absolute top-[-50px] left-[-50px] w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
                    <div className="absolute bottom-[-50px] right-[-50px] w-60 h-60 bg-white/10 rounded-full blur-3xl"></div>

                    <div className="text-center z-10">
                        <div className="text-6xl mb-4 animate-bounce">🐻</div>
                        <h2 className="text-3xl font-black tracking-widest mb-2">JOIN US</h2>
                        <p className="text-blue-100 text-sm">打造最智慧的補習班管理體驗</p>
                    </div>
                </div>

                <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center relative">

                    {/* Link back to login */}
                    <button onClick={() => router.push('/login')} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-sm font-bold flex items-center gap-1">
                        已有帳號？直接登入 &rarr;
                    </button>

                    <div className="mb-6">
                        <h2 className="text-3xl font-bold text-gray-800 mb-1">註冊新帳號</h2>
                        <p className="text-gray-400 text-sm">請填寫以下資訊完成申請</p>
                    </div>

                    <form onSubmit={handleRegister} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Email 信箱</label>
                            <input type="email" required className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">設定密碼</label>
                                <input type="password" required className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="至少 6 碼" value={password} onChange={(e) => setPassword(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">確認密碼</label>
                                <input type="password" required className={`w-full p-3 bg-gray-50 border rounded-lg focus:bg-white outline-none ${!passMatch ? 'border-red-500' : 'border-gray-200 focus:ring-2 focus:ring-blue-500'}`} placeholder="再輸入一次" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                            </div>
                        </div>

                        {!passMatch && <p className="text-xs text-red-500 font-bold animate-pulse">⚠️ 兩次密碼不一致！</p>}
                        {errorMsg && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">🚫 {errorMsg}</div>}

                        <button type="submit" disabled={loading || !passMatch} className={`w-full py-3.5 rounded-lg text-white font-bold text-lg shadow-lg flex items-center justify-center gap-2 ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
                            {loading ? '系統處理中...' : '立即註冊帳號'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
