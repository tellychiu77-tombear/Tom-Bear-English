'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import Link from 'next/link';

export default function Home() {
    const [session, setSession] = useState<any>(null);
    const [role, setRole] = useState<string | null>(null);
    const [profileData, setProfileData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // 📝 表單資料 (註冊後填寫用)
    const [formData, setFormData] = useState({
        full_name: '',
        phone: '',
        user_type: 'parent', // 預設家長
        child_name: '',
        child_class: ''
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
            else {
                setRole(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    async function fetchProfile(session: any) {
        setLoading(true);

        // 👑 園長無敵後門 (方便您測試)
        if (session.user.email === 'teacheryoyo@demo.com') {
            setRole('director');
            setLoading(false);
            return;
        }

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();

            if (data) {
                setRole(data.role || 'pending');
                setProfileData(data);
            } else {
                setRole('pending');
            }
        } catch (error) {
            console.error(error);
            setRole('pending');
        } finally {
            setLoading(false);
        }
    }

    // 提交詳細資料
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);

        const { error } = await supabase
            .from('profiles')
            .update({
                full_name: formData.full_name,
                phone: formData.phone,
                user_type: formData.user_type,
                child_name: formData.user_type === 'parent' ? formData.child_name : null,
                child_class: formData.user_type === 'parent' ? formData.child_class : null,
            })
            .eq('id', session.user.id);

        if (error) {
            alert('儲存失敗: ' + error.message);
        } else {
            window.location.reload(); // 成功後重新整理
        }
        setSubmitting(false);
    }

    if (loading) return <div className="min-h-screen flex items-center justify-center">載入中...</div>;

    // 1. 登入/註冊畫面
    if (!session) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="w-full max-w-md p-8 bg-white shadow-lg rounded-lg">
                    <h1 className="text-2xl font-bold text-center mb-6">補習班系統</h1>
                    <Auth
                        supabaseClient={supabase}
                        appearance={{ theme: ThemeSupa }}
                        providers={[]}
                    // 這裡不加 showLinks={false}，這樣註冊按鈕才會出現
                    />
                </div>
            </div>
        );
    }

    // 2. 待審核 / 資料補全流程
    if (role === 'pending') {
        // A. 如果沒填過名字 -> 顯示「資料補全表單」
        if (!profileData?.full_name) {
            return (
                <div className="min-h-screen bg-blue-50 py-10 px-4">
                    <div className="max-w-md mx-auto bg-white p-8 rounded-xl shadow-lg">
                        <h1 className="text-2xl font-bold text-blue-900 mb-2">👋 歡迎加入！</h1>
                        <p className="text-gray-600 mb-6">初次登入，請填寫基本資料。</p>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700">您的真實姓名</label>
                                <input required type="text" placeholder="例如: 陳大文" className="w-full p-2 border rounded mt-1"
                                    value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700">手機號碼</label>
                                <input required type="text" placeholder="例如: 0912345678" className="w-full p-2 border rounded mt-1"
                                    value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700">申請身分</label>
                                <div className="flex gap-4 mt-1">
                                    <label className="flex items-center gap-2 cursor-pointer bg-gray-50 px-4 py-2 rounded border hover:bg-blue-50">
                                        <input type="radio" name="type" value="parent" checked={formData.user_type === 'parent'}
                                            onChange={() => setFormData({ ...formData, user_type: 'parent' })} />
                                        👨‍👩‍👧 家長
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer bg-gray-50 px-4 py-2 rounded border hover:bg-green-50">
                                        <input type="radio" name="type" value="teacher" checked={formData.user_type === 'teacher'}
                                            onChange={() => setFormData({ ...formData, user_type: 'teacher' })} />
                                        👩‍🏫 老師
                                    </label>
                                </div>
                            </div>

                            {/* 只有選家長才出現小孩欄位 */}
                            {formData.user_type === 'parent' && (
                                <div className="bg-gray-50 p-4 rounded border border-gray-200 animate-fade-in">
                                    <div className="mb-3">
                                        <label className="block text-sm font-bold text-gray-700">小孩姓名</label>
                                        <input required type="text" placeholder="例如: 陳小明" className="w-full p-2 border rounded mt-1"
                                            value={formData.child_name} onChange={e => setFormData({ ...formData, child_name: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700">小孩班級/年級</label>
                                        <input required type="text" placeholder="例如: 英文A班" className="w-full p-2 border rounded mt-1"
                                            value={formData.child_class} onChange={e => setFormData({ ...formData, child_class: e.target.value })} />
                                    </div>
                                </div>
                            )}

                            <button disabled={submitting} type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition">
                                {submitting ? '提交中...' : '確認送出'}
                            </button>
                        </form>
                    </div>
                </div>
            );
        }

        // B. 如果已經填過 -> 顯示詳細等待畫面
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-yellow-50 p-6 text-center">
                <div className="text-6xl mb-4">⏳</div>
                <h1 className="text-2xl font-bold text-yellow-800">資料已送出，審核中</h1>
                <div className="bg-white p-6 rounded shadow-sm mt-4 text-left w-full max-w-sm">
                    <p className="mb-2"><strong>姓名:</strong> {profileData.full_name}</p>
                    <p className="mb-2"><strong>電話:</strong> {profileData.phone}</p>
                    <p className="mb-2"><strong>身分:</strong> {profileData.user_type === 'parent' ? '家長' : '老師'}</p>
                    {profileData.user_type === 'parent' && (
                        <p className="mb-2"><strong>小孩:</strong> {profileData.child_name} ({profileData.child_class})</p>
                    )}
                </div>
                <button onClick={() => window.location.reload()} className="mt-6 px-6 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition">重新整理狀態</button>
                <button onClick={() => supabase.auth.signOut()} className="mt-2 text-sm text-gray-500 underline">登出</button>
            </div>
        );
    }

    // 3. 正式主選單 (園長/老師/主任)
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

                {role === 'director' && (
                    <Link href="/admin" className="block bg-gray-800 text-white p-6 rounded-xl shadow-md mb-6 flex items-center gap-4 hover:bg-gray-700 transition">
                        <div className="text-3xl">👮‍♂️</div>
                        <div>
                            <h2 className="font-bold text-xl">人事管理中心</h2>
                            <p className="text-gray-400 text-sm">審核新進人員與權限</p>
                        </div>
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
                </div>
            </div>
        </main>
    );
}