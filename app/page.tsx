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

        // 👑 園長無敵通道 (保留著以防萬一)
        if (session.user.email === 'teacheryoyo@demo.com') {
            setRole('director');
            setLoading(false);
            return;
        }

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

    if (loading) return <div className="min-h-screen flex items-center justify-center">驗證中...</div>;

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

    if (role === 'pending') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-yellow-50 p-6">
                <div className="text-6xl mb-4">⏳</div>
                <h1 className="text-2xl font-bold text-yellow-800">帳號審核中</h1>
                <p className="mt-2 text-gray-600">請等待園長開通權限。</p>
                <button onClick={() => window.location.reload()} className="mt-6 px-6 py-2 bg-yellow-600 text-white rounded">重新整理</button>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-gray-100 p-4">
            <div className="max-w-md mx-auto">
                <div className="bg-white p-4 rounded-lg shadow mb-6 flex justify-between items-center">
                    <div>
                        <div className="text-sm text-gray-500">歡迎回來!</div>
                        <div className="font-bold">{session.user.email}</div>
                        <div className="text-xs text-blue-600 uppercase font-bold mt-1">
                            身分: {role === 'director' ? '園長' : role === 'manager' ? '主任' : '老師'}
                        </div>
                    </div>
                    <button onClick={() => supabase.auth.signOut()} className="text-sm border px-3 py-1 rounded hover:bg-gray-50">登出</button>
                </div>

                {/* 園長專屬區塊 */}
                {role === 'director' && (
                    <Link href="/admin" className="block bg-gray-800 text-white p-6 rounded-xl shadow-md mb-6 flex items-center gap-4">
                        <div className="text-3xl">👮‍♂️</div>
                        <div>
                            <h2 className="font-bold text-xl">人事管理中心</h2>
                            <p className="text-gray-400 text-sm">審核新進老師</p>
                        </div>
                    </Link>
                )}

                <div className="grid grid-cols-1 gap-4">
                    <Link href="/pickup" className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition flex items-center gap-4 border-l-4 border-blue-500">
                        <div className="bg-blue-100 p-3 rounded-full text-2xl">🚌</div>
                        <div><h2 className="font-bold text-lg">接送管理</h2><p className="text-gray-500 text-sm">Pickup System</p></div>
                    </Link>

                    <Link href="/chat" className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition flex items-center gap-4 border-l-4 border-green-500">
                        <div className="bg-green-100 p-3 rounded-full text-2xl">💬</div>
                        <div><h2 className="font-bold text-lg">親師對話</h2><p className="text-gray-500 text-sm">Chat Room</p></div>
                    </Link>

                    <Link href="/contact" className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition flex items-center gap-4 border-l-4 border-orange-500">
                        <div className="bg-orange-100 p-3 rounded-full text-2xl">📝</div>
                        <div><h2 className="font-bold text-lg">電子聯絡簿</h2><p className="text-gray-500 text-sm">Contact Book</p></div>
                    </Link>

                    <Link href="/grades" className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition flex items-center gap-4 border-l-4 border-purple-500">
                        <div className="bg-purple-100 p-3 rounded-full text-2xl">📊</div>
                        <div><h2 className="font-bold text-lg">成績管理</h2><p className="text-gray-500 text-sm">Grades & Exams</p></div>
                    </Link>

                    <Link href="/students" className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition flex items-center gap-4 border-l-4 border-pink-500">
                        <div className="bg-pink-100 p-3 rounded-full text-2xl">🎓</div>
                        <div><h2 className="font-bold text-lg">學生檔案</h2><p className="text-gray-500 text-sm">Student Profiles</p></div>
                    </Link>
                </div>
            </div>
        </main>
    );
}