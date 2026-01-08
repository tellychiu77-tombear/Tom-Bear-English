'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

const ENGLISH_CLASSES = Array.from({ length: 26 }, (_, i) => `CEI-${String.fromCharCode(65 + i)}`);
const ALL_CLASSES = ['課後輔導班', ...ENGLISH_CLASSES];

export default function StudentsPage() {
    const [students, setStudents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterClass, setFilterClass] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // 🟢 兵籍資料 Modal 狀態 (查看模式)
    const [viewingStudent, setViewingStudent] = useState<any>(null);
    const [studentStats, setStudentStats] = useState({
        avgScore: 0,
        lastExam: { name: '-', score: 0 },
        totalLeaves: 0,
        grades: [] as any[],
        leaves: [] as any[]
    });

    // 🟢 編輯學生 Modal 狀態 (編輯模式)
    const [editingStudent, setEditingStudent] = useState<any>(null);
    const [editName, setEditName] = useState('');
    const [editGrade, setEditGrade] = useState('CEI-A');
    const [editAfterSchool, setEditAfterSchool] = useState(false);
    const [editStatusNote, setEditStatusNote] = useState(''); // 新增：狀況備註

    const router = useRouter();

    useEffect(() => {
        fetchStudents();
    }, []);

    async function fetchStudents() {
        setLoading(true);
        const { data } = await supabase
            .from('students')
            .select(`
        *,
        parent:profiles (full_name, email, phone)
      `)
            .order('grade', { ascending: true })
            .order('chinese_name', { ascending: true });

        if (data) setStudents(data);
        setLoading(false);
    }

    // --- 功能 A：開啟兵籍資料 (分析用) ---
    async function openStudentProfile(student: any) {
        setViewingStudent(student);

        // 抓成績
        const { data: grades } = await supabase.from('exam_results').select('*').eq('student_id', student.id).order('exam_date', { ascending: true });
        // 抓請假
        const { data: leaves } = await supabase.from('leave_requests').select('*').eq('student_id', student.id).eq('status', 'approved').order('start_date', { ascending: false });

        // 計算 KPI
        let avg = 0;
        let last = { name: '無紀錄', score: 0 };
        if (grades && grades.length > 0) {
            const total = grades.reduce((acc, curr) => acc + curr.score, 0);
            avg = Math.round(total / grades.length);
            const lastRec = grades[grades.length - 1];
            last = { name: lastRec.exam_name, score: lastRec.score };
        }

        setStudentStats({
            avgScore: avg,
            lastExam: last,
            totalLeaves: leaves?.length || 0,
            grades: grades || [],
            leaves: leaves || []
        });
    }

    // --- 功能 B：開啟編輯視窗 (管理用) ---
    function openEditModal(student: any) {
        setEditingStudent(student);
        setEditName(student.chinese_name);
        // 載入備註
        setEditStatusNote(student.status_note || '');

        const hasAfterSchool = student.grade.includes('課後輔導班');
        setEditAfterSchool(hasAfterSchool);
        let engClass = student.grade.replace(', 課後輔導班', '').replace('課後輔導班', '').trim();
        if (!engClass) engClass = 'CEI-A';
        setEditGrade(engClass);
    }

    // 儲存編輯
    async function saveEdit() {
        if (!editingStudent) return;
        let finalGrade = editGrade;
        if (editAfterSchool && !finalGrade.includes('課後輔導班')) finalGrade += ', 課後輔導班';
        else if (!editAfterSchool) finalGrade = finalGrade.replace(', 課後輔導班', '').replace('課後輔導班', '').trim();

        const { error } = await supabase
            .from('students')
            .update({
                chinese_name: editName,
                grade: finalGrade,
                status_note: editStatusNote // 儲存備註
            })
            .eq('id', editingStudent.id);

        if (!error) {
            alert('✅ 資料更新成功');
            setEditingStudent(null);
            fetchStudents();
        } else {
            alert('失敗: ' + error.message);
        }
    }

    // 刪除學生
    async function deleteStudent(id: string) {
        if (!confirm('確定要刪除此學生嗎？所有成績與紀錄將會消失！')) return;
        const { error } = await supabase.from('students').delete().eq('id', id);
        if (!error) fetchStudents();
    }

    const filteredStudents = students.filter(s => {
        const matchClass = filterClass ? s.grade.includes(filterClass) : true;
        const matchSearch = searchTerm ? s.chinese_name.includes(searchTerm) : true;
        return matchClass && matchSearch;
    });

    // SVG 圖表元件
    const MiniLineChart = ({ data }: { data: any[] }) => {
        if (!data || data.length === 0) return <div className="h-32 flex items-center justify-center text-gray-300 bg-gray-50 rounded border border-dashed">尚無成績數據</div>;
        const height = 120;
        const points = data.map((d, index) => {
            const x = (index / (data.length - 1 || 1)) * 100;
            const y = height - (d.score / 100) * height;
            return `${x},${y}`;
        }).join(' ');

        return (
            <div className="relative h-[140px] w-full bg-white p-2 rounded border border-gray-100">
                <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
                    <line x1="0" y1={height * 0.4} x2="100" y2={height * 0.4} stroke="#fee2e2" strokeWidth="0.5" strokeDasharray="2" />
                    <polyline fill="none" stroke="#3b82f6" strokeWidth="1.5" points={points} vectorEffect="non-scaling-stroke" />
                    {data.map((d, i) => (
                        <circle key={i} cx={(i / (data.length - 1 || 1)) * 100} cy={height - (d.score / 100) * height} r="2.5" fill="white" stroke={d.score >= 90 ? '#10b981' : d.score < 60 ? '#ef4444' : '#3b82f6'} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                    ))}
                </svg>
            </div>
        );
    };

    if (loading) return <div className="p-8 text-center">載入中...</div>;

    return (
        <div className="min-h-screen bg-indigo-50 p-6">
            <div className="max-w-7xl mx-auto"> {/* 版面加寬 */}
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-indigo-900 flex items-center gap-2">
                        📂 全校學生管理中心
                        <span className="text-sm bg-white text-indigo-600 px-3 py-1 rounded-full shadow-sm">共 {students.length} 人</span>
                    </h1>
                    <button onClick={() => router.push('/')} className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">回首頁</button>
                </div>

                {/* 🔍 搜尋列 */}
                <div className="bg-white p-4 rounded-xl shadow-sm mb-6 flex flex-wrap gap-4 items-center">
                    <select className="p-2 border rounded bg-gray-50" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
                        <option value="">全校班級</option>
                        {ALL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input
                        type="text"
                        placeholder="搜尋學生姓名..."
                        className="p-2 border rounded bg-gray-50 flex-1"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    <button className="bg-indigo-600 text-white px-4 py-2 rounded shadow hover:bg-indigo-700 font-bold" onClick={() => openEditModal({ chinese_name: '', grade: 'CEI-A' })}>
                        + 新增學生
                    </button>
                </div>

                {/* 📋 學生列表 */}
                <div className="bg-white rounded-xl shadow overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-indigo-100 border-b border-indigo-200">
                            <tr>
                                <th className="p-4 text-left font-bold text-indigo-800 w-32">班級</th>
                                <th className="p-4 text-left font-bold text-indigo-800 w-48">姓名</th>
                                <th className="p-4 text-left font-bold text-indigo-800">狀況備註 / 家長</th>
                                <th className="p-4 text-right font-bold text-indigo-800 w-64">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filteredStudents.map(student => (
                                <tr key={student.id} className="hover:bg-indigo-50 transition group">
                                    <td className="p-4 align-top">
                                        <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-bold text-sm block w-fit mb-1">
                                            {student.grade.split(',')[0]}
                                        </span>
                                        {student.grade.includes('課後輔導班') && (
                                            <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-xs font-bold block w-fit">
                                                課後輔導
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4 align-top">
                                        <div className="text-xl font-bold text-gray-800 cursor-pointer hover:text-indigo-600 hover:underline" onClick={() => openStudentProfile(student)}>
                                            {student.chinese_name}
                                        </div>
                                    </td>
                                    <td className="p-4 align-top">
                                        {/* 顯示狀況備註 */}
                                        {student.status_note ? (
                                            <div className="bg-yellow-50 border border-yellow-200 text-gray-700 px-3 py-2 rounded text-sm mb-2 max-w-md">
                                                📝 {student.status_note}
                                            </div>
                                        ) : (
                                            <div className="text-gray-300 text-xs italic mb-2">- 無特殊備註 -</div>
                                        )}

                                        {/* 顯示家長 */}
                                        <div className="text-xs text-gray-400 flex items-center gap-1">
                                            {student.parent ? (
                                                <>
                                                    <span className="text-green-600 font-bold">● 已連結</span>
                                                    <span>{student.parent.full_name} ({student.parent.email})</span>
                                                </>
                                            ) : (
                                                <span className="text-red-400">● 未連結家長</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 text-right align-middle">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => openStudentProfile(student)}
                                                className="bg-purple-600 text-white px-3 py-2 rounded shadow hover:bg-purple-700 font-bold flex items-center gap-1 text-sm"
                                            >
                                                📊 檔案
                                            </button>
                                            <button
                                                onClick={() => openEditModal(student)}
                                                className="bg-white text-gray-600 border border-gray-300 px-3 py-2 rounded hover:bg-gray-100 font-bold text-sm"
                                            >
                                                ✏️ 編輯
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredStudents.length === 0 && <div className="p-10 text-center text-gray-400">查無資料</div>}
                </div>

                {/* 🟢 編輯學生 Modal (包含備註功能) */}
                {editingStudent && (
                    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4 backdrop-blur-sm">
                        <div className="bg-white p-6 rounded-xl w-full max-w-lg shadow-2xl animate-fade-in">
                            <h3 className="font-bold text-xl mb-4 text-gray-800 border-b pb-2">
                                {editingStudent.id ? `編輯資料: ${editingStudent.chinese_name}` : '新增學生'}
                            </h3>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-600 mb-1">學生姓名</label>
                                    <input type="text" className="w-full p-2 border rounded bg-gray-50 focus:bg-white" value={editName} onChange={e => setEditName(e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-600 mb-1">班級</label>
                                    <select className="w-full p-2 border rounded bg-white" value={editGrade} onChange={e => setEditGrade(e.target.value)}>
                                        {ALL_CLASSES.filter(c => c !== '課後輔導班').map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="mb-4">
                                <label className="flex items-center gap-2 p-3 border rounded bg-orange-50 cursor-pointer">
                                    <input type="checkbox" className="w-5 h-5 accent-orange-600" checked={editAfterSchool} onChange={e => setEditAfterSchool(e.target.checked)} />
                                    <span className="font-bold text-orange-800">參加課後輔導班 (安親)</span>
                                </label>
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-bold text-gray-600 mb-1">狀況備註 / 悄悄話</label>
                                <textarea
                                    className="w-full p-3 border rounded h-24 bg-yellow-50 focus:bg-white focus:ring-2 focus:ring-yellow-400 outline-none resize-none"
                                    placeholder="例如：最近感冒需吃藥、家長希望能加強單字..."
                                    value={editStatusNote}
                                    onChange={e => setEditStatusNote(e.target.value)}
                                />
                            </div>

                            <div className="flex justify-between items-center">
                                {editingStudent.id ? (
                                    <button onClick={() => deleteStudent(editingStudent.id)} className="text-red-500 hover:text-red-700 text-sm underline">刪除此學生</button>
                                ) : <div></div>}
                                <div className="flex gap-2">
                                    <button onClick={() => setEditingStudent(null)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded">取消</button>
                                    <button onClick={saveEdit} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded shadow hover:bg-indigo-700">儲存變更</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 🟢 兵籍資料 Modal (分析用 - 保持原樣) */}
                {viewingStudent && (
                    <div className="fixed inset-0 bg-gray-900/80 flex items-center justify-center z-[60] p-4 backdrop-blur-sm" onClick={() => setViewingStudent(null)}>
                        <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div className="bg-gray-800 p-6 text-white flex justify-between items-start shrink-0">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <h3 className="text-3xl font-black">{viewingStudent.chinese_name}</h3>
                                        <span className="text-sm bg-gray-600 px-2 py-1 rounded border border-gray-500">{viewingStudent.grade}</span>
                                    </div>
                                    <div className="opacity-80 text-sm flex gap-4">
                                        <span>家長: {viewingStudent.parent?.full_name || '未綁定'}</span>
                                        <span>{viewingStudent.parent?.email}</span>
                                    </div>
                                </div>
                                <button onClick={() => setViewingStudent(null)} className="bg-white/10 hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center font-bold">✕</button>
                            </div>

                            <div className="p-6 overflow-y-auto bg-gray-50 flex-1">
                                {/* 0. 備註顯示 */}
                                {viewingStudent.status_note && (
                                    <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 p-4 rounded mb-6 font-bold flex items-center gap-2">
                                        📝 老師備註：{viewingStudent.status_note}
                                    </div>
                                )}

                                {/* 1. KPI 儀表板 */}
                                <div className="grid grid-cols-3 gap-4 mb-6">
                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 text-center">
                                        <div className="text-gray-500 text-xs font-bold uppercase mb-1">平均成績</div>
                                        <div className={`text-3xl font-black ${studentStats.avgScore >= 90 ? 'text-green-600' : studentStats.avgScore < 60 ? 'text-red-500' : 'text-blue-600'}`}>
                                            {studentStats.avgScore} <span className="text-sm text-gray-400">分</span>
                                        </div>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 text-center">
                                        <div className="text-gray-500 text-xs font-bold uppercase mb-1">缺勤次數</div>
                                        <div className={`text-3xl font-black ${studentStats.totalLeaves > 3 ? 'text-red-500' : 'text-gray-700'}`}>
                                            {studentStats.totalLeaves} <span className="text-sm text-gray-400">次</span>
                                        </div>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 text-center">
                                        <div className="text-gray-500 text-xs font-bold uppercase mb-1">最近考試</div>
                                        <div className="text-lg font-bold text-gray-800 truncate">{studentStats.lastExam.name}</div>
                                        <div className="text-sm font-bold text-purple-600">{studentStats.lastExam.score} 分</div>
                                    </div>
                                </div>

                                {/* 2. 雙欄分析區 */}
                                <div className="grid md:grid-cols-2 gap-6">
                                    {/* 左：成績 */}
                                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col h-full">
                                        <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">📈 成績趨勢與紀錄</h4>
                                        <MiniLineChart data={studentStats.grades} />
                                        <div className="mt-4 flex-1 overflow-y-auto max-h-48 border-t pt-2">
                                            <table className="w-full text-sm">
                                                <thead className="text-gray-400 text-xs"><tr><th className="text-left py-1">考試</th><th className="text-right py-1">分數</th></tr></thead>
                                                <tbody>
                                                    {studentStats.grades.slice().reverse().map((g: any) => (
                                                        <tr key={g.id} className="border-b border-gray-50 last:border-0">
                                                            <td className="py-2 text-gray-600">{g.exam_name} <span className="text-xs text-gray-300 ml-1">{g.exam_date.slice(5)}</span></td>
                                                            <td className="py-2 text-right font-bold text-gray-800">{g.score}</td>
                                                        </tr>
                                                    ))}
                                                    {studentStats.grades.length === 0 && <tr><td colSpan={2} className="text-center py-4 text-gray-300">無紀錄</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* 右：請假 */}
                                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col h-full">
                                        <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">📅 出缺勤紀錄</h4>
                                        <div className="flex-1 overflow-y-auto max-h-[300px]">
                                            {studentStats.leaves.length > 0 ? (
                                                <div className="space-y-3">
                                                    {studentStats.leaves.map((l: any) => (
                                                        <div key={l.id} className="flex gap-3 items-start bg-orange-50 p-3 rounded-lg border border-orange-100">
                                                            <div className="bg-white text-orange-600 font-bold px-2 py-1 rounded text-xs text-center border border-orange-200 min-w-[60px]">
                                                                {l.start_date.slice(5)}
                                                            </div>
                                                            <div>
                                                                <div className="text-sm font-bold text-gray-800">{l.type}</div>
                                                                <div className="text-xs text-gray-500">{l.reason}</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                                    <span className="text-4xl mb-2">👍</span>
                                                    <p>全勤表現良好</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}