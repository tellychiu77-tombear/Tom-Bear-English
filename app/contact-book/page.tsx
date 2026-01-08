'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

// 產生班級選項 (用來當篩選器)
const ENGLISH_CLASSES = Array.from({ length: 26 }, (_, i) => `CEI-${String.fromCharCode(65 + i)}`);
const ALL_CLASSES = ['課後輔導班', ...ENGLISH_CLASSES];

export default function ContactBookPage() {
    const [role, setRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [students, setStudents] = useState<any[]>([]);

    // 模式切換: 'single' (單人) | 'batch' (群發) | 'history' (查看紀錄)
    const [mode, setMode] = useState<'single' | 'batch' | 'history'>('batch');

    // --- 表單資料 ---
    // 單人模式用
    const [singleForm, setSingleForm] = useState({ studentId: '', homework: '', message: '' });

    // 群發模式用
    const [batchClass, setBatchClass] = useState(''); // 目前選中的班級
    const [batchHomework, setBatchHomework] = useState('');
    const [batchCommonMessage, setBatchCommonMessage] = useState('');
    const [batchList, setBatchList] = useState<any[]>([]); // 該班級的學生清單狀態

    // 歷史紀錄用
    const [historyList, setHistoryList] = useState<any[]>([]);
    const [historyFilterDate, setHistoryFilterDate] = useState(new Date().toISOString().split('T')[0]);

    const router = useRouter();

    useEffect(() => {
        init();
    }, []);

    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        const userRole = profile?.role || 'parent';
        setRole(userRole);

        if (userRole === 'parent') {
            setMode('history'); // 家長只能看歷史
            fetchMyChildHistory(session.user.id);
        } else {
            fetchStudents(); // 老師載入所有學生
        }
        setLoading(false);
    }

    // 老師：抓取所有學生
    async function fetchStudents() {
        const { data } = await supabase.from('students').select('*').order('grade').order('chinese_name');
        if (data) setStudents(data);
    }

    // 家長：抓取自己小孩的聯絡簿
    async function fetchMyChildHistory(parentId: string) {
        const { data: myKids } = await supabase.from('students').select('id').eq('parent_id', parentId);
        if (!myKids || myKids.length === 0) return;

        const kidIds = myKids.map(k => k.id);
        const { data } = await supabase
            .from('contact_books')
            .select(`*, student:students(chinese_name)`)
            .in('student_id', kidIds)
            .order('date', { ascending: false });

        if (data) setHistoryList(data);
    }

    // 當老師選擇「班級」時，自動篩選出該班學生
    useEffect(() => {
        if (mode === 'batch' && batchClass) {
            const targetStudents = students.filter(s => s.grade && s.grade.includes(batchClass));
            // 初始化列表：每個人預設都勾選，備註為空
            setBatchList(targetStudents.map(s => ({
                ...s,
                selected: true,
                individualNote: '' // 個別備註
            })));
        }
    }, [batchClass, mode, students]);

    // 更新群發列表中的個別狀態
    function updateBatchItem(id: string, field: string, value: any) {
        setBatchList(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
    }

    // 發送單人聯絡簿
    async function sendSingle() {
        if (!singleForm.studentId) return alert('請選擇學生');
        if (!singleForm.homework && !singleForm.message) return alert('請填寫內容');

        const { error } = await supabase.from('contact_books').insert({
            student_id: singleForm.studentId,
            homework: singleForm.homework,
            message: singleForm.message,
            date: new Date().toISOString().split('T')[0]
        });

        if (error) alert('發送失敗: ' + error.message);
        else {
            alert('發送成功！');
            setSingleForm({ studentId: '', homework: '', message: '' });
        }
    }

    // 🚀 發送群發聯絡簿
    async function sendBatch() {
        // 1. 找出有被勾選的學生
        const targets = batchList.filter(s => s.selected);
        if (targets.length === 0) return alert('請至少選擇一位學生');
        if (!batchHomework && !batchCommonMessage) return alert('請填寫作業或聯絡事項');

        const confirmMsg = `確定要發送給 ${batchClass} 的 ${targets.length} 位學生嗎？`;
        if (!confirm(confirmMsg)) return;

        // 2. 準備批次資料
        const payload = targets.map(s => ({
            student_id: s.id,
            date: new Date().toISOString().split('T')[0],
            homework: batchHomework, // 大家都一樣的作業
            // 評語 = 共同評語 + 個別評語 (如果有寫的話)
            message: s.individualNote ? `${batchCommonMessage}\n(個別備註: ${s.individualNote})` : batchCommonMessage
        }));

        const { error } = await supabase.from('contact_books').insert(payload);

        if (error) alert('群發失敗: ' + error.message);
        else {
            alert(`成功發送給 ${targets.length} 位學生！🎉`);
            // 清空表單
            setBatchHomework('');
            setBatchCommonMessage('');
            setBatchList(prev => prev.map(s => ({ ...s, individualNote: '' }))); // 保留勾選狀態，但清空備註
        }
    }

    // 載入當日歷史紀錄 (老師用)
    async function fetchDailyHistory() {
        if (!historyFilterDate) return;
        const { data } = await supabase
            .from('contact_books')
            .select(`*, student:students(chinese_name, grade)`)
            .eq('date', historyFilterDate)
            .order('created_at', { ascending: false });

        if (data) setHistoryList(data);
    }

    if (loading) return <div className="p-8 text-center">載入中...</div>;

    return (
        <div className="min-h-screen bg-orange-50 p-4">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-orange-900 flex items-center gap-2">
                        📝 電子聯絡簿
                        {role === 'parent' && <span className="text-sm bg-orange-200 text-orange-800 px-2 py-1 rounded">家長版</span>}
                    </h1>
                    <button onClick={() => router.push('/')} className="px-3 py-1 bg-gray-400 text-white rounded text-sm">回首頁</button>
                </div>

                {/* 老師專用：功能切換 Tabs */}
                {role !== 'parent' && (
                    <div className="flex gap-2 mb-4 bg-white p-1 rounded-lg shadow-sm border inline-flex">
                        <button onClick={() => setMode('batch')} className={`px-4 py-2 rounded-md font-bold text-sm transition ${mode === 'batch' ? 'bg-orange-500 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}>🚀 班級群發</button>
                        <button onClick={() => setMode('single')} className={`px-4 py-2 rounded-md font-bold text-sm transition ${mode === 'single' ? 'bg-orange-500 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}>👤 單人填寫</button>
                        <button onClick={() => { setMode('history'); fetchDailyHistory(); }} className={`px-4 py-2 rounded-md font-bold text-sm transition ${mode === 'history' ? 'bg-orange-500 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}>📜 發送紀錄</button>
                    </div>
                )}

                {/* ============ 🚀 班級群發模式 ============ */}
                {mode === 'batch' && role !== 'parent' && (
                    <div className="bg-white p-6 rounded-xl shadow-lg border-t-4 border-orange-500 animate-fade-in">
                        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">🚀 快速群發作業</h2>

                        {/* 1. 選班級 */}
                        <div className="mb-6">
                            <label className="block text-sm font-bold text-gray-700 mb-2">步驟 1: 選擇班級</label>
                            <div className="flex flex-wrap gap-2">
                                {ALL_CLASSES.map(cls => (
                                    <button
                                        key={cls}
                                        onClick={() => setBatchClass(cls)}
                                        className={`px-3 py-1.5 rounded border text-sm font-bold transition ${batchClass === cls ? 'bg-blue-600 text-white border-blue-600 shadow ring-2 ring-blue-200' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                    >
                                        {cls}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {batchClass && (
                            <>
                                {/* 2. 填寫共同內容 */}
                                <div className="grid md:grid-cols-2 gap-4 mb-6 bg-gray-50 p-4 rounded-xl border">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">步驟 2: 今日作業 (全班一樣)</label>
                                        <input
                                            type="text"
                                            className="w-full p-2 border rounded focus:ring-2 focus:ring-orange-300 outline-none"
                                            placeholder="例如: 英文課本 P.10 ~ P.12"
                                            value={batchHomework}
                                            onChange={e => setBatchHomework(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">共同聯絡事項</label>
                                        <input
                                            type="text"
                                            className="w-full p-2 border rounded focus:ring-2 focus:ring-orange-300 outline-none"
                                            placeholder="例如: 明天要考聽寫"
                                            value={batchCommonMessage}
                                            onChange={e => setBatchCommonMessage(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* 3. 勾選學生 & 個別備註 */}
                                <div className="mb-6">
                                    <label className="block text-sm font-bold text-gray-700 mb-2">
                                        步驟 3: 確認發送名單 ({batchList.filter(s => s.selected).length} 人)
                                    </label>
                                    <div className="max-h-80 overflow-y-auto border rounded-xl divide-y">
                                        {batchList.length === 0 ? <div className="p-4 text-gray-400 text-center">此班級尚無學生</div> :
                                            batchList.map(s => (
                                                <div key={s.id} className={`p-3 flex items-center gap-3 transition ${s.selected ? 'bg-white' : 'bg-gray-100 opacity-50'}`}>
                                                    {/* 勾選框 */}
                                                    <input
                                                        type="checkbox"
                                                        className="w-5 h-5 cursor-pointer accent-orange-500"
                                                        checked={s.selected}
                                                        onChange={e => updateBatchItem(s.id, 'selected', e.target.checked)}
                                                    />

                                                    {/* 學生姓名 */}
                                                    <div className="w-24 font-bold text-gray-800">{s.chinese_name}</div>

                                                    {/* 個別備註輸入框 */}
                                                    <input
                                                        type="text"
                                                        disabled={!s.selected}
                                                        className="flex-1 p-1.5 border rounded text-sm bg-gray-50 focus:bg-white transition"
                                                        placeholder="個別備註 (選填，例如: 上課不專心)"
                                                        value={s.individualNote}
                                                        onChange={e => updateBatchItem(s.id, 'individualNote', e.target.value)}
                                                    />
                                                </div>
                                            ))
                                        }
                                    </div>
                                </div>

                                {/* 4. 送出按鈕 */}
                                <button
                                    onClick={sendBatch}
                                    className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white py-3 rounded-xl font-bold text-lg shadow-lg hover:from-orange-600 hover:to-red-600 transition transform hover:scale-[1.01]"
                                >
                                    🚀 一鍵發送給 {batchList.filter(s => s.selected).length} 位學生
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* ============ 👤 單人填寫模式 (舊版功能) ============ */}
                {mode === 'single' && role !== 'parent' && (
                    <div className="bg-white p-6 rounded-xl shadow-lg border-t-4 border-gray-400">
                        <h2 className="text-lg font-bold text-gray-800 mb-4">✍️ 單筆填寫</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">選擇學生</label>
                                <select className="w-full p-2 border rounded" value={singleForm.studentId} onChange={e => setSingleForm({ ...singleForm, studentId: e.target.value })}>
                                    <option value="">-- 請選擇 --</option>
                                    {students.map(s => (
                                        <option key={s.id} value={s.id}>{s.grade} - {s.chinese_name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">今日作業</label>
                                <input type="text" className="w-full p-2 border rounded" value={singleForm.homework} onChange={e => setSingleForm({ ...singleForm, homework: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">聯絡事項</label>
                                <textarea className="w-full p-2 border rounded h-24" value={singleForm.message} onChange={e => setSingleForm({ ...singleForm, message: e.target.value })} />
                            </div>
                            <button onClick={sendSingle} className="w-full bg-gray-600 text-white py-3 rounded-lg font-bold hover:bg-gray-700">發送</button>
                        </div>
                    </div>
                )}

                {/* ============ 📜 歷史紀錄 (家長/老師共用) ============ */}
                {mode === 'history' && (
                    <div className="space-y-4">
                        {role !== 'parent' && (
                            <div className="flex items-center gap-2 bg-white p-3 rounded-lg shadow-sm">
                                <label className="font-bold text-gray-600 text-sm">📅 選擇日期查看：</label>
                                <input
                                    type="date"
                                    className="p-1 border rounded"
                                    value={historyFilterDate}
                                    onChange={(e) => { setHistoryFilterDate(e.target.value); setTimeout(fetchDailyHistory, 100); }}
                                />
                                <button onClick={fetchDailyHistory} className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm font-bold">查詢</button>
                            </div>
                        )}

                        <div className="space-y-3">
                            {historyList.length === 0 ? <div className="text-center text-gray-400 py-10 bg-white rounded-xl">尚無紀錄</div> :
                                historyList.map(item => (
                                    <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-orange-300">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="font-bold text-lg text-gray-800">
                                                {item.student?.chinese_name}
                                                <span className="text-sm font-normal text-gray-500 ml-2">({item.date})</span>
                                            </div>
                                            {role !== 'parent' && <div className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500">{item.student?.grade}</div>}
                                        </div>

                                        <div className="space-y-2">
                                            <div className="bg-orange-50 p-2 rounded text-sm text-orange-900">
                                                <span className="font-bold">🏠 作業：</span>{item.homework || '無'}
                                            </div>
                                            <div className="text-sm text-gray-600">
                                                <span className="font-bold">💬 事項：</span>{item.message || '無'}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}