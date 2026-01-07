'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function Home() {
    const [session, setSession] = useState<any>(null);
    const [role, setRole] = useState<string | null>(null);
    const [profileData, setProfileData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    // 📝 表單資料
    const [formData, setFormData] = useState({
        full_name: '', phone: '', user_type: 'parent', child_name: '', child_class: ''
    });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (session) fetchProfile(session);
            else setLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session) fetchProfile(session);
            else { setRole(null); setLoading(false); }
        });
        return () => subscription.unsubscribe();
    }, []);

    async function fetchProfile(session: any) {
        setLoading(true);
        // 👑 園長無敵後門
        if (session.user.email === 'teacheryoyo@demo.com') {
            setRole('director'); setLoading(false); return;
        }
        try {
            // Updated to use 'users' table and 'name'
            const { data } = await supabase.from('users').select('*').eq('id', session.user.id).single();
            if (data) {
                setRole(data.role || 'pending');
                setProfileData(data);

                // Redirect if name is missing (Onboarding needed)
                if (!data.name) {
                    router.push('/onboarding');
                }
            } else {
                setRole('pending');
                router.push('/onboarding'); // No profile found -> Onboarding
            }
        } catch { setRole('pending'); }
        finally { setLoading(false); }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault(); setSubmitting(true);
        const { error } = await supabase.from('profiles').upsert({
            id: session.user.id, email: session.user.email,
            full_name: formData.full_name, phone: formData.phone, user_type: formData.user_type,
            child_name: formData.user_type === 'parent' ? formData.child_name : null,
            child_class: formData.user_type === 'parent' ? formData.child_class : null,
            role: 'pending', updated_at: new Date().toISOString(),
        });
        if (error) alert('儲存失敗: ' + error.message);
        else window.location.reload();
        setSubmitting(false);
    }

    if (loading) return <div className="min-h-screen flex items-center justify-center">載入中...</div>;

    // 1. 登入/註冊畫面
    if (!session) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="w-full max-w-md p-8 bg-white shadow-lg rounded-lg">
                    <h1 className="text-2xl font-bold text-center mb-6">補習班系統</h1>
                    <Auth supabaseClient={supabase} appearance={{ theme: ThemeSupa }} providers={[]} />
                </div>
            </div>
        );
    }

    // 2. 待審核 / 資料補全流程
    if (role === 'pending') {
        // Build robust check: if no profile data or no name, we count as onboarding needed.
        if (!profileData || !profileData.name) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-50">
                    <div className="text-xl text-gray-500">Redirecting to Onboarding...</div>
                </div>
            );
        }

        // If has name but still pending:
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-yellow-50 p-6 text-center">
                <div className="text-6xl mb-4">⏳</div>
                <h1 className="text-2xl font-bold text-yellow-800">資料已送出，審核中</h1>
                <div className="bg-white p-6 rounded shadow-sm mt-4 text-left w-full max-w-sm">
                    <p><strong>姓名:</strong> {profileData.name}</p>
                    <p><strong>身分:</strong> {profileData.role === 'parent' ? '家長' : profileData.role === 'teacher' ? '老師' : '待定'}</p>
                </div>
                <button onClick={() => window.location.reload()} className="mt-6 px-6 py-2 bg-yellow-600 text-white rounded">重新整理</button>
                <button onClick={() => supabase.auth.signOut()} className="mt-2 text-sm text-gray-500 underline">登出</button>
            </div>
        );
    }

    // 3. 正式主選單 (完整版)
    return (
        <main className="min-h-screen bg-gray-100 p-4">
            <div className="max-w-md mx-auto">
                <div className="bg-white p-4 rounded-lg shadow mb-6 flex justify-between items-center">
                    <div>
                        <div className="text-sm text-gray-500">歡迎回來!</div>
                        <div className="font-bold">{session.user.email}</div>
                        <div className="text-xs text-blue-600 uppercase font-bold mt-1">身分: {role === 'director' ? '園長' : role === 'manager' ? '主任' : role === 'teacher' ? '老師' : '家長'}</div>
                    </div>
                    <button onClick={() => supabase.auth.signOut()} className="text-sm border px-3 py-1 rounded hover:bg-gray-50">登出</button>
                </div>

                {role === 'director' && (
                    <Link href="/admin" className="block bg-gray-800 text-white p-6 rounded-xl shadow-md mb-6 flex items-center gap-4 hover:scale-105 transition">
                        <div className="text-3xl">👮‍♂️</div>
                        <div><h2 className="font-bold text-xl">人事管理中心</h2><p className="text-gray-400 text-sm">審核人員</p></div>
                    </Link>
                )}

                <div className="grid grid-cols-1 gap-4">
                    <Link href="/pickup" className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition flex items-center gap-4 border-l-4 border-blue-500">
                        <div className="bg-blue-100 p-3 rounded-full text-2xl">🚌</div>
                        <div><h2 className="font-bold text-lg">接送管理</h2><p className="text-gray-500 text-sm">Pickup System</p></div>
                    </Link>
                    <Link href="/students" className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition flex items-center gap-4 border-l-4 border-pink-500">
                        <div className="bg-pink-100 p-3 rounded-full text-2xl">🎓</div>
                        <div><h2 className="font-bold text-lg">學生檔案</h2><p className="text-gray-500 text-sm">Student Profiles</p></div>
                    </Link>

                    {/* 6. 請假中心 */}
                    <Link href="/leave" className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition flex items-center gap-4 border-l-4 border-cyan-500">
                        <div className="bg-cyan-100 p-3 rounded-full text-2xl">📅</div>
                        <div><h2 className="font-bold text-lg">請假中心</h2><p className="text-gray-500 text-sm">Leave Requests</p></div>
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
                </div>
            </div>
        </main>
    );
}