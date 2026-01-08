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

    // 🟢 兵籍資料 Modal 狀態
    const [viewingStudent, setViewingStudent] = useState<any>(null);
    const [studentStats, setStudentStats] = useState({
        avgScore: 0,
        lastExam: { name: '-', score: 0 },
        totalLeaves: 0,
        grades: [] as any[],
        leaves: [] as any[]
    });

    // 🟢 編輯學生狀態
    const [editingStudent, setEditingStudent] = useState<any>(null);
    const [editName, setEditName] = useState('');
    const [editGrade, setEditGrade] = useState('CEI-A');
    const [editAfterSchool, setEditAfterSchool] = useState(false);

    const router = useRouter();

    useEffect(() => {
        fetchStudents();
    }, []);

    async function fetchStudents() {
        setLoading(true);
        // 抓取學生資料，並把家長資料 (profiles) 也一起抓出來 (inner join)
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

    // --- 🟢 核心功能：開啟兵籍資料 (自動抓取成績與請假) ---
    async function openStudentProfile(student: any) {
        // 1. 設定基本資料
        setViewingStudent(student);

        // 2. 自動抓成績
        const { data: grades } = await supabase
            .from('exam_results')
            .select('*')
            .eq('student_id', student.id)
            .order('exam_date', { ascending: true });

        // 3. 自動抓請假 (已核准)
        const { data: leaves } = await supabase
            .from('leave_requests')
            .select('*')
            .eq('student_id', student.id)
            .eq('status', 'approved')
            .order('start_date', { ascending: false });

        // 4. 計算 KPI
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

    // 開啟編輯 Modal
    function openEditModal(student: any) {
        setEditingStudent(student);
        setEditName(student.chinese_name);
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

        const { error } = await supabase.from('students').update({ chinese_name: editName, grade: finalGrade }).eq('id', editingStudent.id);
        if (!error) {
            alert('修改成功');
            setEditingStudent(null);
            fetchStudents();
        } else {
            alert('失敗: ' + error.message);
        }
    }

    // 篩選邏輯
    const filteredStudents = students.filter(s => {
        const matchClass = filterClass ? s.grade.includes(filterClass) : true;
        const matchSearch = searchTerm ? s.chinese_name.includes(searchTerm) : true;
        return matchClass && matchSearch;
    });

    // --- SVG 折線圖元件 ---
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
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-indigo-900 flex items-center gap-2">
                        📂 學生兵籍資料管理
                        <span className="text-sm bg-white text-indigo-600 px-3 py-1 rounded-full shadow-sm">全校共 {students.length} 人</span>
                    </h1>
                    <button onClick={() => router.push('/')} className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">回首頁</button>
                </div>

                {/* 🔍 搜尋與篩選列 */}
                <div className="bg-white p-4 rounded-xl shadow-sm mb-6 flex flex-wrap gap-4 items-center">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-500">班級篩選:</span>
                        <select className="p-2 border rounded bg-gray-50" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
                            <option value="">全部顯示</option>
                            {ALL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2 flex-1">
                        <span className="font-bold text-gray-500">搜尋姓名:</span>
                        <input
                            type="text"
                            placeholder="輸入學生名字..."
                            className="p-2 border rounded bg-gray-50 w-full md:w-64"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* 📋 學生列表 */}
                <div className="bg-white rounded-xl shadow overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-indigo-100 border-b border-indigo-200">
                            <tr>
                                <th className="p-4 text-left font-bold text-indigo-800 w-32">班級</th>
                                <th className="p-4 text-left font-bold text-indigo-800">姓名 / 家長聯繫</th>
                                <th className="p-4 text-left font-bold text-indigo-800 w-48">狀態</th>
                                <th className="p-4 text-right font-bold text-indigo-800 w-40">兵籍資料</th>
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
                                    <td className="p-4">
                                        <div className="text-xl font-bold text-gray-800 mb-1">{student.chinese_name}</div>
                                        {student.parent ? (
                                            <div className="text-sm text-gray-500 flex flex-col">
                                                <span className="flex items-center gap-1">👤 {student.parent.full_name || '家長'}</span>
                                                <span className="text-gray-400 text-xs">{student.parent.email}</span>
                                            </div>
                                        ) : (
                                            <div className="text-sm text-red-400 italic">⚠️ 尚未綁定家長帳號</div>
                                        )}
                                    </td>
                                    <td className="p-4 align-middle">
                                        {student.parent ? (
                                            <span className="text-green-600 bg-green-50 px-2 py-1 rounded text-xs font-bold border border-green-200">✅ 已連結</span>
                                        ) : (
                                            <span className="text-gray-400 bg-gray-100 px-2 py-1 rounded text-xs font-bold">❌ 未連結</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right align-middle">
                                        <div className="flex justify-end gap-2">
                                            {/* 🟢 這裡就是您要的檔案按鈕 */}
                                            <button
                                                onClick={() => openStudentProfile(student)}
                                                className="bg-purple-600 text-white px-4 py-2 rounded shadow hover:bg-purple-700 font-bold flex items-center gap-2 transform transition hover:scale-105"
                                            >
                                                <span>📊</span> 檔案
                                            </button>
                                            <button
                                                onClick={() => openEditModal(student)}
                                                className="bg-white text-gray-400 border border-gray-300 px-3 py-2 rounded hover:bg-gray-50 hover:text-gray-600 text-sm"
                                            >
                                                編輯
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredStudents.length === 0 && (
                        <div className="p-10 text-center text-gray-400">找不到符合條件的學生</div>
                    )}
                </div>

                {/* 🟢 兵籍資料 Modal (戰情室) */}
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

                {/* 編輯 Modal (保留原本功能) */}
                {editingStudent && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
                        <div className="bg-white p-6 rounded-xl w-full max-w-sm">
                            <h3 className="font-bold text-lg mb-4">編輯學生: {editingStudent.chinese_name}</h3>
                            <input type="text" className="w-full p-2 border rounded mb-2" value={editName} onChange={e => setEditName(e.target.value)} />
                            <div className="flex gap-2 mb-2">
                                <select className="w-full p-2 border rounded" value={editGrade} onChange={e => setEditGrade(e.target.value)}>
                                    {ALL_CLASSES.filter(c => c !== '課後輔導班').map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <label className="flex items-center gap-2 mb-4"><input type="checkbox" checked={editAfterSchool} onChange={e => setEditAfterSchool(e.target.checked)} /> <span>參加課輔</span></label>
                            <div className="flex justify-end gap-2">
                                <button onClick={() => setEditingStudent(null)} className="px-3 py-1 text-gray-500">取消</button>
                                <button onClick={saveEdit} className="px-3 py-1 bg-blue-600 text-white rounded">儲存</button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}