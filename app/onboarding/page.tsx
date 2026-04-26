'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { useToast, TOAST_CLASSES } from '@/lib/useToast';

type Step = 'role' | 'info' | 'bind' | 'done';

export default function Onboarding() {
    const router = useRouter();
    const { toast, showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState<Step>('role');
    const [applyRole, setApplyRole] = useState<'parent' | 'teacher'>('parent');
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');

    // 家長綁定用
    const [chineseName, setChineseName] = useState('');
    const [englishName, setEnglishName] = useState('');
    const [bindResult, setBindResult] = useState<'idle' | 'matched' | 'not_found' | 'submitted'>('idle');
    const [matchedStudent, setMatchedStudent] = useState<any>(null);
    const [session, setSession] = useState<any>(null);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) router.push('/');
            else setSession(session);
        });
    }, []);

    // Step 1 → Step 2：儲存基本資料
    async function handleSaveInfo(e: React.FormEvent) {
        e.preventDefault();
        if (!fullName.trim()) { showToast('請輸入姓名', 'error'); return; }
        setLoading(true);
        const { error } = await supabase.from('users').upsert({
            id: session.user.id,
            name: fullName.trim(),
            role: applyRole === 'teacher' ? 'pending' : 'parent',
            is_approved: applyRole === 'teacher' ? false : true,
        });
        setLoading(false);
        if (error) { showToast('更新失敗：' + error.message, 'error'); return; }
        if (applyRole === 'teacher') {
            showToast('申請已送出！待行政人員審核後即可使用。');
            router.push('/');
        } else {
            setStep('bind');
        }
    }

    // Step 3（家長）：比對學生
    async function handleBindSearch(e: React.FormEvent) {
        e.preventDefault();
        if (!chineseName.trim() && !englishName.trim()) { showToast('請至少填入孩子的中文姓名或英文名', 'error'); return; }
        if (!phone.trim()) { showToast('請先填入手機號碼', 'error'); return; }
        setLoading(true);
        setBindResult('idle');

        const cleanPhone = phone.trim().replace(/[-\s]/g, '');

        let query = supabase
            .from('students')
            .select('id, chinese_name, english_name, grade, school_grade')
            .or(`parent_phone.eq.${cleanPhone},parent_2_phone.eq.${cleanPhone}`);

        if (chineseName.trim()) query = query.eq('chinese_name', chineseName.trim());
        if (englishName.trim()) query = query.ilike('english_name', englishName.trim());

        const { data: matched } = await query.limit(1).maybeSingle();

        if (matched) {
            setMatchedStudent(matched);
            setBindResult('matched');
        } else {
            setBindResult('not_found');
        }
        setLoading(false);
    }

    // 送出綁定申請
    async function handleSubmitRequest() {
        setLoading(true);
        const cleanPhone = phone.trim().replace(/[-\s]/g, '');
        const { error } = await supabase.from('student_link_requests').insert({
            parent_id: session.user.id,
            submitted_chinese_name: chineseName.trim(),
            submitted_english_name: englishName.trim(),
            submitted_phone: cleanPhone,
            matched_student_id: matchedStudent?.id || null,
            status: 'pending',
        });
        setLoading(false);
        if (error) { showToast('送出失敗：' + error.message, 'error'); return; }
        setBindResult('submitted');
        setStep('done');
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
            {toast && (
                <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-white font-bold text-sm ${TOAST_CLASSES[toast.type]}`}>
                    {toast.msg}
                </div>
            )}
            <div className="bg-white max-w-lg w-full p-8 rounded-2xl shadow-2xl">

                {/* Step 指示器 */}
                {step !== 'done' && (
                    <div className="flex items-center justify-center gap-2 mb-8">
                        {(['role', 'info', 'bind'] as Step[]).map((s, i) => (
                            <div key={s} className="flex items-center gap-2">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black transition ${
                                    step === s ? 'bg-indigo-600 text-white' :
                                    ['role','info','bind'].indexOf(step) > i ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'
                                }`}>{['role','info','bind'].indexOf(step) > i ? '✓' : i + 1}</div>
                                {i < 2 && <div className="w-8 h-0.5 bg-gray-200" />}
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Step 1: 選擇身分 ── */}
                {step === 'role' && (
                    <div className="space-y-6">
                        <div className="text-center">
                            <h1 className="text-2xl font-black text-gray-800">歡迎！請選擇身分</h1>
                            <p className="text-gray-500 text-sm mt-1">選擇您的申請類型</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <button type="button" onClick={() => setApplyRole('parent')} className={`border-2 rounded-2xl p-6 text-center transition ${applyRole === 'parent' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-200'}`}>
                                <div className="text-4xl mb-2">🏠</div>
                                <div className="font-black text-gray-800">家長</div>
                                <div className="text-xs text-gray-500 mt-1">查看孩子的聯絡簿</div>
                            </button>
                            <button type="button" onClick={() => setApplyRole('teacher')} className={`border-2 rounded-2xl p-6 text-center transition ${applyRole === 'teacher' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-200'}`}>
                                <div className="text-4xl mb-2">👩‍🏫</div>
                                <div className="font-black text-gray-800">老師 / 員工</div>
                                <div className="text-xs text-gray-500 mt-1">需要管理員審核</div>
                            </button>
                        </div>
                        <button type="button" onClick={() => setStep('info')} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition">
                            下一步 →
                        </button>
                    </div>
                )}

                {/* ── Step 2: 填寫基本資料 ── */}
                {step === 'info' && (
                    <form onSubmit={handleSaveInfo} className="space-y-5">
                        <div className="text-center">
                            <h1 className="text-2xl font-black text-gray-800">基本資料</h1>
                            <p className="text-gray-500 text-sm mt-1">請填寫您的真實姓名</p>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">真實姓名 *</label>
                            <input type="text" required className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-indigo-300 outline-none" placeholder="例：王大明" value={fullName} onChange={e => setFullName(e.target.value)} />
                        </div>
                        {applyRole === 'parent' && (
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">手機號碼 *（用於比對孩子資料）</label>
                                <input type="tel" required className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-indigo-300 outline-none" placeholder="0912345678" value={phone} onChange={e => setPhone(e.target.value)} />
                                <p className="text-xs text-gray-400 mt-1">請填入孩子學籍上登記的家長手機號碼</p>
                            </div>
                        )}
                        <div className="flex gap-3">
                            <button type="button" onClick={() => setStep('role')} className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition">← 返回</button>
                            <button type="submit" disabled={loading} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition disabled:opacity-50">
                                {loading ? '處理中...' : applyRole === 'teacher' ? '送出申請' : '下一步 →'}
                            </button>
                        </div>
                    </form>
                )}

                {/* ── Step 3: 家長綁定孩子 ── */}
                {step === 'bind' && (
                    <div className="space-y-5">
                        <div className="text-center">
                            <h1 className="text-2xl font-black text-gray-800">🔗 連結您的孩子</h1>
                            <p className="text-gray-500 text-sm mt-1">填入孩子的姓名，系統自動比對學籍</p>
                        </div>

                        <form onSubmit={handleBindSearch} className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">孩子中文姓名</label>
                                    <input type="text" className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-indigo-300 outline-none" placeholder="例：王小明" value={chineseName} onChange={e => setChineseName(e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">孩子英文名</label>
                                    <input type="text" className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-indigo-300 outline-none" placeholder="例：Ryan" value={englishName} onChange={e => setEnglishName(e.target.value)} />
                                </div>
                            </div>
                            <p className="text-xs text-gray-400 bg-gray-50 px-3 py-2 rounded-lg">📱 登記電話：{phone}（上一步填入）</p>
                            <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition disabled:opacity-50">
                                {loading ? '比對中...' : '🔍 比對孩子資料'}
                            </button>
                        </form>

                        {/* 比對結果：找到 */}
                        {bindResult === 'matched' && matchedStudent && (
                            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3 animate-fade-in">
                                <div className="flex items-center gap-2 text-green-700 font-bold text-sm">
                                    <span className="text-lg">✅</span> 找到您的孩子！
                                </div>
                                <div className="bg-white rounded-xl p-3 border border-green-100 flex items-center gap-3">
                                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center font-black text-indigo-600 text-lg">
                                        {matchedStudent.chinese_name?.[0] || matchedStudent.english_name?.[0]}
                                    </div>
                                    <div>
                                        <div className="font-black text-gray-800">{matchedStudent.chinese_name} <span className="text-gray-400 font-normal text-sm">{matchedStudent.english_name}</span></div>
                                        <div className="text-xs text-gray-500">{matchedStudent.grade} · {matchedStudent.school_grade}</div>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500">申請送出後需管理員確認，通常 1 個工作天內完成。</p>
                                <button type="button" onClick={handleSubmitRequest} disabled={loading} className="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition disabled:opacity-50">
                                    {loading ? '送出中...' : '📨 送出綁定申請'}
                                </button>
                            </div>
                        )}

                        {/* 比對結果：找不到 */}
                        {bindResult === 'not_found' && (
                            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3 animate-fade-in">
                                <div className="font-bold text-orange-700 text-sm">⚠️ 找不到符合的學生資料</div>
                                <p className="text-sm text-gray-600">請確認姓名和電話是否正確，或聯絡老師協助處理。</p>
                                <button type="button" onClick={handleSubmitRequest} disabled={loading} className="w-full bg-orange-500 text-white py-2.5 rounded-xl font-bold hover:bg-orange-600 transition text-sm disabled:opacity-50">
                                    {loading ? '送出中...' : '仍要送出申請（請老師手動核對）'}
                                </button>
                            </div>
                        )}

                        <button type="button" onClick={() => setStep('done')} className="w-full py-2.5 text-sm text-gray-400 hover:text-gray-600 transition font-bold">
                            暫時跳過，之後再綁定
                        </button>
                    </div>
                )}

                {/* ── 完成頁 ── */}
                {step === 'done' && (
                    <div className="text-center space-y-5 py-4">
                        <div className="text-6xl">{bindResult === 'submitted' ? '🎉' : '✅'}</div>
                        <h1 className="text-2xl font-black text-gray-800">
                            {bindResult === 'submitted' ? '申請送出！' : '設定完成！'}
                        </h1>
                        <p className="text-gray-500 text-sm leading-relaxed">
                            {bindResult === 'submitted'
                                ? '您的綁定申請已送出，管理員審核後即完成連結。通常在 1 個工作天內完成。'
                                : '您的帳號已完成設定。'}
                        </p>
                        <button type="button" onClick={() => router.push('/')} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition">
                            前往首頁 →
                        </button>
                    </div>
                )}

            </div>
        </div>
    );
}
