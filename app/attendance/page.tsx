'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { getEffectivePermissions } from '@/lib/permissions';

// 出缺席狀態設定
const STATUS_CONFIG = {
    present: { label: '出席', icon: '✅', color: 'bg-green-500', textColor: 'text-green-700', bgLight: 'bg-green-50 border-green-200' },
    late:    { label: '遲到', icon: '⏰', color: 'bg-amber-400', textColor: 'text-amber-700', bgLight: 'bg-amber-50 border-amber-200' },
    absent:  { label: '缺席', icon: '❌', color: 'bg-red-500',   textColor: 'text-red-700',   bgLight: 'bg-red-50 border-red-200' },
    excused: { label: '已請假', icon: '📋', color: 'bg-yellow-400', textColor: 'text-yellow-700', bgLight: 'bg-yellow-50 border-yellow-200' },
};

type AttendanceStatus = keyof typeof STATUS_CONFIG;

interface StudentAttendance {
    id: string;
    chinese_name: string;
    english_name: string;
    status: AttendanceStatus;
    isExcused: boolean;
    recordId?: string;
    saving?: boolean;
}

export default function AttendancePage() {
    const router = useRouter();

    // 使用者狀態
    const [userId, setUserId] = useState('');
    const [userRole, setUserRole] = useState('');
    const [teacherClasses, setTeacherClasses] = useState<string[]>([]);
    const [allClasses, setAllClasses] = useState<string[]>([]);
    const [canViewAll, setCanViewAll] = useState(false);

    // 點名設定
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [selectedClass, setSelectedClass] = useState('');

    // 學生與記錄
    const [students, setStudents] = useState<StudentAttendance[]>([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [pageLoading, setPageLoading] = useState(true);

    // 統計
    const presentCount = students.filter(s => s.status === 'present').length;
    const lateCount    = students.filter(s => s.status === 'late').length;
    const absentCount  = students.filter(s => s.status === 'absent').length;
    const excusedCount = students.filter(s => s.status === 'excused').length;

    useEffect(() => {
        initPage();
    }, []);

    async function initPage() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        const { data: userData } = await supabase
            .from('users')
            .select('id, role, extra_permissions')
            .eq('id', session.user.id)
            .single();

        if (!userData) { router.push('/'); return; }

        setUserId(userData.id);
        setUserRole(userData.role);

        if (userData.role === 'teacher') {
            // 老師：只能看自己負責的班級
            const { data: assignments } = await supabase
                .from('teacher_assignments')
                .select('class_group')
                .eq('teacher_id', userData.id);
            const classes = [...new Set((assignments || []).map((a: any) => a.class_group as string))].sort();
            setTeacherClasses(classes);
            setSelectedClass(classes[0] || '');
            setCanViewAll(false);
        } else {
            // director / manager / admin：可看全部班級
            const { data: roleConfigRow } = await supabase
                .from('role_configs')
                .select('permissions')
                .eq('role', userData.role)
                .single();
            const perms = getEffectivePermissions(
                userData.role,
                roleConfigRow?.permissions ?? null,
                userData.extra_permissions ?? null
            );
            const isPrivileged = perms.viewAllStudents || ['director', 'english_director', 'care_director', 'admin', 'manager'].includes(userData.role);
            if (!isPrivileged) { router.push('/'); return; }

            // 查所有班級
            const { data: classRows } = await supabase
                .from('students')
                .select('grade')
                .not('grade', 'is', null);
            const classes = [...new Set((classRows || []).flatMap((r: any) =>
                (r.grade as string).split(',').map((g: string) => g.trim()).filter(Boolean)
            ))].sort();
            setAllClasses(classes);
            setSelectedClass(classes[0] || '');
            setCanViewAll(true);
        }

        setPageLoading(false);
    }

    async function loadStudents() {
        if (!selectedClass) return;
        setLoading(true);
        setLoaded(false);

        // 1. 查該班學生
        const { data: studentRows, error: sErr } = await supabase
            .from('students')
            .select('id, chinese_name, english_name, grade')
            .ilike('grade', `%${selectedClass}%`)
            .order('chinese_name');

        if (sErr) { console.error(sErr); setLoading(false); return; }
        const rawStudents = studentRows || [];
        const studentIds = rawStudents.map(s => s.id);

        // 2. 查今天是否已有出缺席記錄
        const { data: existingRecords } = await supabase
            .from('attendance_records')
            .select('id, student_id, status')
            .in('student_id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000'])
            .eq('date', selectedDate)
            .eq('class_group', selectedClass);

        const recordMap: Record<string, { id: string; status: string }> = {};
        (existingRecords || []).forEach((r: any) => {
            recordMap[r.student_id] = { id: r.id, status: r.status };
        });

        // 3. 查今天已核准的請假
        const { data: leaveRows } = await supabase
            .from('leave_requests')
            .select('student_id')
            .in('student_id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000'])
            .eq('status', 'approved')
            .lte('start_date', selectedDate)
            .gte('end_date', selectedDate);

        const excusedSet = new Set((leaveRows || []).map((r: any) => r.student_id as string));

        // 4. 組合結果
        const combined: StudentAttendance[] = rawStudents.map(s => {
            const existing = recordMap[s.id];
            const isExcused = excusedSet.has(s.id);
            let status: AttendanceStatus = 'present';

            if (existing) {
                status = existing.status as AttendanceStatus;
            } else if (isExcused) {
                status = 'excused';
            }

            return {
                id: s.id,
                chinese_name: s.chinese_name,
                english_name: s.english_name,
                status,
                isExcused,
                recordId: existing?.id,
            };
        });

        setStudents(combined);
        setLoading(false);
        setLoaded(true);
    }

    async function updateStatus(studentId: string, newStatus: AttendanceStatus) {
        // 請假學生不能手動改（唯讀顯示）
        const student = students.find(s => s.id === studentId);
        if (student?.isExcused && newStatus !== 'excused') {
            // 允許老師覆寫請假記錄（例如學生實際到場了）
        }

        // 樂觀更新 UI
        setStudents(prev => prev.map(s =>
            s.id === studentId ? { ...s, status: newStatus, saving: true } : s
        ));

        const { data, error } = await supabase
            .from('attendance_records')
            .upsert({
                student_id: studentId,
                class_group: selectedClass,
                date: selectedDate,
                status: newStatus,
                teacher_id: userId || null,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'student_id,date,class_group' })
            .select('id')
            .single();

        if (error) {
            console.error('upsert error:', error);
            // 回退
            setStudents(prev => prev.map(s =>
                s.id === studentId ? { ...s, saving: false } : s
            ));
            return;
        }

        setStudents(prev => prev.map(s =>
            s.id === studentId ? { ...s, saving: false, recordId: data?.id || s.recordId } : s
        ));
    }

    const availableClasses = canViewAll ? allClasses : teacherClasses;

    if (pageLoading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-400 font-bold">載入中...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
                <div className="max-w-4xl mx-auto px-4 py-3 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <button onClick={() => router.push('/')}
                            className="text-gray-400 hover:text-gray-600 font-bold text-sm">
                            ← 首頁
                        </button>
                        <h1 className="text-xl font-black text-gray-800">📋 出缺席點名</h1>
                    </div>
                    {loaded && (
                        <div className="flex gap-3 text-xs font-bold">
                            <span className="text-green-600">出席 {presentCount}</span>
                            <span className="text-amber-600">遲到 {lateCount}</span>
                            <span className="text-red-600">缺席 {absentCount}</span>
                            <span className="text-yellow-600">請假 {excusedCount}</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="max-w-4xl mx-auto p-4 space-y-4">

                {/* 選擇面板 */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <h2 className="text-sm font-black text-gray-500 uppercase mb-4">點名設定</h2>
                    <div className="flex flex-col sm:flex-row gap-3">
                        {/* 日期 */}
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-400 mb-1 ml-1">日期</label>
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={e => { setSelectedDate(e.target.value); setLoaded(false); setStudents([]); }}
                                className="w-full p-3 border border-gray-200 rounded-xl font-bold text-sm text-gray-700 outline-none focus:ring-2 focus:ring-[#E8695A]/30 focus:border-[#E8695A] bg-gray-50"
                            />
                        </div>

                        {/* 班級 */}
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-400 mb-1 ml-1">班級</label>
                            <select
                                value={selectedClass}
                                onChange={e => { setSelectedClass(e.target.value); setLoaded(false); setStudents([]); }}
                                className="w-full p-3 border border-gray-200 rounded-xl font-bold text-sm text-gray-700 outline-none focus:ring-2 focus:ring-[#E8695A]/30 focus:border-[#E8695A] bg-gray-50"
                            >
                                <option value="">-- 選擇班級 --</option>
                                {availableClasses.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>

                        {/* 載入按鈕 */}
                        <div className="flex items-end">
                            <button
                                onClick={loadStudents}
                                disabled={!selectedClass || loading}
                                className="w-full sm:w-auto px-6 py-3 bg-[#E8695A] hover:bg-[#d45f51] text-white font-black rounded-xl shadow-sm shadow-[#E8695A]/30 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                            >
                                {loading ? '載入中...' : '載入學生'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* 統計卡片 */}
                {loaded && students.length > 0 && (
                    <div className="grid grid-cols-4 gap-3">
                        {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG[AttendanceStatus]][]).map(([key, cfg]) => {
                            const count = students.filter(s => s.status === key).length;
                            return (
                                <div key={key} className={`bg-white rounded-xl border p-3 text-center shadow-sm ${cfg.bgLight}`}>
                                    <div className="text-2xl mb-0.5">{cfg.icon}</div>
                                    <div className={`text-xl font-black ${cfg.textColor}`}>{count}</div>
                                    <div className="text-xs text-gray-500 font-bold">{cfg.label}</div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* 學生清單 */}
                {loaded && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="px-5 py-3 bg-gray-50 border-b flex items-center justify-between">
                            <h2 className="font-black text-gray-700 text-sm">
                                {selectedClass} · {selectedDate} · 共 {students.length} 位
                            </h2>
                            <button
                                onClick={async () => {
                                    // 全部標為出席（批量 upsert）
                                    const updates = students
                                        .filter(s => !s.isExcused)
                                        .map(s => ({
                                            student_id: s.id,
                                            class_group: selectedClass,
                                            date: selectedDate,
                                            status: 'present' as AttendanceStatus,
                                            teacher_id: userId || null,
                                            updated_at: new Date().toISOString(),
                                        }));
                                    if (updates.length === 0) return;
                                    await supabase.from('attendance_records').upsert(updates, { onConflict: 'student_id,date,class_group' });
                                    setStudents(prev => prev.map(s => s.isExcused ? s : { ...s, status: 'present' }));
                                }}
                                className="text-xs text-green-600 font-black hover:bg-green-50 px-3 py-1.5 rounded-lg transition border border-green-200"
                            >
                                ✅ 全員出席
                            </button>
                        </div>

                        {students.length === 0 ? (
                            <div className="p-12 text-center text-gray-300 font-bold">
                                <div className="text-4xl mb-2">🎒</div>
                                <p>此班級尚無學生資料</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-50">
                                {students.map((student, index) => {
                                    const cfg = STATUS_CONFIG[student.status];
                                    return (
                                        <div
                                            key={student.id}
                                            className={`flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/60 transition ${student.saving ? 'opacity-60' : ''}`}
                                        >
                                            {/* 序號 + 頭像 */}
                                            <div className="flex items-center gap-3 flex-shrink-0">
                                                <span className="text-xs text-gray-300 font-bold w-5 text-right">{index + 1}</span>
                                                <div className="w-9 h-9 rounded-full bg-[#E8695A]/10 text-[#E8695A] flex items-center justify-center font-black text-base">
                                                    {student.chinese_name?.[0]}
                                                </div>
                                            </div>

                                            {/* 姓名 */}
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold text-gray-800 text-sm flex items-center gap-2">
                                                    {student.chinese_name}
                                                    {student.isExcused && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 font-black border border-yellow-200">
                                                            已請假
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-400">{student.english_name || '—'}</div>
                                            </div>

                                            {/* 目前狀態標籤 */}
                                            <div className={`hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${cfg.bgLight} ${cfg.textColor}`}>
                                                {cfg.icon} {cfg.label}
                                            </div>

                                            {/* 操作按鈕 */}
                                            <div className="flex gap-1.5 flex-shrink-0">
                                                {(['present', 'late', 'absent'] as AttendanceStatus[]).map(statusKey => {
                                                    const btnCfg = STATUS_CONFIG[statusKey];
                                                    const isActive = student.status === statusKey;
                                                    return (
                                                        <button
                                                            key={statusKey}
                                                            onClick={() => updateStatus(student.id, statusKey)}
                                                            disabled={student.saving}
                                                            title={btnCfg.label}
                                                            className={`w-9 h-9 rounded-xl text-base font-bold transition border-2 ${
                                                                isActive
                                                                    ? `${btnCfg.color} text-white border-transparent shadow-sm`
                                                                    : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600'
                                                            } disabled:cursor-not-allowed`}
                                                        >
                                                            {btnCfg.icon}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* 空狀態 */}
                {!loaded && !loading && (
                    <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center">
                        <div className="text-5xl mb-3">📋</div>
                        <p className="font-bold text-gray-400">選擇班級與日期後，點擊「載入學生」開始點名</p>
                        <p className="text-xs text-gray-300 mt-1">已請假的學生將自動標記為「已請假」</p>
                    </div>
                )}
            </div>
        </div>
    );
}
