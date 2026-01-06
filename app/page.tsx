'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import Link from 'next/link';

export default function Home() {
    const [session, setSession] = useState<any>(null);
    const [role, setRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (session) checkUserRole(session);
            else setLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session) checkUserRole(session);
            else {
                setRole(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    async function checkUserRole(session: any) {
        setLoading(true);

        // 👑 園長無敵後門：如果是您的 Email，直接賦予最高權限，不查資料庫！
        // 這樣可以繞過所有權限錯誤
        if (session.user.email === 'teacheryoyo@demo.com') {
            console.log("園長駕到，強制開門！");
            setRole('director');
            setLoading(false);
            return; // 直接結束，不走下面的檢查
        }

        // 其他人照常檢查
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', session.user.id)
                .single();

            if (error || !data) {
                setRole('pending');
            } else {
                setRole(data.role);
            }
        } catch (error) {
            setRole('pending');
        } finally {
            setLoading(false);
        }
    }

    // 1. 讀取畫面
    if (loading) {
        return <div className="min-h-screen flex items-center justify-center text-xl">正在驗證身分...</div>;
    }

    // 2. 登入畫面
    if (!session) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="w-full max-w-md p-8 bg-white shadow-lg rounded-lg">
                    <h1 className="text-2xl font-bold text-center mb-6">補習班管理系統</h1>
                    <Auth supabaseClient={supabase} appearance={{ theme: ThemeSupa }} providers={[]} showLinks={false} />
                </div>
            </div>
        );
    }

    // 3. 等待審核畫面 (附帶除錯資訊)
    if (role === 'pending') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-yellow-50 p-6">
                <div className="text-6xl mb-4">🚧</div>
                <h1 className="text-2xl font-bold text-yellow-800">帳號審核中 (Debug Mode)</h1>
                <p className="mt-2 text-gray-600">您的身分目前無法讀取。</p>

                {/* 把錯誤原因顯示出來，讓我們知道發生什麼事 */}
                <div className="bg-white p-4 mt-6 rounded border border-yellow-200 text-left text-sm font-mono">
                    <p><strong>Debug Info:</strong></p>
                    <p>Email: {session.user.email}</p>
                    <p>ID: {session.user.id}</p>
                    <p>Detected Role: {role}</p>
                </div>

                <button onClick={() => window.location.reload()} className="mt-6 px-6 py-2 bg-yellow-600 text-white rounded">
                    重新整理
                </button>
                <button onClick={() => supabase.auth.signOut()} className="mt-2 text-sm text-gray-500 underline">
                    登出
                </button>
            </div>
        );
    }

    // 4. 正式主選單
    return (
        <main className="min-h-screen bg-gray-100 p-4">
            <div className="max-w-md mx-auto">
                <div className="bg-white p-4 rounded-lg shadow mb-4 flex justify-between items-center">
                    <div>
                        <div className="font-bold text-lg">歡迎回來，園長！</div>
                        <div className="text-sm text-gray-500">{session.user.email}</div>
                    </div>
                    <button onClick={() => supabase.auth.signOut()} className="text-sm border px-3 py-1 rounded">登出</button>
                </div>

                {/* 園長專屬的人事管理入口 */}
                {role === 'director' && (
                    <Link href="/admin" className="block bg-gray-800 text-white p-6 rounded-xl shadow-md mb-4 flex items-center gap-4">
                        <div className="text-3xl">👮‍♂️</div>
                        <div>
                            <h2 className="font-bold text-xl">人事管理中心</h2>
                            <p className="text-gray-400 text-sm">審核新進老師</p>
                        </div>
                    </Link>
                )}

                <div className="grid grid-cols-1 gap-4">
                    <Link href="/students" className="bg-white p-6 rounded-xl shadow hover:shadow-md flex items-center gap-4 border-l-4 border-pink-500">
                        <div className="bg-pink-100 p-3 rounded-full text-2xl">🎓</div>
                        <div><h2 className="font-bold">學生檔案</h2></div>
                    </Link>
                    {/* 其他按鈕先省略，確認能進去再加回來 */}
                </div>
            </div>
        </main>
    );
}