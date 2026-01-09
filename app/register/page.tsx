'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

const ENGLISH_CLASSES = Array.from({ length: 26 }, (_, i) => `CEI-${String.fromCharCode(65 + i)}`);

export default function RegisterPage() {
    const [role, setRole] = useState<'parent' | 'teacher'>('parent');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');

    // 家長申請者填寫：
    const [childName, setChildName] = useState('');
    const [childGrade, setChildGrade] = useState('CEI-A');
    const [childAfterSchool, setChildAfterSchool] = useState(false);

    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [passMatch, setPassMatch] = useState(true);

    const router = useRouter();

    useEffect(() => {
        if (confirmPassword) setPassMatch(password === confirmPassword);
        else setPassMatch(true);
    }, [password, confirmPassword]);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setLoading(true);

        if (password !== confirmPassword) {
            setErrorMsg('❌ 兩次密碼不一致'); setLoading(false); return;
        }
        if (password.length < 6) {
            setErrorMsg('⚠️ 密碼長度不足 6 碼'); setLoading(false); return;
        }
        if (!fullName.trim()) {
            setErrorMsg('⚠️ 請輸入真實姓名'); setLoading(false); return;
        }
        if (role === 'parent' && !childName.trim()) {
            setErrorMsg('⚠️ 請輸入學生姓名，以便行政人員審核'); setLoading(false); return;
        }

        // 註冊
        const { error: signUpError } = await supabase.auth.signUp({ email, password });

        if (signUpError) {
            setErrorMsg('註冊失敗: ' + signUpError.message);
            setLoading(false);
            return;
        }

        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
            try {
                // 🔴 關鍵修正：不管選什麼，Role 一律存為 'pending' (待審核)
                // 我們把使用者宣稱的身分 (家長/老師) 寫在 full_name 後面做備註，方便您審核時辨識
                const nameWithTag = `${fullName} (${role === 'parent' ? '申請家長' : '申請老師'})`;

                await supabase.from('profiles').insert({
                    id: user.id,
                    email: email,
                    full_name: nameWithTag,
                    phone: phone,
                    role: 'pending', // 🔒 鎖死權限！一定要等您開通
                });

                // 如果是家長申請，我們先把小孩資料建立起來，
                // 這樣您審核通過後，資料就直接連上了，不用再手動輸入。
                // 但因為 role 是 pending，他也看不到這些資料。
                if (role === 'parent') {
                    let finalGrade = childGrade;
                    if (childAfterSchool) finalGrade += ', 課後輔導班';

                    await supabase.from('students').insert({
                        parent_id: user.id,
                        chinese_name: childName,
                        grade: finalGrade
                    });
                }

                // 註冊成功，導向首頁 (首頁會擋住他)
                alert('🎉 註冊申請已送出！\n\n為了保護學生隱私，您的帳號目前為「待審核」狀態。\n請等待補習班行政人員開通權限。');
                router.push('/');

            } catch (dbError: any) {
                setErrorMsg('資料寫入失敗: ' + dbError.message);
            }
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row animate-fade-in-up">

                <div className="hidden md:flex w-2/5 bg-gradient-to-br from-gray-700 to-gray-900 text-white p-8 flex-col justify-center relative">
                    <div className="text-center z-10">
                        <div className="text-7xl mb-4">🛡️</div>
                        <h2 className="text-3xl font-black tracking-widest mb-2">SECURITY</h2>
                        <p className="opacity-90">實名制審核保護</p>
                        <div className="mt-8 text-left bg-white/10 p-4 rounded-xl border border-white/20">
                            <p className="font-bold mb-2 text-yellow-400">⚠️ 註冊須知</p>
                            <ul className="text-sm space-y-2 opacity-90 list-disc list-inside">
                                <li>本系統採<strong>人工審核制</strong>。</li>
                                <li>註冊後無法立即使用，需等待行政人員核對身分。</li>
                                <li>請務必填寫<strong>真實姓名</strong>與<strong>就讀學童資料</strong>以加快審核速度。</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="w-full md:w-3/5 p-8 md:p-10 relative overflow-y-auto max-h-[90vh]">
                    <button onClick={() => router.push('/')} className="absolute top-6 right-6 text-gray-400 hover:text-indigo-600 text-sm font-bold flex items-center gap-1">已有帳號？登入 &rarr;</button>

                    <h2 className="text-2xl font-bold text-gray-800 mb-6">申請開通帳號</h2>

                    <form onSubmit={handleRegister} className="space-y-6">

                        {/* 身分宣告 (僅供審核參考) */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">申請身分</label>
                            <div className="grid grid-cols-2 gap-4">
                                <button type="button" onClick={() => setRole('parent')} className={`py-4 rounded-xl border-2 font-bold text-lg flex flex-col items-center gap-1 transition ${role === 'parent' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-400'}`}>
                                    <span>👨‍👩‍👧‍👦</span> 我是家長
                                </button>
                                <button type="button" onClick={() => setRole('teacher')} className={`py-4 rounded-xl border-2 font-bold text-lg flex flex-col items-center gap-1 transition ${role === 'teacher' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-400'}`}>
                                    <span>🧑‍🏫</span> 我是老師
                                </button>
                            </div>
                        </div>

                        {/* 基本資料 */}
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">真實姓名</label>
                                    <input type="text" required placeholder="例如: 王大明" className="w-full p-3 bg-gray-50 border rounded-lg" value={fullName} onChange={e => setFullName(e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">手機號碼</label>
                                    <input type="tel" required placeholder="0912..." className="w-full p-3 bg-gray-50 border rounded-lg" value={phone} onChange={e => setPhone(e.target.value)} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Email</label>
                                <input type="email" required className="w-full p-3 bg-gray-50 border rounded-lg" value={email} onChange={e => setEmail(e.target.value)} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-xs font-bold text-gray-700 mb-1">密碼</label><input type="password" required className="w-full p-3 bg-gray-50 border rounded-lg" value={password} onChange={e => setPassword(e.target.value)} /></div>
                                <div><label className="block text-xs font-bold text-gray-700 mb-1">確認密碼</label><input type="password" required className={`w-full p-3 bg-gray-50 border rounded-lg ${!passMatch ? 'border-red-500' : ''}`} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></div>
                            </div>
                            {!passMatch && <p className="text-xs text-red-500 font-bold">⚠️ 密碼不一致</p>}
                        </div>

                        {/* 家長必填資料 (方便您審核) */}
                        {role === 'parent' && (
                            <div className="bg-orange-50 p-5 rounded-xl border border-orange-200">
                                <label className="block text-xs font-bold text-orange-800 mb-3 uppercase tracking-wide">綁定申請資料 (供行政核對)</label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1">學生姓名</label>
                                        <input type="text" className="w-full p-3 bg-white border border-orange-200 rounded-lg" value={childName} onChange={e => setChildName(e.target.value)} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1">就讀班級</label>
                                        <select className="w-full p-3 bg-white border border-orange-200 rounded-lg" value={childGrade} onChange={e => setChildGrade(e.target.value)}>
                                            {ENGLISH_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <label className="flex items-center gap-2 mt-4 cursor-pointer">
                                    <input type="checkbox" className="w-5 h-5 accent-orange-600" checked={childAfterSchool} onChange={e => setChildAfterSchool(e.target.checked)} />
                                    <span className="text-sm font-bold text-gray-700">參加課後輔導</span>
                                </label>
                            </div>
                        )}

                        {errorMsg && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg font-bold">🚫 {errorMsg}</div>}

                        <button type="submit" disabled={loading || !passMatch} className={`w-full py-4 rounded-xl text-white font-bold text-lg shadow-lg flex items-center justify-center gap-2 ${loading ? 'bg-gray-400' : 'bg-gray-800 hover:bg-black'}`}>
                            {loading ? '送出申請中...' : '送出申請 (等待審核)'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}