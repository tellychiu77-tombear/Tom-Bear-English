'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

// 產生班級選項
const ENGLISH_CLASSES = Array.from({ length: 26 }, (_, i) => `CEI-${String.fromCharCode(65 + i)}`);

export default function Onboarding() {
    const [loading, setLoading] = useState(false);
    const [role, setRole] = useState<'parent' | 'teacher'>('parent');

    // 基本資料
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');

    // 🟢 家長專用：多個小孩的陣列
    const [children, setChildren] = useState([
        { name: '', english_grade: '', is_after_school: false }
    ]);

    const router = useRouter();

    // 增加一位小孩欄位
    function addChild() {
        setChildren([...children, { name: '', english_grade: '', is_after_school: false }]);
    }

    // 移除一位小孩欄位
    function removeChild(index: number) {
        const newChildren = [...children];
        newChildren.splice(index, 1);
        setChildren(newChildren);
    }

    // 更新小孩資料
    function updateChild(index: number, field: string, value: any) {
        const newChildren = [...children];
        // @ts-ignore
        newChildren[index][field] = value;
        setChildren(newChildren);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // 1. 更新使用者 Profile (姓名、身分)
        // ADAPTATION: Using 'users' table instead of 'profiles' and 'name' instead of 'full_name' to match schema.
        const { error: profileError } = await supabase.from('users').update({
            name: fullName,       // Schema uses 'name'
            role: role,
            contact_info: { phone: phone } // Schema uses 'contact_info' jsonb
        }).eq('id', session.user.id);

        if (profileError) {
            alert('資料更新失敗: ' + profileError.message);
            setLoading(false);
            return;
        }

        // 2. 如果是家長，批次建立學生資料
        if (role === 'parent') {
            for (const child of children) {
                // 只有當名字有填寫時才建立
                if (child.name.trim()) {

                    // 組合班級字串
                    const parts = [];
                    if (child.english_grade) parts.push(child.english_grade);
                    if (child.is_after_school) parts.push('課後輔導班');
                    const finalGrade = parts.join(', ') || '未分班';

                    // ADAPTATION: Using 'name' instead of 'chinese_name' and 'school_grade' instead of 'grade'
                    await supabase.from('students').insert({
                        parent_id: session.user.id,
                        name: child.name,          // Schema uses 'name'
                        school_grade: finalGrade   // Schema uses 'school_grade'
                    });
                }
            }
        }

        // 3. 完成後跳轉回首頁
        alert('註冊成功！歡迎加入。');
        router.push('/');
    }

    return (
        <div className="min-h-screen bg-blue-50 flex items-center justify-center p-4">
            <div className="bg-white max-w-lg w-full p-8 rounded-xl shadow-2xl animate-fade-in">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-black text-blue-900">👋 歡迎加入！</h1>
                    <p className="text-gray-500 mt-2">初次登入，請填寫基本資料以完成註冊。</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">

                    {/* 真實姓名 */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">您的真實姓名</label>
                        <input
                            type="text"
                            required
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50"
                            placeholder="例: 王大明"
                            value={fullName}
                            onChange={e => setFullName(e.target.value)}
                        />
                    </div>

                    {/* 手機號碼 */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">手機號碼</label>
                        <input
                            type="tel"
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50"
                            placeholder="0912345678"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                        />
                    </div>

                    {/* 身分選擇 */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">申請身分</label>
                        <div className="grid grid-cols-2 gap-4">
                            <div
                                onClick={() => setRole('parent')}
                                className={`cursor-pointer border-2 rounded-xl p-4 text-center transition ${role === 'parent' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-blue-200'}`}
                            >
                                <div className="text-2xl mb-1">🏠</div>
                                <div className="font-bold">我是家長</div>
                            </div>
                            <div
                                onClick={() => setRole('teacher')}
                                className={`cursor-pointer border-2 rounded-xl p-4 text-center transition ${role === 'teacher' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 hover:border-green-200'}`}
                            >
                                <div className="text-2xl mb-1">👩‍🏫</div>
                                <div className="font-bold">我是老師</div>
                            </div>
                        </div>
                    </div>

                    <hr className="border-gray-100" />

                    {/* 🟢 家長專用：小孩資料區 (支援多位) */}
                    {role === 'parent' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <label className="block text-sm font-bold text-gray-700">小孩資料設定</label>
                            </div>

                            {children.map((child, index) => (
                                <div key={index} className="bg-orange-50 p-4 rounded-xl border border-orange-100 relative group">

                                    {/* 標題與移除按鈕 */}
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="text-xs font-bold text-orange-800 bg-orange-200 px-2 py-1 rounded">第 {index + 1} 位小朋友</span>
                                        {children.length > 1 && (
                                            <button type="button" onClick={() => removeChild(index)} className="text-red-400 hover:text-red-600 text-sm font-bold">
                                                移除 ✕
                                            </button>
                                        )}
                                    </div>

                                    <div className="space-y-3">
                                        {/* 小孩姓名 */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">姓名</label>
                                            <input
                                                type="text"
                                                required
                                                className="w-full p-2 border rounded focus:outline-none focus:border-orange-500"
                                                placeholder="輸入小孩名字"
                                                value={child.name}
                                                onChange={e => updateChild(index, 'name', e.target.value)}
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            {/* 英文班級 */}
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 mb-1">英文班級</label>
                                                <select
                                                    className="w-full p-2 border rounded bg-white text-sm"
                                                    value={child.english_grade}
                                                    onChange={e => updateChild(index, 'english_grade', e.target.value)}
                                                >
                                                    <option value="">(無)</option>
                                                    {ENGLISH_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </div>

                                            {/* 課後輔導 */}
                                            <div className="flex items-end">
                                                <label className="flex items-center gap-2 cursor-pointer bg-white px-2 py-2 border rounded w-full h-[38px]">
                                                    <input
                                                        type="checkbox"
                                                        checked={child.is_after_school}
                                                        onChange={e => updateChild(index, 'is_after_school', e.target.checked)}
                                                    />
                                                    <span className="text-xs font-bold text-gray-700">參加課後輔導</span>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* 新增按鈕 */}
                            <button
                                type="button"
                                onClick={addChild}
                                className="w-full py-2 border-2 border-dashed border-orange-300 text-orange-600 rounded-lg font-bold hover:bg-orange-50 transition"
                            >
                                + 新增另一位小朋友
                            </button>
                        </div>
                    )}

                    {/* 送出按鈕 */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-blue-700 transition disabled:opacity-50"
                    >
                        {loading ? '註冊中...' : '送出資料 (Start) 🚀'}
                    </button>

                </form>
            </div>
        </div>
    );
}
