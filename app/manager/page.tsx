'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { getEffectivePermissions } from '@/lib/permissions';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    LineChart, Line, Legend, Cell
} from 'recharts';

// ─── 常數 ────────────────────────────────────────────────────────────────────
const DEPT_OPTIONS = [
    { value: null, label: '全校總覽', icon: '🏫' },
    { value: 'english', label: '英文部', icon: '🇬🇧' },
    { value: 'after_school', label: '安親部', icon: '🌙' },
    { value: 'general', label: '行政部', icon: '📋' },
];

const PERIOD_OPTIONS = [
    { value: 'week', label: '本週' },
    { value: 'month', label: '本月' },
    { value: 'semester', label: '本學期' },
    { value: 'all', label: '全部' },
];

const TAB_OPTIONS = [
    { value: 'overview', label: '📊 總覽' },
    { value: 'classes', label: '🏫 班級分析' },
    { value: 'teachers', label: '🧑‍🏫 師資效能' },
    { value: 'attendance', label: '📅 出勤分析' },
    { value: 'retention', label: '📈 留存趨勢' },
];

function getDateRange(period: string): { from: string | null; to: string | null } {
    const now = new Date();
    const to = now.toISOString().split('T')[0];
    if (period === 'week') {
        const from = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
        return { from, to };
    }
    if (period === 'month') {
        const from = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];
        return { from, to };
    }
    if (period === 'semester') {
        const from = new Date(now.getTime() - 180 * 86400000).toISOString().split('T')[0];
        return { from, to };
    }
    return { from: null, to: null };
}

// ─── 主元件 ──────────────────────────────────────────────────────────────────
export default function ManagerDashboard() {
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [isDirector, setIsDirector] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');

    // 篩選條件
    const [selectedDept, setSelectedDept] = useState<string | null>(null);
    const [period, setPeriod] = useState('month');

    // ── 總覽資料
    const [teachers, setTeachers] = useState<any[]>([]);
    const [kpi, setKpi] = useState({ teacherCount: 0, studentCount: 0, avgScore: 0, absenceRate: 0, passRate: 0, atRiskCount: 0 });
    const [classChartData, setClassChartData] = useState<any[]>([]);
    const [trendData, setTrendData] = useState<any[]>([]);
    const [atRiskStudents, setAtRiskStudents] = useState<any[]>([]);

    // ── 班級分析
    const [fillRateData, setFillRateData] = useState<any[]>([]);

    // ── 師資效能
    const [improvementData, setImprovementData] = useState<any[]>([]);

    // ── 出勤分析
    const [absenceRanking, setAbsenceRanking] = useState<any[]>([]);
    const [monthlyAbsence, setMonthlyAbsence] = useState<any[]>([]);

    // ── 留存趨勢
    const [retentionData, setRetentionData] = useState<any[]>([]);
    const [retentionKpi, setRetentionKpi] = useState({ thisMonth: 0, total: 0, growthPct: 0 });

    // ── 老師詳情 Modal
    const [selectedTeacher, setSelectedTeacher] = useState<any>(null);
    const [teacherStats, setTeacherStats] = useState<any>({ classPerformance: [], recentExams: [], atRiskStudents: [] });
    const [detailLoading, setDetailLoading] = useState(false);

    const router = useRouter();

    useEffect(() => { checkPermission(); }, []);
    useEffect(() => { if (currentUser) fetchAll(); }, [selectedDept, period, currentUser]);

    // ── 權限檢查 ──────────────────────────────────────────────────────────────
    const checkPermission = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        const { data: profile } = await supabase.from('users').select('*').eq('id', session.user.id).single();
        if (!profile) { router.push('/'); return; }

        const { data: roleConfigRow } = await supabase.from('role_configs').select('permissions').eq('role', profile.role).single();
        const perms = getEffectivePermissions(profile.role, roleConfigRow?.permissions ?? null, profile.extra_permissions ?? null);

        if (!perms.viewManagerDashboard) { router.push('/'); return; }

        const director = ['director', 'manager'].includes(profile.role);
        setIsDirector(director);
        setCurrentUser(profile);
        if (!director && profile.department) setSelectedDept(profile.department);
    };

    // ── 全部數據載入 ─────────────────────────────────────────────────────────
    const fetchAll = async () => {
        setLoading(true);
        const { from, to } = getDateRange(period);

        // 1. 教師清單（dept 篩選，可能為空，不 early-exit）
        let tq = supabase.from('users').select('*').eq('role', 'teacher');
        if (selectedDept) tq = tq.eq('department', selectedDept);
        const { data: teacherList } = await tq;

        // 2. 所有學生（直接從 students 抓，不依賴老師 responsible_classes）
        const { data: allStudents } = await supabase.from('students').select('*');

        // ── 依部門篩選學生（以 grade 的班級前綴判斷）────────────────────
        //   english dept  → 含 'CEI-'（不含課後輔導班的純英文班）
        //   after_school  → 含 '課後輔導班'
        //   general/null  → 全部
        function isDeptStudent(grade: string | null): boolean {
            if (!grade) return false;
            if (!selectedDept) return true;
            if (selectedDept === 'english') return grade.includes('CEI-');
            if (selectedDept === 'after_school') return grade.includes('課後輔導班');
            return true;
        }
        const deptStudents = allStudents?.filter(s => isDeptStudent(s.grade)) || [];
        const deptStudentIds = deptStudents.map(s => s.id);

        // 3. 考試（只取部門學生，含時間篩選）
        let eq = supabase.from('exam_results').select('*');
        if (deptStudentIds.length > 0) eq = eq.in('student_id', deptStudentIds);
        if (from) eq = eq.gte('exam_date', from);
        if (to) eq = eq.lte('exam_date', to);
        const { data: allExams } = deptStudentIds.length > 0 ? await eq : { data: [] };

        // 4. 請假（只取部門學生，含時間篩選）
        let lq = supabase.from('leave_requests').select('*').eq('status', 'approved');
        if (deptStudentIds.length > 0) lq = lq.in('student_id', deptStudentIds);
        if (from) lq = lq.gte('leave_date', from);
        if (to) lq = lq.lte('leave_date', to);
        const { data: allLeaves } = deptStudentIds.length > 0 ? await lq : { data: [] };

        // 5. 班級容量（schedule_slots）
        const { data: slots } = await supabase.from('schedule_slots').select('class_group, max_students');
        const slotCapacity: Record<string, number> = {};
        slots?.forEach((s: any) => {
            if (!slotCapacity[s.class_group] || (s.max_students || 0) > slotCapacity[s.class_group]) {
                slotCapacity[s.class_group] = s.max_students || 25;
            }
        });

        // ── 直接從學生資料算班級分佈（不依賴老師）─────────────────────
        const classMap: Record<string, any> = {};
        deptStudents.forEach(s => {
            if (!s.grade) return;
            // 取主班級（逗號前）
            const primaryClass = s.grade.split(',')[0].trim();
            if (!primaryClass || primaryClass === '課後輔導班') return;
            if (!classMap[primaryClass]) classMap[primaryClass] = { class: primaryClass, count: 0, scoreSum: 0, scoreCount: 0 };
            classMap[primaryClass].count++;
            // 成績稍後補入
        });
        allExams?.forEach((e: any) => {
            const student = deptStudents.find(s => s.id === e.student_id);
            if (!student?.grade) return;
            const primaryClass = student.grade.split(',')[0].trim();
            if (!classMap[primaryClass]) return;
            classMap[primaryClass].scoreSum += e.score;
            classMap[primaryClass].scoreCount++;
        });
        const classChartArr = Object.values(classMap).map((c: any) => ({
            class: c.class,
            count: c.count,
            avg: c.scoreCount > 0 ? Math.round(c.scoreSum / c.scoreCount) : 0,
        })).sort((a, b) => b.avg - a.avg || a.class.localeCompare(b.class)).slice(0, 14);

        // ── KPI 全域計算（直接用部門學生）──────────────────────────────
        const totalStudents = deptStudents.length;
        const examScores = allExams?.map((e: any) => e.score) || [];
        const overallAvg = examScores.length > 0 ? Math.round(examScores.reduce((a: number, b: number) => a + b, 0) / examScores.length) : 0;
        const passRate = examScores.length > 0 ? Math.round((examScores.filter((s: number) => s >= 60).length / examScores.length) * 100) : 0;
        const absenceRate = totalStudents > 0 ? Math.round(((allLeaves?.length || 0) / totalStudents) * 100) : 0;

        // ── 高風險學生（直接從部門學生計算）────────────────────────────
        const allAtRisk: any[] = [];
        deptStudents.forEach(s => {
            const sExams = allExams?.filter((e: any) => e.student_id === s.id) || [];
            const sLeaves = allLeaves?.filter((l: any) => l.student_id === s.id) || [];
            const sAvg = sExams.length > 0 ? Math.round(sExams.reduce((a: number, e: any) => a + e.score, 0) / sExams.length) : null;
            if ((sAvg !== null && sAvg < 60) || sLeaves.length > 3) {
                // 嘗試找對應老師姓名
                const teacher = (teacherList || []).find((t: any) => {
                    let cls: string[] = [];
                    try { cls = Array.isArray(t.responsible_classes) ? t.responsible_classes : JSON.parse(t.responsible_classes || '[]'); } catch { cls = []; }
                    return cls.some((c: string) => s.grade?.includes(c));
                });
                allAtRisk.push({ ...s, avgScore: sAvg, absence: sLeaves.length, teacherName: teacher?.name || '—' });
            }
        });

        // ── 處理老師績效（teacher table 仍用 responsible_classes 配對，但不影響 KPI）
        const processed = (teacherList || []).map((t: any) => {
            let classes: string[] = [];
            try { const raw = t.responsible_classes; classes = Array.isArray(raw) ? raw : JSON.parse(raw || '[]'); } catch { classes = []; }

            const myStudents = deptStudents.filter(s => s.grade && classes.some((c: string) => s.grade.includes(c)));
            const sIds = myStudents.map(s => s.id);
            const myExams = allExams?.filter((e: any) => sIds.includes(e.student_id)) || [];
            const myLeaves = allLeaves?.filter((l: any) => sIds.includes(l.student_id)) || [];
            const avg = myExams.length > 0 ? Math.round(myExams.reduce((a: number, b: any) => a + b.score, 0) / myExams.length) : 0;

            return { ...t, responsible_classes: classes, studentCount: myStudents.length, avgScore: avg, leaveCount: myLeaves.length, students: myStudents };
        });

        setTeachers(processed.sort((a: any, b: any) => b.avgScore - a.avgScore));
        setKpi({ teacherCount: (teacherList || []).length, studentCount: totalStudents, avgScore: overallAvg, absenceRate, passRate, atRiskCount: allAtRisk.length });
        setClassChartData(classChartArr);
        setAtRiskStudents(allAtRisk.slice(0, 8));

        // ── 趨勢圖：過去 6 個月各月平均分 ────────────────────────────────
        const monthlyMap: Record<string, { sum: number; count: number }> = {};
        const allStudentIds = deptStudentIds.length > 0 ? deptStudentIds : (allStudents?.map(s => s.id) || []);
        const { data: trendExams } = allStudentIds.length > 0
            ? await supabase.from('exam_results').select('score, exam_date').in('student_id', allStudentIds).gte('exam_date', new Date(Date.now() - 180 * 86400000).toISOString().split('T')[0])
            : { data: [] };

        trendExams?.forEach(e => {
            const month = e.exam_date?.slice(0, 7);
            if (!month) return;
            if (!monthlyMap[month]) monthlyMap[month] = { sum: 0, count: 0 };
            monthlyMap[month].sum += e.score;
            monthlyMap[month].count += 1;
        });
        const trend = Object.entries(monthlyMap).sort(([a], [b]) => a.localeCompare(b)).map(([month, d]) => ({
            month: month.slice(5) + '月', avg: Math.round(d.sum / d.count)
        }));
        setTrendData(trend);

        // ─────────────────────────────────────────────────────────────────────
        // ── 新功能 2：班級飽和率 ─────────────────────────────────────────
        const classEnrollment: Record<string, number> = {};
        deptStudents.forEach((s: any) => {
            if (!s.grade) return;
            const classes = s.grade.split(',').map((g: string) => g.trim()).filter(Boolean);
            classes.forEach((cls: string) => {
                if (!cls.startsWith('課後')) classEnrollment[cls] = (classEnrollment[cls] || 0) + 1;
            });
        });
        const fillArr = Object.keys(classEnrollment).map(cls => {
            const enrolled = classEnrollment[cls];
            const capacity = slotCapacity[cls] || 25;
            return { class: cls, enrolled, capacity, rate: Math.round((enrolled / capacity) * 100) };
        }).sort((a, b) => b.rate - a.rate).slice(0, 14);
        setFillRateData(fillArr);

        // ── 新功能 3：學生流失 / 留存趨勢（最近 12 個月新生）──────────────
        const twelveMonthsAgo = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];
        const { data: recentStudents } = await supabase.from('students').select('id, created_at').gte('created_at', twelveMonthsAgo);
        const retMap: Record<string, number> = {};
        recentStudents?.forEach((s: any) => {
            const month = s.created_at?.slice(0, 7);
            if (month) retMap[month] = (retMap[month] || 0) + 1;
        });
        const retArr = Object.entries(retMap).sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({
            month: month.slice(5) + '月', newStudents: count
        }));
        setRetentionData(retArr);

        const thisMonthKey = new Date().toISOString().slice(0, 7);
        const lastMonthKey = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 7);
        const thisMonthCount = retMap[thisMonthKey] || 0;
        const lastMonthCount = retMap[lastMonthKey] || 0;
        const growth = lastMonthCount > 0 ? Math.round(((thisMonthCount - lastMonthCount) / lastMonthCount) * 100) : 0;
        setRetentionKpi({ thisMonth: thisMonthCount, total: deptStudents.length, growthPct: growth });

        // ── 新功能 4：請假頻率排名 ────────────────────────────────────────
        // Use ALL-TIME leaves for this ranking (not period-filtered)
        const { data: allTimeLeaves } = await supabase.from('leave_requests').select('*').eq('status', 'approved');
        const absMap: Record<string, { count: number; student: any }> = {};
        allTimeLeaves?.forEach((l: any) => {
            const student = deptStudents.find((s: any) => s.id === l.student_id);
            if (!student) return;
            if (!absMap[l.student_id]) absMap[l.student_id] = { count: 0, student };
            absMap[l.student_id].count++;
        });
        const absRanking = Object.values(absMap)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)
            .map(item => ({ ...item.student, absenceCount: item.count }));
        setAbsenceRanking(absRanking);

        // Monthly absence trend (last 6 months)
        const absMonthMap: Record<string, number> = {};
        allTimeLeaves?.filter((l: any) => l.leave_date >= new Date(Date.now() - 180 * 86400000).toISOString().split('T')[0])
            .forEach((l: any) => {
                const month = l.leave_date?.slice(0, 7);
                if (month) absMonthMap[month] = (absMonthMap[month] || 0) + 1;
            });
        const absMonthArr = Object.entries(absMonthMap).sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({
            month: month.slice(5) + '月', count
        }));
        setMonthlyAbsence(absMonthArr);

        // ── 新功能 5：老師進步量效能比較 ─────────────────────────────────
        // Compare earliest 50% vs latest 50% of exam scores per teacher
        const { data: allTimeExams } = allStudentIds.length > 0
            ? await supabase.from('exam_results').select('*').in('student_id', allStudentIds)
            : { data: [] };

        const improvArr = processed.map(t => {
            const sIds = t.students?.map((s: any) => s.id) || [];
            const myExams = allTimeExams?.filter((e: any) => sIds.includes(e.student_id)) || [];
            if (myExams.length < 4) return { name: t.name, improvement: null, avgScore: t.avgScore, examCount: myExams.length };

            const sorted = [...myExams].sort((a: any, b: any) => (a.exam_date || '').localeCompare(b.exam_date || ''));
            const half = Math.floor(sorted.length / 2);
            const early = sorted.slice(0, half);
            const late = sorted.slice(half);
            const earlyAvg = early.reduce((a: number, b: any) => a + b.score, 0) / early.length;
            const lateAvg = late.reduce((a: number, b: any) => a + b.score, 0) / late.length;
            return { name: t.name, improvement: Math.round(lateAvg - earlyAvg), avgScore: t.avgScore, examCount: myExams.length };
        }).filter(t => t.examCount >= 4).sort((a, b) => (b.improvement || 0) - (a.improvement || 0));
        setImprovementData(improvArr);

        setLoading(false);
    };

    // ── 老師詳情 ──────────────────────────────────────────────────────────────
    const fetchTeacherDetails = async (teacher: any) => {
        setSelectedTeacher(teacher);
        setDetailLoading(true);
        try {
            const studentIds = teacher.students?.map((s: any) => s.id) || [];
            if (studentIds.length === 0) { setTeacherStats({ classPerformance: [], recentExams: [], atRiskStudents: [] }); return; }

            const { data: exams } = await supabase.from('exam_results').select('*').in('student_id', studentIds).order('exam_date', { ascending: false });
            const { data: leaves } = await supabase.from('leave_requests').select('*').in('student_id', studentIds).eq('status', 'approved');

            const classPerfMap: any = {};
            teacher.responsible_classes?.forEach((cls: string) => {
                const studentsInClass = teacher.students.filter((s: any) => s.grade?.includes(cls));
                const sIds = studentsInClass.map((s: any) => s.id);
                const classExams = exams?.filter((e: any) => sIds.includes(e.student_id)) || [];
                const avg = classExams.length > 0 ? Math.round(classExams.reduce((a: any, b: any) => a + b.score, 0) / classExams.length) : 0;
                const passedCount = classExams.filter((e: any) => e.score >= 60).length;
                classPerfMap[cls] = { className: cls, studentCount: studentsInClass.length, avgScore: avg, passRate: classExams.length > 0 ? Math.round((passedCount / classExams.length) * 100) : 0 };
            });

            const uniqueExams = Array.from(new Set(exams?.map((e: any) => e.exam_name))).slice(0, 5).map(name => {
                const ex = exams?.find((e: any) => e.exam_name === name);
                return { name: ex.exam_name, date: ex.exam_date, subject: ex.subject };
            });

            const atRisk = teacher.students.map((s: any) => {
                const myExams = exams?.filter((e: any) => e.student_id === s.id) || [];
                const myLeaves = leaves?.filter((l: any) => l.student_id === s.id) || [];
                const myAvg = myExams.length > 0 ? Math.round(myExams.reduce((a: any, b: any) => a + b.score, 0) / myExams.length) : null;
                if ((myAvg !== null && myAvg < 60) || myLeaves.length > 3) return { ...s, avgScore: myAvg, absence: myLeaves.length };
                return null;
            }).filter(Boolean);

            setTeacherStats({ classPerformance: Object.values(classPerfMap), recentExams: uniqueExams, atRiskStudents: atRisk });
        } catch (e) { console.error(e); }
        finally { setDetailLoading(false); }
    };

    if (loading) return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="text-center">
                <div className="text-4xl mb-3 animate-pulse">📊</div>
                <p className="text-gray-500 font-medium">數據分析中...</p>
            </div>
        </div>
    );

    const deptLabel = DEPT_OPTIONS.find(d => d.value === selectedDept)?.label || '全校總覽';
    const avgFillRate = fillRateData.length > 0 ? Math.round(fillRateData.reduce((a, b) => a + b.rate, 0) / fillRateData.length) : 0;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* ── 頂部 Header ── */}
            <div className="bg-white border-b shadow-sm sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-black text-gray-800">📊 部門戰情室</h1>
                        <p className="text-sm text-gray-500 mt-0.5">{currentUser?.name} · {deptLabel}</p>
                    </div>
                    <button onClick={() => router.push('/')} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl text-sm transition">
                        ← 回首頁
                    </button>
                </div>

                {/* ── 篩選列 ── */}
                <div className="max-w-7xl mx-auto px-6 pb-3 flex flex-wrap gap-3 items-center">
                    {isDirector && (
                        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                            {DEPT_OPTIONS.map(d => (
                                <button key={String(d.value)} onClick={() => setSelectedDept(d.value)}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-bold transition
                                        ${selectedDept === d.value ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>
                                    {d.icon} {d.label}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="flex gap-1 bg-gray-100 p-1 rounded-xl ml-auto">
                        {PERIOD_OPTIONS.map(p => (
                            <button key={p.value} onClick={() => setPeriod(p.value)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition
                                    ${period === p.value ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── 分頁 Tab ── */}
                <div className="max-w-7xl mx-auto px-6 flex gap-1 border-t border-gray-100 pt-1">
                    {TAB_OPTIONS.map(tab => (
                        <button key={tab.value} onClick={() => setActiveTab(tab.value)}
                            className={`px-4 py-2 text-sm font-bold rounded-t-lg transition border-b-2
                                ${activeTab === tab.value
                                    ? 'border-indigo-600 text-indigo-700 bg-indigo-50'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* ── Tab: 總覽 ── */}
                {activeTab === 'overview' && (
                    <>
                        {/* KPI 卡片 */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                            <KPICard title="部門教師" value={kpi.teacherCount} unit="位" icon="🧑‍🏫" color="bg-blue-500" />
                            <KPICard title="負責學生" value={kpi.studentCount} unit="人" icon="👶" color="bg-indigo-500" />
                            <KPICard title="平均成績" value={kpi.avgScore} unit="分" icon="📈"
                                color={kpi.avgScore >= 80 ? 'bg-emerald-500' : kpi.avgScore < 60 ? 'bg-red-500' : 'bg-amber-500'}
                                sub={kpi.avgScore >= 80 ? '優異 ✨' : kpi.avgScore < 60 ? '需關注 ⚠️' : '正常'} />
                            <KPICard title="及格率" value={kpi.passRate} unit="%" icon="✅" color={kpi.passRate >= 80 ? 'bg-emerald-500' : 'bg-orange-500'} />
                            <KPICard title="缺勤率" value={kpi.absenceRate} unit="%" icon="📅" color={kpi.absenceRate > 15 ? 'bg-red-500' : 'bg-gray-500'} />
                            <KPICard title="需關注學生" value={kpi.atRiskCount} unit="人" icon="🚨"
                                color={kpi.atRiskCount > 0 ? 'bg-red-500' : 'bg-emerald-500'}
                                sub={kpi.atRiskCount === 0 ? '全部正常 🎉' : undefined} />
                        </div>

                        {/* 圖表區 */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <ChartCard title="📊 各班平均成績">
                                {classChartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={240}>
                                        <BarChart data={classChartData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                            <XAxis dataKey="class" tick={{ fontSize: 11 }} />
                                            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                                            <Tooltip formatter={(val: any) => [`${val} 分`, '平均']} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                                            <Bar dataKey="avg" name="平均分" radius={[4, 4, 0, 0]} fill="#6366f1"
                                                label={{ position: 'top', fontSize: 10, fill: '#6b7280' }} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : <EmptyChart text={period !== 'all' ? `${PERIOD_OPTIONS.find(p => p.value === period)?.label}內尚無考試數據` : '尚無班級考試數據'} />}
                            </ChartCard>

                            <ChartCard title="📈 近 6 個月成績趨勢">
                                {trendData.length > 1 ? (
                                    <ResponsiveContainer width="100%" height={240}>
                                        <LineChart data={trendData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                                            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                                            <Tooltip formatter={(val: any) => [`${val} 分`, '平均']} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                                            <Line type="monotone" dataKey="avg" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                ) : <EmptyChart text="數據不足以顯示趨勢（需至少 2 個月）" />}
                            </ChartCard>
                        </div>

                        {/* At-Risk 學生 */}
                        {atRiskStudents.length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
                                <h2 className="text-base font-bold text-red-700 mb-3 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-red-500 rounded-full animate-ping inline-block"></span>
                                    🚨 需要關注的學生（成績 &lt; 60 或缺勤 &gt; 3 次）
                                </h2>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                    {atRiskStudents.map((s: any) => (
                                        <div key={s.id} className="bg-white rounded-xl p-3 border-l-4 border-red-500 shadow-sm">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="w-7 h-7 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">
                                                    {s.chinese_name?.[0]}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-gray-800 text-sm">{s.chinese_name}</div>
                                                    <div className="text-[10px] text-gray-400">{s.grade}</div>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 mt-1 flex-wrap">
                                                {s.avgScore !== null && s.avgScore < 60 && (
                                                    <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">均分 {s.avgScore}</span>
                                                )}
                                                {s.absence > 3 && (
                                                    <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-bold">缺席 {s.absence} 次</span>
                                                )}
                                                {s.teacherName && (
                                                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">👤 {s.teacherName}</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* ── Tab: 班級分析 ── */}
                {activeTab === 'classes' && (
                    <>
                        {/* KPI */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <KPICard title="總班級數" value={fillRateData.length} unit="班" icon="🏫" color="bg-indigo-500" />
                            <KPICard title="平均飽和率" value={avgFillRate} unit="%" icon="📊"
                                color={avgFillRate >= 85 ? 'bg-emerald-500' : avgFillRate < 60 ? 'bg-orange-500' : 'bg-blue-500'}
                                sub={avgFillRate >= 85 ? '近滿班 🔥' : avgFillRate < 60 ? '招生空間大' : '正常'} />
                            <KPICard title="快滿班（≥90%）" value={fillRateData.filter(c => c.rate >= 90).length} unit="班" icon="⚠️" color="bg-orange-500" />
                            <KPICard title="空位多（≤50%）" value={fillRateData.filter(c => c.rate <= 50).length} unit="班" icon="📭" color="bg-gray-500" />
                        </div>

                        {/* 飽和率圖 */}
                        <ChartCard title="🏫 各班招生飽和率（在籍人數 / 班級容量）" subtitle="預設容量 25 人；可在排課系統設定 max_students">
                            {fillRateData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={320}>
                                    <BarChart data={fillRateData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="class" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={50} />
                                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                                        <Tooltip
                                            formatter={(val: any, name: string, props: any) => [
                                                `${props.payload.enrolled} / ${props.payload.capacity} 人（${val}%）`, '飽和率'
                                            ]}
                                            contentStyle={{ borderRadius: 8, fontSize: 12 }}
                                        />
                                        <Bar dataKey="rate" name="飽和率" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 10, fill: '#6b7280', formatter: (v: any) => `${v}%` }}>
                                            {fillRateData.map((entry, index) => (
                                                <Cell key={`cell-${index}`}
                                                    fill={entry.rate >= 90 ? '#f97316' : entry.rate >= 70 ? '#6366f1' : '#94a3b8'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : <EmptyChart text="尚無班級招生資料" />}
                        </ChartCard>

                        {/* 飽和率明細表 */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="p-5 border-b flex justify-between items-center">
                                <h2 className="text-base font-bold text-gray-800">📋 班級招生明細</h2>
                                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded font-bold">依飽和率排序</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                                        <tr>
                                            <th className="p-4 text-left">班級</th>
                                            <th className="p-4 text-center">在籍人數</th>
                                            <th className="p-4 text-center">班級容量</th>
                                            <th className="p-4 text-center">飽和率</th>
                                            <th className="p-4 text-left">視覺化</th>
                                            <th className="p-4 text-center">狀態</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {fillRateData.map(cls => (
                                            <tr key={cls.class} className="hover:bg-indigo-50/30 transition">
                                                <td className="p-4 font-bold text-gray-800">{cls.class}</td>
                                                <td className="p-4 text-center font-bold text-indigo-700">{cls.enrolled}</td>
                                                <td className="p-4 text-center text-gray-500">{cls.capacity}</td>
                                                <td className="p-4 text-center font-black text-gray-800">{cls.rate}%</td>
                                                <td className="p-4">
                                                    <div className="w-32 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                                        <div className={`h-full rounded-full transition-all
                                                            ${cls.rate >= 90 ? 'bg-orange-500' : cls.rate >= 70 ? 'bg-indigo-500' : 'bg-gray-400'}`}
                                                            style={{ width: `${Math.min(cls.rate, 100)}%` }} />
                                                    </div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    {cls.rate >= 90 ? <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-bold">即將額滿 🔥</span>
                                                        : cls.rate >= 70 ? <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-bold">良好</span>
                                                            : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-bold">招生空間</span>}
                                                </td>
                                            </tr>
                                        ))}
                                        {fillRateData.length === 0 && (
                                            <tr><td colSpan={6} className="p-10 text-center text-gray-400">尚無班級資料</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* ── Tab: 師資效能 ── */}
                {activeTab === 'teachers' && (
                    <>
                        {/* 進步量圖 */}
                        <ChartCard title="🧑‍🏫 老師學生進步量比較" subtitle="計算各老師學生「後半期平均 − 前半期平均」，需至少 4 筆考試才納入">
                            {improvementData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={280}>
                                    <BarChart data={improvementData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                        <YAxis tick={{ fontSize: 11 }} unit="分" />
                                        <Tooltip
                                            formatter={(val: any) => [`${val > 0 ? '+' : ''}${val} 分`, '學生進步量']}
                                            contentStyle={{ borderRadius: 8, fontSize: 12 }}
                                        />
                                        <Bar dataKey="improvement" name="進步量" radius={[4, 4, 0, 0]}
                                            label={{ position: 'top', fontSize: 11, fill: '#6b7280', formatter: (v: any) => v !== null ? `${v > 0 ? '+' : ''}${v}` : '' }}>
                                            {improvementData.map((entry, index) => (
                                                <Cell key={`cell-${index}`}
                                                    fill={(entry.improvement || 0) >= 5 ? '#10b981' : (entry.improvement || 0) >= 0 ? '#6366f1' : '#f87171'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : <EmptyChart text="數據不足（需各老師有至少 4 筆考試成績）" />}
                        </ChartCard>

                        {/* 教師績效表格 */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="p-5 border-b flex justify-between items-center">
                                <h2 className="text-base font-bold text-gray-800">🧑‍🏫 教師績效排行</h2>
                                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded font-bold">依平均成績排序</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                                        <tr>
                                            <th className="p-4 text-left">教師</th>
                                            <th className="p-4 text-left">負責班級</th>
                                            <th className="p-4 text-center">學生數</th>
                                            <th className="p-4 text-center">平均分</th>
                                            <th className="p-4 text-center">進步量</th>
                                            <th className="p-4 text-center">缺勤人次</th>
                                            <th className="p-4 text-center">成績分佈</th>
                                            <th className="p-4 text-right">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {teachers.map((t) => {
                                            const impData = improvementData.find(i => i.name === t.name);
                                            const imp = impData?.improvement;
                                            return (
                                                <tr key={t.id} className="hover:bg-indigo-50/40 transition">
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-base">
                                                                {t.name?.[0] || 'T'}
                                                            </div>
                                                            <div>
                                                                <div className="font-bold text-gray-800">{t.name}</div>
                                                                <div className="text-xs text-gray-400">{t.job_title || '教師'}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex flex-wrap gap-1">
                                                            {t.responsible_classes?.length > 0
                                                                ? t.responsible_classes.map((c: string) => (
                                                                    <span key={c} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-bold rounded">{c}</span>
                                                                ))
                                                                : <span className="text-gray-300 text-xs italic">無班級</span>}
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-center font-bold text-gray-700">{t.studentCount}</td>
                                                    <td className="p-4 text-center">
                                                        <span className={`px-3 py-1 rounded-full text-sm font-black
                                                            ${t.avgScore >= 80 ? 'bg-green-100 text-green-700' :
                                                                t.avgScore < 60 ? 'bg-red-100 text-red-600' :
                                                                    t.avgScore > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                                                            {t.avgScore > 0 ? `${t.avgScore}` : '—'}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        {imp !== null && imp !== undefined ? (
                                                            <span className={`text-sm font-black ${imp >= 5 ? 'text-emerald-600' : imp >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                                                                {imp > 0 ? '+' : ''}{imp}
                                                            </span>
                                                        ) : <span className="text-gray-300 text-xs">—</span>}
                                                    </td>
                                                    <td className="p-4 text-center text-gray-600">{t.leaveCount}</td>
                                                    <td className="p-4">
                                                        <div className="w-24 mx-auto">
                                                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                                <div className={`h-full rounded-full transition-all ${t.avgScore >= 80 ? 'bg-green-400' : t.avgScore < 60 ? 'bg-red-400' : 'bg-blue-400'}`}
                                                                    style={{ width: `${t.avgScore}%` }} />
                                                            </div>
                                                            <div className="text-[10px] text-center text-gray-400 mt-1">{t.avgScore}%</div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        <button onClick={() => fetchTeacherDetails(t)}
                                                            className="text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg text-xs font-bold transition">
                                                            詳情 →
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {teachers.length === 0 && (
                                            <tr><td colSpan={8} className="p-10 text-center text-gray-400">此部門目前無教師資料</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* ── Tab: 出勤分析 ── */}
                {activeTab === 'attendance' && (
                    <>
                        {/* KPI */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <KPICard title="總缺勤人次" value={kpi.absenceRate} unit="%" icon="📅"
                                color={kpi.absenceRate > 15 ? 'bg-red-500' : 'bg-gray-500'} />
                            <KPICard title="最高缺勤" value={absenceRanking[0]?.absenceCount || 0} unit="次" icon="🔴" color="bg-orange-500"
                                sub={absenceRanking[0]?.chinese_name || '—'} />
                            <KPICard title="缺勤 ≥5 次" value={absenceRanking.filter(s => s.absenceCount >= 5).length} unit="人" icon="⚠️"
                                color="bg-red-500" />
                            <KPICard title="本期請假學生" value={new Set(kpi.absenceRate > 0 ? absenceRanking.map(s => s.id) : []).size} unit="人" icon="📋" color="bg-blue-500" />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* 月缺勤趨勢 */}
                            <ChartCard title="📅 近 6 個月缺勤趨勢">
                                {monthlyAbsence.length > 1 ? (
                                    <ResponsiveContainer width="100%" height={240}>
                                        <LineChart data={monthlyAbsence} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                                            <YAxis tick={{ fontSize: 11 }} />
                                            <Tooltip formatter={(val: any) => [`${val} 人次`, '缺勤']} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                                            <Line type="monotone" dataKey="count" stroke="#f97316" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                ) : <EmptyChart text="缺勤數據不足（需至少 2 個月）" />}
                            </ChartCard>

                            {/* 請假頻率 Top 10 */}
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                                <h2 className="text-base font-bold text-gray-800 mb-4">🏆 請假頻率排名 Top 10</h2>
                                {absenceRanking.length > 0 ? (
                                    <div className="space-y-2">
                                        {absenceRanking.map((s: any, i: number) => (
                                            <div key={s.id} className="flex items-center gap-3">
                                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0
                                                    ${i === 0 ? 'bg-orange-500 text-white' : i === 1 ? 'bg-gray-400 text-white' : i === 2 ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                                    {i + 1}
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-center mb-0.5">
                                                        <span className="font-bold text-gray-800 text-sm truncate">{s.chinese_name}</span>
                                                        <span className={`text-xs font-black ml-2 flex-shrink-0
                                                            ${s.absenceCount >= 8 ? 'text-red-600' : s.absenceCount >= 5 ? 'text-orange-600' : 'text-gray-600'}`}>
                                                            {s.absenceCount} 次
                                                        </span>
                                                    </div>
                                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full
                                                            ${s.absenceCount >= 8 ? 'bg-red-500' : s.absenceCount >= 5 ? 'bg-orange-400' : 'bg-blue-400'}`}
                                                            style={{ width: `${Math.min((s.absenceCount / (absenceRanking[0]?.absenceCount || 1)) * 100, 100)}%` }} />
                                                    </div>
                                                    <div className="text-[10px] text-gray-400 mt-0.5">{s.grade}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : <EmptyChart text="目前無請假記錄" />}
                            </div>
                        </div>
                    </>
                )}

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* ── Tab: 留存趨勢 ── */}
                {activeTab === 'retention' && (
                    <>
                        {/* KPI */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <KPICard title="總在籍學生" value={retentionKpi.total} unit="人" icon="👶" color="bg-indigo-500" />
                            <KPICard title="本月新生" value={retentionKpi.thisMonth} unit="人" icon="✨" color="bg-emerald-500" />
                            <KPICard title="月增率" value={retentionKpi.growthPct > 0 ? retentionKpi.growthPct : Math.abs(retentionKpi.growthPct)} unit="%"
                                icon={retentionKpi.growthPct >= 0 ? '📈' : '📉'}
                                color={retentionKpi.growthPct >= 0 ? 'bg-emerald-500' : 'bg-red-500'}
                                sub={retentionKpi.growthPct >= 0 ? '較上月成長' : '較上月下降'} />
                            <KPICard title="近 12 月累積新生" value={retentionData.reduce((a, b) => a + b.newStudents, 0)} unit="人" icon="📊" color="bg-blue-500" />
                        </div>

                        <ChartCard title="📈 近 12 個月新生入學趨勢" subtitle="以學生建檔時間（created_at）為基準統計">
                            {retentionData.length > 1 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={retentionData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                        <Tooltip formatter={(val: any) => [`${val} 人`, '新入學']} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                                        <Line type="monotone" dataKey="newStudents" stroke="#6366f1" strokeWidth={2.5}
                                            dot={{ r: 5, fill: '#6366f1' }} activeDot={{ r: 7 }}
                                            label={{ position: 'top', fontSize: 11, fill: '#6b7280' }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : <EmptyChart text="新生入學數據不足（需至少 2 個月）" />}
                        </ChartCard>

                        {/* 每月收入趨勢（預留框架） */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-base font-bold text-gray-800">💰 每月學費收入趨勢</h2>
                                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded font-bold">功能規劃中</span>
                            </div>
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <div className="text-4xl mb-3">💳</div>
                                <p className="text-gray-600 font-bold mb-1">需建立學費記錄資料表</p>
                                <p className="text-gray-400 text-sm max-w-md">
                                    建議新增 <code className="bg-gray-100 px-1 rounded text-xs">fee_records</code> 資料表，包含
                                    <span className="font-medium text-gray-600">學生 ID、繳費月份、金額、狀態（已繳/欠費）</span>
                                    欄位，即可在此顯示月收入折線圖與欠費預警
                                </p>
                                <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-left">
                                    {['月收入折線圖', '欠費學生名單', '收款進度圓餅圖'].map(f => (
                                        <div key={f} className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-indigo-700 font-bold text-center">
                                            {f}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* ── 教師詳情 Modal ── */}
            {selectedTeacher && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl flex flex-col">
                        <div className="bg-indigo-600 p-6 text-white flex justify-between items-start shrink-0 rounded-t-3xl">
                            <div>
                                <h2 className="text-xl font-black flex items-center gap-2">
                                    <span>👨‍🏫</span> {selectedTeacher.name}
                                    <span className="text-sm bg-white/20 px-2 py-0.5 rounded border border-white/30 font-normal">
                                        {selectedTeacher.job_title || '教師'}
                                    </span>
                                </h2>
                                <div className="mt-1 opacity-80 text-sm space-x-3">
                                    <span>📧 {selectedTeacher.email || '—'}</span>
                                    <span>📞 {selectedTeacher.phone || '—'}</span>
                                </div>
                                <div className="mt-3 flex gap-2 flex-wrap">
                                    {selectedTeacher.responsible_classes?.map((c: string) => (
                                        <span key={c} className="bg-white/20 px-2 py-0.5 rounded text-xs border border-white/30">{c}</span>
                                    ))}
                                </div>
                            </div>
                            <button onClick={() => setSelectedTeacher(null)} className="text-white/70 hover:text-white hover:bg-white/20 p-2 rounded-full transition">✕</button>
                        </div>

                        <div className="p-6 space-y-6 bg-gray-50 flex-1">
                            {detailLoading ? (
                                <div className="text-center py-16 text-gray-400">載入中...</div>
                            ) : (
                                <>
                                    <section>
                                        <h3 className="text-sm font-black text-gray-700 mb-3 flex items-center gap-2">
                                            <span className="w-1 h-5 bg-indigo-500 rounded-full"></span> 班級健康度分析
                                        </h3>
                                        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-50 text-gray-500 font-bold text-xs border-b">
                                                    <tr>
                                                        <th className="p-3 text-left">班級</th>
                                                        <th className="p-3 text-center">學生數</th>
                                                        <th className="p-3 text-center">平均分</th>
                                                        <th className="p-3 text-center">及格率</th>
                                                        <th className="p-3 text-center">狀態</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y">
                                                    {teacherStats.classPerformance.map((cls: any) => (
                                                        <tr key={cls.className} className="hover:bg-gray-50">
                                                            <td className="p-3 font-bold text-gray-700">{cls.className}</td>
                                                            <td className="p-3 text-center">{cls.studentCount}</td>
                                                            <td className="p-3 text-center font-bold">{cls.avgScore} 分</td>
                                                            <td className="p-3 text-center">{cls.passRate}%</td>
                                                            <td className="p-3 text-center">
                                                                {cls.avgScore >= 80 ? <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded text-xs font-bold">優良</span>
                                                                    : cls.avgScore < 60 ? <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded text-xs font-bold">需加強</span>
                                                                        : <span className="text-gray-500 text-xs">正常</span>}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {teacherStats.classPerformance.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-gray-400">無班級數據</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </section>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <section>
                                            <h3 className="text-sm font-black text-gray-700 mb-3 flex items-center gap-2">
                                                <span className="w-1 h-5 bg-purple-500 rounded-full"></span> 近期考試紀錄
                                            </h3>
                                            <div className="space-y-2">
                                                {teacherStats.recentExams.map((ex: any, i: number) => (
                                                    <div key={i} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center">
                                                        <div>
                                                            <div className="font-bold text-gray-800 text-sm">{ex.name}</div>
                                                            <div className="text-xs text-gray-400">{ex.subject}</div>
                                                        </div>
                                                        <div className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                                                            {new Date(ex.date).toLocaleDateString('zh-TW')}
                                                        </div>
                                                    </div>
                                                ))}
                                                {teacherStats.recentExams.length === 0 && <div className="text-gray-400 text-sm">尚無考試紀錄</div>}
                                            </div>
                                        </section>

                                        <section>
                                            <h3 className="text-sm font-black text-red-600 mb-3 flex items-center gap-2">
                                                <span className="w-1 h-5 bg-red-500 rounded-full animate-pulse"></span> 重點關注學生
                                            </h3>
                                            <div className="space-y-2 max-h-[280px] overflow-y-auto">
                                                {teacherStats.atRiskStudents.map((s: any) => (
                                                    <div key={s.id} className="bg-white p-3 rounded-xl border-l-4 border-red-500 shadow-sm flex justify-between items-center">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-7 h-7 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">{s.chinese_name?.[0]}</div>
                                                            <div>
                                                                <div className="font-bold text-gray-800 text-sm">{s.chinese_name}</div>
                                                                <div className="text-[10px] text-gray-400">{s.grade}</div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right space-y-0.5">
                                                            {s.avgScore !== null && s.avgScore < 60 && <div className="text-xs font-bold text-red-600">均分 {s.avgScore}</div>}
                                                            {s.absence > 3 && <div className="text-xs font-bold text-orange-600">缺席 {s.absence} 次</div>}
                                                        </div>
                                                    </div>
                                                ))}
                                                {teacherStats.atRiskStudents.length === 0 && (
                                                    <div className="flex flex-col items-center py-8 text-green-600">
                                                        <span className="text-2xl">🎉</span>
                                                        <span className="text-sm font-bold mt-1">目前無須關注學生</span>
                                                    </div>
                                                )}
                                            </div>
                                        </section>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── 共用元件 ──────────────────────────────────────────────────────────────────
function KPICard({ title, value, unit, icon, color, sub }: any) {
    return (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition">
            <div className="flex justify-between items-start mb-3">
                <div className={`w-10 h-10 rounded-xl text-white flex items-center justify-center text-xl shadow ${color}`}>{icon}</div>
                {sub && <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{sub}</span>}
            </div>
            <div className="text-gray-500 text-xs font-bold uppercase tracking-wide mb-0.5">{title}</div>
            <div className="text-2xl font-black text-gray-800">{value} <span className="text-xs text-gray-400 font-normal">{unit}</span></div>
        </div>
    );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="mb-4">
                <h2 className="text-base font-bold text-gray-800">{title}</h2>
                {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
            </div>
            {children}
        </div>
    );
}

function EmptyChart({ text }: { text: string }) {
    return (
        <div className="h-[240px] flex items-center justify-center text-gray-400 text-sm">{text}</div>
    );
}
