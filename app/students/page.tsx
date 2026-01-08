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

    // 🟢 整合型狀態：管理模式 (Manager Mode)
    // 不再分 viewing 和 editing，統一用這個「指揮艙」
    const [managerStudent, setManagerStudent] = useState<any>(null);

    // 指揮艙 - 左側 (編輯資料)
    const [editForm, setEditForm] = useState({
        name: '',
        grade: 'CEI-A',
        hasAfterSchool: false,
        note: '' // 備註
    });

    // 指揮艙 - 右側 (分析數據)
    const [stats, setStats] = useState({
        avgScore: 0,
        lastExam: { name: '-', score: 0 },
        totalLeaves: 0,
        grades: [] as any[],
        leaves: [] as any[]
    });

    // 新增學生模式 (獨立的小視窗)
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [newStudentForm, setNewStudentForm] = useState({ name: '', grade: 'CEI-A', hasAfterSchool: false });

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

    // --- 🟢 核心功能：開啟「學生指揮艙」 ---
    async function openStudentManager(student: any) {
        // 1. 初始化左側編輯區
        setManagerStudent(student);
        setEditForm({
            name: student.chinese_name,
            grade: student.grade.replace(', 課後輔導班', '').replace('課後輔導班', '').trim() || 'CEI-A',
            hasAfterSchool: student.grade.includes('課後輔導班'),
            note: student.status_note || ''
        });

        // 2. 抓取右側分析數據 (成績 + 請假)
        const { data: grades } = await supabase.from('exam_results').select('*').eq('student_id', student.id).order('exam_date', { ascending: true });
        const { data: leaves } = await supabase.from('leave_requests').select('*').eq('student_id', student.id).eq('status', 'approved').order('start_date', { ascending: false });

        // 3. 計算 KPI
        let avg = 0;
        let last = { name: '無紀錄', score: 0 };
        if (grades && grades.length > 0) {
            const total = grades.reduce((acc, curr) => acc + curr.score, 0);
            avg = Math.round(total / grades.length);
            const lastRec = grades[grades.length - 1];
            last = { name: lastRec.exam_name, score: lastRec.score };
        }

        setStats({
            avgScore: avg,
            lastExam: last,
            totalLeaves: leaves?.length || 0,
            grades: grades || [],
            leaves: leaves || []
        });
    }

    // 儲存變更 (左側表單)
    async function saveManagerChanges() {
        if (!managerStudent) return;

        let finalGrade = editForm.grade;
        if (editForm.hasAfterSchool && !finalGrade.includes('課後輔導班')) finalGrade += ', 課後輔導班';
        else if (!editForm.hasAfterSchool) finalGrade = finalGrade.replace(', 課後輔導班', '').replace('課後輔導班', '').trim();

        const { error } = await supabase
            .from('students')
            .update({
                chinese_name: editForm.name,
                grade: finalGrade,
                status_note: editForm.note
            })
            .eq('id', managerStudent.id);

        if (!error) {
            alert('✅ 資料更新成功');
            // 更新列表顯示
            fetchStudents();
            // 這裡不關閉視窗，讓老師可以繼續看，或者手動關閉
        } else {
            alert('失敗: ' + error.message);
        }
    }

    // 新增學生
    async function addNewStudent() {
        let finalGrade = newStudentForm.grade;
        if (newStudentForm.hasAfterSchool) finalGrade += ', 課後輔導班';

        const { error } = await supabase.from('students').insert({
            chinese_name: newStudentForm.name,
            grade: finalGrade
        });

        if (!error) {
            alert('新增成功');
            setIsAddingNew(false);
            setNewStudentForm({ name: '', grade: 'CEI-A', hasAfterSchool: false });
            fetchStudents();
        } else {
            alert('失敗');
        }
    }

    // 刪除學生
    async function deleteStudent(id: string) {
        if (!confirm('確定要刪除此學生嗎？所有成績與紀錄將會消失！')) return;
        const { error } = await supabase.from('students').delete().eq('id', id);
        if (!error) {
            setManagerStudent(null);
            fetchStudents();
        }
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
            <div className="max-w-7xl mx-auto">

                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-indigo-900 flex items-center gap-2">
                        📂 全校學生管理中心
                        <span className="text-sm bg-white text-indigo-600 px-3 py-1 rounded-full shadow-sm">共 {students.length} 人</span>
                    </h1>
                    <button onClick={() => router.push('/')} className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">回首頁</button>
                </div>

                {/* 搜尋與新增 */}
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
                    <button className="bg-indigo-600 text-white px-6 py-2 rounded-lg shadow hover:bg-indigo-700 font-bold transition" onClick={() => setIsAddingNew(true)}>
                        + 新增學生
                    </button>
                </div>

                {/* 📋 乾淨的學生列表 */}
                <div className="bg-white rounded-xl shadow overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-indigo-100 border-b border-indigo-200">
                            <tr>
                                <th className="p-4 text-left font-bold text-indigo-800 w-32">班級</th>
                                <th className="p-4 text-left font-bold text-indigo-800">姓名</th>
                                <th className="p-4 text-left font-bold text-indigo-800">狀態</th>
                                <th className="p-4 text-right font-bold text-indigo-800 w-40">管理</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filteredStudents.map(student => (
                                <tr
                                    key={student.id}
                                    className="hover:bg-indigo-50 transition group cursor-pointer"
                                    onClick={() => openStudentManager(student)} // 點整行都可以打開
                                >
                                    <td className="p-4 align-middle">
                                        <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-bold text-sm block w-fit mb-1">
                                            {student.grade.split(',')[0]}
                                        </span>
                                        {student.grade.includes('課後輔導班') && (
                                            <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-xs font-bold block w-fit">
                                                安親
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4 align-middle">
                                        <div className="text-xl font-bold text-gray-800">{student.chinese_name}</div>
                                    </td>
                                    <td className="p-4 align-middle">
                                        <div className="flex gap-2 items-center">
                                            {/* 這裡只顯示圖示，保持乾淨 */}
                                            {student.status_note && (
                                                <span className="text-lg" title="有狀況備註">📝</span>
                                            )}
                                            {student.parent ? (
                                                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full border border-green-200">已綁定家長</span>
                                            ) : (
                                                <span className="text-xs bg-gray-100 text-gray-400 px-2 py-1 rounded-full">未綁定</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 text-right align-middle">
                                        <button className="bg-white text-indigo-600 border border-indigo-200 px-4 py-2 rounded-lg hover:bg-indigo-50 font-bold text-sm shadow-sm">
                                            開啟檔案
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredStudents.length === 0 && <div className="p-10 text-center text-gray-400">查無資料</div>}
                </div>

                {/* 🟢 終極指揮艙 (Manager Modal) - 超大視窗 */}
                {managerStudent && (
                    <div className="fixed inset-0 bg-gray-900/80 flex items-center justify-center z-[60] p-4 backdrop-blur-md" onClick={() => setManagerStudent(null)}>
                        <div className="bg-white w-full max-w-6xl h-[85vh] rounded-2xl shadow-2xl overflow-hidden animate-slide-up flex flex-col" onClick={e => e.stopPropagation()}>

                            {/* Header */}
                            <div className="bg-indigo-900 p-5 text-white flex justify-between items-center shrink-0">
                                <div className="flex items-center gap-4">
                                    <h2 className="text-2xl font-black">{managerStudent.chinese_name}</h2>
                                    <span className="bg-indigo-700 px-3 py-1 rounded text-sm border border-indigo-500">{managerStudent.grade}</span>
                                </div>
                                <button onClick={() => setManagerStudent(null)} className="bg-white/10 hover:bg-white/20 rounded-full w-10 h-10 flex items-center justify-center text-xl">✕</button>
                            </div>

                            {/* Body: 雙欄設計 */}
                            <div className="flex-1 flex overflow-hidden">

                                {/* 左側：編輯與備註區 (40%) */}
                                <div className="w-2/5 p-6 bg-gray-50 border-r overflow-y-auto">
                                    <h3 className="text-indigo-900 font-bold mb-4 flex items-center gap-2">✏️ 基本資料與備註</h3>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-600 mb-1">學生姓名</label>
                                            <input type="text" className="w-full p-3 border rounded-lg bg-white focus:ring-2 focus:ring-indigo-300 outline-none" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                                        </div>

                                        <div className="flex gap-4">
                                            <div className="flex-1">
                                                <label className="block text-sm font-bold text-gray-600 mb-1">班級</label>
                                                <select className="w-full p-3 border rounded-lg bg-white" value={editForm.grade} onChange={e => setEditForm({ ...editForm, grade: e.target.value })}>
                                                    {ALL_CLASSES.filter(c => c !== '課後輔導班').map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </div>
                                            <div className="flex items-end pb-3">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input type="checkbox" className="w-5 h-5 accent-orange-500" checked={editForm.hasAfterSchool} onChange={e => setEditForm({ ...editForm, hasAfterSchool: e.target.checked })} />
                                                    <span className="font-bold text-gray-700">參加課輔</span>
                                                </label>
                                            </div>
                                        </div>

                                        <div className="bg-white p-4 rounded-lg border border-gray-200">
                                            <div className="text-xs font-bold text-gray-400 mb-2 uppercase">家長資訊</div>
                                            {managerStudent.parent ? (
                                                <div>
                                                    <div className="font-bold text-gray-800 text-lg">{managerStudent.parent.full_name}</div>
                                                    <div className="text-gray-500">{managerStudent.parent.email}</div>
                                                    <div className="text-gray-500">{managerStudent.parent.phone}</div>
                                                </div>
                                            ) : (
                                                <div className="text-red-400 italic">尚未綁定家長帳號</div>
                                            )}
                                        </div>

                                        {/* 超大備註欄 */}
                                        <div className="flex-1 flex flex-col">
                                            <label className="block text-sm font-bold text-gray-600 mb-2">📝 學生狀況備註 / 觀察紀錄</label>
                                            <textarea
                                                className="w-full p-4 border rounded-xl bg-yellow-50 focus:bg-white focus:ring-2 focus:ring-yellow-400 outline-none resize-none text-gray-700 leading-relaxed shadow-inner"
                                                rows={8}
                                                placeholder="在此輸入該學生的詳細狀況、家長交代事項、學習弱點..."
                                                value={editForm.note}
                                                onChange={e => setEditForm({ ...editForm, note: e.target.value })}
                                            />
                                        </div>

                                        <div className="pt-4 flex justify-between items-center border-t">
                                            <button onClick={() => deleteStudent(managerStudent.id)} className="text-red-400 hover:text-red-600 text-sm hover:underline">刪除學生</button>
                                            <button onClick={saveManagerChanges} className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 transform active:scale-95 transition">
                                                儲存所有變更
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* 右側：分析數據區 (60%) */}
                                <div className="w-3/5 p-6 overflow-y-auto bg-white">
                                    <h3 className="text-indigo-900 font-bold mb-6 flex items-center gap-2">📊 學習成效分析</h3>

                                    {/* KPI Cards */}
                                    <div className="grid grid-cols-3 gap-4 mb-8">
                                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-center">
                                            <div className="text-gray-400 text-xs font-bold uppercase">平均成績</div>
                                            <div className={`text-4xl font-black ${stats.avgScore >= 90 ? 'text-green-500' : stats.avgScore < 60 ? 'text-red-500' : 'text-blue-600'}`}>{stats.avgScore}</div>
                                        </div>
                                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-center">
                                            <div className="text-gray-400 text-xs font-bold uppercase">缺勤次數</div>
                                            <div className="text-4xl font-black text-gray-700">{stats.totalLeaves}</div>
                                        </div>
                                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-center">
                                            <div className="text-gray-400 text-xs font-bold uppercase">上次考試</div>
                                            <div className="text-xl font-bold text-gray-800 truncate">{stats.lastExam.name}</div>
                                            <div className="text-sm font-bold text-purple-600">{stats.lastExam.score} 分</div>
                                        </div>
                                    </div>

                                    {/* 圖表 */}
                                    <div className="mb-8">
                                        <h4 className="font-bold text-gray-600 mb-3">📈 成績走勢圖</h4>
                                        <MiniLineChart data={stats.grades} />
                                    </div>

                                    {/* 兩欄列表 */}
                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <h4 className="font-bold text-gray-600 mb-3 border-b pb-2">近期成績</h4>
                                            <div className="space-y-2">
                                                {stats.grades.slice().reverse().map((g: any) => (
                                                    <div key={g.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                                                        <span className="text-gray-600 text-sm">{g.exam_name}</span>
                                                        <span className="font-bold text-gray-800">{g.score}</span>
                                                    </div>
                                                ))}
                                                {stats.grades.length === 0 && <p className="text-gray-300 text-sm text-center py-4">無資料</p>}
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-gray-600 mb-3 border-b pb-2">請假紀錄</h4>
                                            <div className="space-y-2">
                                                {stats.leaves.map((l: any) => (
                                                    <div key={l.id} className="flex gap-2 items-start py-2 border-b border-gray-50 last:border-0">
                                                        <span className="bg-orange-100 text-orange-600 px-1.5 rounded text-xs font-bold whitespace-nowrap">{l.start_date.slice(5)}</span>
                                                        <span className="text-gray-500 text-sm truncate">{l.type} - {l.reason}</span>
                                                    </div>
                                                ))}
                                                {stats.leaves.length === 0 && <p className="text-gray-300 text-sm text-center py-4">全勤</p>}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                )}

                {/* 新增學生 Modal (獨立的小視窗) */}
                {isAddingNew && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
                        <div className="bg-white p-6 rounded-xl w-full max-w-sm shadow-xl animate-fade-in">
                            <h3 className="font-bold text-xl mb-4 text-indigo-900">新增學生</h3>
                            <input type="text" placeholder="姓名" className="w-full p-3 border rounded-lg mb-3 bg-gray-50" value={newStudentForm.name} onChange={e => setNewStudentForm({ ...newStudentForm, name: e.target.value })} />
                            <select className="w-full p-3 border rounded-lg mb-3 bg-white" value={newStudentForm.grade} onChange={e => setNewStudentForm({ ...newStudentForm, grade: e.target.value })}>
                                {ALL_CLASSES.filter(c => c !== '課後輔導班').map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <label className="flex items-center gap-2 mb-6 cursor-pointer">
                                <input type="checkbox" className="w-5 h-5 accent-indigo-600" checked={newStudentForm.hasAfterSchool} onChange={e => setNewStudentForm({ ...newStudentForm, hasAfterSchool: e.target.checked })} />
                                <span className="font-bold text-gray-700">參加課後輔導 (安親)</span>
                            </label>
                            <div className="flex gap-3">
                                <button onClick={() => setIsAddingNew(false)} className="flex-1 py-2 text-gray-500 hover:bg-gray-100 rounded-lg">取消</button>
                                <button onClick={addNewStudent} className="flex-1 py-2 bg-indigo-600 text-white font-bold rounded-lg shadow hover:bg-indigo-700">確認新增</button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}