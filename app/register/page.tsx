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

    // 🔴【修正重點】加回被弄丟的欄位
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');

    // 家長專屬資料
    // 家長專屬資料 (多位學生)
    const [children, setChildren] = useState([{ name: '', grade: 'CEI-A', afterSchool: false }]);

    const handleAddChild = () => {
        setChildren([...children, { name: '', grade: 'CEI-A', afterSchool: false }]);
    };

    const handleRemoveChild = (index: number) => {
        setChildren(children.filter((_, i) => i !== index));
    };

    const handleChildChange = (index: number, field: string, value: any) => {
        const newChildren = [...children];
        (newChildren[index] as any)[field] = value;
        setChildren(newChildren);
    };

    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [passMatch, setPassMatch] = useState(true);
    const router = useRouter();

    useEffect(() => { if (confirmPassword) setPassMatch(password === confirmPassword); }, [password, confirmPassword]);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setLoading(true);

        if (password !== confirmPassword) { setErrorMsg('❌ 兩次密碼不一致'); setLoading(false); return; }
        if (password.length < 6) { setErrorMsg('⚠️ 密碼過短'); setLoading(false); return; }
        if (!fullName.trim()) { setErrorMsg('⚠️ 請輸入真實姓名'); setLoading(false); return; }

        // 家長必須填小孩資料
        // 家長必須填小孩資料
        if (role === 'parent') {
            const hasEmptyName = children.some(c => !c.name.trim());
            if (hasEmptyName) { setErrorMsg('⚠️ 請填寫所有學生的姓名'); setLoading(false); return; }
        }

        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) { setErrorMsg('註冊失敗: ' + signUpError.message); setLoading(false); return; }

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            // 1. 建立 Profile (包含姓名電話，狀態 pending)
            await supabase.from('profiles').insert({
                id: user.id,
                email,
                full_name: fullName,
                phone,
                role: 'pending' // 等待審核
            });

            // 2. 家長：建立小孩資料
            // 2. 家長：建立小孩資料
            if (role === 'parent') {
                const studentsToInsert = children.map(child => {
                    let finalGrade = child.grade;
                    if (child.afterSchool) finalGrade += ', 課後輔導班';
                    return {
                        parent_id: user.id,
                        chinese_name: child.name,
                        grade: finalGrade
                    };
                });
                await supabase.from('students').insert(studentsToInsert);
            }
            alert('✅ 註冊申請已送出！\n\n請等待行政人員審核開通。');
            router.push('/');
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row animate-fade-in-up">
                {/* 左側形象區 */}
                <div className="hidden md:flex w-1/3 bg-gradient-to-br from-indigo-800 to-blue-900 text-white p-8 flex-col justify-center text-center">
                    <div className="text-6xl mb-4">📝</div>
                    <h2 className="text-2xl font-black mb-2">註冊申請</h2>
                    <p className="opacity-80 text-sm">Tom Bear 智慧校園</p>
                </div>

                {/* 右側表單 */}
                <div className="w-full md:w-2/3 p-8 relative overflow-y-auto max-h-[90vh]">
                    <button onClick={() => router.push('/')} className="absolute top-6 right-6 text-gray-400 hover:text-indigo-600 text-sm font-bold">已有帳號？登入 &rarr;</button>

                    <h2 className="text-2xl font-bold text-gray-800 mb-6">填寫資料</h2>

                    <form onSubmit={handleRegister} className="space-y-4">

                        {/* 身分選擇 */}
                        <div className="grid grid-cols-2 gap-4">
                            <button type="button" onClick={() => setRole('parent')} className={`py-3 rounded-lg border-2 font-bold flex items-center justify-center gap-2 ${role === 'parent' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-400'}`}>
                                <span>👨‍👩‍👧‍👦</span> 家長
                            </button>
                            <button type="button" onClick={() => setRole('teacher')} className={`py-3 rounded-lg border-2 font-bold flex items-center justify-center gap-2 ${role === 'teacher' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-400'}`}>
                                <span>🧑‍🏫</span> 老師
                            </button>
                        </div>

                        {/* 基本資料 */}
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-xs font-bold text-gray-500">姓名</label><input type="text" required className="w-full p-2 border rounded" value={fullName} onChange={e => setFullName(e.target.value)} /></div>
                            <div><label className="text-xs font-bold text-gray-500">電話</label><input type="tel" required className="w-full p-2 border rounded" value={phone} onChange={e => setPhone(e.target.value)} /></div>
                        </div>
                        <div><label className="text-xs font-bold text-gray-500">Email</label><input type="email" required className="w-full p-2 border rounded" value={email} onChange={e => setEmail(e.target.value)} /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-xs font-bold text-gray-500">密碼</label><input type="password" required className="w-full p-2 border rounded" value={password} onChange={e => setPassword(e.target.value)} /></div>
                            <div><label className="text-xs font-bold text-gray-500">確認</label><input type="password" required className="w-full p-2 border rounded" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></div>
                        </div>

                        {/* 家長專屬：小孩資料 */}
                        {role === 'parent' && (
                            <div className="bg-orange-50 p-5 rounded-xl border border-orange-200">
                                <label className="block text-xs font-bold text-orange-800 mb-3 uppercase">步驟 3：綁定學生資料</label>

                                {children.map((child, index) => (
                                    <div key={index} className="mb-4 pb-4 border-b border-orange-200 last:border-0">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-bold text-orange-600">學生 {index + 1}</span>
                                            {children.length > 1 && (
                                                <button type="button" onClick={() => handleRemoveChild(index)} className="text-red-500 text-xs hover:underline">🗑️ 刪除</button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <input
                                                type="text"
                                                placeholder="學生姓名"
                                                className="w-full p-2 border rounded"
                                                value={child.name}
                                                onChange={e => handleChildChange(index, 'name', e.target.value)}
                                            />
                                            <select
                                                className="w-full p-2 border rounded"
                                                value={child.grade}
                                                onChange={e => handleChildChange(index, 'grade', e.target.value)}
                                            >
                                                {ENGLISH_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>
                                        <label className="flex items-center gap-2 mt-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="accent-orange-600"
                                                checked={child.afterSchool}
                                                onChange={e => handleChildChange(index, 'afterSchool', e.target.checked)}
                                            />
                                            <span className="text-sm text-gray-700 font-bold">有參加安親</span>
                                        </label>
                                    </div>
                                ))}

                                <button type="button" onClick={handleAddChild} className="w-full py-2 bg-white border-2 border-dashed border-orange-300 text-orange-500 rounded-lg font-bold hover:bg-orange-100 transition">
                                    + 新增另一位學生
                                </button>
                            </div>
                        )}

                        {errorMsg && <div className="text-red-500 text-sm font-bold">{errorMsg}</div>}

                        <button type="submit" disabled={loading} className="w-full py-3 bg-indigo-800 text-white font-bold rounded-lg hover:bg-indigo-900">
                            {loading ? '處理中...' : '送出申請'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}