'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import Link from 'next/link';

export default function Home() {
    const [session, setSession] = useState<any>(null);
    const [role, setRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true); // 預設正在讀取，誰都不準進！

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (session) fetchRole(session.user.id);
            else setLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session) fetchRole(session.user.id);
            else {
                setRole(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    async function fetchRole(userId: string) {
        try {
            setLoading(true); // 開始查身分，先鎖門
            const { data, error } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', userId)
                .single();

            if (error) {
                console.error('Error fetching role:', error);
            } else {
                setRole(data?.role || 'pending'); // 如果沒抓到，預設當作 pending 處理
            }
        } catch (error) {
            console.error('Unexpected error:', error);
        } finally {
            setLoading(false); // 查完了，開門
        }
    }

    // 1. 如果還在查身分，顯示轉圈圈 (絕對防禦)
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100">
                <div className="text-xl font-bold text-gray-600">正在驗證身分中...</div>
            </div>
        );
    }

    // 2. 如果沒登入，顯示登入框
    if (!session) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-md">
                    <h1 className="mb-6 text-2xl font-bold text-center text-gray-900">補習班管理系統</h1>
                    <Auth
                        supabaseClient={supabase}
                        appearance={{ theme: ThemeSupa }}
                        providers={[]}
                        showLinks={false} // 隱藏忘記密碼等雜項
                    />
                </div>
            </div>
        );
    }

    // 3. ⚠️ 關鍵：如果是 pending，顯示等待室 (死都不給看選單)
    if (role === 'pending') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-yellow-50 p-6 text-center">
                <div className="mb-4 text-6xl">⏳</div>
                <h1 className="text-2xl font-bold text-yellow-800 mb-2">帳號審核中</h1>
                <p className="text-gray-600 mb-6">註冊成功！請等待園長開通您的權限後，再重新整理此頁面。</p>
                <button
                    onClick={() => window.location.reload()}
                    className="px-6 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
                >
                    重新整理狀態
                </button>
                <button
                    onClick={() => supabase.auth.signOut()}
                    className="mt-4 text-sm text-gray-500 underline"
                >
                    登出
                </button>
            </div>
        );
    }

    // 4. 通過驗證的正式員工，才給看選單
    return (
        <main className="min-h-screen bg-gray-100 p-4">
            <div className="max-w-md mx-auto">
                <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-lg shadow-sm">
                    <div>
                        <div className="text-sm text-gray-500">歡迎回來!</div>
                        <div className="font-bold">{session.user.email}</div>
                        <div className="text-xs text-blue-600 uppercase font-bold mt-1">身分: {role === 'director' ? '園長' : role === 'manager' ? '主任' : '老師'}</div>
                    </div>
                    <button
                        onClick={() => supabase.auth.signOut()}
                        className="text-sm border border-gray-300 px-3 py-1 rounded hover:bg-gray-50"
                    >
                        登出
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    <Link href="/pickup" className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition flex items-center gap-4 border-l-4 border-blue-500">
                        <div className="bg-blue-100 p-3 rounded-full text-2xl">🚌</div>
                        <div>
                            <h2 className="font-bold text-lg">接送管理</h2>
                            <p className="text-gray-500 text-sm">Pickup System</p>
                        </div>
                    </Link>

                    <Link href="/chat" className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition flex items-center gap-4 border-l-4 border-green-500">
                        <div className="bg-green-100 p-3 rounded-full text-2xl">💬</div>
                        <div>
                            <h2 className="font-bold text-lg">親師對話</h2>
                            <p className="text-gray-500 text-sm">Chat Room</p>
                        </div>
                    </Link>

                    <Link href="/contact" className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition flex items-center gap-4 border-l-4 border-orange-500">
                        <div className="bg-orange-100 p-3 rounded-full text-2xl">📝</div>
                        <div>
                            <h2 className="font-bold text-lg">電子聯絡簿</h2>
                            <p className="text-gray-500 text-sm">Contact Book</p>
                        </div>
                    </Link>

                    <Link href="/grades" className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition flex items-center gap-4 border-l-4 border-purple-500">
                        <div className="bg-purple-100 p-3 rounded-full text-2xl">📊</div>
                        <div>
                            <h2 className="font-bold text-lg">成績管理</h2>
                            <p className="text-gray-500 text-sm">Grades & Exams</p>
                        </div>
                    </Link>

                    <Link href="/students" className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition flex items-center gap-4 border-l-4 border-pink-500">
                        <div className="bg-pink-100 p-3 rounded-full text-2xl">🎓</div>
                        <div>
                            <h2 className="font-bold text-lg">學生檔案</h2>
                            <p className="text-gray-500 text-sm">Student Profiles</p>
                        </div>
                    </Link>
                </div>
            </div>
        </main>
    );
}