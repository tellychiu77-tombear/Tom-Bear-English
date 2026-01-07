'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

const ENGLISH_CLASSES = Array.from({ length: 26 }, (_, i) => `CEI-${String.fromCharCode(65 + i)}`);

export default function Onboarding() {
    const [loading, setLoading] = useState(false);
    // 這裡只紀錄使用者「想申請」的身分，實際送出給資料庫會是 'pending'
    const [applyRole, setApplyRole] = useState<'parent' | 'teacher'>('parent');

    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');

    // 🟢 修復輸入框 Bug：使用更穩定的 State 更新方式
    const [children, setChildren] = useState([
        { name: '', english_grade: '', is_after_school: false }
    ]);

    const router = useRouter();

    function addChild() {
        setChildren([...children, { name: '', english_grade: '', is_after_school: false }]);
    }

    function removeChild(index: number) {
        setChildren(children.filter((_, i) => i !== index));
    }

    // 🟢 關鍵修正：確保這裡的更新不會導致輸入框失去焦點
    function updateChild(index: number, field: string, value: any) {
        setChildren(prev => prev.map((child, i) => {
            if (i === index) {
                return { ...child, [field]: value };
            }
            return child;
        }));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // 1. 更新 Profile：將身分設為 'pending' (審核中)
        // 我們把使用者「想申請的身分」備註在 full_name 後面，方便主任審核時參考
        const nameWithNote = `${fullName} (${applyRole === 'parent' ? '申請家長' : '申請老師'})`;

        const { error: profileError } = await supabase.from('profiles').update({
            full_name: nameWithNote,
            role: 'pending', // 🟢 關鍵：先鎖住權限，等待審核
        }).eq('id', session.user.id);

        if (profileError) {
            alert('更新失敗: ' + profileError.message);
            setLoading(false);
            return;
        }

        // 2. 如果是申請家長，先預先建立學生資料 (雖然後台還沒審核，但先存起來)
        if (applyRole === 'parent') {
            for (const child of children) {
                if (child.name.trim()) {
                    const parts = [];
                    if (child.english_grade) parts.push(child.english_grade);
                    if (child.is_after_school) parts.push('課後輔導班');
                    const finalGrade = parts.join(', ') || '未分班';

                    await supabase.from('students').insert({
                        parent_id: session.user.id,
                        chinese_name: child.name,
                        grade: finalGrade
                    });
                }
            }
        }

        alert('資料已送出！請通知行政人員進行審核開通。');
        router.push('/'); // 回首頁，首頁會顯示「等待審核」畫面
    }

    return (
        <div className="min-h-screen bg-blue-50 flex items-center justify-center p-4">
            <div className="bg-white max-w-lg w-full p-8 rounded-xl shadow-2xl animate-fade-in">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-black text-blue-900">📝 註冊申請</h1>
                    <p className="text-gray-500 mt-2">請填寫資料，送出後將由行政人員審核。</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">真實姓名</label>
                        <input
                            type="text" required
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50"
                            placeholder="例: 王大明"
                            value={fullName}
                            onChange={e => setFullName(e.target.value)}
                        />
                    </div>

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

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">申請身分</label>
                        <div className="grid grid-cols-2 gap-4">
                            <div onClick={() => setApplyRole('parent')}
                                className={`cursor-pointer border-2 rounded-xl p-4 text-center transition ${applyRole === 'parent' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-blue-200'}`}>
                                <div className="text-2xl mb-1">🏠</div><div className="font-bold">申請當家長</div>
                            </div>
                            <div onClick={() => setApplyRole('teacher')}
                                className={`cursor-pointer border-2 rounded-xl p-4 text-center transition ${applyRole === 'teacher' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 hover:border-green-200'}`}>
                                <div className="text-2xl mb-1">👩‍🏫</div><div className="font-bold">申請當老師</div>
                            </div>
                        </div>
                    </div>

                    <hr className="border-gray-100" />

                    {/* 只有申請家長才顯示小孩欄位 */}
                    {applyRole === 'parent' && (
                        <div className="space-y-4">
                            <label className="block text-sm font-bold text-gray-700">小孩資料設定</label>
                            {children.map((child, index) => (
                                <div key={index} className="bg-orange-50 p-4 rounded-xl border border-orange-100 relative">
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="text-xs font-bold text-orange-800 bg-orange-200 px-2 py-1 rounded">第 {index + 1} 位</span>
                                        {children.length > 1 && (
                                            <button type="button" onClick={() => removeChild(index)} className="text-red-400 hover:text-red-600 text-sm font-bold">移除 ✕</button>
                                        )}
                                    </div>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">姓名</label>
                                            <input type="text" required className="w-full p-2 border rounded" placeholder="輸入小孩名字"
                                                value={child.name} onChange={e => updateChild(index, 'name', e.target.value)} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 mb-1">英文班級</label>
                                                <select className="w-full p-2 border rounded bg-white text-sm"
                                                    value={child.english_grade} onChange={e => updateChild(index, 'english_grade', e.target.value)}>
                                                    <option value="">(無)</option>
                                                    {ENGLISH_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </div>
                                            <div className="flex items-end">
                                                <label className="flex items-center gap-2 cursor-pointer bg-white px-2 py-2 border rounded w-full h-[38px]">
                                                    <input type="checkbox" checked={child.is_after_school} onChange={e => updateChild(index, 'is_after_school', e.target.checked)} />
                                                    <span className="text-xs font-bold text-gray-700">參加課輔</span>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <button type="button" onClick={addChild} className="w-full py-2 border-2 border-dashed border-orange-300 text-orange-600 rounded-lg font-bold hover:bg-orange-50 transition">+ 新增另一位小朋友</button>
                        </div>
                    )}

                    <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-blue-700 transition disabled:opacity-50">
                        {loading ? '處理中...' : '送出申請 (等待審核)'}
                    </button>
                </form>
            </div>
        </div>
    );
}