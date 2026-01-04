'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { useRouter } from 'next/navigation';

export default function Home() {
    const [session, setSession] = useState<any>(null);
    const router = useRouter();

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
    };

    // 1. 未登入狀態：顯示登入框
    if (!session) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-gray-50">
                <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-lg border border-gray-100">
                    <h1 className="text-3xl font-extrabold text-center mb-2 text-gray-800 tracking-tight">補習班管理系統</h1>
                    <p className="text-center text-gray-400 mb-8">請登入以存取管理功能</p>
                    <Auth
                        supabaseClient={supabase}
                        appearance={{ theme: ThemeSupa }}
                        providers={[]}
                        localization={{ variables: { sign_in: { email_label: '電子郵件', password_label: '密碼', button_label: '登入' } } }}
                    />
                </div>
            </div>
        );
    }

    // 2. 已登入狀態：顯示【四大功能選單】
    return (
        <div className="min-h-screen bg-gray-100 font-sans p-4 md:p-8">
            {/* 歡迎區塊 */}
            <div className="max-w-4xl mx-auto bg-white p-6 rounded-2xl shadow-sm mb-8 flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">👋 歡迎回來!</h2>
                    <p className="text-gray-500 text-sm mt-1">{session.user.email}</p>
                </div>
                <button onClick={handleLogout} className="text-gray-400 hover:text-red-500 font-medium text-sm border border-gray-200 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors">
                    登出
                </button>
            </div>

            {/* 功能九宮格 */}
            <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* 1. 接送管理 */}
                <button
                    onClick={() => router.push('/dashboard')}
                    className="bg-white hover:bg-blue-50 border-l-8 border-blue-500 p-6 rounded-xl shadow-md flex items-center gap-5 transition-all active:scale-95 group"
                >
                    <div className="bg-blue-100 p-4 rounded-full text-3xl group-hover:scale-110 transition-transform">🚍</div>
                    <div className="text-left">
                        <h3 className="text-xl font-bold text-gray-800">接送管理</h3>
                        <p className="text-gray-500 text-sm">Pickup System</p>
                    </div>
                </button>

                {/* 2. 親師對話 */}
                <button
                    onClick={() => router.push('/chat')}
                    className="bg-white hover:bg-green-50 border-l-8 border-green-500 p-6 rounded-xl shadow-md flex items-center gap-5 transition-all active:scale-95 group"
                >
                    <div className="bg-green-100 p-4 rounded-full text-3xl group-hover:scale-110 transition-transform">💬</div>
                    <div className="text-left">
                        <h3 className="text-xl font-bold text-gray-800">親師對話</h3>
                        <p className="text-gray-500 text-sm">Chat Room</p>
                    </div>
                </button>

                {/* 3. 電子聯絡簿 */}
                <button
                    onClick={() => router.push('/contact')}
                    className="bg-white hover:bg-orange-50 border-l-8 border-orange-500 p-6 rounded-xl shadow-md flex items-center gap-5 transition-all active:scale-95 group"
                >
                    <div className="bg-orange-100 p-4 rounded-full text-3xl group-hover:scale-110 transition-transform">📝</div>
                    <div className="text-left">
                        <h3 className="text-xl font-bold text-gray-800">電子聯絡簿</h3>
                        <p className="text-gray-500 text-sm">Contact Book</p>
                    </div>
                </button>

                {/* 4. 成績管理 (新功能!) */}
                <button
                    onClick={() => router.push('/grades')}
                    className="bg-white hover:bg-purple-50 border-l-8 border-purple-500 p-6 rounded-xl shadow-md flex items-center gap-5 transition-all active:scale-95 group"
                >
                    <div className="bg-purple-100 p-4 rounded-full text-3xl group-hover:scale-110 transition-transform">📊</div>
                    <div className="text-left">
                        <h3 className="text-xl font-bold text-gray-800">成績管理</h3>
                        <p className="text-gray-500 text-sm">Grades & Exams</p>
                    </div>
                </button>

            </div>
        </div>
    );
}