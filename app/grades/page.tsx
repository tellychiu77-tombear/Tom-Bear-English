'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

const ENGLISH_CLASSES = Array.from({ length: 26 }, (_, i) => `CEI-${String.fromCharCode(65 + i)}`);
const ALL_CLASSES = ['課後輔導班', ...ENGLISH_CLASSES];

export default function GradesPage() {
    // Auth & Role
    const [loading, setLoading] = useState(true);
    const [role, setRole] = useState<string | null>(null);
    const [userId, setUserId] = useState('');

    // Tabs
    const [activeTab, setActiveTab] = useState<'entry' | 'history'>('entry');

    // --- Tab 1: Entry / Edit ---
    const [entryClass, setEntryClass] = useState('');
    const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
    const [entryExamName, setEntryExamName] = useState('');

    // Data for Entry
    const [classStudents, setClassStudents] = useState<any[]>([]);
    const [scores, setScores] = useState<Record<string, string>>({}); // studentId -> score
    const [isUpdateMode, setIsUpdateMode] = useState(false); // True if editing existing exam

    // --- Tab 2: History ---
    const [historyClassFilter, setHistoryClassFilter] = useState('');
    const [historyMonthFilter, setHistoryMonthFilter] = useState(new Date().toISOString().slice(0, 7));
    const [examHistory, setExamHistory] = useState<any[]>([]);

    // --- Parent View Data ---
    const [myChildren, setMyChildren] = useState<any[]>([]);
    const [selectedChildId, setSelectedChildId] = useState('');
    const [childGrades, setChildGrades] = useState<any[]>([]);

    const router = useRouter();

    // 1. Init
    useEffect(() => {
        init();
    }, []);

    const init = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }
        setUserId(session.user.id);

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        const r = profile?.role || 'parent';
        setRole(r);

        if (r === 'parent') {
            fetchMyChildren(session.user.id);
        } else {
            // Staff: Load history initially
            fetchExamHistory();
        }
        setLoading(false);
    };

    // --- Staff Logic: Entry Tab ---

    // 2. Fetch Students when Class changes
    useEffect(() => {
        if (role !== 'parent' && entryClass) {
            fetchClassStudents();
        }
    }, [entryClass]);

    // 3. Smart Detection: Check if exam exists when Class + Date + Name are set
    useEffect(() => {
        if (role !== 'parent' && entryClass && entryDate && entryExamName) {
            checkExistingScores();
        }
    }, [entryClass, entryDate, entryExamName, classStudents]);

    const fetchClassStudents = async () => {
        const { data } = await supabase
            .from('students')
            .select('*')
            .ilike('grade', `%${entryClass}%`)
            .order('chinese_name');

        if (data) {
            setClassStudents(data);
            setScores({}); // Clear scores when changing class
            setIsUpdateMode(false);
        }
    };

    const checkExistingScores = async () => {
        if (classStudents.length === 0) return;

        // Get student IDs for this class
        const studentIds = classStudents.map(s => s.id);

        const { data: existingResults } = await supabase
            .from('exam_results')
            .select('*')
            .in('student_id', studentIds)
            .eq('exam_date', entryDate)
            .eq('exam_name', entryExamName);

        if (existingResults && existingResults.length > 0) {
            // Data Found -> Update Mode
            setIsUpdateMode(true);
            const newScores: any = {};
            existingResults.forEach((r: any) => {
                newScores[r.student_id] = r.score.toString();
            });
            setScores(newScores);
        } else {
            // No Data -> Create Mode
            setIsUpdateMode(false);
            setScores({});
        }
    };

    const handleScoreChange = (sid: string, val: string) => {
        setScores(prev => ({ ...prev, [sid]: val }));
    };

    const handleSubmitScores = async () => {
        if (!entryClass || !entryExamName) return alert('請填寫完整考試資訊');

        const validEntries = Object.entries(scores).filter(([_, val]) => val !== '');
        if (validEntries.length === 0) return alert('請至少輸入一位學生的分數');

        const confirmMsg = isUpdateMode
            ? `⚠️ 確定要更新「${entryExamName}」的 ${validEntries.length} 筆成績嗎？`
            : `確定要儲存「${entryExamName}」的 ${validEntries.length} 筆新成績嗎？`;

        if (!confirm(confirmMsg)) return;

        // Prepare Upsert Data
        // Note: Since we want to support "Update", we first delete existing for this batch to avoid duplicates or complex upsert logic if ID isn't tracked client-side.
        // Strategy: Delete matches for (student_id, exam_date, exam_name) then insert. 
        // Or cleaner for MVP: just try to delete relevant records first.

        const studentIdsToUpdate = validEntries.map(([sid]) => sid);

        // 1. Delete existing for these students on this exam
        if (isUpdateMode) {
            await supabase.from('exam_results')
                .delete()
                .in('student_id', studentIdsToUpdate)
                .eq('exam_date', entryDate)
                .eq('exam_name', entryExamName);
        }

        // 2. Insert new
        const payload = validEntries.map(([sid, val]) => ({
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
            alert(isUpdateMode ? '✅ 成績更新成功！' : '✅ 成績登錄成功！');
            // Refresh history
            fetchExamHistory();
            // Optional: clear input or stay? User usually wants to stay to verify.
            // Let's re-trigger check to set Update Mode correctly
            checkExistingScores();
        }
    };

    // --- Staff Logic: History Tab ---

    useEffect(() => {
        if (role !== 'parent' && activeTab === 'history') {
            fetchExamHistory();
        }
    }, [activeTab, historyClassFilter, historyMonthFilter]);

    const fetchExamHistory = async () => {
        // 1. Get all results, potentially filtered
        let query = supabase
            .from('exam_results')
            .select(`
                *,
                student:students (id, chinese_name, grade)
            `)
            .order('exam_date', { ascending: false });

        if (historyMonthFilter) {
            const start = `${historyMonthFilter}-01`;
            const end = `${historyMonthFilter}-31`; // Loose check
            query = query.gte('exam_date', start).lte('exam_date', end);
        }

        const { data } = await query;

        if (data) {
            // Client-side filter for Class (since exam_results doesn't have class directly, rely on join)
            let filtered = data;
            if (historyClassFilter) {
                filtered = data.filter((r: any) => r.student?.grade?.includes(historyClassFilter));
            }
            setExamHistory(filtered);
        }
    };

    const handleEditExam = (exam: any) => {
        // Switch to Entry Tab and Pre-fill
        setActiveTab('entry');
        setEntryClass(historyClassFilter || exam.student.grade); // Try to guess class or use filter
        setEntryDate(exam.exam_date);
        setEntryExamName(exam.exam_name);
        // data will auto-load via useEffect
    };

    // --- Parent Logic ---
    const fetchMyChildren = async (pid: string) => {
        const { data } = await supabase.from('students').select('*').eq('parent_id', pid);
        if (data && data.length > 0) {
            setMyChildren(data);
            setSelectedChildId(data[0].id);
        }
    };

    useEffect(() => {
        if (selectedChildId) {
            fetchChildGrades(selectedChildId);
        }
    }, [selectedChildId]);

    const fetchChildGrades = async (cid: string) => {
        const { data } = await supabase.from('exam_results').select('*').eq('student_id', cid).order('exam_date', { ascending: true });
        if (data) setChildGrades(data);
    };

    // --- Grouping Logic for History ---
    // Group by Date + Exam Name + Class (inferred)
    // Actually simplicity: Group by "Date | Exam Name"
    const groupedHistory = examHistory.reduce((acc: any, cur: any) => {
        const key = `${cur.exam_date}||${cur.exam_name}`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(cur);
        return acc;
    }, {});

    if (loading) return <div className="p-10 text-center animate-pulse">載入中...</div>;

    return (
        <div className="min-h-screen bg-purple-50 p-4 font-sans">
            <div className="max-w-5xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-black text-purple-900 flex items-center gap-2">
                        📊 成績管理系統
                        {role === 'parent' && <span className="text-xs bg-purple-200 text-purple-800 px-2 py-1 rounded">家長版</span>}
                    </h1>
                    <button onClick={() => router.push('/')} className="px-4 py-2 bg-white text-gray-600 font-bold rounded-xl border hover:bg-gray-50 transition shadow-sm">
                        回首頁
                    </button>
                </div>

                {/* PARENT VIEW (Simplified) */}
                {role === 'parent' && (
                    <div className="space-y-6">
                        <div className="flex gap-2 overflow-x-auto pb-2">
                            {myChildren.map(child => (
                                <button
                                    key={child.id}
                                    onClick={() => setSelectedChildId(child.id)}
                                    className={`px-6 py-2 rounded-full font-bold whitespace-nowrap transition ${selectedChildId === child.id ? 'bg-purple-600 text-white shadow-lg' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
                                >
                                    {child.chinese_name}
                                </button>
                            ))}
                        </div>
                        {childGrades.length > 0 ? (
                            <div className="bg-white p-6 rounded-2xl shadow-lg border-t-4 border-purple-500">
                                <h3 className="font-bold text-gray-700 mb-4 text-lg">📈 成績趨勢</h3>
                                {/* Simple Chart Visualization Reuse or new */}
                                <div className="h-64 flex items-end justify-between gap-2 px-4 border-b border-gray-200 pb-2">
                                    {childGrades.map((g, i) => (
                                        <div key={i} className="flex flex-col items-center group w-full">
                                            <div className="relative w-full flex justify-center">
                                                <div
                                                    className={`w-8 md:w-12 rounded-t-lg transition-all duration-500 ${g.score >= 90 ? 'bg-green-400' : g.score < 60 ? 'bg-red-400' : 'bg-blue-400'} group-hover:opacity-80`}
                                                    style={{ height: `${g.score * 2}px` }}
                                                ></div>
                                                <div className="absolute -top-6 font-bold text-xs bg-gray-800 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition">
                                                    {g.score}
                                                </div>
                                            </div>
                                            <div className="text-[10px] text-gray-500 mt-2 rotate-45 origin-left truncate w-12 text-center">{g.exam_name}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="p-10 text-center text-gray-400 bg-white rounded-xl">尚無成績紀錄</div>
                        )}
                    </div>
                )}

                {/* STAFF VIEW */}
                {role !== 'parent' && (
                    <div className="space-y-6">
                        {/* Tabs */}
                        <div className="bg-white p-1 rounded-xl inline-flex shadow-sm mb-2">
                            <button
                                onClick={() => setActiveTab('entry')}
                                className={`px-6 py-2 rounded-lg font-bold text-sm transition ${activeTab === 'entry' ? 'bg-purple-100 text-purple-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                📝 成績登錄
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={`px-6 py-2 rounded-lg font-bold text-sm transition ${activeTab === 'history' ? 'bg-gray-800 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                🗂️ 歷史紀錄
                            </button>
                        </div>

                        {/* TAB: ENTRY */}
                        {activeTab === 'entry' && (
                            <div className="animate-fade-in space-y-6">
                                {/* Controls */}
                                <div className="bg-white p-6 rounded-2xl shadow-md border-l-4 border-purple-500 grid md:grid-cols-3 gap-6">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Class</label>
                                        <select
                                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-700 focus:ring-2 focus:ring-purple-500 outline-none"
                                            value={entryClass}
                                            onChange={e => setEntryClass(e.target.value)}
                                        >
                                            <option value="">-- 選擇班級 --</option>
                                            {ALL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Date</label>
                                        <input
                                            type="date"
                                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-700 focus:ring-2 focus:ring-purple-500 outline-none"
                                            value={entryDate}
                                            onChange={e => setEntryDate(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Exam Name</label>
                                        <input
                                            type="text"
                                            placeholder="例: Unit 5 Quiz"
                                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-700 focus:ring-2 focus:ring-purple-500 outline-none"
                                            value={entryExamName}
                                            onChange={e => setEntryExamName(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* Student List Input */}
                                {entryClass && (
                                    <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
                                        <div className={`p-4 border-b flex justify-between items-center ${isUpdateMode ? 'bg-orange-50 border-orange-100' : 'bg-gray-50 border-gray-100'}`}>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xl">{isUpdateMode ? '✏️' : '🆕'}</span>
                                                <span className={`font-bold ${isUpdateMode ? 'text-orange-700' : 'text-gray-700'}`}>
                                                    {isUpdateMode ? '修改現有成績' : '登錄新成績'}
                                                </span>
                                            </div>
                                            <div className="text-sm font-bold text-gray-400">
                                                {classStudents.length} 位學生
                                            </div>
                                        </div>

                                        <div className="p-2">
                                            {classStudents.map((s, idx) => (
                                                <div key={s.id} className="flex items-center justify-between p-3 border-b last:border-0 border-gray-50 hover:bg-gray-50 transition">
                                                    <div className="flex items-center gap-3">
                                                        <span className="w-6 text-center text-xs font-bold text-gray-300">{idx + 1}</span>
                                                        <span className="font-bold text-gray-700 text-lg">{s.chinese_name}</span>
                                                    </div>
                                                    <input
                                                        type="number"
                                                        placeholder="0"
                                                        className={`w-24 text-center p-2 rounded-lg border-2 font-mono text-xl font-bold focus:scale-105 transition outline-none
                                                            ${scores[s.id] ? (Number(scores[s.id]) < 60 ? 'border-red-200 bg-red-50 text-red-600' : 'border-purple-200 bg-purple-50 text-purple-700') : 'border-gray-200 bg-white text-gray-800 focus:border-purple-400'}
                                                        `}
                                                        value={scores[s.id] || ''}
                                                        onChange={e => handleScoreChange(s.id, e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                // Use simple DOM logic to move to next input if possible
                                                                const inputs = document.querySelectorAll('input[type="number"]');
                                                                const index = Array.from(inputs).indexOf(e.currentTarget);
                                                                if (index > -1 && index < inputs.length - 1) {
                                                                    (inputs[index + 1] as HTMLElement).focus();
                                                                }
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                            {classStudents.length === 0 && <div className="p-8 text-center text-gray-400">此班級尚無學生資料</div>}
                                        </div>

                                        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                                            <button
                                                onClick={handleSubmitScores}
                                                className={`px-8 py-3 rounded-xl font-bold text-white shadow-lg transition transform active:scale-95 flex items-center gap-2
                                                    ${isUpdateMode ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-200' : 'bg-purple-600 hover:bg-purple-700 shadow-purple-200'}
                                                `}
                                            >
                                                {isUpdateMode ? '🔄 更新成績 (Update)' : '💾 儲存成績 (Save)'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TAB: HISTORY */}
                        {activeTab === 'history' && (
                            <div className="animate-fade-in space-y-6">
                                {/* Filters */}
                                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex gap-4">
                                    <div className="flex-1">
                                        <label className="text-xs font-bold text-gray-400 block mb-1">月份</label>
                                        <input
                                            type="month"
                                            className="w-full font-bold text-gray-700 border-none outline-none bg-transparent"
                                            value={historyMonthFilter}
                                            onChange={e => setHistoryMonthFilter(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex-1 border-l pl-4">
                                        <label className="text-xs font-bold text-gray-400 block mb-1">班級</label>
                                        <select
                                            className="w-full font-bold text-gray-700 border-none outline-none bg-transparent"
                                            value={historyClassFilter}
                                            onChange={e => setHistoryClassFilter(e.target.value)}
                                        >
                                            <option value="">全部班級</option>
                                            {ALL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* Grouped List */}
                                <div className="space-y-4">
                                    {Object.keys(groupedHistory).length === 0 ? (
                                        <div className="text-center py-10 text-gray-400">查無考試紀錄</div>
                                    ) : (
                                        Object.entries(groupedHistory).sort().reverse().map(([key, list]: [string, any[]]) => {
                                            const [date, name] = key.split('||');
                                            // Calculate Stats
                                            const avg = Math.round(list.reduce((sum, i) => sum + i.score, 0) / list.length);
                                            const count = list.length;

                                            return (
                                                <div key={key} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between hover:shadow-md transition gap-4">
                                                    <div>
                                                        <div className="flex items-center gap-3 mb-1">
                                                            <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-xs font-bold font-mono">{date}</span>
                                                            <h3 className="text-lg font-black text-gray-800">{name}</h3>
                                                        </div>
                                                        <div className="text-sm text-gray-500 font-bold flex gap-4">
                                                            <span>👥 {count} 人應考</span>
                                                            <span className={`${avg >= 90 ? 'text-green-600' : avg < 60 ? 'text-red-500' : 'text-blue-600'}`}>
                                                                📈 平均 {avg} 分
                                                            </span>
                                                        </div>
                                                        {historyClassFilter && <div className="mt-1 text-xs text-purple-600 font-bold bg-purple-50 inline-block px-1 rounded">{historyClassFilter}</div>}
                                                    </div>

                                                    <button
                                                        onClick={() => handleEditExam(list[0])}
                                                        className="px-6 py-2 bg-gray-50 hover:bg-purple-50 text-gray-600 hover:text-purple-700 rounded-xl font-bold transition flex items-center justify-center gap-2 border border-gray-200"
                                                    >
                                                        <span>✏️</span> 編輯
                                                    </button>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}