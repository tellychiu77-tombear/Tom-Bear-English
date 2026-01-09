'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

const ENGLISH_CLASSES = Array.from({ length: 26 }, (_, i) => `CEI-${String.fromCharCode(65 + i)}`);
const ALL_CLASSES = ['課後輔導班', ...ENGLISH_CLASSES];

export default function GradesPage() {
    const [loading, setLoading] = useState(true);
    const [role, setRole] = useState<string | null>(null);
    const [userId, setUserId] = useState('');
    const router = useRouter();

    // 🟢 核心架構：分頁狀態
    const [activeTab, setActiveTab] = useState<'entry' | 'history'>('entry');

    // ============ Tab 1: 成績登錄 ============
    const [entryClass, setEntryClass] = useState('');
    const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
    const [entryExamName, setEntryExamName] = useState('');

    const [classStudents, setClassStudents] = useState<any[]>([]); // 該班級學生列表
    const [scores, setScores] = useState<Record<string, string>>({}); // 暫存分數 { studentId: score }
    const [isUpdateMode, setIsUpdateMode] = useState(false); // 是否為編輯模式

    // ============ Tab 2: 歷史題庫 ============
    const [historyMonth, setHistoryMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [historyClass, setHistoryClass] = useState('');
    const [historyList, setHistoryList] = useState<any[]>([]);

    // 1. 初始化檢查權限
    useEffect(() => {
        init();
    }, []);

    const init = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }
        setUserId(session.user.id);

        // 簡單檢查 role (實際應從 profiles 拉)
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        const userRole = profile?.role || 'parent';

        if (userRole === 'parent') {
            // 家長不應該看到此頁面或是看到只限家長的 View (依您的需求，這裡主要針對老師)
            // 為了簡化，這裡假設此頁面主要是老師介面
            setRole('parent'); // 你可以導向或顯示家長版
        } else {
            setRole(userRole);
            setLoading(false);
            // 預設載入歷史
            fetchHistory();
        }
    };

    // ============ 功能 A: 成績登錄邏輯 ============

    // 當選擇班級改變 -> 抓學生名單
    useEffect(() => {
        if (entryClass) {
            fetchStudents(entryClass);
        } else {
            setClassStudents([]);
            setScores({});
        }
    }, [entryClass]);

    // 🟢 Smart Load: 當 Class + Date + Name 都有值 -> 自動檢查是否已存在
    useEffect(() => {
        if (entryClass && entryDate && entryExamName && classStudents.length > 0) {
            checkExistingScores();
        }
    }, [entryClass, entryDate, entryExamName, classStudents]);

    const fetchStudents = async (cls: string) => {
        const { data } = await supabase
            .from('students')
            .select('id, chinese_name, grade')
            .ilike('grade', `%${cls}%`)
            .order('chinese_name');

        if (data) {
            setClassStudents(data);
            setScores({}); // 切換班級先清空
            setIsUpdateMode(false);
        }
    };

    const checkExistingScores = async () => {
        // 查詢該班學生、該日期、該考試的分數
        const studentIds = classStudents.map(s => s.id);

        const { data } = await supabase
            .from('exam_results')
            .select('*')
            .in('student_id', studentIds)
            .eq('exam_date', entryDate)
            .eq('exam_name', entryExamName);

        if (data && data.length > 0) {
            // ⚠️ 編輯模式
            setIsUpdateMode(true);
            const newScores: Record<string, string> = {};
            data.forEach((r: any) => {
                newScores[r.student_id] = r.score.toString();
            });
            setScores(newScores);
        } else {
            // ✨ 新增模式
            setIsUpdateMode(false);
            setScores({});
        }
    };

    const handleSave = async () => {
        if (!entryClass || !entryExamName) return alert('請填寫完整資訊');

        // 過濾出有輸入分數的
        const entries = Object.entries(scores).filter(([_, val]) => val !== '');
        if (entries.length === 0) return alert('請至少輸入一筆成績');

        const confirmMsg = isUpdateMode
            ? `確定要「更新」這 ${entries.length} 筆成績嗎？`
            : `確定要「儲存」這 ${entries.length} 筆成績嗎？`;

        if (!confirm(confirmMsg)) return;

        // 準備寫入 (先刪除舊的避免重複，或 Upsert)
        // 這裡採用簡單策略：先刪該批學生當天的同名考試，再寫入
        const targetStudentIds = entries.map(([sid]) => sid);

        // 1. Delete old (for these students)
        await supabase.from('exam_results')
            .delete()
            .in('student_id', targetStudentIds)
            .eq('exam_date', entryDate)
            .eq('exam_name', entryExamName);

        // 2. Insert new
        const payload = entries.map(([sid, val]) => ({
            student_id: sid,
            exam_name: entryExamName,
            exam_date: entryDate,
            score: parseInt(val),
            full_score: 100
        }));

        const { error } = await supabase.from('exam_results').insert(payload);

        if (error) {
            alert('儲存失敗: ' + error.message);
        } else {
            alert(isUpdateMode ? '更新成功！' : '儲存成功！');
            // 重新載入歷史
            fetchHistory();
            // 停在原頁面方便確認，再次觸發檢查就會變 Update Mode (理論上已經是了)
            checkExistingScores();
        }
    };

    // ============ 功能 B: 歷史題庫邏輯 ============

    useEffect(() => {
        if (activeTab === 'history') {
            fetchHistory();
        }
    }, [activeTab, historyMonth, historyClass]);

    const fetchHistory = async () => {
        let query = supabase
            .from('exam_results')
            .select(`
                *,
                student:students ( id, chinese_name, grade )
            `)
            .order('exam_date', { ascending: false });

        // Month Filter
        if (historyMonth) {
            query = query.gte('exam_date', `${historyMonth}-01`).lte('exam_date', `${historyMonth}-31`);
        }

        const { data } = await query;
        if (data) {
            // Client-side Class Filter & Grouping
            let filtered = data;
            if (historyClass) {
                filtered = data.filter((r: any) => r.student?.grade?.includes(historyClass));
            }

            // Group By: Date + ExamName + (Class??)
            // 題目要求：日期 | 考試名稱 | 班級 | 平均分
            // 由於 exam_results 沒有直接存 class，我們通常是透過學生判斷。
            // 但如果一次考試混了多個班級，這裡分組會比較複雜。
            // 我們假設一次操作通常是一個班級。這裡依 Date + ExamName + StudentGrade(第一位) 來分組
            const grouped: Record<string, any[]> = {};

            filtered.forEach((r: any) => {
                // 嘗試抓班級，預設抓該次考試第一個學生的班級代表
                // 為了分得更細，我們可以把 "Date_ExamName" 當 Key
                // 顯示時再統計 Class
                const key = `${r.exam_date}::${r.exam_name}`;
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(r);
            });

            // 轉成 Array 方便顯示
            const list = Object.entries(grouped).map(([key, items]) => {
                const [date, name] = key.split('::');
                const avg = Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length);
                // 找出最多出現的 Class (Mode)
                const classCounts: Record<string, number> = {};
                items.forEach(i => {
                    const g = i.student?.grade || 'Unknown';
                    classCounts[g] = (classCounts[g] || 0) + 1;
                });
                const mainClass = Object.keys(classCounts).sort((a, b) => classCounts[b] - classCounts[a])[0];

                return {
                    key,
                    date,
                    name,
                    mainClass,
                    avg,
                    count: items.length,
                    raw: items // for loading back
                };
            });

            setHistoryList(list);
        }
    };

    const handleEditHistory = (item: any) => {
        // 點擊編輯 -> 切換到 'entry' -> 帶入詳細資料
        setActiveTab('entry');
        setEntryDate(item.date);
        setEntryExamName(item.name);
        setEntryClass(item.mainClass); // 這會觸發 fetchStudents -> 然後觸發 checkExistingScores
    };


    if (loading) return <div className="p-10 text-center animate-pulse">載入中...</div>;
    // 如果是家長，顯示簡單訊息 (或您希望保留家長功能，可自行保留)
    if (role === 'parent') return <div className="p-10 text-center">此頁面僅供老師使用 (家長請至首頁查看)</div>;


    return (
        <div className="min-h-screen bg-gray-50 p-6 font-sans">
            <div className="max-w-5xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex justify-between items-center">
                    <h1 className="text-3xl font-black text-gray-800 tracking-tight">📊 成績管理系統</h1>
                    <button onClick={() => router.push('/')} className="px-4 py-2 bg-white border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50">回首頁</button>
                </div>

                {/* Tabs */}
                <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-gray-100 w-fit">
                    <button
                        onClick={() => setActiveTab('entry')}
                        className={`px-6 py-2.5 rounded-xl font-bold transition flex items-center gap-2 ${activeTab === 'entry' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <span>📝</span> 成績登錄
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`px-6 py-2.5 rounded-xl font-bold transition flex items-center gap-2 ${activeTab === 'history' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <span>🗂️</span> 歷史題庫
                    </button>
                </div>


                {/* === Tab 1: 成績登錄 === */}
                {activeTab === 'entry' && (
                    <div className="animate-fade-in space-y-6">

                        {/* Control Panel */}
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">選擇班級</label>
                                <select
                                    className="w-full text-lg font-bold text-gray-800 bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500 transition"
                                    value={entryClass}
                                    onChange={e => setEntryClass(e.target.value)}
                                >
                                    <option value="">-- 請選擇班級 --</option>
                                    {ALL_CLASSES.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">考試名稱</label>
                                <input
                                    type="text"
                                    placeholder="例: Unit 5 Quiz"
                                    className="w-full text-lg font-bold text-gray-800 bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500 transition"
                                    value={entryExamName}
                                    onChange={e => setEntryExamName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">日期</label>
                                <input
                                    type="date"
                                    className="w-full text-lg font-bold text-gray-800 bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500 transition"
                                    value={entryDate}
                                    onChange={e => setEntryDate(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Student List */}
                        {entryClass && (
                            <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden">
                                {/* Header Status */}
                                <div className={`p-4 border-b flex justify-between items-center ${isUpdateMode ? 'bg-orange-50 border-orange-100' : 'bg-indigo-50 border-indigo-100'}`}>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-8 rounded-full ${isUpdateMode ? 'bg-orange-500' : 'bg-indigo-500'}`}></div>
                                        <span className={`text-lg font-black ${isUpdateMode ? 'text-orange-700' : 'text-indigo-700'}`}>
                                            {isUpdateMode ? '⚠️ 編輯現有成績模式' : '✨ 新增成績模式'}
                                        </span>
                                    </div>
                                    <span className="font-bold text-gray-400 text-sm">{classStudents.length} 位學生</span>
                                </div>

                                <div className="p-2 space-y-1">
                                    {classStudents.length === 0 ? (
                                        <div className="p-10 text-center text-gray-400">尚無學生資料</div>
                                    ) : (
                                        classStudents.map((s, idx) => (
                                            <div key={s.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition group">
                                                <div className="flex items-center gap-4 pl-2">
                                                    <span className="font-mono text-gray-300 font-bold w-6">{idx + 1}</span>
                                                    <span className="text-lg font-bold text-gray-700 group-hover:text-indigo-600 transition">{s.chinese_name}</span>
                                                </div>
                                                <input
                                                    type="number"
                                                    placeholder="-"
                                                    className={`w-24 text-center text-lg font-black p-2 rounded-lg outline-none transition border-2
                                                        ${scores[s.id]
                                                            ? (Number(scores[s.id]) >= 90 ? 'border-green-200 bg-green-50 text-green-700'
                                                                : Number(scores[s.id]) < 60 ? 'border-red-200 bg-red-50 text-red-600'
                                                                    : 'border-indigo-100 bg-indigo-50 text-indigo-700')
                                                            : 'border-gray-100 bg-gray-50 text-gray-400 focus:border-indigo-400 focus:bg-white focus:text-gray-800'
                                                        }
                                                    `}
                                                    value={scores[s.id] || ''}
                                                    onChange={e => setScores(prev => ({ ...prev, [s.id]: e.target.value }))}
                                                    onFocus={e => e.target.select()}
                                                />
                                            </div>
                                        ))
                                    )}
                                </div>

                                <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                                    <button
                                        onClick={handleSave}
                                        className={`px-8 py-3 rounded-2xl font-black text-white text-lg shadow-lg hover:shadow-xl transform active:scale-95 transition flex items-center gap-2
                                            ${isUpdateMode ? 'bg-orange-500 hover:bg-orange-600' : 'bg-indigo-600 hover:bg-indigo-700'}
                                        `}
                                    >
                                        <span>{isUpdateMode ? '🔄 更新成績' : '💾 儲存成績'}</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}


                {/* === Tab 2: 歷史題庫 === */}
                {activeTab === 'history' && (
                    <div className="animate-fade-in space-y-6">
                        {/* Filters */}
                        <div className="flex flex-col md:flex-row gap-4">
                            <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex-1 flex items-center gap-3">
                                <span className="text-xl pl-2">📅</span>
                                <input
                                    type="month"
                                    className="w-full font-bold text-gray-600 outline-none bg-transparent"
                                    value={historyMonth}
                                    onChange={e => setHistoryMonth(e.target.value)}
                                />
                            </div>
                            <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex-1 flex items-center gap-3">
                                <span className="text-xl pl-2">🏫</span>
                                <select
                                    className="w-full font-bold text-gray-600 outline-none bg-transparent"
                                    value={historyClass}
                                    onChange={e => setHistoryClass(e.target.value)}
                                >
                                    <option value="">所有班級</option>
                                    {ALL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* History List */}
                        <div className="space-y-4">
                            {historyList.length === 0 ? (
                                <div className="p-12 bg-white rounded-3xl border border-gray-100 text-center text-gray-400">
                                    <div className="text-4xl mb-4 opacity-50">📂</div>
                                    目前無符合條件的考試紀錄
                                </div>
                            ) : (
                                historyList.map((item) => (
                                    <div key={item.key} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div>
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="font-mono text-xs font-bold bg-gray-100 text-gray-500 px-2 py-1 rounded-md">{item.date}</span>
                                                <span className="font-bold text-gray-800 text-lg">{item.name}</span>
                                                <span className="font-bold text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md">{item.mainClass}</span>
                                            </div>
                                            <div className="flex items-center gap-4 text-sm font-bold text-gray-400">
                                                <span>👥 {item.count} 人應考</span>
                                                <span className={`${item.avg >= 90 ? 'text-green-500' : item.avg < 60 ? 'text-red-500' : 'text-blue-500'}`}>
                                                    📊 平均: {item.avg}
                                                </span>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => handleEditHistory(item)}
                                            className="px-5 py-2 rounded-xl bg-gray-50 hover:bg-indigo-50 text-gray-500 hover:text-indigo-600 font-bold transition flex items-center justify-center gap-2 border border-gray-200 hover:border-indigo-200"
                                        >
                                            ✏️ 修改
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}