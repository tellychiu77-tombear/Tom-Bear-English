'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

// 定義班級選項
const ENGLISH_CLASSES = Array.from({ length: 26 }, (_, i) => `CEI-${String.fromCharCode(65 + i)}`);

export default function RegisterPage() {
    // 核心狀態
    const [role, setRole] = useState<'parent' | 'teacher'>('parent'); // 預設家長

    // 基本資料
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');

    // 家長專屬：小孩資料
    const [childName, setChildName] = useState('');
    const [childGrade, setChildGrade] = useState('CEI-A');
    const [childAfterSchool, setChildAfterSchool] = useState(false);

    // 系統狀態
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [passMatch, setPassMatch] = useState(true);

    const router = useRouter();

    // 檢查密碼一致性
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

        // 1. 驗證
        if (password !== confirmPassword) {
            setErrorMsg('❌ 兩次密碼不一致');
            setLoading(false); return;
        }
        if (password.length < 6) {
            setErrorMsg('⚠️ 密碼長度不足 6 碼');
            setLoading(false); return;
        }
        if (!fullName.trim()) {
            setErrorMsg('⚠️ 請輸入真實姓名');
            setLoading(false); return;
        }
        // 如果是家長，檢查小孩資料
        if (role === 'parent' && !childName.trim()) {
            setErrorMsg('⚠️ 請輸入學生姓名');
            setLoading(false); return;
        }

        // 2. 註冊帳號 (Supabase Auth)
        const { error: signUpError } = await supabase.auth.signUp({
            email,
            password,
        });

        if (signUpError) {
            setErrorMsg('註冊失敗: ' + signUpError.message);
            setLoading(false);
            return;
        }

        // 3. 寫入資料庫
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
            try {
                // A. 建立個人檔案 (Profile)
                const { error: profileError } = await supabase.from('profiles').insert({
                    id: user.id,
                    email: email,
                    full_name: fullName,
                    phone: phone,
                    role: role, // 直接寫入選擇的身分
                });
                if (profileError) throw profileError;

                // B. 如果是家長，自動幫他建立小孩資料 (Student)
                if (role === 'parent') {
                    let finalGrade = childGrade;
                    if (childAfterSchool) finalGrade += ', 課後輔導班';

                    const { error: studentError } = await supabase.from('students').insert({
                        parent_id: user.id, // 直接綁定這個新帳號
                        chinese_name: childName,
                        grade: finalGrade
                    });
                    if (studentError) throw studentError;
                }

                alert(`🎉 註冊成功！歡迎加入 Tom Bear。\n身分：${role === 'parent' ? '家長' : '老師'}`);
                router.push('/'); // 回首頁

            } catch (dbError: any) {
                setErrorMsg('資料寫入失敗: ' + dbError.message);
                // 這裡可能需要考慮 rollback 機制，但簡單處理先提示錯誤
            }
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row animate-fade-in-up">

                {/* 左側：形象區 (手機版會隱藏) */}
                <div className="hidden md:flex w-2/5 bg-gradient-to-br from-indigo-600 to-blue-500 text-white p-8 flex-col justify-center relative overflow-hidden">
                    <div className="absolute top-[-20%] left-[-20%] w-60 h-60 bg-white/10 rounded-full blur-3xl"></div>
                    <div className="text-center z-10">
                        <div className="text-7xl mb-4 animate-bounce">🐻</div>
                        <h2 className="text-3xl font-black tracking-widest mb-2">WELCOME</h2>
                        <p className="opacity-90">Tom Bear 智慧校園系統</p>
                        <div className="mt-8 text-left bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/20">
                            <p className="font-bold mb-2">✨ 註冊說明</p>
                            <ul className="text-sm space-y-2 opacity-90 list-disc list-inside">
                                <li>家長註冊後，系統將自動連結您的孩子資料。</li>
                                <li>教師帳號註冊後，可直接進入管理後台。</li>
                                <li>請務必填寫真實姓名以便核對。</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* 右側：表單區 */}
                <div className="w-full md:w-3/5 p-8 md:p-10 relative overflow-y-auto max-h-[90vh]">

                    <button onClick={() => router.push('/')} className="absolute top-6 right-6 text-gray-400 hover:text-indigo-600 text-sm font-bold flex items-center gap-1 transition">
                        已有帳號？登入 &rarr;
                    </button>

                    <h2 className="text-2xl font-bold text-gray-800 mb-6">建立新帳號</h2>

                    <form onSubmit={handleRegister} className="space-y-6">

                        {/* 1. 身分選擇 (大按鈕切換) */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">步驟 1：請問您的身分是？</label>
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    type="button"
                                    onClick={() => setRole('parent')}
                                    className={`py-4 rounded-xl border-2 font-bold text-lg flex flex-col items-center gap-1 transition ${role === 'parent'
                                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-md'
                                            : 'border-gray-200 text-gray-400 hover:border-gray-300'
                                        }`}
                                >
                                    <span>👨‍👩‍👧‍👦</span>
                                    我是家長
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setRole('teacher')}
                                    className={`py-4 rounded-xl border-2 font-bold text-lg flex flex-col items-center gap-1 transition ${role === 'teacher'
                                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-md'
                                            : 'border-gray-200 text-gray-400 hover:border-gray-300'
                                        }`}
                                >
                                    <span>🧑‍🏫</span>
                                    我是老師
                                </button>
                            </div>
                        </div>

                        {/* 2. 基本資料 (共用) */}
                        <div className="space-y-4">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide">步驟 2：基本資料</label>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">真實姓名</label>
                                    <input type="text" required placeholder="例如: 王大明" className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={fullName} onChange={e => setFullName(e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">手機號碼</label>
                                    <input type="tel" required placeholder="0912..." className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={phone} onChange={e => setPhone(e.target.value)} />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Email (登入帳號)</label>
                                <input type="email" required placeholder="name@example.com" className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={email} onChange={e => setEmail(e.target.value)} />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">設定密碼</label>
                                    <input type="password" required placeholder="至少 6 碼" className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={password} onChange={e => setPassword(e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">確認密碼</label>
                                    <input type="password" required placeholder="再次輸入" className={`w-full p-3 bg-gray-50 border rounded-lg focus:ring-2 outline-none ${!passMatch ? 'border-red-500 focus:ring-red-200' : 'focus:ring-indigo-500'}`} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                                </div>
                            </div>
                            {!passMatch && <p className="text-xs text-red-500 font-bold">⚠️ 密碼不一致</p>}
                        </div>

                        {/* 3. 家長專屬：小孩資料欄位 (動態顯示) */}
                        {role === 'parent' && (
                            <div className="bg-orange-50 p-5 rounded-xl border border-orange-200 animate-fade-in">
                                <label className="block text-xs font-bold text-orange-800 mb-3 uppercase tracking-wide">
                                    步驟 3：綁定學生資料 (重要)
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1">學生姓名</label>
                                        <input
                                            type="text"
                                            placeholder="例如: 妹妹"
                                            className="w-full p-3 bg-white border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none"
                                            value={childName}
                                            onChange={e => setChildName(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1">就讀班級</label>
                                        <select
                                            className="w-full p-3 bg-white border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none"
                                            value={childGrade}
                                            onChange={e => setChildGrade(e.target.value)}
                                        >
                                            {ENGLISH_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="mt-4">
                                    <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-white/50 rounded transition">
                                        <input
                                            type="checkbox"
                                            className="w-5 h-5 accent-orange-600"
                                            checked={childAfterSchool}
                                            onChange={e => setChildAfterSchool(e.target.checked)}
                                        />
                                        <span className="text-sm font-bold text-gray-700">該學生有參加課後輔導 (安親)</span>
                                    </label>
                                </div>
                            </div>
                        )}

                        {/* 錯誤訊息 */}
                        {errorMsg && (
                            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2 font-bold">
                                <span>🚫</span> {errorMsg}
                            </div>
                        )}

                        {/* 送出按鈕 */}
                        <button
                            type="submit"
                            disabled={loading || !passMatch}
                            className={`w-full py-4 rounded-xl text-white font-bold text-lg shadow-lg flex items-center justify-center gap-2 transition transform active:scale-95
                    ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}
                `}
                        >
                            {loading ? '資料處理中...' : `確認註冊 (${role === 'parent' ? '家長' : '老師'})`}
                        </button>

                        <p className="text-center text-xs text-gray-400 mt-2">
                            點擊註冊代表您同意使用者條款與隱私權政策
                        </p>

                    </form>
                </div>
            </div>
        </div>
    );
}