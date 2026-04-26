'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';

type Tab = 'profile' | 'performance' | 'grades';

// ===== 工具函數 =====

function scoreGrade(s: number) {
    if (s >= 90) return 'A';
    if (s >= 80) return 'B';
    if (s >= 70) return 'C';
    if (s >= 60) return 'D';
    return 'F';
}
function scoreColor(s: number) {
    if (s >= 90) return 'text-green-600';
    if (s >= 80) return 'text-blue-600';
    if (s >= 70) return 'text-purple-600';
    if (s >= 60) return 'text-yellow-600';
    return 'text-red-500';
}
function scoreBadge(s: number) {
    if (s >= 90) return 'bg-green-100 text-green-700';
    if (s >= 80) return 'bg-blue-100 text-blue-700';
    if (s >= 70) return 'bg-purple-100 text-purple-700';
    if (s >= 60) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-600';
}

function moodEmoji(val: number) {
    const map: Record<number, string> = { 1: '😞', 2: '😐', 3: '🙂', 4: '😊', 5: '😄' };
    return map[val] || '—';
}
function focusEmoji(val: number) {
    const map: Record<number, string> = { 1: '😴', 2: '😑', 3: '🙂', 4: '🧐', 5: '🤩' };
    return map[val] || '—';
}
function appetiteEmoji(val: number) {
    const map: Record<number, string> = { 1: '🤢', 2: '😕', 3: '🙂', 4: '😋', 5: '🤤' };
    return map[val] || '—';
}

// ===== Toast =====
function Toast({ msg, type, onClose }: { msg: string; type: 'success' | 'error'; onClose: () => void }) {
    useEffect(() => {
        const t = setTimeout(onClose, 3000);
        return () => clearTimeout(t);
    }, [onClose]);
    return (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-xl font-bold text-sm flex items-center gap-2 animate-fade-in
            ${type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
            {type === 'success' ? '✅' : '❌'} {msg}
            <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">✕</button>
        </div>
    );
}

// ===== 主元件 =====
export default function MyChildPage() {
    const router = useRouter();
    const [loading, setLoading]               = useState(true);
    const [myChildren, setMyChildren]         = useState<any[]>([]);
    const [selectedChild, setSelectedChild]   = useState<any>(null);
    const [recentLogs, setRecentLogs]         = useState<any[]>([]);
    const [recentGrades, setRecentGrades]     = useState<any[]>([]);
    const [activeTab, setActiveTab]           = useState<Tab>('profile');
    const [isEditing, setIsEditing]           = useState(false);
    const [formData, setFormData]             = useState<any>({});
    const [toast, setToast]                   = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [signingId, setSigningId]           = useState<string | null>(null);

    const showToast = useCallback((msg: string, type: 'success' | 'error') => {
        setToast({ msg, type });
    }, []);

    useEffect(() => { fetchMyChildren(); }, []);

    useEffect(() => {
        if (selectedChild) {
            fetchChildDetails(selectedChild.id);
            setFormData(selectedChild);
            setIsEditing(false);
        }
    }, [selectedChild]);

    async function fetchMyChildren() {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }
        const { data: children } = await supabase
            .from('students').select('*').eq('parent_id', session.user.id);
        if (children && children.length > 0) {
            setMyChildren(children);
            setSelectedChild(children[0]);
            setFormData(children[0]);
        }
        setLoading(false);
    }

    async function fetchChildDetails(studentId: string) {
        const [{ data: logs }, { data: grades }] = await Promise.all([
            supabase.from('contact_books').select('*').eq('student_id', studentId).order('date', { ascending: false }).limit(10),
            supabase.from('exam_results').select('*').eq('student_id', studentId).order('exam_date', { ascending: false }).limit(20),
        ]);
        if (logs)   setRecentLogs(logs);
        if (grades) setRecentGrades(grades);
    }

    const handleInputChange = (field: string, value: string) => {
        setFormData((prev: any) => ({ ...prev, [field]: value }));
    };

    const handleSaveProfile = async () => {
        try {
            const updates = {
                english_name:         formData.english_name || null,
                birthday:             formData.birthday || null,
                allergies:            formData.allergies || null,
                special_needs:        formData.special_needs || null,
                parent_relationship:  formData.parent_relationship || null,
                parent_phone:         formData.parent_phone || null,
                parent_2_relationship: formData.parent_2_relationship || null,
                parent_2_phone:       formData.parent_2_phone || null,
                pickup_method:        formData.pickup_method || '家長接送',
            };
            const { error } = await supabase.from('students').update(updates).eq('id', selectedChild.id);
            if (error) throw error;
            showToast('資料更新成功！', 'success');
            setIsEditing(false);
            const updated = { ...selectedChild, ...updates };
            setSelectedChild(updated);
            setMyChildren(prev => prev.map(c => c.id === selectedChild.id ? updated : c));
        } catch (e: any) {
            showToast(`儲存失敗：${e.message}`, 'error');
        }
    };

    const handleSign = async (logId: string) => {
        setSigningId(logId);
        const { error } = await supabase
            .from('contact_books')
            .update({ parent_signature: true })
            .eq('id', logId);
        if (!error) {
            setRecentLogs(prev => prev.map(l => l.id === logId ? { ...l, parent_signature: true } : l));
            showToast('簽名完成！', 'success');
        } else {
            showToast('簽名失敗', 'error');
        }
        setSigningId(null);
    };

    // 成績統計
    const gradeStats = (() => {
        if (!recentGrades.length) return null;
        const scores = recentGrades.map(g => g.score);
        const avg  = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        const best = Math.max(...scores);
        const pass = Math.round((scores.filter(s => s >= 60).length / scores.length) * 100);
        const trend = [...recentGrades].reverse().map(g => ({ name: g.exam_name, score: g.score }));
        return { avg, best, pass, trend };
    })();

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center text-gray-400 animate-pulse text-lg">
            載入學生檔案中...
        </div>
    );

    if (myChildren.length === 0) return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
            <div className="text-6xl">📭</div>
            <p className="text-gray-500 font-bold">尚未連結學生資料</p>
            <button onClick={() => router.push('/')}
                className="px-5 py-2 bg-white border rounded-xl shadow-sm font-bold text-gray-600 hover:bg-gray-50">
                回首頁
            </button>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-6">
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
                        📂 學生學習護照
                    </h1>
                    <button onClick={() => router.push('/')}
                        className="bg-white px-4 py-2 rounded-xl text-gray-500 font-bold shadow-sm hover:bg-gray-50 text-sm border border-gray-100">
                        ← 回首頁
                    </button>
                </div>

                {/* Child Switcher */}
                {myChildren.length > 1 && (
                    <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                        {myChildren.map(child => (
                            <button key={child.id} onClick={() => setSelectedChild(child)}
                                className={`px-5 py-2 rounded-full whitespace-nowrap font-bold transition shadow-sm
                                    ${selectedChild?.id === child.id
                                        ? 'bg-indigo-600 text-white shadow-indigo-200'
                                        : 'bg-white text-gray-500 border hover:bg-gray-50'}`}>
                                {child.chinese_name}
                            </button>
                        ))}
                    </div>
                )}

                {selectedChild && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

                        {/* ===== 左側 ID 卡 ===== */}
                        <div className="md:col-span-4">
                            <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden sticky top-6">
                                {/* 漸層頂部 */}
                                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-6 text-white text-center pb-10 relative">
                                    <div className="w-24 h-24 mx-auto bg-white rounded-full p-1 shadow-lg mb-3">
                                        <div className="w-full h-full rounded-full bg-indigo-50 flex items-center justify-center text-4xl overflow-hidden">
                                            {selectedChild.photo_url
                                                ? <img src={selectedChild.photo_url} className="w-full h-full object-cover" alt="" />
                                                : <span>👦</span>}
                                        </div>
                                    </div>
                                    <h2 className="text-2xl font-black">{selectedChild.chinese_name}</h2>
                                    <p className="text-indigo-200 text-sm font-bold mt-1">
                                        {selectedChild.english_name || 'Student'}
                                    </p>
                                    <div className="flex justify-center gap-2 mt-3">
                                        <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold">
                                            {selectedChild.grade || '未分班'}
                                        </span>
                                        <span className="bg-green-400/80 px-3 py-1 rounded-full text-xs font-bold">在學中</span>
                                    </div>
                                </div>

                                {/* 成績摘要 */}
                                {gradeStats && (
                                    <div className="flex divide-x divide-gray-100 -mt-5 mx-4 bg-white rounded-2xl shadow-md border border-gray-100 text-center py-3">
                                        <div className="flex-1 px-2">
                                            <div className="text-xs text-gray-400 font-bold">平均</div>
                                            <div className={`text-xl font-black ${scoreColor(gradeStats.avg)}`}>{gradeStats.avg}</div>
                                        </div>
                                        <div className="flex-1 px-2">
                                            <div className="text-xs text-gray-400 font-bold">最高</div>
                                            <div className="text-xl font-black text-green-600">{gradeStats.best}</div>
                                        </div>
                                        <div className="flex-1 px-2">
                                            <div className="text-xs text-gray-400 font-bold">及格率</div>
                                            <div className="text-xl font-black text-blue-600">{gradeStats.pass}%</div>
                                        </div>
                                    </div>
                                )}

                                {/* 基本資訊 */}
                                <div className="p-5 space-y-2 mt-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-400 font-bold">學號</span>
                                        <span className="font-mono text-gray-700">{selectedChild.student_id || '—'}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-400 font-bold">生日</span>
                                        <span className="font-mono text-gray-700">{selectedChild.birthday || '未登記'}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-400 font-bold">接送方式</span>
                                        <span className="font-bold text-gray-700">{selectedChild.pickup_method || '家長接送'}</span>
                                    </div>
                                </div>

                                {/* 快捷按鈕 */}
                                <div className="px-5 pb-5 grid grid-cols-2 gap-2">
                                    <button onClick={() => router.push('/leave')}
                                        className="py-2.5 bg-teal-50 text-teal-700 rounded-xl font-bold text-sm hover:bg-teal-100 transition flex items-center justify-center gap-1.5">
                                        📅 申請請假
                                    </button>
                                    <button onClick={() => router.push('/chat')}
                                        className="py-2.5 bg-blue-50 text-blue-700 rounded-xl font-bold text-sm hover:bg-blue-100 transition flex items-center justify-center gap-1.5">
                                        💬 聯絡老師
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* ===== 右側 Tabs ===== */}
                        <div className="md:col-span-8">
                            <div className="flex bg-white p-1.5 rounded-xl shadow-sm mb-5 border border-gray-100">
                                {([
                                    { key: 'profile',     label: '👤 個人檔案' },
                                    { key: 'performance', label: '📋 課堂表現' },
                                    { key: 'grades',      label: '💯 成績紀錄' },
                                ] as const).map(t => (
                                    <button key={t.key} onClick={() => setActiveTab(t.key)}
                                        className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition whitespace-nowrap
                                            ${activeTab === t.key
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}>
                                        {t.label}
                                    </button>
                                ))}
                            </div>

                            {/* ===== Tab: 個人檔案 ===== */}
                            {activeTab === 'profile' && (
                                <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-6">
                                    {/* 標題 + 編輯按鈕 */}
                                    <div className="flex justify-between items-center border-b border-gray-100 pb-4">
                                        <h3 className="text-base font-black text-gray-800 flex items-center gap-2">
                                            <span className="bg-red-100 text-red-500 w-8 h-8 rounded-lg flex items-center justify-center">❤️</span>
                                            健康與照護
                                        </h3>
                                        {isEditing ? (
                                            <div className="flex gap-2">
                                                <button onClick={() => { setFormData(selectedChild); setIsEditing(false); }}
                                                    className="px-4 py-1.5 rounded-lg bg-gray-100 text-gray-500 font-bold text-sm hover:bg-gray-200">
                                                    取消
                                                </button>
                                                <button onClick={handleSaveProfile}
                                                    className="px-4 py-1.5 rounded-lg bg-green-500 text-white font-bold text-sm hover:bg-green-600">
                                                    💾 儲存
                                                </button>
                                            </div>
                                        ) : (
                                            <button onClick={() => setIsEditing(true)}
                                                className="px-4 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 font-bold text-sm hover:bg-indigo-100 transition">
                                                ✏️ 編輯
                                            </button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        {/* 英文名 */}
                                        <div className={`p-4 rounded-2xl border col-span-2 md:col-span-1 ${isEditing ? 'border-indigo-300 ring-2 ring-indigo-50' : 'bg-indigo-50 border-indigo-100'}`}>
                                            <div className="text-xs font-bold text-indigo-400 mb-1">英文名</div>
                                            {isEditing
                                                ? <input type="text" value={formData.english_name || ''} onChange={e => handleInputChange('english_name', e.target.value)} className="w-full font-bold text-gray-800 bg-transparent outline-none placeholder-gray-300" placeholder="English Name" />
                                                : <div className="font-bold text-indigo-700">{selectedChild.english_name || '未填寫'}</div>}
                                        </div>

                                        {/* 生日 */}
                                        <div className={`p-4 rounded-2xl border col-span-2 md:col-span-1 ${isEditing ? 'border-indigo-300 ring-2 ring-indigo-50' : 'bg-gray-50 border-gray-100'}`}>
                                            <div className="text-xs font-bold text-gray-400 mb-1">生日</div>
                                            {isEditing
                                                ? <input type="date" value={formData.birthday || ''} onChange={e => handleInputChange('birthday', e.target.value)} className="w-full font-mono font-bold text-gray-800 bg-transparent outline-none" />
                                                : <div className="font-mono font-bold text-gray-700">{selectedChild.birthday || '未登記'}</div>}
                                        </div>

                                        {/* 過敏原 */}
                                        <div className={`p-4 rounded-2xl border ${isEditing ? 'border-indigo-300 ring-2 ring-indigo-50' : 'bg-red-50 border-red-100'}`}>
                                            <div className={`text-xs font-bold mb-1 ${isEditing ? 'text-indigo-400' : 'text-red-400'}`}>🚨 過敏原</div>
                                            {isEditing
                                                ? <input type="text" value={formData.allergies || ''} onChange={e => handleInputChange('allergies', e.target.value)} className="w-full font-bold text-gray-800 bg-transparent outline-none placeholder-gray-300" placeholder="例如: 蝦子, 花生" />
                                                : <div className="font-bold text-red-800">{selectedChild.allergies || '無'}</div>}
                                        </div>

                                        {/* 特殊照護 */}
                                        <div className={`p-4 rounded-2xl border ${isEditing ? 'border-indigo-300 ring-2 ring-indigo-50' : 'bg-gray-50 border-gray-100'}`}>
                                            <div className="text-xs font-bold text-gray-400 mb-1">💊 特殊照護</div>
                                            {isEditing
                                                ? <input type="text" value={formData.special_needs || ''} onChange={e => handleInputChange('special_needs', e.target.value)} className="w-full font-bold text-gray-800 bg-transparent outline-none placeholder-gray-300" placeholder="例如: 氣喘, 定時服藥" />
                                                : <div className="font-bold text-gray-700">{selectedChild.special_needs || '無'}</div>}
                                        </div>
                                    </div>

                                    <div className="border-t border-gray-100 pt-5">
                                        <h3 className="text-base font-black text-gray-800 flex items-center gap-2 mb-4">
                                            <span className="bg-green-100 text-green-600 w-8 h-8 rounded-lg flex items-center justify-center">📞</span>
                                            接送與聯絡
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* 聯絡人 1 */}
                                            <div className={`border p-4 rounded-2xl ${isEditing ? 'border-indigo-300' : 'border-gray-100 bg-gray-50'}`}>
                                                <div className="text-xs text-gray-400 font-bold mb-2">第一聯絡人</div>
                                                {isEditing ? (
                                                    <div className="space-y-2">
                                                        <input type="text" value={formData.parent_relationship || ''} onChange={e => handleInputChange('parent_relationship', e.target.value)} className="w-full border-b border-gray-200 font-bold text-gray-800 outline-none focus:border-indigo-500 bg-transparent" placeholder="稱謂（媽媽）" />
                                                        <input type="tel" value={formData.parent_phone || ''} onChange={e => handleInputChange('parent_phone', e.target.value)} className="w-full font-mono text-indigo-600 font-bold outline-none bg-transparent" placeholder="電話" />
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="font-bold text-gray-800 text-base">{selectedChild.parent_relationship || '未登記'}</div>
                                                        <div className="text-indigo-600 font-mono font-bold text-sm">{selectedChild.parent_phone || '—'}</div>
                                                    </>
                                                )}
                                            </div>

                                            {/* 聯絡人 2 */}
                                            <div className={`border p-4 rounded-2xl ${isEditing ? 'border-indigo-300' : 'border-gray-100 bg-gray-50'}`}>
                                                <div className="text-xs text-gray-400 font-bold mb-2">第二聯絡人</div>
                                                {isEditing ? (
                                                    <div className="space-y-2">
                                                        <input type="text" value={formData.parent_2_relationship || ''} onChange={e => handleInputChange('parent_2_relationship', e.target.value)} className="w-full border-b border-gray-200 font-bold text-gray-800 outline-none focus:border-indigo-500 bg-transparent" placeholder="稱謂（爸爸）" />
                                                        <input type="tel" value={formData.parent_2_phone || ''} onChange={e => handleInputChange('parent_2_phone', e.target.value)} className="w-full font-mono text-indigo-600 font-bold outline-none bg-transparent" placeholder="電話" />
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="font-bold text-gray-800 text-base">{selectedChild.parent_2_relationship || '未登記'}</div>
                                                        <div className="text-indigo-600 font-mono font-bold text-sm">{selectedChild.parent_2_phone || '—'}</div>
                                                    </>
                                                )}
                                            </div>

                                            {/* 接送方式 */}
                                            <div className={`p-4 rounded-2xl col-span-1 md:col-span-2 ${isEditing ? 'bg-white border border-indigo-300 ring-2 ring-indigo-50' : 'bg-gray-50 border border-gray-100'}`}>
                                                <div className="text-xs text-gray-400 font-bold mb-1">放學接送方式</div>
                                                {isEditing ? (
                                                    <select value={formData.pickup_method || '家長接送'} onChange={e => handleInputChange('pickup_method', e.target.value)}
                                                        className="w-full font-bold text-gray-800 bg-transparent outline-none">
                                                        <option value="家長接送">家長接送</option>
                                                        <option value="自行回家">自行回家</option>
                                                        <option value="安親班接送">安親班接送</option>
                                                    </select>
                                                ) : (
                                                    <div className="font-bold text-gray-800">{selectedChild.pickup_method || '家長接送'}</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ===== Tab: 課堂表現 ===== */}
                            {activeTab === 'performance' && (
                                <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 min-h-[400px]">
                                    <h3 className="text-base font-black text-gray-800 mb-5 flex items-center gap-2">
                                        <span className="bg-orange-100 text-orange-500 w-8 h-8 rounded-lg flex items-center justify-center">📋</span>
                                        近期課堂表現
                                    </h3>
                                    {recentLogs.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                            <div className="text-5xl mb-3">📭</div>
                                            <p>尚無聯絡簿紀錄</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {recentLogs.map((log: any) => (
                                                <div key={log.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1 rounded-full">
                                                            {log.date}
                                                        </span>
                                                        {log.parent_signature ? (
                                                            <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-bold">
                                                                ✅ 已簽名
                                                            </span>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleSign(log.id)}
                                                                disabled={signingId === log.id}
                                                                className="text-xs bg-orange-500 text-white px-3 py-1 rounded-full font-bold hover:bg-orange-600 transition disabled:opacity-50">
                                                                {signingId === log.id ? '簽名中...' : '📝 點此簽名'}
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* 表現指標 */}
                                                    <div className="grid grid-cols-3 gap-3">
                                                        <div className="bg-white rounded-xl p-2 text-center border border-gray-100">
                                                            <div className="text-[10px] text-gray-400 font-bold mb-1">心情</div>
                                                            <div className="text-2xl">{moodEmoji(log.mood)}</div>
                                                        </div>
                                                        <div className="bg-white rounded-xl p-2 text-center border border-gray-100">
                                                            <div className="text-[10px] text-gray-400 font-bold mb-1">專注</div>
                                                            <div className="text-2xl">{focusEmoji(log.focus)}</div>
                                                        </div>
                                                        <div className="bg-white rounded-xl p-2 text-center border border-gray-100">
                                                            <div className="text-[10px] text-gray-400 font-bold mb-1">食慾</div>
                                                            <div className="text-2xl">{appetiteEmoji(log.appetite)}</div>
                                                        </div>
                                                    </div>

                                                    {log.homework && (
                                                        <div className="text-sm bg-yellow-50 border border-yellow-100 rounded-xl p-3">
                                                            <span className="text-[10px] font-black text-yellow-600 block mb-0.5">📚 作業</span>
                                                            <div className="font-bold text-gray-700">{log.homework}</div>
                                                        </div>
                                                    )}
                                                    {log.public_note && (
                                                        <div className="text-sm bg-green-50 border border-green-100 rounded-xl p-3">
                                                            <span className="text-[10px] font-black text-green-600 block mb-0.5">💬 老師留言</span>
                                                            <div className="font-bold text-gray-700 whitespace-pre-wrap">{log.public_note}</div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            <button onClick={() => router.push('/contact-book')}
                                                className="w-full py-3 mt-2 text-indigo-600 font-bold bg-indigo-50 rounded-xl hover:bg-indigo-100 transition text-sm">
                                                查看完整聯絡簿紀錄 →
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ===== Tab: 成績紀錄 ===== */}
                            {activeTab === 'grades' && (
                                <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 min-h-[400px] space-y-6">
                                    <h3 className="text-base font-black text-gray-800 flex items-center gap-2">
                                        <span className="bg-purple-100 text-purple-500 w-8 h-8 rounded-lg flex items-center justify-center">💯</span>
                                        成績紀錄
                                    </h3>

                                    {recentGrades.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                            <div className="text-5xl mb-3">📝</div>
                                            <p>尚無成績紀錄</p>
                                        </div>
                                    ) : (
                                        <>
                                            {/* 統計橫條 */}
                                            {gradeStats && (
                                                <div className="grid grid-cols-3 gap-3">
                                                    <div className="bg-indigo-50 p-3 rounded-2xl text-center">
                                                        <div className="text-xs text-indigo-400 font-bold">平均分</div>
                                                        <div className={`text-2xl font-black ${scoreColor(gradeStats.avg)}`}>{gradeStats.avg}</div>
                                                    </div>
                                                    <div className="bg-green-50 p-3 rounded-2xl text-center">
                                                        <div className="text-xs text-green-400 font-bold">最高分</div>
                                                        <div className="text-2xl font-black text-green-600">{gradeStats.best}</div>
                                                    </div>
                                                    <div className="bg-blue-50 p-3 rounded-2xl text-center">
                                                        <div className="text-xs text-blue-400 font-bold">及格率</div>
                                                        <div className="text-2xl font-black text-blue-600">{gradeStats.pass}%</div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* 趨勢折線圖 */}
                                            {gradeStats && gradeStats.trend.length > 1 && (
                                                <div>
                                                    <p className="text-xs text-gray-400 font-bold mb-3">📈 成績趨勢</p>
                                                    <ResponsiveContainer width="100%" height={180}>
                                                        <LineChart data={gradeStats.trend} margin={{ top: 5, right: 15, left: 0, bottom: 40 }}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                                            <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" />
                                                            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                                                            <Tooltip formatter={(v: any) => [`${v} 分`, '成績']} />
                                                            <ReferenceLine y={60} stroke="#fbbf24" strokeDasharray="4 2" />
                                                            <Line type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2.5}
                                                                dot={{ r: 5, fill: '#6366f1' }} activeDot={{ r: 7 }} />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            )}

                                            {/* 成績列表 */}
                                            <div className="divide-y divide-gray-50">
                                                {recentGrades.map((g: any) => (
                                                    <div key={g.id} className="flex items-center justify-between py-3 hover:bg-gray-50 rounded-xl px-2 transition">
                                                        <div>
                                                            <div className="font-bold text-gray-700 text-sm">{g.exam_name}</div>
                                                            <div className="text-xs text-gray-400">{g.exam_date}</div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <span className={`text-xs font-black px-2.5 py-1 rounded-full ${scoreBadge(g.score)}`}>
                                                                {scoreGrade(g.score)}
                                                            </span>
                                                            <span className={`text-2xl font-black ${scoreColor(g.score)}`}>{g.score}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
