'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

// 定義選項
const ENGLISH_CLASSES = Array.from({ length: 26 }, (_, i) => `CEI-${String.fromCharCode(65 + i)}`);
const ALL_OPTIONS = ['課後輔導班', ...ENGLISH_CLASSES];

export default function AdminPage() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // 編輯模式狀態 (原本的功能)
    const [editingUser, setEditingUser] = useState<any>(null);
    const [editName, setEditName] = useState('');
    const [teacherClasses, setTeacherClasses] = useState<string[]>([]);
    const [newChildName, setNewChildName] = useState('');
    const [newChildGrade, setNewChildGrade] = useState('CEI-A');
    const [isAfterSchool, setIsAfterSchool] = useState(false);
    const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
    const [editStudentName, setEditStudentName] = useState('');
    const [editStudentGrade, setEditStudentGrade] = useState('CEI-A');
    const [editStudentAfterSchool, setEditStudentAfterSchool] = useState(false);

    // 🟢 新增：學生兵籍資料 (Profile) 狀態
    const [viewingStudent, setViewingStudent] = useState<any>(null);
    const [studentStats, setStudentStats] = useState({
        avgScore: 0,
        lastExam: { name: '-', score: 0 },
        totalLeaves: 0,
        grades: [] as any[],
        leaves: [] as any[]
    });

    const router = useRouter();

    useEffect(() => {
        checkAdmin();
        fetchUsers();
    }, []);

    async function checkAdmin() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        if (!['admin', 'director', 'manager'].includes(profile?.role || '')) {
            alert('權限不足'); router.push('/');
        }
    }

    async function fetchUsers() {
        setLoading(true);
        const { data: profiles } = await supabase
            .from('profiles')
            .select(`*, students (*)`)
            .order('created_at', { ascending: false });
        if (profiles) setUsers(profiles);
        setLoading(false);
    }

    // --- 🟢 核心功能：讀取學生完整兵籍資料 ---
    async function fetchStudentProfile(student: any, parent: any) {
        // 先設定基本資料
        setViewingStudent({ ...student, parentName: parent.full_name, parentEmail: parent.email });

        // 1. 抓取成績
        const { data: grades } = await supabase
            .from('exam_results')
            .select('*')
            .eq('student_id', student.id)
            .order('exam_date', { ascending: true });

        // 2. 抓取請假紀錄 (只抓已核准)
        const { data: leaves } = await supabase
            .from('leave_requests')
            .select('*')
            .eq('student_id', student.id)
            .eq('status', 'approved')
            .order('start_date', { ascending: false });

        // 3. 計算 KPI 數據
        let avg = 0;
        let last = { name: '尚無考試', score: 0 };

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

    // (原本的編輯與儲存功能保持不變，為了篇幅省略細節，直接貼上)
    function openEditModal(user: any) {
        setEditingUser(user);
        setEditName(user.full_name || '');
        setTeacherClasses(user.responsible_classes || []);
        setNewChildName(''); setNewChildGrade('CEI-A'); setIsAfterSchool(false);
        setEditingStudentId(null);
    }

    function toggleTeacherClass(cls: string) {
        setTeacherClasses(prev => prev.includes(cls) ? prev.filter(c => c !== cls) : [...prev, cls]);
    }

    function startEditingStudent(student: any) {
        setEditingStudentId(student.id);
        setEditStudentName(student.chinese_name);
        const hasAfterSchool = student.grade.includes('課後輔導班');
        setEditStudentAfterSchool(hasAfterSchool);
        let engClass = student.grade.replace(', 課後輔導班', '').replace('課後輔導班', '').trim();
        if (!engClass) engClass = 'CEI-A';
        setEditStudentGrade(engClass);
    }

    async function saveStudentChanges() {
        if (!editingStudentId) return;
        let finalGrade = editStudentGrade;
        if (editStudentAfterSchool && !finalGrade.includes('課後輔導班')) finalGrade += ', 課後輔導班';
        else if (!editStudentAfterSchool) finalGrade = finalGrade.replace(', 課後輔導班', '').replace('課後輔導班', '').trim();

        const { error } = await supabase.from('students').update({ chinese_name: editStudentName, grade: finalGrade }).eq('id', editingStudentId);
        if (!error) { setEditingStudentId(null); await fetchUsers(); }
    }

    async function handleSaveUser() {
        if (!editingUser) return;
        try {
            await supabase.from('profiles').update({ role: editingUser.role, full_name: editName, responsible_classes: editingUser.role === 'teacher' ? teacherClasses : null }).eq('id', editingUser.id);
            if (editingUser.role === 'parent' && newChildName.trim()) {
                let finalGrade = newChildGrade;
                if (isAfterSchool && !finalGrade.includes('課後輔導班')) finalGrade += ', 課後輔導班';
                await supabase.from('students').insert({ parent_id: editingUser.id, chinese_name: newChildName, grade: finalGrade });
            }
            alert('儲存成功！'); setEditingUser(null); await fetchUsers();
        } catch (e: any) { alert('失敗: ' + e.message); }
    }

    async function deleteStudent(studentId: string) {
        if (!confirm('確定刪除？資料將無法復原。')) return;
        await supabase.from('students').delete().eq('id', studentId);
        fetchUsers();
    }

    // --- SVG 折線圖元件 (內嵌版) ---
    const MiniLineChart = ({ data }: { data: any[] }) => {
        if (!data || data.length === 0) return <div className="h-32 flex items-center justify-center text-gray-300 bg-gray-50 rounded">尚無成績數據</div>;
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
                        <circle key={i} cx={(i / (data.length - 1 || 1)) * 100} cy={height - (d.score / 100) * height} r="2" fill="white" stroke="#3b82f6" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    ))}
                </svg>
            </div>
        );
    };

    useEffect(() => { if (editingUser) { const u = users.find(x => x.id === editingUser.id); if (u) setEditingUser(u); } }, [users]);
    if (loading) return <div className="p-8 text-center">載入中...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-800">👥 人事與兵籍管理</h1>
                    <button onClick={() => router.push('/')} className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">回首頁</button>
                </div>

                {/* 用戶列表 */}
                <div className="bg-white rounded-xl shadow overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-gray-100 border-b">
                            <tr>
                                <th className="p-4 text-left font-bold text-gray-600">姓名 / Email</th>
                                <th className="p-4 text-left font-bold text-gray-600">身分</th>
                                <th className="p-4 text-left font-bold text-gray-600">負責 / 綁定</th>
                                <th className="p-4 text-right font-bold text-gray-600">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {users.map(user => (
                                <tr key={user.id} className="hover:bg-gray-50 transition">
                                    <td className="p-4">
                                        <div className="font-bold text-gray-800">{user.full_name || '未填寫'}</div>
                                        <div className="text-sm text-gray-500">{user.email}</div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${user.role === 'teacher' ? 'bg-blue-100 text-blue-700' : user.role === 'parent' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100'}`}>
                                            {user.role === 'teacher' ? '老師' : user.role === 'parent' ? '家長' : user.role}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        {user.role === 'teacher' && user.responsible_classes?.map((c: string) => <span key={c} className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-xs border border-blue-100 mr-1">{c}</span>)}
                                        {user.role === 'parent' && user.students?.map((s: any) => <span key={s.id} className="bg-orange-50 text-orange-600 px-2 py-0.5 rounded text-xs border border-orange-100 mr-1">{s.chinese_name}</span>)}
                                    </td>
                                    <td className="p-4 text-right">
                                        <button onClick={() => openEditModal(user)} className="px-3 py-1 bg-white text-gray-600 rounded border hover:bg-gray-50 text-sm font-bold shadow-sm">設定與檔案</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* 編輯 User Modal */}
                {editingUser && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
                            <div className="p-6 border-b bg-gray-50 flex-shrink-0">
                                <h3 className="text-xl font-bold text-gray-800">管理用戶資料</h3>
                                <div className="text-sm text-gray-500 mt-1">{editingUser.email}</div>
                            </div>

                            <div className="p-6 space-y-6 overflow-y-auto">
                                {/* 基本資料設定 (身分/姓名) */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">設定身分</label>
                                    <div className="grid grid-cols-4 gap-2 mb-4">
                                        {['parent', 'teacher', 'manager', 'director'].map(r => (
                                            <button key={r} onClick={() => setEditingUser({ ...editingUser, role: r })} className={`py-2 rounded border text-sm font-bold transition ${editingUser.role === r ? 'bg-blue-600 text-white' : 'bg-white'}`}>{r === 'parent' ? '家長' : r === 'teacher' ? '老師' : r}</button>
                                        ))}
                                    </div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">顯示名稱</label>
                                    <input type="text" className="w-full p-2 border rounded" value={editName} onChange={e => setEditName(e.target.value)} />
                                </div>

                                <hr className="border-gray-100" />

                                {/* 🟢 家長專區：學生管理 (包含兵籍資料按鈕) */}
                                {editingUser.role === 'parent' && (
                                    <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                                        <h4 className="font-bold text-orange-800 mb-4">👶 學生列表與兵籍資料</h4>
                                        <div className="space-y-2 mb-4">
                                            {editingUser.students && editingUser.students.length > 0 ? (
                                                editingUser.students.map((s: any) => (
                                                    <div key={s.id} className="bg-white p-3 rounded shadow-sm border border-orange-200">
                                                        {editingStudentId === s.id ? (
                                                            // 編輯模式
                                                            <div className="space-y-2 animate-fade-in">
                                                                <input type="text" className="w-full p-1 border rounded" value={editStudentName} onChange={e => setEditStudentName(e.target.value)} />
                                                                <div className="flex gap-2">
                                                                    <select className="flex-1 p-1 border rounded bg-white" value={editStudentGrade} onChange={e => setEditStudentGrade(e.target.value)}>
                                                                        {ENGLISH_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                                                                    </select>
                                                                </div>
                                                                <label className="flex items-center gap-2"><input type="checkbox" checked={editStudentAfterSchool} onChange={e => setEditStudentAfterSchool(e.target.checked)} /><span className="text-sm">參加課輔</span></label>
                                                                <div className="flex justify-end gap-2">
                                                                    <button onClick={() => setEditingStudentId(null)} className="text-gray-400 text-xs">取消</button>
                                                                    <button onClick={saveStudentChanges} className="bg-green-500 text-white px-2 py-1 rounded text-xs font-bold">確認修改</button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            // 顯示模式
                                                            <div className="flex justify-between items-center">
                                                                <div>
                                                                    <div className="font-bold text-gray-800">{s.chinese_name}</div>
                                                                    <div className="text-xs text-gray-500">{s.grade}</div>
                                                                </div>
                                                                <div className="flex gap-2">
                                                                    <button onClick={() => fetchStudentProfile(s, editingUser)} className="text-white text-xs font-bold px-3 py-1.5 bg-purple-600 rounded shadow hover:bg-purple-700 flex items-center gap-1">
                                                                        📂 檔案
                                                                    </button>
                                                                    <button onClick={() => startEditingStudent(s)} className="text-blue-500 text-xs font-bold px-2 py-1 bg-blue-50 rounded">✏️ 修改</button>
                                                                    <button onClick={() => deleteStudent(s.id)} className="text-red-500 text-xs hover:underline px-2 py-1">🗑️ 移除</button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-center text-gray-400 text-sm py-2">目前沒有綁定學生</div>
                                            )}
                                        </div>
                                        {/* 新增學生 (略) */}
                                        <div className="bg-white p-3 rounded-lg border border-orange-200 mt-2">
                                            <div className="flex gap-2 mb-2"><input type="text" placeholder="新增學生姓名" className="flex-1 p-2 border rounded" value={newChildName} onChange={e => setNewChildName(e.target.value)} /><select className="w-24 p-2 bg-white border rounded" value={newChildGrade} onChange={e => setNewChildGrade(e.target.value)}>{ALL_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                                            <label className="flex items-center gap-2"><input type="checkbox" checked={isAfterSchool} onChange={e => setIsAfterSchool(e.target.checked)} /><span className="text-sm">參加課輔</span></label>
                                        </div>
                                    </div>
                                )}

                                {/* 老師專區 (略，維持原樣) */}
                                {editingUser.role === 'teacher' && (
                                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                        <h4 className="font-bold text-blue-800 mb-2">🧑‍🏫 老師負責班級</h4>
                                        <div className="flex flex-wrap gap-2">{ALL_OPTIONS.map(cls => (<button key={cls} onClick={() => toggleTeacherClass(cls)} className={`px-2 py-1 rounded text-xs border ${teacherClasses.includes(cls) ? 'bg-blue-600 text-white' : 'bg-white'}`}>{cls}</button>))}</div>
                                    </div>
                                )}
                            </div>

                            <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 flex-shrink-0">
                                <button onClick={() => setEditingUser(null)} className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-200 rounded">關閉</button>
                                <button onClick={handleSaveUser} className="px-6 py-2 bg-blue-600 text-white font-bold rounded shadow hover:bg-blue-700">儲存變更</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 🟢 兵籍資料 Modal (Student Dossier) */}
                {viewingStudent && (
                    <div className="fixed inset-0 bg-gray-900/80 flex items-center justify-center z-[60] p-4 backdrop-blur-sm" onClick={() => setViewingStudent(null)}>
                        <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

                            {/* Header: 學生基本資料 */}
                            <div className="bg-gray-800 p-6 text-white flex justify-between items-start">
                                <div>
                                    <h3 className="text-3xl font-black mb-1 flex items-center gap-2">
                                        {viewingStudent.chinese_name}
                                        <span className="text-sm font-normal bg-gray-600 px-2 py-1 rounded text-gray-200 border border-gray-500">
                                            {viewingStudent.grade}
                                        </span>
                                    </h3>
                                    <div className="opacity-80 text-sm flex gap-4 mt-2">
                                        <span>👤 家長：{viewingStudent.parentName}</span>
                                        <span>📧 {viewingStudent.parentEmail}</span>
                                    </div>
                                </div>
                                <button onClick={() => setViewingStudent(null)} className="bg-white/10 hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center">✕</button>
                            </div>

                            <div className="p-6 overflow-y-auto bg-gray-50">

                                {/* 1. KPI 儀表板 (主管最愛看這個) */}
                                <div className="grid grid-cols-3 gap-4 mb-6">
                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 text-center">
                                        <div className="text-gray-500 text-xs font-bold uppercase mb-1">平均成績</div>
                                        <div className={`text-3xl font-black ${studentStats.avgScore >= 90 ? 'text-green-600' : studentStats.avgScore < 60 ? 'text-red-500' : 'text-blue-600'}`}>
                                            {studentStats.avgScore} <span className="text-sm text-gray-400">分</span>
                                        </div>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 text-center">
                                        <div className="text-gray-500 text-xs font-bold uppercase mb-1">缺勤次數</div>
                                        <div className="text-3xl font-black text-orange-500">
                                            {studentStats.totalLeaves} <span className="text-sm text-gray-400">次</span>
                                        </div>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 text-center">
                                        <div className="text-gray-500 text-xs font-bold uppercase mb-1">上次考試</div>
                                        <div className="text-xl font-bold text-gray-800 truncate px-2">{studentStats.lastExam.name}</div>
                                        <div className="text-sm font-bold text-purple-600">{studentStats.lastExam.score} 分</div>
                                    </div>
                                </div>

                                {/* 2. 雙視圖：左成績、右請假 */}
                                <div className="grid md:grid-cols-2 gap-6">
                                    {/* 左：學習歷程 */}
                                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                                        <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">📈 成績走勢 <span className="text-xs text-gray-400 font-normal">History</span></h4>
                                        <MiniLineChart data={studentStats.grades} />
                                        <div className="mt-4 max-h-40 overflow-y-auto">
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-50 text-gray-500 sticky top-0"><tr><th className="p-2 text-left">考試</th><th className="p-2 text-right">分數</th></tr></thead>
                                                <tbody className="divide-y">
                                                    {studentStats.grades.slice().reverse().map((g: any) => (
                                                        <tr key={g.id}><td className="p-2 text-gray-600">{g.exam_name}</td><td className="p-2 text-right font-bold">{g.score}</td></tr>
                                                    ))}
                                                    {studentStats.grades.length === 0 && <tr><td colSpan={2} className="p-2 text-center text-gray-300">無資料</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* 右：出缺勤紀錄 */}
                                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                                        <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">📅 請假紀錄 <span className="text-xs text-gray-400 font-normal">Absence</span></h4>
                                        <div className="bg-orange-50 rounded-lg p-3 mb-3 flex items-center gap-2 text-orange-800 text-xs font-bold">
                                            <span>⚠️ 請注意請假對成績的影響</span>
                                        </div>
                                        <div className="max-h-60 overflow-y-auto">
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-50 text-gray-500 sticky top-0"><tr><th className="p-2 text-left">日期</th><th className="p-2 text-left">假別/原因</th></tr></thead>
                                                <tbody className="divide-y">
                                                    {studentStats.leaves.map((l: any) => (
                                                        <tr key={l.id}>
                                                            <td className="p-2 font-bold text-gray-700 whitespace-nowrap">{l.start_date.slice(5)}</td>
                                                            <td className="p-2 text-gray-600">
                                                                <span className="px-1.5 py-0.5 bg-gray-100 rounded text-xs mr-1">{l.type}</span>
                                                                {l.reason}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {studentStats.leaves.length === 0 && <tr><td colSpan={2} className="p-8 text-center text-gray-300">表現良好，全勤出席 👍</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>

                            </div>
                            <div className="bg-gray-100 p-4 text-center text-xs text-gray-400">
                                學生 ID: {viewingStudent.id} • 資料最後更新: 即時
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}