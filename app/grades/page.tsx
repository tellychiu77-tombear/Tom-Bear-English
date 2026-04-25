'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { getEffectivePermissions } from '@/lib/permissions';
import {
    LineChart, Line, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell
} from 'recharts';

const GRADE_BANDS = [
    { label: 'A (90-100)', min: 90, max: 100, color: '#22c55e' },
    { label: 'B (80-89)', min: 80, max: 89, color: '#3b82f6' },
    { label: 'C (70-79)', min: 70, max: 79, color: '#a855f7' },
    { label: 'D (60-69)', min: 60, max: 69, color: '#f59e0b' },
    { label: 'F (<60)',   min: 0,  max: 59, color: '#ef4444' },
];

function scoreTextColor(score: number) {
    if (score >= 90) return 'text-green-600';
    if (score >= 80) return 'text-blue-600';
    if (score >= 70) return 'text-purple-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-500';
}

function scoreBg(score: number) {
    if (score >= 90) return 'bg-green-50 border-green-200';
    if (score >= 80) return 'bg-blue-50 border-blue-200';
    if (score >= 70) return 'bg-purple-50 border-purple-200';
    if (score >= 60) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
}

function scoreGrade(score: number) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
}

function scoreDotColor(score: number) {
    if (score >= 90) return 'bg-green-500';
    if (score >= 80) return 'bg-blue-500';
    if (score >= 70) return 'bg-purple-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
}

export default function GradesPage() {
    const router = useRouter();
    const [loading, setLoading]         = useState(true);
    const [role, setRole]               = useState<string | null>(null);
    const [userId, setUserId]           = useState<string>('');
    const [canViewGrades, setCanViewGrades] = useState(false);
    const [canEditGrades, setCanEditGrades] = useState(false);

    // 'entry' | 'history' | 'analytics' | 'mychild'
    const [activeTab, setActiveTab] = useState<string>('entry');

    // ============ Tab 1: 成績登錄 ============
    const [entryClass, setEntryClass]       = useState('');
    const [entryDate, setEntryDate]         = useState(new Date().toISOString().split('T')[0]);
    const [entryExamName, setEntryExamName] = useState('');
    const [classStudents, setClassStudents] = useState<any[]>([]);
    const [scores, setScores]               = useState<Record<string, string>>({});
    const [isUpdateMode, setIsUpdateMode]   = useState(false);
    const [statusMsg, setStatusMsg]         = useState<{ type: 'error' | 'success' | 'info' | '', text: string }>({ type: '', text: '' });
    const saveButtonRef = useRef<HTMLButtonElement>(null);

    // ============ Tab 2: 歷史紀錄 ============
    const [historyMonth, setHistoryMonth]   = useState('');
    const [historyClass, setHistoryClass]   = useState('');
    const [historySearch, setHistorySearch] = useState('');
    const [groupedHistory, setGroupedHistory] = useState<any[]>([]);
    const [expandedRows, setExpandedRows]   = useState<Set<string>>(new Set());
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    // ============ Tab 3: 成績分析 ============
    const [analyticsClass, setAnalyticsClass] = useState('');
    const [analyticsExam, setAnalyticsExam]   = useState('');
    const [analyticsData, setAnalyticsData]   = useState<any[]>([]);
    const [trendData, setTrendData]           = useState<any[]>([]);
    const [allExams, setAllExams]             = useState<string[]>([]);

    // ============ Tab 4: 我的孩子 (parent) ============
    const [myChildren, setMyChildren]       = useState<any[]>([]);
    const [selectedChild, setSelectedChild] = useState<string>('');
    const [childResults, setChildResults]   = useState<any[]>([]);

    // ============ Dynamic class list ============
    const [classes, setClasses] = useState<string[]>([]);

    useEffect(() => { checkUser(); fetchClasses(); }, []);

    const fetchClasses = async () => {
        const { data } = await supabase.from('students').select('grade').order('grade');
        if (data) {
            const unique = [...new Set(data.map((s: any) => s.grade).filter(Boolean))].sort();
            setClasses(unique);
        }
    };

    const checkUser = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }
        const uid = session.user.id;
        setUserId(uid);

        const { data: profile } = await supabase
            .from('users').select('role, extra_permissions').eq('id', uid).single();
        const r = profile?.role || 'parent';

        const { data: roleConfigRow } = await supabase
            .from('role_configs').select('permissions').eq('role', r).single();
        const perms = getEffectivePermissions(r, roleConfigRow?.permissions ?? null, profile?.extra_permissions ?? null);

        setCanViewGrades(perms.viewGrades);
        setCanEditGrades(perms.editGrades);
        setRole(r);
        setLoading(false);

        if (r === 'parent') {
            setActiveTab('mychild');
            fetchMyChildren(uid);
        } else if (perms.viewGrades) {
            fetchHistory('', '', '');
            fetchAllExams();
        }
    };

    // ===== 成績登錄邏輯 =====

    useEffect(() => {
        if (entryClass) {
            fetchClassStudents(entryClass);
        } else {
            setClassStudents([]);
            setScores({});
            setStatusMsg({ type: '', text: '' });
        }
    }, [entryClass]);

    useEffect(() => {
        if (entryClass && entryDate && entryExamName && classStudents.length > 0) {
            checkExistingScores();
        }
    }, [entryClass, entryDate, entryExamName, classStudents]);

    const fetchClassStudents = async (cls: string) => {
        const { data } = await supabase
            .from('students')
            .select('id, chinese_name, grade')
            .ilike('grade', `%${cls}%`)
            .order('chinese_name');
        if (data) setClassStudents(data);
    };

    const checkExistingScores = async () => {
        const studentIds = classStudents.map(s => s.id);
        if (!studentIds.length) return;
        const { data } = await supabase
            .from('exam_results')
            .select('*')
            .in('student_id', studentIds)
            .eq('exam_date', entryDate)
            .eq('exam_name', entryExamName);
        if (data && data.length > 0) {
            setIsUpdateMode(true);
            const loaded: Record<string, string> = {};
            data.forEach((r: any) => { loaded[r.student_id] = r.score.toString(); });
            setScores(loaded);
            setStatusMsg({ type: 'info', text: '⚠️ 偵測到已有成績，目前為編輯模式' });
        } else {
            setIsUpdateMode(false);
            setScores({});
            setStatusMsg({ type: '', text: '' });
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const next = document.getElementById(`score-input-${index + 1}`);
            if (next) (next as HTMLInputElement).focus();
            else saveButtonRef.current?.focus();
        }
    };

    const getEntryStats = () => {
        const vals = Object.values(scores).filter(s => s !== '').map(Number);
        if (!vals.length) return { avg: 0, min: 0, max: 0, passRate: 0, count: 0 };
        const avg      = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
        const passRate = Math.round((vals.filter(v => v >= 60).length / vals.length) * 100);
        return { avg, min: Math.min(...vals), max: Math.max(...vals), passRate, count: vals.length };
    };

    const handleSave = async () => {
        setStatusMsg({ type: '', text: '' });
        if (!entryClass)    return setStatusMsg({ type: 'error', text: '請選擇班級 (Class)' });
        if (!entryExamName) return setStatusMsg({ type: 'error', text: '請填寫考試名稱 (Exam Name)' });
        const validEntries = Object.entries(scores).filter(([_, v]) => v !== '');
        if (!validEntries.length) return setStatusMsg({ type: 'error', text: '請至少輸入一筆成績' });

        setStatusMsg({ type: 'info', text: '⏳ 儲存中...' });
        try {
            const targetIds = validEntries.map(([sid]) => sid);
            await supabase.from('exam_results')
                .delete().in('student_id', targetIds)
                .eq('exam_date', entryDate).eq('exam_name', entryExamName);

            const payload = validEntries.map(([sid, val]) => ({
                student_id: sid, exam_name: entryExamName,
                exam_date: entryDate, score: parseInt(val, 10), full_score: 100
            }));
            const { error } = await supabase.from('exam_results').insert(payload);
            if (error) throw error;

            const time = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
            setStatusMsg({ type: 'success', text: `✅ 已於 ${time} 成功儲存 ${validEntries.length} 筆成績！` });
            setIsUpdateMode(true);
            fetchHistory('', '', '');
            fetchAllExams();
        } catch (e: any) {
            setStatusMsg({ type: 'error', text: `❌ 錯誤: ${e.message}` });
        }
    };

    // ===== 歷史紀錄邏輯 =====

    const fetchHistory = useCallback(async (month: string, cls: string, search: string) => {
        let query = supabase
            .from('exam_results')
            .select('*, student:students(id, chinese_name, grade)')
            .order('exam_date', { ascending: false });
        if (month) query = query.gte('exam_date', `${month}-01`).lte('exam_date', `${month}-31`);
        const { data } = await query;
        if (!data) return;

        let filtered = data.filter((r: any) => r.student?.id);
        if (cls)    filtered = filtered.filter((r: any) => r.student?.grade?.includes(cls));
        if (search) filtered = filtered.filter((r: any) => r.exam_name?.toLowerCase().includes(search.toLowerCase()));

        const map: Record<string, any[]> = {};
        filtered.forEach((r: any) => {
            const key = `${r.exam_date}::${r.exam_name}`;
            if (!map[key]) map[key] = [];
            map[key].push(r);
        });

        const list = Object.entries(map).map(([key, items]) => {
            const [date, name] = key.split('::');
            const classCounts: Record<string, number> = {};
            items.forEach(i => {
                const g = i.student?.grade || 'Unknown';
                classCounts[g] = (classCounts[g] || 0) + 1;
            });
            const mainClass = Object.keys(classCounts).sort((a, b) => classCounts[b] - classCounts[a])[0];
            const scoreArr = items.map(i => i.score);
            const avg      = Math.round(scoreArr.reduce((a, b) => a + b, 0) / scoreArr.length);
            const passRate = Math.round((scoreArr.filter(s => s >= 60).length / scoreArr.length) * 100);
            return { key, date, name, mainClass, avg,
                min: Math.min(...scoreArr), max: Math.max(...scoreArr),
                passRate, count: items.length, records: items };
        });

        list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setGroupedHistory(list);
    }, []);

    useEffect(() => {
        if (activeTab === 'history') fetchHistory(historyMonth, historyClass, historySearch);
    }, [activeTab, historyMonth, historyClass, historySearch, fetchHistory]);

    const handleEditRecord = (row: any) => {
        setEntryClass(row.mainClass);
        setEntryDate(row.date);
        setEntryExamName(row.name);
        const loaded: Record<string, string> = {};
        row.records.forEach((r: any) => { loaded[r.student_id] = r.score.toString(); });
        setScores(loaded);
        setIsUpdateMode(true);
        setStatusMsg({ type: 'info', text: '📝 已載入歷史資料，請修改後儲存' });
        setActiveTab('entry');
    };

    const handleDeleteExam = async (row: any) => {
        const ids = row.records.map((r: any) => r.id);
        const { error } = await supabase.from('exam_results').delete().in('id', ids);
        if (!error) {
            setDeleteConfirm(null);
            fetchHistory(historyMonth, historyClass, historySearch);
        }
    };

    const toggleRow = (key: string) => {
        const s = new Set(expandedRows);
        s.has(key) ? s.delete(key) : s.add(key);
        setExpandedRows(s);
    };

    // ===== 成績分析邏輯 =====

    const fetchAllExams = async () => {
        const { data } = await supabase.from('exam_results').select('exam_name').order('exam_name');
        if (data) {
            const unique = Array.from(new Set(data.map((d: any) => d.exam_name as string)));
            setAllExams(unique);
        }
    };

    const fetchAnalytics = useCallback(async (cls: string, exam: string) => {
        if (!cls) return;

        const { data: students } = await supabase
            .from('students').select('id').ilike('grade', `%${cls}%`);
        if (!students || !students.length) return;
        const sids = students.map(s => s.id);

        // Score distribution for a specific exam
        if (exam) {
            const { data: results } = await supabase
                .from('exam_results').select('score').in('student_id', sids).eq('exam_name', exam);
            if (results) {
                setAnalyticsData(GRADE_BANDS.map(band => ({
                    label: band.label,
                    count: results.filter(r => r.score >= band.min && r.score <= band.max).length,
                    color: band.color
                })));
            }
        } else {
            setAnalyticsData([]);
        }

        // Class average trend over all exams
        const { data: results } = await supabase
            .from('exam_results').select('exam_name, exam_date, score')
            .in('student_id', sids).order('exam_date');

        if (results) {
            const map: Record<string, { total: number; count: number; date: string }> = {};
            results.forEach((r: any) => {
                const k = `${r.exam_date}::${r.exam_name}`;
                if (!map[k]) map[k] = { total: 0, count: 0, date: r.exam_date };
                map[k].total += r.score;
                map[k].count += 1;
            });
            const trend = Object.entries(map).map(([k, v]) => ({
                name: k.split('::')[1],
                date: v.date,
                avg: Math.round(v.total / v.count)
            })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            setTrendData(trend);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'analytics' && analyticsClass) fetchAnalytics(analyticsClass, analyticsExam);
    }, [activeTab, analyticsClass, analyticsExam, fetchAnalytics]);

    // ===== 我的孩子邏輯 =====

    const fetchMyChildren = async (uid: string) => {
        const { data } = await supabase
            .from('students').select('id, chinese_name, grade').eq('parent_id', uid);
        if (data && data.length > 0) {
            setMyChildren(data);
            setSelectedChild(data[0].id);
            fetchChildResults(data[0].id);
        }
    };

    const fetchChildResults = async (childId: string) => {
        const { data } = await supabase
            .from('exam_results').select('*').eq('student_id', childId)
            .order('exam_date', { ascending: false });
        setChildResults(data || []);
    };

    useEffect(() => {
        if (selectedChild) fetchChildResults(selectedChild);
    }, [selectedChild]);

    // ===== 渲染 =====

    if (loading) return (
        <div className="p-10 text-center animate-pulse text-gray-400">系統載入中...</div>
    );
    if (!canViewGrades) return (
        <div className="p-10 text-center text-gray-500">您沒有查看成績的權限，請聯絡管理人員。</div>
    );

    const entryStats = getEntryStats();
    const isParent   = role === 'parent';

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans text-gray-800">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-gray-900">📊 成績管理系統</h1>
                        <p className="text-gray-500 text-sm mt-1">Grade Management System</p>
                    </div>
                    <button onClick={() => router.push('/')}
                        className="px-5 py-2 bg-white border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition shadow-sm">
                        ← 首頁
                    </button>
                </div>

                {/* Tabs */}
                <div className="bg-white p-1.5 rounded-2xl shadow-sm border border-gray-200 inline-flex flex-wrap gap-1">
                    {isParent ? (
                        <button onClick={() => setActiveTab('mychild')}
                            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2
                                ${activeTab === 'mychild' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'}`}>
                            <span>👶</span> 我的孩子成績
                        </button>
                    ) : (
                        <>
                            {canEditGrades && (
                                <button onClick={() => setActiveTab('entry')}
                                    className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2
                                        ${activeTab === 'entry' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'}`}>
                                    <span>📝</span> 成績登錄
                                </button>
                            )}
                            <button onClick={() => setActiveTab('history')}
                                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2
                                    ${activeTab === 'history' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'}`}>
                                <span>🗂️</span> 歷史紀錄
                            </button>
                            <button onClick={() => setActiveTab('analytics')}
                                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2
                                    ${activeTab === 'analytics' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'}`}>
                                <span>📈</span> 成績分析
                            </button>
                        </>
                    )}
                </div>

                {/* ============ Tab 1: 成績登錄 ============ */}
                {activeTab === 'entry' && (
                    <div className="space-y-6">
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 grid md:grid-cols-3 gap-6">
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">選擇班級 (Class)</label>
                                <select
                                    className="w-full text-lg font-bold bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-xl p-3 outline-none transition"
                                    value={entryClass} onChange={e => setEntryClass(e.target.value)}>
                                    <option value="">-- 請選擇 --</option>
                                    {classes.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">
                                    考試名稱 (Exam Name) <span className="text-red-500">*</span>
                                </label>
                                <input type="text" placeholder="例: Unit 1 Test"
                                    className={`w-full text-lg font-bold bg-gray-50 border-2 rounded-xl p-3 outline-none transition
                                        ${!entryExamName ? 'border-red-200 bg-red-50' : 'border-transparent focus:border-indigo-500'}`}
                                    value={entryExamName} onChange={e => setEntryExamName(e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">日期 (Date)</label>
                                <input type="date"
                                    className="w-full text-lg font-bold bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-xl p-3 outline-none transition"
                                    value={entryDate} onChange={e => setEntryDate(e.target.value)} />
                            </div>
                        </div>

                        {entryClass && (
                            <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden">
                                {/* Header bar */}
                                <div className={`p-4 border-b flex flex-wrap items-center justify-between gap-4
                                    ${isUpdateMode ? 'bg-orange-50 border-orange-100' : 'bg-indigo-50 border-indigo-100'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg text-lg
                                            ${isUpdateMode ? 'bg-orange-200 text-orange-700' : 'bg-indigo-200 text-indigo-700'}`}>
                                            {isUpdateMode ? '✏️' : '✨'}
                                        </div>
                                        <div>
                                            <div className={`text-lg font-black ${isUpdateMode ? 'text-orange-800' : 'text-indigo-800'}`}>
                                                {isUpdateMode ? '編輯模式' : '新增模式'}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {classStudents.length} 位學生 · 已填 {entryStats.count} 筆
                                            </div>
                                        </div>
                                    </div>
                                    {entryStats.count > 0 && (
                                        <div className="flex gap-5 text-center">
                                            <div>
                                                <div className="text-xs text-gray-400 font-bold">平均</div>
                                                <div className={`font-black text-xl ${scoreTextColor(entryStats.avg)}`}>{entryStats.avg}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-400 font-bold">最高</div>
                                                <div className="font-black text-xl text-green-600">{entryStats.max}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-400 font-bold">最低</div>
                                                <div className="font-black text-xl text-red-500">{entryStats.min}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-400 font-bold">及格率</div>
                                                <div className="font-black text-xl text-blue-600">{entryStats.passRate}%</div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Student score list */}
                                <div className="p-2 divide-y divide-gray-50 max-h-[55vh] overflow-y-auto">
                                    {classStudents.length === 0 ? (
                                        <div className="p-10 text-center text-gray-400">此班級尚無學生資料</div>
                                    ) : (
                                        classStudents.map((s, idx) => {
                                            const scoreVal = scores[s.id];
                                            const scoreNum = scoreVal ? Number(scoreVal) : null;
                                            return (
                                                <div key={s.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition">
                                                    <div className="flex items-center gap-3">
                                                        <span className="w-7 text-center font-mono text-gray-300 font-bold text-sm">{idx + 1}</span>
                                                        <span className="text-base font-bold text-gray-700">{s.chinese_name}</span>
                                                        {scoreNum !== null && (
                                                            <span className={`text-xs font-black px-2 py-0.5 rounded-full bg-gray-100 ${scoreTextColor(scoreNum)}`}>
                                                                {scoreGrade(scoreNum)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <input
                                                        id={`score-input-${idx}`}
                                                        type="number" min="0" max="100" placeholder="-"
                                                        onKeyDown={e => handleKeyDown(e, idx)}
                                                        className={`w-28 text-center text-2xl font-black p-2 rounded-xl outline-none border-2 transition focus:ring-4 focus:ring-indigo-100
                                                            ${scoreNum !== null
                                                                ? scoreNum >= 90 ? 'border-green-400 bg-green-50 text-green-700'
                                                                : scoreNum >= 60 ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                                                : 'border-red-300 bg-red-50 text-red-600'
                                                                : 'border-gray-100 bg-gray-50 focus:bg-white focus:border-indigo-400'
                                                            }`}
                                                        value={scoreVal || ''}
                                                        onChange={e => setScores(p => ({ ...p, [s.id]: e.target.value }))}
                                                        onFocus={e => e.target.select()}
                                                    />
                                                </div>
                                            );
                                        })
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="p-4 border-t border-gray-100 bg-gray-50 flex flex-col md:flex-row justify-end items-center gap-4">
                                    {statusMsg.text && (
                                        <div className={`px-4 py-2 rounded-lg font-bold text-sm
                                            ${statusMsg.type === 'error'   ? 'bg-red-100 text-red-600' :
                                              statusMsg.type === 'success' ? 'bg-green-100 text-green-700' :
                                              'bg-blue-100 text-blue-700'}`}>
                                            {statusMsg.text}
                                        </div>
                                    )}
                                    {canEditGrades ? (
                                        <button ref={saveButtonRef} onClick={handleSave}
                                            className={`px-8 py-3 rounded-2xl font-black text-white shadow-lg active:scale-95 transition flex items-center gap-2
                                                ${isUpdateMode
                                                    ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-200'
                                                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}`}>
                                            {isUpdateMode ? '💾 儲存變更' : '💾 確認儲存'}
                                        </button>
                                    ) : (
                                        <div className="px-4 py-2 bg-gray-100 text-gray-500 rounded-xl text-sm font-bold">👀 僅供查看</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ============ Tab 2: 歷史紀錄 ============ */}
                {activeTab === 'history' && (
                    <div className="space-y-6">
                        {/* Filters */}
                        <div className="flex flex-wrap gap-3">
                            <div className="flex-1 min-w-[140px] bg-white p-3 rounded-2xl border border-gray-200 flex items-center gap-2 shadow-sm">
                                <span className="text-gray-400">📅</span>
                                <input type="month" className="w-full font-bold text-gray-700 outline-none bg-transparent"
                                    value={historyMonth} onChange={e => setHistoryMonth(e.target.value)} />
                            </div>
                            <div className="flex-1 min-w-[140px] bg-white p-3 rounded-2xl border border-gray-200 flex items-center gap-2 shadow-sm">
                                <span className="text-gray-400">🏫</span>
                                <select className="w-full font-bold text-gray-700 outline-none bg-transparent"
                                    value={historyClass} onChange={e => setHistoryClass(e.target.value)}>
                                    <option value="">所有班級</option>
                                    {classes.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div className="flex-1 min-w-[180px] bg-white p-3 rounded-2xl border border-gray-200 flex items-center gap-2 shadow-sm">
                                <span className="text-gray-400">🔍</span>
                                <input type="text" placeholder="搜尋考試名稱..." className="w-full font-bold text-gray-700 outline-none bg-transparent"
                                    value={historySearch} onChange={e => setHistorySearch(e.target.value)} />
                                {historySearch && (
                                    <button onClick={() => setHistorySearch('')} className="text-gray-300 hover:text-gray-500 font-bold">✕</button>
                                )}
                            </div>
                        </div>

                        {groupedHistory.length === 0 ? (
                            <div className="p-20 text-center text-gray-400 bg-white rounded-3xl border border-dashed border-gray-200">
                                查無紀錄
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {groupedHistory.map((row: any) => (
                                    <div key={row.key} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                                        <div className="p-4 flex flex-wrap justify-between items-center gap-3 cursor-pointer hover:bg-gray-50 transition"
                                            onClick={() => toggleRow(row.key)}>
                                            <div className="flex items-center gap-4">
                                                <div className="bg-indigo-50 text-indigo-600 p-2 rounded-lg font-bold text-xs text-center min-w-[64px]">
                                                    {row.date}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-gray-800 text-base">{row.name}</h3>
                                                    <span className="text-xs text-gray-400 font-bold">
                                                        {row.mainClass} · {row.count} 位學生
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4 ml-auto">
                                                <div className="flex gap-4 text-center">
                                                    <div>
                                                        <div className="text-xs text-gray-400 font-bold">平均</div>
                                                        <div className={`font-black text-lg ${scoreTextColor(row.avg)}`}>{row.avg}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-xs text-gray-400 font-bold">最高</div>
                                                        <div className="font-black text-lg text-green-600">{row.max}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-xs text-gray-400 font-bold">及格率</div>
                                                        <div className="font-black text-lg text-blue-600">{row.passRate}%</div>
                                                    </div>
                                                </div>
                                                {canEditGrades && (
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={e => { e.stopPropagation(); handleEditRecord(row); }}
                                                            className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition text-xs font-bold">
                                                            ✏️ 編輯
                                                        </button>
                                                        <button
                                                            onClick={e => { e.stopPropagation(); setDeleteConfirm(row.key); }}
                                                            className="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition text-xs font-bold">
                                                            🗑️
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {expandedRows.has(row.key) && (
                                            <div className="bg-gray-50 p-4 border-t border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-3">
                                                {row.records.map((r: any) => (
                                                    <div key={r.id} className={`p-3 rounded-xl border flex justify-between items-center ${scoreBg(r.score)}`}>
                                                        <span className="font-bold text-gray-600 text-sm">{r.student.chinese_name}</span>
                                                        <div className="text-right">
                                                            <span className={`font-black text-lg ${scoreTextColor(r.score)}`}>{r.score}</span>
                                                            <div className="text-xs font-bold text-gray-400">{scoreGrade(r.score)}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Delete confirmation modal */}
                        {deleteConfirm && (
                            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                                <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                                    <div className="text-4xl text-center mb-3">🗑️</div>
                                    <h3 className="text-lg font-black text-gray-800 text-center mb-2">確認刪除？</h3>
                                    <p className="text-gray-500 text-sm text-center mb-6">
                                        此操作將刪除「{groupedHistory.find(r => r.key === deleteConfirm)?.name}」的所有成績，無法復原。
                                    </p>
                                    <div className="flex gap-3">
                                        <button onClick={() => setDeleteConfirm(null)}
                                            className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition">
                                            取消
                                        </button>
                                        <button onClick={() => handleDeleteExam(groupedHistory.find(r => r.key === deleteConfirm))}
                                            className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition">
                                            確認刪除
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ============ Tab 3: 成績分析 ============ */}
                {activeTab === 'analytics' && (
                    <div className="space-y-6">
                        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-wrap gap-4">
                            <div className="flex-1 min-w-[160px]">
                                <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">班級</label>
                                <select
                                    className="w-full font-bold text-gray-700 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-xl p-3 outline-none transition"
                                    value={analyticsClass} onChange={e => setAnalyticsClass(e.target.value)}>
                                    <option value="">請選擇班級</option>
                                    {classes.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div className="flex-1 min-w-[160px]">
                                <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">考試（選填，用於成績分佈圖）</label>
                                <select
                                    className="w-full font-bold text-gray-700 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-xl p-3 outline-none transition"
                                    value={analyticsExam} onChange={e => setAnalyticsExam(e.target.value)}>
                                    <option value="">所有考試</option>
                                    {allExams.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                                </select>
                            </div>
                        </div>

                        {!analyticsClass ? (
                            <div className="p-20 text-center text-gray-400 bg-white rounded-3xl border border-dashed border-gray-200">
                                請先選擇班級以查看分析圖表
                            </div>
                        ) : (
                            <div className="grid md:grid-cols-2 gap-6">
                                {/* Trend chart */}
                                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                                    <h3 className="font-black text-gray-700 mb-1">📈 班級平均趨勢</h3>
                                    <p className="text-xs text-gray-400 mb-4">{analyticsClass} · 各考試平均分</p>
                                    {trendData.length === 0 ? (
                                        <div className="h-48 flex items-center justify-center text-gray-300">尚無資料</div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height={220}>
                                            <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 50 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" />
                                                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                                                <Tooltip formatter={(v: any) => [`${v} 分`, '平均分']} />
                                                <Line type="monotone" dataKey="avg" stroke="#6366f1" strokeWidth={2.5}
                                                    dot={{ r: 5, fill: '#6366f1' }} activeDot={{ r: 7 }} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    )}
                                </div>

                                {/* Distribution chart */}
                                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                                    <h3 className="font-black text-gray-700 mb-1">📊 成績分佈</h3>
                                    <p className="text-xs text-gray-400 mb-4">
                                        {analyticsExam || '請選擇考試'} · 等第人數
                                    </p>
                                    {!analyticsExam || analyticsData.length === 0 ? (
                                        <div className="h-48 flex items-center justify-center text-gray-300">
                                            請選擇考試以查看分佈
                                        </div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height={220}>
                                            <BarChart data={analyticsData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                                                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                                <Tooltip formatter={(v: any) => [`${v} 人`, '人數']} />
                                                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                                    {analyticsData.map((entry, i) => (
                                                        <Cell key={i} fill={entry.color} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ============ Tab 4: 我的孩子 (parent) ============ */}
                {activeTab === 'mychild' && (
                    <div className="space-y-6">
                        {myChildren.length === 0 ? (
                            <div className="p-16 text-center text-gray-400 bg-white rounded-3xl border border-dashed border-gray-200">
                                尚無綁定的學生資料，請聯絡管理人員
                            </div>
                        ) : (
                            <>
                                {/* Child tabs if multiple */}
                                {myChildren.length > 1 && (
                                    <div className="flex gap-3 flex-wrap">
                                        {myChildren.map(child => (
                                            <button key={child.id} onClick={() => setSelectedChild(child.id)}
                                                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition
                                                    ${selectedChild === child.id
                                                        ? 'bg-indigo-600 text-white shadow-md'
                                                        : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}`}>
                                                {child.chinese_name}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Child info card */}
                                {myChildren.filter(c => c.id === selectedChild).map(child => (
                                    <div key={child.id} className="bg-gradient-to-br from-indigo-600 to-blue-700 text-white p-5 rounded-2xl">
                                        <div className="flex items-center gap-4">
                                            <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center text-2xl font-black">
                                                {child.chinese_name[0]}
                                            </div>
                                            <div>
                                                <div className="text-xl font-black">{child.chinese_name}</div>
                                                <div className="text-indigo-200 text-sm">{child.grade} · 共 {childResults.length} 筆成績</div>
                                            </div>
                                            {childResults.length > 0 && (
                                                <div className="ml-auto text-right">
                                                    <div className="text-indigo-200 text-xs">整體平均</div>
                                                    <div className="text-3xl font-black">
                                                        {Math.round(childResults.reduce((a, b) => a + b.score, 0) / childResults.length)}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {/* Trend chart */}
                                {childResults.length > 1 && (
                                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                                        <h3 className="font-black text-gray-700 mb-4">📈 成績趨勢</h3>
                                        <ResponsiveContainer width="100%" height={200}>
                                            <LineChart
                                                data={[...childResults].reverse().map(r => ({
                                                    name: r.exam_name, score: r.score, date: r.exam_date
                                                }))}
                                                margin={{ top: 5, right: 20, left: 0, bottom: 50 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" />
                                                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                                                <Tooltip formatter={(v: any) => [`${v} 分`, '成績']} />
                                                <Line type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2.5}
                                                    dot={{ r: 5, fill: '#6366f1' }} activeDot={{ r: 7 }} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}

                                {/* Results list */}
                                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                    <div className="p-4 border-b border-gray-100">
                                        <h3 className="font-black text-gray-700">📋 所有成績</h3>
                                    </div>
                                    <div className="divide-y divide-gray-50">
                                        {childResults.length === 0 ? (
                                            <div className="p-10 text-center text-gray-400">尚無成績資料</div>
                                        ) : (
                                            childResults.map((r: any) => (
                                                <div key={r.id} className="flex items-center justify-between p-4 hover:bg-gray-50 transition">
                                                    <div>
                                                        <div className="font-bold text-gray-700">{r.exam_name}</div>
                                                        <div className="text-xs text-gray-400">{r.exam_date}</div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white ${scoreDotColor(r.score)}`}>
                                                            {scoreGrade(r.score)}
                                                        </div>
                                                        <div className={`text-2xl font-black ${scoreTextColor(r.score)}`}>{r.score}</div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
}
