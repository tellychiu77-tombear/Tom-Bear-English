'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

const ENGLISH_CLASSES = Array.from({ length: 26 }, (_, i) => `CEI-${String.fromCharCode(65 + i)}`);
const ALL_CLASSES = ['課後輔導班', ...ENGLISH_CLASSES];

export default function GradesPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [role, setRole] = useState<string | null>(null);

    // 🟢 核心：分頁狀態
    const [activeTab, setActiveTab] = useState<'entry' | 'history'>('entry');

    // ============ Tab 1: 成績登錄 ============
    const [entryClass, setEntryClass] = useState('');
    const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
    const [entryExamName, setEntryExamName] = useState('');

    // 資料狀態
    const [classStudents, setClassStudents] = useState<any[]>([]); // 目前班級的「在學學生」
    const [scores, setScores] = useState<Record<string, string>>({}); // { studentId: score }
    const [isUpdateMode, setIsUpdateMode] = useState(false);

    // ============ Tab 2: 歷史紀錄 (Historical Records) ============
    const [historyMonth, setHistoryMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [historyClass, setHistoryClass] = useState('');
    const [groupedHistory, setGroupedHistory] = useState<any[]>([]); // 依照月份分組的歷史資料
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set()); // 展開的行 Key

    // 1. Init
    useEffect(() => {
        checkUser();
    }, []);

    const checkUser = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        const r = profile?.role || 'parent';

        if (r === 'parent') {
            setRole('parent'); // 家長應導向其他頁面，此處保留邏輯
        } else {
            setRole(r);
            setLoading(false);
            fetchHistory(); // 預載歷史
        }
    };

    // ============ 功能 A: 成績登錄邏輯 ============

    // 當 Class 改變 -> 抓取 Valid Students
    useEffect(() => {
        if (entryClass) {
            fetchClassStudents(entryClass);
        } else {
            // 清空避免殘留
            setClassStudents([]);
            setScores({});
        }
    }, [entryClass]);

    // Smart Load: 當 (Class + Date + Name) 改變 && 學生名單已載入 -> 檢查是否為編輯模式
    useEffect(() => {
        if (entryClass && entryDate && entryExamName && classStudents.length > 0) {
            checkExistingScores();
        }
    }, [entryClass, entryDate, entryExamName, classStudents]);

    const fetchClassStudents = async (cls: string) => {
        // 只抓取目前存在的學生 (避免幽靈人口)
        const { data } = await supabase
            .from('students')
            .select('id, chinese_name, grade')
            .ilike('grade', `%${cls}%`)
            .order('chinese_name');

        if (data) {
            setClassStudents(data);
            // 注意：這裡不主動清空 scores，因為如果是從「歷史紀錄」載入的，scores 會由 checkExistingScores 填入
            // 但如果是手動切換班級， scores 應該清空。
            // 我們交由 checkExistingScores 決定是否覆蓋
        }
    };

    const checkExistingScores = async () => {
        const studentIds = classStudents.map(s => s.id);
        if (studentIds.length === 0) return;

        const { data } = await supabase
            .from('exam_results')
            .select('*')
            .in('student_id', studentIds)
            .eq('exam_date', entryDate)
            .eq('exam_name', entryExamName);

        if (data && data.length > 0) {
            // ⚠️ 編輯模式
            setIsUpdateMode(true);
            const loadedScores: Record<string, string> = {};
            data.forEach((r: any) => {
                loadedScores[r.student_id] = r.score.toString();
            });
            setScores(loadedScores);
        } else {
            // ✨ 新增模式 (若不是從歷史點進來，應該是空的)
            // 只有當確定「從未填寫過」才清空，避免使用者打到一半被清掉(?)
            // 不，Smart Load 的定義就是：有就載入，沒有就清空(代表新考試)
            setIsUpdateMode(false);
            setScores({});
        }
    };

    const handleSave = async () => {
        if (!entryClass || !entryExamName) return alert('請填寫完整資訊');

        const validEntries = Object.entries(scores).filter(([_, v]) => v !== '');
        if (validEntries.length === 0) return alert('請至少輸入一筆成績');

        const modeText = isUpdateMode ? '更新' : '儲存';
        if (!confirm(`確定要${modeText}這 ${validEntries.length} 筆成績嗎？`)) return;

        const targetStudentIds = validEntries.map(([sid]) => sid);

        // 防呆：先刪除舊資料 (避免重複)
        const { error: delErr } = await supabase.from('exam_results')
            .delete()
            .in('student_id', targetStudentIds)
            .eq('exam_date', entryDate)
            .eq('exam_name', entryExamName);

        if (delErr) {
            console.error(delErr);
            return alert('系統錯誤：無法清除舊資料');
        }

        // 寫入新資料
        const payload = validEntries.map(([sid, val]) => ({
            student_id: sid,
            exam_name: entryExamName,
            exam_date: entryDate,
            score: parseInt(val),
            full_score: 100
        }));

        const { error } = await supabase.from('exam_results').insert(payload);

        if (error) {
            alert(`❌ ${modeText}失敗: ` + error.message);
        } else {
            alert(`✅ ${modeText}成功！`);
            fetchHistory(); // 刷新歷史
            checkExistingScores(); // 重新確認狀態
        }
    };


    // ============ 功能 B: 歷史紀錄 (Accordion & Grouping) ============

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

        if (historyMonth) {
            query = query.gte('exam_date', `${historyMonth}-01`).lte('exam_date', `${historyMonth}-31`);
        }

        const { data } = await query;
        if (!data) return;

        // 1. 資料清洗：移除無效學生 (Deleted Students)
        const validRecords = data.filter((r: any) => r.student && r.student.id);

        // 2. 班級篩選
        let filtered = validRecords;
        if (historyClass) {
            filtered = filtered.filter((r: any) => r.student?.grade?.includes(historyClass));
        }

        // 3. 去重 (Deduplication) - 同學生同場考試只留一筆
        const uniqueMap = new Map();
        filtered.forEach((r: any) => {
            const k = `${r.exam_date}_${r.exam_name}_${r.student.id}`;
            if (!uniqueMap.has(k)) uniqueMap.set(k, r);
        });
        const cleanedData = Array.from(uniqueMap.values());

        // 4. 分組邏輯：Key = Date + ExamName + MainClass
        // 因為沒有直接紀錄 Exam 的 Class，我們用「該場考試學生的多數班級」來推斷
        const groupedMap: Record<string, any[]> = {};

        cleanedData.forEach((r: any) => {
            // 推斷班級: 先簡單用 Date+Name 分組，後續再統計 Class
            const key = `${r.exam_date}::${r.exam_name}`;
            if (!groupedMap[key]) groupedMap[key] = [];
            groupedMap[key].push(r);
        });

        // 轉為列表並計算統計數據
        const list = Object.entries(groupedMap).map(([key, items]) => {
            const [date, name] = key.split('::');

            // 找出 Main Class
            const classCounts: Record<string, number> = {};
            items.forEach(i => {
                const g = i.student?.grade || 'Unknown';
                classCounts[g] = (classCounts[g] || 0) + 1;
            });
            const mainClass = Object.keys(classCounts).sort((a, b) => classCounts[b] - classCounts[a])[0];

            const avg = Math.round(items.reduce((sum, i) => sum + i.score, 0) / items.length);

            return {
                key, // Unique ID for the row
                date,
                name,
                mainClass,
                avg,
                count: items.length,
                records: items // 詳細名單
            };
        });

        // 5. 若需依照月份視覺分組，這裡先單純回傳 List，渲染時再切分
        // 為了符合「視覺優化：月份分組」，我們在 Render 層處理，這裡回傳扁平 List 即可 (已按日期排序)
        // 重新按日期排序 List
        list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        setGroupedHistory(list);
    };

    const handleEditRecord = (record: any) => {
        // 核心修復：防止狀態殘留跳動
        // 1. 清空狀態
        setClassStudents([]);
        setScores({});

        // 2. 設定目標參數
        setEntryClass(record.mainClass);
        setEntryDate(record.date);
        setEntryExamName(record.name);

        // 3. 切換 Tab (這會觸發 useEffect fetchClassStudents -> 接著 useEffect checkExistingScores)
        setActiveTab('entry');
    };

    const toggleRow = (key: string) => {
        const newSet = new Set(expandedRows);
        if (newSet.has(key)) newSet.delete(key);
        else newSet.add(key);
        setExpandedRows(newSet);
    };

    // Helper: Group by Month for Display
    const displayGroups = groupedHistory.reduce((acc: any, cur: any) => {
        const monthKey = cur.date.slice(0, 7); // YYYY-MM
        if (!acc[monthKey]) acc[monthKey] = [];
        acc[monthKey].push(cur);
        return acc;
    }, {});


    if (loading) return <div className="p-10 text-center animate-pulse text-gray-400">系統載入中...</div>;
    if (role === 'parent') return <div className="p-10 text-center text-gray-500">家長請由首頁查看子女成績</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans text-gray-800">
            <div className="max-w-6xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-gray-900">📊 成績管理系統</h1>
                        <p className="text-gray-500 text-sm mt-1">Grade Management System</p>
                    </div>
                    <button onClick={() => router.push('/')} className="px-5 py-2 bg-white border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition shadow-sm">
                        回首頁
                    </button>
                </div>

                {/* Tabs */}
                <div className="bg-white p-1.5 rounded-2xl shadow-sm border border-gray-200 inline-flex">
                    <button
                        onClick={() => setActiveTab('entry')}
                        className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'entry' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                    >
                        <span>📝</span> 成績登錄
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'history' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                    >
                        <span>🗂️</span> 歷史紀錄
                    </button>
                </div>

                {/* === Tab 1: Entry === */}
                {activeTab === 'entry' && (
                    <div className="animate-fade-in space-y-6">
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 grid md:grid-cols-3 gap-6">
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">選擇班級 (Class)</label>
                                <select
                                    className="w-full text-lg font-bold bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-xl p-3 outline-none transition"
                                    value={entryClass}
                                    onChange={e => setEntryClass(e.target.value)}
                                >
                                    <option value="">-- 請選擇 --</option>
                                    {ALL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">考試名稱 (Exam Name)</label>
                                <input
                                    type="text"
                                    placeholder="例: Unit 1 Quiz"
                                    className="w-full text-lg font-bold bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-xl p-3 outline-none transition"
                                    value={entryExamName}
                                    onChange={e => setEntryExamName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">日期 (Date)</label>
                                <input
                                    type="date"
                                    className="w-full text-lg font-bold bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-xl p-3 outline-none transition"
                                    value={entryDate}
                                    onChange={e => setEntryDate(e.target.value)}
                                />
                            </div>
                        </div>

                        {entryClass && (
                            <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden">
                                <div className={`p-4 border-b flex items-center justify-between ${isUpdateMode ? 'bg-orange-50 border-orange-100' : 'bg-indigo-50 border-indigo-100'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${isUpdateMode ? 'bg-orange-200 text-orange-700' : 'bg-indigo-200 text-indigo-700'}`}>
                                            {isUpdateMode ? '⚠️' : '✨'}
                                        </div>
                                        <span className={`text-lg font-black ${isUpdateMode ? 'text-orange-800' : 'text-indigo-800'}`}>
                                            {isUpdateMode ? '編輯現有成績 (Update Mode)' : '新增成績 (Create Mode)'}
                                        </span>
                                    </div>
                                    <span className="font-bold text-gray-400">{classStudents.length} Students</span>
                                </div>

                                <div className="p-2 divide-y divide-gray-50">
                                    {classStudents.length === 0 ? (
                                        <div className="p-10 text-center text-gray-400">此班級尚無學生資料</div>
                                    ) : (
                                        classStudents.map((s, idx) => (
                                            <div key={s.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition group">
                                                <div className="flex items-center gap-4">
                                                    <span className="w-8 text-center font-mono text-gray-300 font-bold">{idx + 1}</span>
                                                    <span className="text-lg font-bold text-gray-700">{s.chinese_name}</span>
                                                </div>
                                                <input
                                                    type="number"
                                                    placeholder="-"
                                                    className={`w-24 text-center text-xl font-bold p-2 rounded-xl outline-none border-2 transition
                                                        ${scores[s.id]
                                                            ? (Number(scores[s.id]) >= 100 ? 'border-green-400 bg-green-50 text-green-700' : Number(scores[s.id]) < 60 ? 'border-red-300 bg-red-50 text-red-600' : 'border-indigo-200 bg-indigo-50 text-indigo-700')
                                                            : 'border-gray-100 bg-gray-50 focus:bg-white focus:border-indigo-400'
                                                        }
                                                    `}
                                                    value={scores[s.id] || ''}
                                                    onChange={e => setScores(p => ({ ...p, [s.id]: e.target.value }))}
                                                    onFocus={e => e.target.select()}
                                                />
                                            </div>
                                        ))
                                    )}
                                </div>

                                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                                    <button
                                        onClick={handleSave}
                                        className={`px-8 py-3 rounded-2xl font-black text-white shadow-lg active:scale-95 transition flex items-center gap-2
                                            ${isUpdateMode ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}
                                        `}
                                    >
                                        <span>{isUpdateMode ? '🔄 更新成績' : '💾 儲存成績'}</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* === Tab 2: History (Accordion) === */}
                {activeTab === 'history' && (
                    <div className="animate-fade-in space-y-8">
                        {/* Filters */}
                        <div className="flex gap-4">
                            <div className="flex-1 bg-white p-3 rounded-2xl border border-gray-200 flex items-center gap-2 shadow-sm">
                                <span className="text-gray-400 pl-2">📅</span>
                                <input
                                    type="month"
                                    className="w-full font-bold text-gray-700 outline-none bg-transparent"
                                    value={historyMonth}
                                    onChange={e => setHistoryMonth(e.target.value)}
                                />
                            </div>
                            <div className="flex-1 bg-white p-3 rounded-2xl border border-gray-200 flex items-center gap-2 shadow-sm">
                                <span className="text-gray-400 pl-2">🏫</span>
                                <select
                                    className="w-full font-bold text-gray-700 outline-none bg-transparent"
                                    value={historyClass}
                                    onChange={e => setHistoryClass(e.target.value)}
                                >
                                    <option value="">所有班級</option>
                                    {ALL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* List by Month */}
                        {Object.keys(displayGroups).length === 0 ? (
                            <div className="p-20 text-center text-gray-400 bg-white rounded-3xl border border-dashed border-gray-200">
                                查無紀錄
                            </div>
                        ) : (
                            Object.entries(displayGroups).sort().reverse().map(([month, items]: [string, any]) => (
                                <div key={month} className="space-y-3">
                                    <h3 className="text-lg font-black text-gray-400 pl-2">{month}</h3>

                                    <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
                                        <table className="w-full text-left">
                                            <thead className="bg-gray-50 border-b border-gray-100">
                                                <tr>
                                                    <th className="p-4 text-xs font-black text-gray-400 uppercase tracking-wider">Date</th>
                                                    <th className="p-4 text-xs font-black text-gray-400 uppercase tracking-wider">Exam Name</th>
                                                    <th className="p-4 text-xs font-black text-gray-400 uppercase tracking-wider">Class</th>
                                                    <th className="p-4 text-xs font-black text-gray-400 uppercase tracking-wider text-center">Avg</th>
                                                    <th className="p-4 text-xs font-black text-gray-400 uppercase tracking-wider text-center">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {items.map((row: any) => (
                                                    <>
                                                        {/* Main Row */}
                                                        <tr
                                                            key={row.key}
                                                            onClick={() => toggleRow(row.key)}
                                                            className="hover:bg-gray-50 cursor-pointer transition group"
                                                        >
                                                            <td className="p-4 font-mono font-bold text-gray-500 text-sm">{row.date}</td>
                                                            <td className="p-4 font-bold text-gray-800 text-lg">{row.name}</td>
                                                            <td className="p-4">
                                                                <span className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold">{row.mainClass}</span>
                                                            </td>
                                                            <td className="p-4 text-center">
                                                                <span className={`font-black ${row.avg >= 90 ? 'text-green-500' : row.avg < 60 ? 'text-red-500' : 'text-blue-500'}`}>
                                                                    {row.avg}
                                                                </span>
                                                            </td>
                                                            <td className="p-4 text-center">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation(); // prevent toggle
                                                                        handleEditRecord(row);
                                                                    }}
                                                                    className="px-4 py-2 bg-white border border-gray-200 text-gray-500 hover:text-indigo-600 hover:border-indigo-200 rounded-xl text-xs font-bold transition shadow-sm"
                                                                >
                                                                    ✏️ 載入修改
                                                                </button>
                                                            </td>
                                                        </tr>

                                                        {/* Expanded Row */}
                                                        {expandedRows.has(row.key) && (
                                                            <tr className="bg-gray-50/50 animate-fade-in">
                                                                <td colSpan={5} className="p-4">
                                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-2">
                                                                        {row.records.map((r: any) => (
                                                                            <div key={r.id} className="bg-white p-3 rounded-xl border border-gray-100 flex justify-between items-center">
                                                                                <span className="font-bold text-gray-600 text-sm">{r.student.chinese_name}</span>
                                                                                <span className={`font-black text-lg ${r.score >= 100 ? 'text-green-600' : r.score < 60 ? 'text-red-500' : 'text-gray-800'}`}>
                                                                                    {r.score}
                                                                                </span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}