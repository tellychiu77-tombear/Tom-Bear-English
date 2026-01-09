'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function ManagerDashboard() {
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [deptName, setDeptName] = useState('');

    // Data States
    const [teachers, setTeachers] = useState<any[]>([]);
    const [kpi, setKpi] = useState({
        teacherCount: 0,
        studentCount: 0,
        avgScore: 0,
        absentCount: 0
    });

    const router = useRouter();

    useEffect(() => {
        checkPermission();
    }, []);

    const checkPermission = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();

        if (!profile || !['director', 'manager'].includes(profile.role)) {
            alert('權限不足：僅限主管存取');
            router.push('/');
            return;
        }

        setCurrentUser(profile);
        fetchDepartmentData(profile);
    };

    const fetchDepartmentData = async (user: any) => {
        setLoading(true);
        let targetDept = user.department;

        // 如果是 Director，預設看所有，或者給他一個選擇 (這裡先簡化為看所有，或者如果 Director 有選部門就看該部門？
        // 依照需求：Director 顯示所有部門資料。但為了避免混亂，我們這裡先邏輯設定為：
        // 如果是 Director，他可以看到「全校」數據，或是我們可以讓他「切換」。
        // 為了符合 "Director 顯示所有部門資料" 的需求，我們視為 null = all。

        if (user.role === 'director') targetDept = null;

        setDeptName(
            targetDept === 'english' ? '英文部' :
                targetDept === 'after_school' ? '課輔安親部' :
                    targetDept === 'general' ? '行政部' : '全校總覽'
        );

        // 1. Fetch Teachers
        let teacherQuery = supabase.from('profiles').select('*').eq('role', 'teacher');
        if (targetDept) {
            teacherQuery = teacherQuery.eq('department', targetDept);
        }
        const { data: teacherList } = await teacherQuery;

        if (!teacherList || teacherList.length === 0) {
            setTeachers([]);
            setLoading(false);
            return;
        }

        // 2. Fetch All Students (to link with classes)
        const { data: allStudents } = await supabase.from('students').select('*');
        // 3. Fetch All Exam Results
        const { data: allExams } = await supabase.from('exam_results').select('*');
        // 4. Fetch All Leave Requests
        const { data: allLeaves } = await supabase.from('leave_requests').select('*').eq('status', 'approved');

        // Processing Data
        let totalStudents = 0;
        let totalScoreSum = 0;
        let totalScoreCount = 0;
        let totalLeaves = 0;

        const processedTeachers = teacherList.map(t => {
            const classes = t.responsible_classes || [];

            // Find students in this teacher's classes
            // 邏輯：學生的 grade 包含老師負責的班級 (e.g. Student: "CEI-A, 課後輔導班" matches Class "CEI-A")
            const myStudents = allStudents?.filter(s => {
                if (!s.grade) return false;
                return classes.some((c: string) => s.grade.includes(c));
            }) || [];

            const studentIds = myStudents.map(s => s.id);

            // Calculate Performance
            const myExams = allExams?.filter(e => studentIds.includes(e.student_id)) || [];
            const myLeaves = allLeaves?.filter(l => studentIds.includes(l.student_id)) || [];

            const avg = myExams.length > 0
                ? Math.round(myExams.reduce((a, b) => a + b.score, 0) / myExams.length)
                : 0;

            // Global Accumulators
            totalStudents += myStudents.length;
            if (myExams.length > 0) {
                totalScoreSum += myExams.reduce((a, b) => a + b.score, 0);
                totalScoreCount += myExams.length;
            }
            totalLeaves += myLeaves.length;

            return {
                ...t,
                studentCount: myStudents.length,
                avgScore: avg,
                leaveCount: myLeaves.length,
                students: myStudents // Keep ref if needed
            };
        });

        setTeachers(processedTeachers.sort((a, b) => b.avgScore - a.avgScore)); // sort by performance by default

        setKpi({
            teacherCount: teacherList.length,
            studentCount: totalStudents, // 注意：學生可能被重複計算(如果多個老師負責同一班)。但在此系統架構下一班通常一師。
            avgScore: totalScoreCount > 0 ? Math.round(totalScoreSum / totalScoreCount) : 0,
            absentCount: totalLeaves
        });

        setLoading(false);
    };

    if (loading) return <div className="p-10 text-center text-gray-500">數據分析中...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6 font-sans">
            <div className="max-w-7xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div>
                        <h1 className="text-3xl font-black text-gray-800 tracking-tight">
                            📊 {deptName} 管理儀表板
                        </h1>
                        <p className="text-gray-500 mt-1">Hello, {currentUser?.full_name} ({currentUser?.job_title || 'Manager'})</p>
                    </div>
                    <button onClick={() => router.push('/')} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl transition">
                        回首頁
                    </button>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <KPICard title="部門教師" value={kpi.teacherCount} unit="位" icon="🧑‍🏫" color="bg-blue-500" />
                    <KPICard title="負責學生" value={kpi.studentCount} unit="人" icon="👶" color="bg-indigo-500" />
                    <KPICard title="部門平均分" value={kpi.avgScore} unit="分" icon="📈" color="bg-emerald-500"
                        sub={kpi.avgScore >= 90 ? '表現優異' : kpi.avgScore < 70 ? '需關注' : '符合標準'} />
                    <KPICard title="本月缺勤" value={kpi.absentCount} unit="人次" icon="📅" color="bg-orange-500" />
                </div>

                {/* Main Content: Teacher Performance */}
                <div className="bg-white rounded-2xl shadow overflow-hidden border border-gray-100">
                    <div className="p-6 border-b flex justify-between items-center">
                        <h2 className="text-xl font-bold text-gray-800">🧑‍🏫 教師績效總覽</h2>
                        <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded">依照平均成績排序</span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-gray-500 uppercase text-xs tracking-wider">
                                <tr>
                                    <th className="p-5">教師姓名 / 職稱</th>
                                    <th className="p-5">負責班級</th>
                                    <th className="p-5 text-center">學生數</th>
                                    <th className="p-5 text-center">班級平均分</th>
                                    <th className="p-5 text-center">請假人次</th>
                                    <th className="p-5 text-right">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {teachers.map((t) => (
                                    <tr key={t.id} className="hover:bg-blue-50/50 transition duration-150">
                                        <td className="p-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg">
                                                    {t.full_name?.[0] || 'T'}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-gray-800">{t.full_name}</div>
                                                    <div className="text-xs text-gray-500">{t.job_title || '教師'}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-5">
                                            <div className="flex flex-wrap gap-1">
                                                {t.responsible_classes && t.responsible_classes.length > 0
                                                    ? t.responsible_classes.map((c: string) => (
                                                        <span key={c} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded border border-gray-200">{c}</span>
                                                    ))
                                                    : <span className="text-gray-300 text-xs italic">無班級</span>
                                                }
                                            </div>
                                        </td>
                                        <td className="p-5 text-center font-bold text-gray-700">{t.studentCount}</td>
                                        <td className="p-5 text-center">
                                            <div className={`inline-block px-3 py-1 rounded-full text-sm font-black
                                                ${t.avgScore >= 90 ? 'bg-green-100 text-green-700' :
                                                    t.avgScore < 70 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-700'}`}>
                                                {t.avgScore}
                                            </div>
                                        </td>
                                        <td className="p-5 text-center text-gray-600">{t.leaveCount}</td>
                                        <td className="p-5 text-right">
                                            <button
                                                onClick={() => alert(`即將顯示 ${t.full_name} 的詳細班級分析 (功能開發中)`)}
                                                className="text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-xs font-bold transition"
                                            >
                                                查看詳情
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {teachers.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="p-10 text-center text-gray-400">
                                            目前此部門尚無教師資料
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

function KPICard({ title, value, unit, icon, color, sub }: any) {
    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition">
            <div className="flex justify-between items-start mb-4">
                <div className={`w-12 h-12 rounded-xl text-white flex items-center justify-center text-2xl shadow-lg ${color}`}>
                    {icon}
                </div>
                {sub && <span className="text-xs font-bold bg-gray-100 text-gray-500 px-2 py-1 rounded-full">{sub}</span>}
            </div>
            <div className="text-gray-500 text-sm font-bold uppercase tracking-wide mb-1">{title}</div>
            <div className="text-3xl font-black text-gray-800">
                {value} <span className="text-sm text-gray-400 font-normal">{unit}</span>
            </div>
        </div>
    );
}
