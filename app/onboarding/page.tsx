'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

const ENGLISH_CLASSES = Array.from({ length: 26 }, (_, i) => `CEI-${String.fromCharCode(65 + i)}`);

export default function Onboarding() {
    const [loading, setLoading] = useState(false);
    const [applyRole, setApplyRole] = useState<'parent' | 'teacher'>('parent');
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');

    // 預設小孩列表
    const [children, setChildren] = useState([
        { name: '', english_grade: '', is_after_school: false }
    ]);

    // 🟢 自動找到的小孩
    const [foundChildren, setFoundChildren] = useState<any[]>([]);

    const router = useRouter();

    // 畫面載入時，自動執行「尋找小孩」任務
    useEffect(() => {
        checkExistingChildren();
    }, []);

    async function checkExistingChildren() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || !session.user.email) return;

        const userEmail = session.user.email;

        // 1. 搜尋：有沒有學生的 parent_email 剛好是我的 Email？
        const { data: matchedStudents } = await supabase
            .from('students')
            .select('*')
            .eq('parent_email', userEmail); // 找 Email 符合的

        if (matchedStudents && matchedStudents.length > 0) {
            setFoundChildren(matchedStudents);

            // 🟢 自動綁定！(把 parent_id 補上去)
            // 這一步是關鍵：一旦發現 Email 對上了，立刻把這個學生歸戶給現在登入的這個人
            await supabase
                .from('students')
                .update({ parent_id: session.user.id })
                .eq('parent_email', userEmail);
        }
    }

    function addChild() {
        setChildren([...children, { name: '', english_grade: '', is_after_school: false }]);
    }

    function removeChild(index: number) {
        setChildren(children.filter((_, i) => i !== index));
    }

    function updateChild(index: number, field: string, value: any) {
        setChildren(prev => prev.map((child, i) => i === index ? { ...child, [field]: value } : child));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // 1. 更新 Profile
        const nameWithNote = `${fullName} (${applyRole === 'parent' ? '申請家長' : '申請老師'})`;
        const { error } = await supabase.from('profiles').update({
            full_name: nameWithNote,
            role: 'pending',
        }).eq('id', session.user.id);

        if (error) { alert('更新失敗: ' + error.message); setLoading(false); return; }

        // 2. 如果是申請家長，且有填寫「額外」的小孩，才新增
        // (如果已經有 foundChildren，代表老師建好了，這裡就不用再建，除非有第二個小孩)
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

        alert('申請已送出！待行政人員開通後即可使用。');
        router.push('/');
    }

    return (
        <div className="min-h-screen bg-blue-50 flex items-center justify-center p-4">
            <div className="bg-white max-w-lg w-full p-8 rounded-xl shadow-2xl animate-fade-in">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-black text-blue-900">📝 註冊申請</h1>
                    <p className="text-gray-500 mt-2">請填寫基本資料。</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">真實姓名</label>
                        <input type="text" required className="w-full p-3 border rounded-lg" placeholder="例: 王大明" value={fullName} onChange={e => setFullName(e.target.value)} />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">手機號碼</label>
                        <input type="tel" className="w-full p-3 border rounded-lg" placeholder="0912345678" value={phone} onChange={e => setPhone(e.target.value)} />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">申請身分</label>
                        <div className="grid grid-cols-2 gap-4">
                            <div onClick={() => setApplyRole('parent')} className={`cursor-pointer border-2 rounded-xl p-4 text-center transition ${applyRole === 'parent' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-blue-200'}`}>🏠 申請當家長</div>
                            <div onClick={() => setApplyRole('teacher')} className={`cursor-pointer border-2 rounded-xl p-4 text-center transition ${applyRole === 'teacher' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 hover:border-green-200'}`}>👩‍🏫 申請當老師</div>
                        </div>
                    </div>

                    <hr className="border-gray-100" />

                    {/* 🟢 自動找到的小孩顯示區 */}
                    {applyRole === 'parent' && foundChildren.length > 0 && (
                        <div className="bg-green-50 p-4 rounded-xl border border-green-200 mb-4 animate-fade-in">
                            <h3 className="text-green-800 font-bold text-sm mb-2">🎉 系統自動找到您的孩子：</h3>
                            <ul className="space-y-2">
                                {foundChildren.map(child => (
                                    <li key={child.id} className="flex items-center gap-2 bg-white p-2 rounded border border-green-100 shadow-sm">
                                        <span className="text-xl">👶</span>
                                        <span className="font-bold text-gray-700">{child.chinese_name}</span>
                                        <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500">{child.grade}</span>
                                        <span className="ml-auto text-xs text-green-600 font-bold bg-green-100 px-2 py-1 rounded-full">已連結 ✅</span>
                                    </li>
                                ))}
                            </ul>
                            <p className="text-xs text-green-600 mt-2 font-bold">* 這些孩子已經自動歸戶，您 **不需要** 在下方重複填寫。</p>
                        </div>
                    )}

                    {/* 手動新增區 */}
                    {applyRole === 'parent' && (
                        <div className="space-y-4">
                            <label className="block text-sm font-bold text-gray-700">
                                {foundChildren.length > 0 ? '還有其他小孩嗎？(若無請留空)' : '小孩資料設定'}
                            </label>

                            {children.map((child, index) => (
                                <div key={index} className="bg-orange-50 p-4 rounded-xl border border-orange-100 relative">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-bold text-orange-800 bg-orange-200 px-2 py-1 rounded">
                                            {foundChildren.length > 0 ? `額外新增第 ${index + 1} 位` : `第 ${index + 1} 位`}
                                        </span>
                                        {children.length > 1 && <button type="button" onClick={() => removeChild(index)} className="text-red-400 text-xs font-bold">移除 ✕</button>}
                                    </div>

                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">姓名</label>
                                            <input type="text" className="w-full p-2 border rounded" placeholder="姓名" value={child.name} onChange={e => updateChild(index, 'name', e.target.value)} />
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="w-1/2">
                                                <label className="block text-xs font-bold text-gray-600 mb-1">英文班級</label>
                                                <select className="w-full p-2 border rounded text-sm bg-white" value={child.english_grade} onChange={e => updateChild(index, 'english_grade', e.target.value)}>
                                                    <option value="">(無)</option>
                                                    {ENGLISH_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </div>
                                            <div className="w-1/2 flex items-end">
                                                <label className="flex items-center gap-2 bg-white border rounded px-2 w-full h-[38px] cursor-pointer">
                                                    <input type="checkbox" checked={child.is_after_school} onChange={e => updateChild(index, 'is_after_school', e.target.checked)} />
                                                    <span className="text-xs font-bold text-gray-700">參加課輔</span>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <button type="button" onClick={addChild} className="w-full py-2 border-2 border-dashed border-orange-300 text-orange-600 rounded-lg text-sm font-bold hover:bg-orange-50 transition">+ 還有其他小孩</button>
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