'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { logAction } from '@/lib/logService';
import { getEffectivePermissions } from '@/lib/permissions';

const ENGLISH_CLASSES = Array.from({ length: 26 }, (_, i) => `CEI-${String.fromCharCode(65 + i)}`);
const ALL_CLASSES = ['課後輔導班', ...ENGLISH_CLASSES];

export default function GradesPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [role, setRole] = useState<string | null>(null);
    const [canViewGrades, setCanViewGrades] = useState(false);
    const [canEditGrades, setCanEditGrades] = useState(false);

    // 分頁
    const [activeTab, setActiveTab] = useState<'entry' | 'history'>('entry');

    // ============ Tab 1: 成績登錄 ============
    const [entryClass, setEntryClass] = useState('');
    const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
    const [entryExamName, setEntryExamName] = useState('');

    // 資料與狀態
    const [classStudents, setClassStudents] = useState<any[]>([]);
    const [scores, setScores] = useState<Record<string, string>>({});
    const [isUpdateMode, setIsUpdateMode] = useState(false);

    // 🔔 訊息狀態 (取代 alert)
    const [statusMsg, setStatusMsg] = useState<{ type: 'error' | 'success' | 'info' | '', text: string }>({ type: '', text: '' });

    // 存檔按鈕 Ref
    const saveButtonRef = useRef<HTMLButtonElement>(null);

    // ============ Tab 2: 歷史紀錄 ============
    const [historyMonth, setHistoryMonth] = useState('');
    const [historyClass, setHistoryClass] = useState('');
    const [groupedHistory, setGroupedHistory] = useState<any[]>([]);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    useEffect(() => {
        checkUser();
    }, []);

    const checkUser = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }
        const { data: profile } = await supabase.from('users').select('role, extra_permissions').eq('id', session.user.id).single();
        const r = profile?.role || 'parent';

        // 計算有效權限
        const { data: roleConfigRow } = await supabase
            .from('role_configs')
            .select('permissions')
            .eq('role', r)
            .single();
        const perms = getEffectivePermissions(r, roleConfigRow?.permissions ?? null, profile?.extra_permissions ?? null);

        setCanViewGrades(perms.viewGrades);
        setCanEditGrades(perms.editGrades);
        setRole(r);
        setLoading(false);
        if (perms.viewGrades) fetchHistory();
    };

    // --- 邏輯 A: 成績登錄 ---

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
        let searchTerm = cls;

        // 🚨 關鍵修正：針對「課後輔導班」做模糊處理
        // 這樣 "CEI-A, 課後輔導" 或 "課後輔導班" 通通都抓得到！
        if (cls === '課後輔導班') {
            searchTerm = '課後輔導';
        }

        const { data } = await supabase
            .from('students')
            .select('id, chinese_name, grade')
            .ilike('grade', `%${searchTerm}%`) // 使用修正後的關鍵字搜尋
            .order('chinese_name');

        if (data) setClassStudents(data);
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
            setIsUpdateMode(true);
            const loadedScores: Record<string, string> = {};
            data.forEach((r: any) => {
                loadedScores[r.student_id] = r.score.toString();
            });
            setScores(loadedScores);
            setStatusMsg({ type: 'info', text: '⚠️ 偵測到已有成績，目前為編輯模式' });
        } else {
            setIsUpdateMode(false);
            setStatusMsg({ type: '', text: '' });
        }
    };

    // 🎹 鍵盤導航：Enter 跳下一格
    const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const nextInputId = `score-input-${index + 1}`;
            const nextInput = document.getElementById(nextInputId);
            if (nextInput) {
                (nextInput as HTMLInputElement).focus();
            } else {
                saveButtonRef.current?.focus();
            }
        }
    };

    // 🧮 計算即時平均
    const calculateAverage = () => {
        const validScores = Object.values(scores).filter(s => s !== '').map(Number);
        if (validScores.length === 0) return 0;
        const sum = validScores.reduce((a, b) => a + b, 0);
        return Math.round(sum / validScores.length);
    };

    const handleSave = async () => {
        setStatusMsg({ type: '', text: '' }); // 重置訊息

        // 1. 檢查必填
        if (!entryClass) return setStatusMsg({ type: 'error', text: '請選擇班級 (Class)' });
        if (!entryExamName) return setStatusMsg({ type: 'error', text: '請填寫考試名稱 (Exam Name)' }); // 👈 這裡會直接告訴您少了名稱！

        const validEntries = Object.entries(scores).filter(([_, v]) => v !== '');
        if (validEntries.length === 0) return setStatusMsg({ type: 'error', text: '請至少輸入一筆成績' });

        // 開始儲存
        setStatusMsg({ type: 'info', text: '⏳ 儲存中...' });

        try {
            const targetStudentIds = validEntries.map(([sid]) => sid);

            // 1. 刪除舊資料
            const { error: delErr } = await supabase.from('exam_results')
                .delete()
                .in('student_id', targetStudentIds)
                .eq('exam_date', entryDate)
                .eq('exam_name', entryExamName);

            if (delErr) throw delErr;

            // 2. 寫入新資料
            const payload = validEntries.map(([sid, val]) => ({
                student_id: sid,
                exam_name: entryExamName,
                exam_date: entryDate,
                score: parseInt(val, 10),
                full_score: 100
            }));

            const { error: insertErr } = await supabase.from('exam_results').insert(payload);
            if (insertErr) throw insertErr;

            // 3. 成功
            const time = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
            setStatusMsg({ type: 'success', text: `✅ 已於 ${time} 成功儲存！` });

            setIsUpdateMode(true);
            fetchHistory();

        } catch (e: any) {
            console.error(e);
            setStatusMsg({ type: 'error', text: `❌ 錯誤: ${e.message}` });
        }
    };

    // --- 邏輯 B: 歷史紀錄 ---
    const fetchHistory = async () => {
        let query = supabase.from('exam_results').select(`*, student:students(id, chinese_name, grade)`).order('exam_date', { ascending: false });
        if (historyMonth) query = query.gte('exam_date', `${historyMonth}-01`).lte('exam_date', `${historyMonth}-31`);
        const { data } = await query;
        if (!data) return;
        const validRecords = data.filter((r: any) => r.student && r.student.id);
        let filtered = validRecords;
        if (historyClass) filtered = filtered.filter((r: any) => r.student?.grade?.includes(historyClass));

        const groupedMap: Record<string, any[]> = {};
        filtered.forEach((r: any) => {
            const key = `${r.exam_date}::${r.exam_name}`;
            if (!groupedMap[key]) groupedMap[key] = [];
            groupedMap[key].push(r);
        });

        const list = Object.entries(groupedMap).map(([key, items]) => {
            const [date, name] = key.split('::');
            const classCounts: Record<string, number> = {};
            items.forEach(i => {
                const g = i.student?.grade || 'Unknown';
                classCounts[g] = (classCounts[g] || 0) + 1;
            });
            const mainClass = Object.keys(classCounts).sort((a, b) => classCounts[b] - classCounts[a])[0];
            const avg = Math.round(items.reduce((sum, i) => sum + i.score, 0) / items.length);
            return { key, date, name, mainClass, avg, count: items.length, records: items };
        });

        list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setGroupedHistory(list);
    };

    const handleEditRecord = (record: any) => {
        setEntryClass(record.mainClass);
        setEntryDate(record.date);
        setEntryExamName(record.name);
        const loadedScores: Record<string, string> = {};
        record.records.forEach((r: any) => {
            loadedScores[r.student_id] = r.score.toString();
        });
        setScores(loadedScores);
        setIsUpdateMode(true);
        setStatusMsg({ type: 'info', text: '📝 已載入歷史資料，請修改後儲存' });
        setActiveTab('entry');
    };

    const toggleRow = (key: string) => {
        const newSet = new Set(expandedRows);
        if (newSet.has(key)) newSet.delete(key);
        else newSet.add(key);
        setExpandedRows(newSet);
    };

    if (loading) return <div className="p-10 text-center animate-pulse text-gray-400">系統載入中...</div>;
    if (!canViewGrades) return <div className="p-10 text-center text-gray-500">您沒有查看成績的權限，請聯絡管理人員。</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans text-gray-800">
            <div className="max-w-6xl mx-auto space-y-8">

                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-gray-900">📊 成績管理系統</h1>
                        <p className="text-gray-500 text-sm mt-1">Grade Management System</p>
                    </div>
                    <button onClick={() => router.push('/')} className="px-5 py-2 bg-white border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition shadow-sm">
                        回首頁
                    </button>
                </div>

                <div className="bg-white p-1.5 rounded-2xl shadow-sm border border-gray-200 inline-flex">
                    <button onClick={() => setActiveTab('entry')} className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'entry' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}>
                        <span>📝</span> 成績登錄
                    </button>
                    <button onClick={() => setActiveTab('history')} className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'history' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}>
                        <span>🗂️</span> 歷史紀錄
                    </button>
                </div>

                {/* === Tab 1: Entry === */}
                {activeTab === 'entry' && (
                    <div className="animate-fade-in space-y-6">
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 grid md:grid-cols-3 gap-6">
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">選擇班級 (Class)</label>
                                <select className="w-full text-lg font-bold bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-xl p-3 outline-none transition" value={entryClass} onChange={e => setEntryClass(e.target.value)}>
                                    <option value="">-- 請選擇 --</option>
                                    {ALL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">考試名稱 (Exam Name) <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    placeholder="請輸入名稱 (例: Unit 1)"
                                    className={`w-full text-lg font-bold bg-gray-50 border-2 rounded-xl p-3 outline-none transition ${!entryExamName ? 'border-red-200 bg-red-50' : 'border-transparent focus:border-indigo-500'}`}
                                    value={entryExamName}
                                    onChange={e => setEntryExamName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">日期 (Date)</label>
                                <input type="date" className="w-full text-lg font-bold bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-xl p-3 outline-none transition" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
                            </div>
                        </div>

                        {entryClass && (
                            <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden">
                                <div className={`p-4 border-b flex items-center justify-between ${isUpdateMode ? 'bg-orange-50 border-orange-100' : 'bg-indigo-50 border-indigo-100'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${isUpdateMode ? 'bg-orange-200 text-orange-700' : 'bg-indigo-200 text-indigo-700'}`}>
                                            {isUpdateMode ? '✏️' : '✨'}
                                        </div>
                                        <div>
                                            <div className={`text-lg font-black ${isUpdateMode ? 'text-orange-800' : 'text-indigo-800'}`}>
                                                {isUpdateMode ? '編輯模式' : '新增模式'}
                                            </div>
                                            <div className="text-xs text-gray-500">{classStudents.length} 位學生</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-gray-400 text-xs">平均分數</div>
                                        <div className="font-black text-2xl text-gray-800">{calculateAverage()} <span className="text-xs font-normal text-gray-400">分</span></div>
                                    </div>
                                </div>

                                <div className="p-2 divide-y divide-gray-50 max-h-[60vh] overflow-y-auto">
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
                                                    id={`score-input-${idx}`}
                                                    type="number"
                                                    placeholder="-"
                                                    onKeyDown={(e) => handleKeyDown(e, idx)}
                                                    className={`w-32 text-center text-2xl font-black p-2 rounded-xl outline-none border-2 transition focus:ring-4 focus:ring-indigo-100
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

                                {/* 👇 這裡是最重要的修改：把 alert 換成 Status Message Bar */}
                                <div className="p-4 border-t border-gray-100 bg-gray-50 flex flex-col md:flex-row justify-end items-center gap-4">

                                    {/* 訊息顯示區 */}
                                    {statusMsg.text && (
                                        <div className={`px-4 py-2 rounded-lg font-bold text-sm animate-pulse
                                            ${statusMsg.type === 'error' ? 'bg-red-100 text-red-600' :
                                                statusMsg.type === 'success' ? 'bg-green-100 text-green-700' :
                                                    'bg-blue-100 text-blue-700'}
                                        `}>
                                            {statusMsg.text}
                                        </div>
                                    )}

                                    {canEditGrades ? (
                                        <button
                                            ref={saveButtonRef}
                                            onClick={handleSave}
                                            className={`px-8 py-3 rounded-2xl font-black text-white shadow-lg active:scale-95 transition flex items-center gap-2
                                                ${isUpdateMode ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}
                                            `}
                                        >
                                            <span>{isUpdateMode ? '💾 儲存變更' : '💾 確認儲存'}</span>
                                        </button>
                                    ) : (
                                        <div className="px-4 py-2 bg-gray-100 text-gray-500 rounded-xl text-sm font-bold">👀 僅供查看</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* === Tab 2: History === */}
                {activeTab === 'history' && (
                    <div className="animate-fade-in space-y-8">
                        {/* (歷史紀錄這部分保持原樣，沒有變動) */}
                        <div className="flex gap-4">
                            <div className="flex-1 bg-white p-3 rounded-2xl border border-gray-200 flex items-center gap-2 shadow-sm">
                                <span className="text-gray-400 pl-2">📅</span>
                                <input type="month" className="w-full font-bold text-gray-700 outline-none bg-transparent" value={historyMonth} onChange={e => setHistoryMonth(e.target.value)} />
                            </div>
                            <div className="flex-1 bg-white p-3 rounded-2xl border border-gray-200 flex items-center gap-2 shadow-sm">
                                <span className="text-gray-400 pl-2">🏫</span>
                                <select className="w-full font-bold text-gray-700 outline-none bg-transparent" value={historyClass} onChange={e => setHistoryClass(e.target.value)}>
                                    <option value="">所有班級</option>
                                    {ALL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        </div>
                        {groupedHistory.length === 0 ? (
                            <div className="p-20 text-center text-gray-400 bg-white rounded-3xl border border-dashed border-gray-200">查無紀錄</div>
                        ) : (
                            <div className="space-y-4">
                                {groupedHistory.map((row: any) => (
                                    <div key={row.key} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                                        <div className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition" onClick={() => toggleRow(row.key)}>
                                            <div className="flex items-center gap-4">
                                                <div className="bg-indigo-50 text-indigo-600 p-2 rounded-lg font-bold text-xs text-center min-w-[60px]">{row.date}</div>
                                                <div>
                                                    <h3 className="font-bold text-gray-800 text-lg">{row.name}</h3>
                                                    <span className="text-xs text-gray-400 font-bold">{row.mainClass} • {row.count} 位學生</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="text-right">
                                                    <div className="text-xs text-gray-400 font-bold">平均</div>
                                                    <div className={`font-black text-xl ${row.avg >= 90 ? 'text-green-500' : row.avg < 60 ? 'text-red-500' : 'text-blue-500'}`}>{row.avg}</div>
                                                </div>
                                                <button onClick={(e) => { e.stopPropagation(); handleEditRecord(row); }} className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition font-bold text-xs">
                                                    ✏️ 編輯
                                                </button>
                                            </div>
                                        </div>
                                        {expandedRows.has(row.key) && (
                                            <div className="bg-gray-50 p-4 border-t border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in">
                                                {row.records.map((r: any) => (
                                                    <div key={r.id} className="bg-white p-3 rounded-xl border border-gray-200 flex justify-between items-center">
                                                        <span className="font-bold text-gray-600 text-sm">{r.student.chinese_name}</span>
                                                        <span className={`font-black text-lg ${r.score >= 100 ? 'text-green-600' : r.score < 60 ? 'text-red-500' : 'text-gray-800'}`}>{r.score}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}