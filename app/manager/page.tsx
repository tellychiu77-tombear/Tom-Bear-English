'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { getEffectivePermissions } from '@/lib/permissions';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    LineChart, Line, Legend
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

    // 篩選條件
    const [selectedDept, setSelectedDept] = useState<string | null>(null);
    const [period, setPeriod] = useState('month');

    // 資料
    const [teachers, setTeachers] = useState<any[]>([]);
    const [kpi, setKpi] = useState({ teacherCount: 0, studentCount: 0, avgScore: 0, absenceRate: 0, passRate: 0, atRiskCount: 0 });
    const [classChartData, setClassChartData] = useState<any[]>([]);
    const [trendData, setTrendData] = useState<any[]>([]);
    const [atRiskStudents, setAtRiskStudents] = useState<any[]>([]);

    // UI
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

        // 非總覽角色預設看自己部門
        if (!director && profile.department) setSelectedDept(profile.department);
    };

    // ── 全部數據載入 ─────────────────────────────────────────────────────────
    const fetchAll = async () => {
        setLoading(true);
        const { from, to } = getDateRange(period);

        // 1. 教師清單
        let tq = supabase.from('users').select('*').eq('role', 'teacher');
        if (selectedDept) tq = tq.eq('department', selectedDept);
        const { data: teacherList } = await tq;
        if (!teacherList || teacherList.length === 0) {
            setTeachers([]); setKpi({ teacherCount: 0, studentCount: 0, avgScore: 0, absenceRate: 0, passRate: 0, atRiskCount: 0 });
            setClassChartData([]); setAtRiskStudents([]); setLoading(false); return;
        }

        // 2. 學生
        const { data: allStudents } = await supabase.from('students').select('*');

        // 3. 考試（含時間篩選）
        let eq = supabase.from('exam_results').select('*');
        if (from) eq = eq.gte('exam_date', from);
        if (to) eq = eq.lte('exam_date', to);
        const { data: allExams } = await eq;

        // 4. 請假（含時間篩選）
        let lq = supabase.from('leave_requests').select('*').eq('status', 'approved');
        if (from) lq = lq.gte('leave_date', from);
        if (to) lq = lq.lte('leave_date', to);
        const { data: allLeaves } = await lq;

        // ── 處理教師資料 ───────────────────────────────────────────────────
        let totalStudents = 0, totalScoreSum = 0, totalScoreCount = 0, totalLeaves = 0, totalPassed = 0;
        const classMap: Record<string, any> = {};
        const allAtRisk: any[] = [];

        const processed = teacherList.map(t => {
            let classes: string[] = [];
            try { const raw = t.responsible_classes; classes = Array.isArray(raw) ? raw : JSON.parse(raw || '[]'); } catch { classes = []; }

            const myStudents = allStudents?.filter(s => s.grade && classes.some((c: string) => s.grade.includes(c))) || [];
            const sIds = myStudents.map(s => s.id);
            const myExams = allExams?.filter(e => sIds.includes(e.student_id)) || [];
            const myLeaves = allLeaves?.filter(l => sIds.includes(l.student_id)) || [];

            const avg = myExams.length > 0 ? Math.round(myExams.reduce((a, b) => a + b.score, 0) / myExams.length) : 0;
            const passed = myExams.filter(e => e.score >= 60).length;

            totalStudents += myStudents.length;
            if (myExams.length > 0) { totalScoreSum += myExams.reduce((a, b) => a + b.score, 0); totalScoreCount += myExams.length; }
            totalLeaves += myLeaves.length;
            totalPassed += passed;

            // Class chart data
            classes.forEach((cls: string) => {
                const studentsInCls = myStudents.filter(s => s.grade?.includes(cls));
                const clsExams = allExams?.filter(e => studentsInCls.map(s => s.id).includes(e.student_id)) || [];
                const clsAvg = clsExams.length > 0 ? Math.round(clsExams.reduce((a, b) => a + b.score, 0) / clsExams.length) : 0;
                if (!classMap[cls]) classMap[cls] = { class: cls, avg: clsAvg, count: studentsInCls.length };
            });

            // At-risk students
            myStudents.forEach(s => {
                const sExams = myExams.filter(e => e.student_id === s.id);
                const sLeaves = myLeaves.filter(l => l.student_id === s.id);
                const sAvg = sExams.length > 0 ? Math.round(sExams.reduce((a, b) => a + b.score, 0) / sExams.length) : null;
                if ((sAvg !== null && sAvg < 60) || sLeaves.length > 3) {
                    allAtRisk.push({ ...s, avgScore: sAvg, absence: sLeaves.length, teacherName: t.name });
                }
            });

            return { ...t, responsible_classes: classes, studentCount: myStudents.length, avgScore: avg, leaveCount: myLeaves.length, students: myStudents };
        });

        const overallAvg = totalScoreCount > 0 ? Math.round(totalScoreSum / totalScoreCount) : 0;
        const passRate = totalScoreCount > 0 ? Math.round((totalPassed / totalScoreCount) * 100) : 0;
        const absenceRate = totalStudents > 0 ? Math.round((totalLeaves / totalStudents) * 100) : 0;

        setTeachers(processed.sort((a, b) => b.avgScore - a.avgScore));
        setKpi({ teacherCount: teacherList.length, studentCount: totalStudents, avgScore: overallAvg, absenceRate, passRate, atRiskCount: allAtRisk.length });
        setClassChartData(Object.values(classMap).sort((a, b) => b.avg - a.avg).slice(0, 12));
        setAtRiskStudents(allAtRisk.slice(0, 8));

        // ── 趨勢圖：過去 6 個月各月平均分 ────────────────────────────────
        const monthlyMap: Record<string, { sum: number; count: number }> = {};
        const allStudentIds = allStudents?.map(s => s.id) || [];
        const { data: trendExams } = await supabase.from('exam_results').select('score, exam_date').in('student_id', allStudentIds).gte('exam_date', new Date(Date.now() - 180 * 86400000).toISOString().split('T')[0]);

        trendExams?.forEach(e => {
            const month = e.exam_date?.slice(0, 7);
            if (!month) return;
            if (!monthlyMap[month]) monthlyMap[month] = { sum: 0, count: 0 };
            monthlyMap[month].sum += e.score;
            monthlyMap[month].count += 1;
        });

        const trend = Object.entries(monthlyMap).sort(([a], [b]) => a.localeCompare(b)).map(([month, d]) => ({
            month: month.slice(5) + '月',
            avg: Math.round(d.sum / d.count)
        }));
        setTrendData(trend);

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

    return (
        <div className="min-h-screen bg-gray-50">
            {/* ── 頂部 Header ── */}
            <div className="bg-white border-b shadow-sm sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-black text-gray-800">📊 部門戰情室</h1>
                        <p className="text-sm text-gray-500 mt-0.5">
                            {currentUser?.name} · {deptLabel}
                        </p>
                    </div>
                    <button onClick={() => router.push('/')} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl text-sm transition">
                        ← 回首頁
                    </button>
                </div>

                {/* ── 篩選列 ── */}
                <div className="max-w-7xl mx-auto px-6 pb-3 flex flex-wrap gap-3 items-center">
                    {/* 部門切換（總園長才看得到） */}
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

                    {/* 時間篩選 */}
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
            </div>

            <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

                {/* ── KPI 卡片 ── */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <KPICard title="部門教師" value={kpi.teacherCount} unit="位" icon="🧑‍🏫" color="bg-blue-500" />
                    <KPICard title="負責學生" value={kpi.studentCount} unit="人" icon="👶" color="bg-indigo-500" />
                    <KPICard title="平均成績" value={kpi.avgScore} unit="分" icon="📈" color={kpi.avgScore >= 80 ? 'bg-emerald-500' : kpi.avgScore < 60 ? 'bg-red-500' : 'bg-amber-500'}
                        sub={kpi.avgScore >= 80 ? '優異 ✨' : kpi.avgScore < 60 ? '需關注 ⚠️' : '正常'} />
                    <KPICard title="及格率" value={kpi.passRate} unit="%" icon="✅" color={kpi.passRate >= 80 ? 'bg-emerald-500' : 'bg-orange-500'} />
                    <KPICard title="缺勤率" value={kpi.absenceRate} unit="%" icon="📅" color={kpi.absenceRate > 15 ? 'bg-red-500' : 'bg-gray-500'} />
                    <KPICard title="需關注學生" value={kpi.atRiskCount} unit="人" icon="🚨" color={kpi.atRiskCount > 0 ? 'bg-red-500' : 'bg-emerald-500'}
                        sub={kpi.atRiskCount === 0 ? '全部正常 🎉' : undefined} />
                </div>

                {/* ── 圖表區 ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* 班級平均成績長條圖 */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <h2 className="text-base font-bold text-gray-800 mb-4">📊 各班平均成績</h2>
                        {classChartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={240}>
                                <BarChart data={classChartData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="class" tick={{ fontSize: 11 }} />
                                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                                    <Tooltip
                                        formatter={(val: any) => [`${val} 分`, '平均']}
                                        contentStyle={{ borderRadius: 8, fontSize: 12 }}
                                    />
                                    <Bar dataKey="avg" name="平均分" radius={[4, 4, 0, 0]}
                                        fill="#6366f1"
                                        label={{ position: 'top', fontSize: 10, fill: '#6b7280' }}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-[240px] flex items-center justify-center text-gray-400 text-sm">
                                {period !== 'all' ? `${PERIOD_OPTIONS.find(p => p.value === period)?.label}內尚無考試數據` : '尚無班級考試數據'}
                            </div>
                        )}
                    </div>

                    {/* 成績趨勢折線圖 */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <h2 className="text-base font-bold text-gray-800 mb-4">📈 近 6 個月成績趨勢</h2>
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
                        ) : (
                            <div className="h-[240px] flex items-center justify-center text-gray-400 text-sm">數據不足以顯示趨勢（需至少 2 個月）</div>
                        )}
                    </div>
                </div>

                {/* ── 需關注學生（At-Risk 全局預覽） ── */}
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

                {/* ── 教師績效表格 ── */}
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
                                    <th className="p-4 text-center">缺勤人次</th>
                                    <th className="p-4 text-center">成績分佈</th>
                                    <th className="p-4 text-right">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {teachers.map((t) => (
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
                                        <td className="p-4 text-center text-gray-600">{t.leaveCount}</td>
                                        <td className="p-4">
                                            {/* 成績分佈小長條圖 */}
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
                                ))}
                                {teachers.length === 0 && (
                                    <tr><td colSpan={7} className="p-10 text-center text-gray-400">此部門目前無教師資料</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* ── 教師詳情 Modal ── */}
            {selectedTeacher && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl flex flex-col">
                        {/* Modal Header */}
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

                        {/* Modal Body */}
                        <div className="p-6 space-y-6 bg-gray-50 flex-1">
                            {detailLoading ? (
                                <div className="text-center py-16 text-gray-400">載入中...</div>
                            ) : (
                                <>
                                    {/* 班級健康度 */}
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
                                        {/* 近期考試 */}
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

                                        {/* At-Risk 學生 */}
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

// ── KPI 卡片元件 ──────────────────────────────────────────────────────────────
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
