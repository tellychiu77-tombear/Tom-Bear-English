'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

// ✅ Issue #6：備用班級列表（A-Z），實際上會從資料庫動態載入
const FALLBACK_CLASSES = Array.from({ length: 26 }, (_, i) => `CEI-${String.fromCharCode(65 + i)}`);

// ✅ Issue #2 延伸：註冊錯誤中文化
function getChineseRegisterError(message: string): string {
    if (message.includes('already registered') || message.includes('already been registered') || message.includes('User already registered')) {
        return '此電子郵件已有帳號，請直接登入';
    }
    if (message.includes('Password should be at least')) return '密碼至少需要 6 個字元';
    if (message.includes('Unable to validate email')) return '電子郵件格式不正確';
    if (message.includes('Signup is disabled')) return '目前暫停開放新帳號申請';
    return '註冊失敗，請確認資料後再試';
}

export default function RegisterPage() {
    const [role, setRole] = useState<'parent' | 'teacher'>('parent');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');

    // ✅ Issue #6：從 DB 動態載入真實班級清單
    const [availableClasses, setAvailableClasses] = useState<string[]>(FALLBACK_CLASSES);

    // 家長專屬：多位學生
    const [children, setChildren] = useState([{ name: '', grade: '', afterSchool: false }]);

    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [passMatch, setPassMatch] = useState(true);
    const router = useRouter();

    // ✅ 載入真實班級清單
    useEffect(() => {
        async function loadClasses() {
            const { data } = await supabase
                .from('schedule_slots')
                .select('class_group')
                .order('class_group');
            if (data && data.length > 0) {
                const unique = Array.from(new Set(data.map((d: any) => d.class_group as string))).sort();
                setAvailableClasses(unique);
                setChildren([{ name: '', grade: unique[0] || 'CEI-A', afterSchool: false }]);
            }
        }
        loadClasses();
    }, []);

    useEffect(() => {
        if (confirmPassword) setPassMatch(password === confirmPassword);
    }, [password, confirmPassword]);

    const handleAddChild = () => {
        setChildren([...children, { name: '', grade: availableClasses[0] || 'CEI-A', afterSchool: false }]);
    };

    const handleRemoveChild = (index: number) => {
        setChildren(children.filter((_, i) => i !== index));
    };

    const handleChildChange = (index: number, field: string, value: any) => {
        const newChildren = [...children];
        (newChildren[index] as any)[field] = value;
        setChildren(newChildren);
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setLoading(true);

        if (password !== confirmPassword) { setErrorMsg('❌ 兩次密碼不一致'); setLoading(false); return; }
        if (password.length < 6) { setErrorMsg('⚠️ 密碼至少需要 6 個字元'); setLoading(false); return; }
        if (!fullName.trim()) { setErrorMsg('⚠️ 請輸入真實姓名'); setLoading(false); return; }

        if (role === 'parent') {
            const hasEmptyName = children.some(c => !c.name.trim());
            if (hasEmptyName) { setErrorMsg('⚠️ 請填寫所有學生的姓名'); setLoading(false); return; }
        }

        // ✅ 修正：直接用 signUp 回傳的 user，而非 getUser()
        // getUser() 在 email 驗證開啟時可能回傳舊的登入者或 null，導致 pending 記錄寫入失敗
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) {
            setErrorMsg('❌ ' + getChineseRegisterError(signUpError.message));
            setLoading(false);
            return;
        }

        const user = signUpData?.user;
        if (user) {
            // 寫入 users 表，強制 role='pending', is_approved=false
            const { error: upsertError } = await supabase.from('users').upsert({
                id: user.id,
                email,
                name: fullName,
                phone,
                role: 'pending',
                is_approved: false
            }, { onConflict: 'id' });

            if (upsertError) {
                console.error('users upsert error:', upsertError);
            }

            // 家長：建立子女資料
            if (role === 'parent') {
                const studentsToInsert = children.map(child => {
                    let finalGrade = child.grade;
                    if (child.afterSchool) finalGrade += ', 課後輔導';
                    return {
                        parent_id: user.id,
                        chinese_name: child.name,
                        grade: finalGrade
                    };
                });
                await supabase.from('students').insert(studentsToInsert);
            }

            router.push('/');
        } else {
            // email 驗證流程：user 尚未建立 session，顯示提示
            setErrorMsg('📧 註冊申請已送出，請確認您的電子郵件後再登入。');
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            {/* ✅ Issue #8：移除 max-h 限制，讓頁面自然展開不截斷 */}
            <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row animate-fade-in-up">

                {/* 左側形象區 */}
                <div className="hidden md:flex w-1/3 bg-gradient-to-br from-indigo-800 to-blue-900 text-white p-8 flex-col justify-center text-center">
                    <div className="text-6xl mb-4">📝</div>
                    <h2 className="text-2xl font-black mb-2">註冊申請</h2>
                    <p className="opacity-80 text-sm">Tom Bear 智慧補習班</p>
                    <div className="mt-8 text-left text-xs opacity-70 space-y-2">
                        <p>✅ 家長可查看孩子成績與課堂記錄</p>
                        <p>✅ 隨時與老師即時溝通</p>
                        <p>✅ 線上請假，方便快速</p>
                    </div>
                </div>

                {/* 右側表單 */}
                <div className="w-full md:w-2/3 p-8 overflow-y-auto">
                    <button onClick={() => router.push('/')}
                        className="absolute top-6 right-6 text-gray-400 hover:text-indigo-600 text-sm font-bold hidden md:block">
                        已有帳號？登入 &rarr;
                    </button>

                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-gray-800">填寫資料</h2>
                        <button onClick={() => router.push('/')}
                            className="md:hidden text-sm text-indigo-600 font-bold">
                            已有帳號？登入 →
                        </button>
                    </div>

                    <form onSubmit={handleRegister} className="space-y-4">

                        {/* 身分選擇 */}
                        <div className="grid grid-cols-2 gap-4">
                            <button type="button" onClick={() => setRole('parent')}
                                className={`py-3 rounded-lg border-2 font-bold flex items-center justify-center gap-2
                                    ${role === 'parent' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-400'}`}>
                                <span>👨‍👩‍👧‍👦</span> 家長
                            </button>
                            <button type="button" onClick={() => setRole('teacher')}
                                className={`py-3 rounded-lg border-2 font-bold flex items-center justify-center gap-2
                                    ${role === 'teacher' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-400'}`}>
                                <span>🧑‍🏫</span> 老師
                            </button>
                        </div>

                        {/* 基本資料 */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500">姓名 <span className="text-red-400">*</span></label>
                                <input type="text" required
                                    placeholder="請輸入真實姓名"
                                    className="w-full p-2 border rounded mt-1"
                                    value={fullName} onChange={e => setFullName(e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500">聯絡電話</label>
                                <input type="tel"
                                    placeholder="例：0912-345-678"
                                    className="w-full p-2 border rounded mt-1"
                                    value={phone} onChange={e => setPhone(e.target.value)} />
                            </div>
                        </div>

                        <div>
                            {/* ✅ Issue #10：Email 標籤改為中文 */}
                            <label className="text-xs font-bold text-gray-500">電子郵件 <span className="text-red-400">*</span></label>
                            <input type="email" required
                                placeholder="請輸入電子郵件（將作為登入帳號）"
                                className="w-full p-2 border rounded mt-1"
                                value={email} onChange={e => setEmail(e.target.value)} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500">密碼 <span className="text-red-400">*</span></label>
                                <input type="password" required
                                    placeholder="至少 6 個字元"
                                    className="w-full p-2 border rounded mt-1"
                                    value={password} onChange={e => setPassword(e.target.value)} />
                            </div>
                            <div>
                                {/* ✅ Issue #9：「確認」→「確認密碼」 */}
                                <label className="text-xs font-bold text-gray-500">確認密碼 <span className="text-red-400">*</span></label>
                                <input type="password" required
                                    placeholder="再次輸入密碼"
                                    className={`w-full p-2 border rounded mt-1 ${!passMatch && confirmPassword ? 'border-red-400' : ''}`}
                                    value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                                {!passMatch && confirmPassword && (
                                    <p className="text-red-500 text-xs mt-1">密碼不一致</p>
                                )}
                            </div>
                        </div>

                        {/* ✅ Issue #5 & #7：家長專屬學生綁定區塊 */}
                        {role === 'parent' && (
                            <div className="bg-orange-50 p-5 rounded-xl border border-orange-200">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-lg">👶</span>
                                    <label className="text-sm font-bold text-orange-800">綁定您的孩子</label>
                                </div>
                                {/* ✅ Issue #7：加入說明提示文字 */}
                                <p className="text-xs text-orange-600 mb-4">
                                    請填寫孩子的中文全名與班級，行政人員將核對資料後開通您的帳號。
                                </p>

                                {children.map((child, index) => (
                                    <div key={index} className="mb-4 pb-4 border-b border-orange-200 last:border-0">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-bold text-orange-600">學生 {index + 1}</span>
                                            {children.length > 1 && (
                                                <button type="button" onClick={() => handleRemoveChild(index)}
                                                    className="text-red-500 text-xs hover:underline">
                                                    🗑️ 移除
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <input
                                                    type="text"
                                                    placeholder="學生中文全名，例：王大明"
                                                    className="w-full p-2 border rounded text-sm"
                                                    value={child.name}
                                                    onChange={e => handleChildChange(index, 'name', e.target.value)} />
                                            </div>
                                            <div>
                                                {/* ✅ Issue #6：使用從 DB 動態載入的班級清單 */}
                                                <select
                                                    className="w-full p-2 border rounded text-sm"
                                                    value={child.grade}
                                                    onChange={e => handleChildChange(index, 'grade', e.target.value)}>
                                                    <option value="">— 選擇班級 —</option>
                                                    {availableClasses.map(c => (
                                                        <option key={c} value={c}>{c}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <label className="flex items-center gap-2 mt-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="accent-orange-600"
                                                checked={child.afterSchool}
                                                onChange={e => handleChildChange(index, 'afterSchool', e.target.checked)} />
                                            <span className="text-sm text-gray-700 font-bold">有參加安親班</span>
                                        </label>
                                    </div>
                                ))}

                                <button type="button" onClick={handleAddChild}
                                    className="w-full py-2 bg-white border-2 border-dashed border-orange-300 text-orange-500 rounded-lg font-bold hover:bg-orange-100 transition text-sm">
                                    + 新增另一位孩子
                                </button>
                            </div>
                        )}

                        {errorMsg && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm font-medium">
                                {errorMsg}
                            </div>
                        )}

                        <button type="submit" disabled={loading}
                            className="w-full py-3 bg-indigo-800 text-white font-bold rounded-lg hover:bg-indigo-900 disabled:opacity-50 transition">
                            {loading ? '處理中...' : '送出申請'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
