'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

// ── Types ──────────────────────────────────────────────────────────────────
type TeacherType = 'foreign' | 'external' | 'staff';
type SlotType = '聽說' | '文法' | '閱讀' | '英文綜合' | '課後輔導';
type AssignRole = 'lead' | 'assistant';
type DayOfWeek = 1 | 2 | 3 | 4 | 5;

interface Teacher {
    id: string;
    name: string;
    email: string;
    teacher_type: TeacherType | null;
    available_days: number[];
}

interface Assignment {
    id: string;
    teacher_id: string;
    class_group: string;
    slot_type: SlotType;
    role: AssignRole;
}

interface ScheduleSlot {
    id: string;
    semester: string;
    class_group: string;
    slot_type: SlotType;
    lead_teacher_id: string | null;
    assistant_teacher_id: string | null;
    day_of_week: DayOfWeek;
    start_time: string;
    end_time: string | null;
    note: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────
const SLOT_TYPES: SlotType[] = ['聽說', '文法', '閱讀', '英文綜合', '課後輔導'];
const DAYS = ['週一', '週二', '週三', '週四', '週五'];
const DAY_NUMS: DayOfWeek[] = [1, 2, 3, 4, 5];
const DAY_SHORT = ['一', '二', '三', '四', '五'];

const TIME_OPTIONS = ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00'];

const TEACHER_TYPE_LABEL: Record<TeacherType, string> = {
    foreign: '🌍 外師',
    external: '📝 外聘老師',
    staff: '👩‍🏫 英文老師（正職）',
};

const SLOT_TYPE_COLOR: Record<SlotType, string> = {
    '聽說':   'bg-blue-100 border-blue-200 text-blue-700',
    '文法':   'bg-purple-100 border-purple-200 text-purple-700',
    '閱讀':   'bg-rose-100 border-rose-200 text-rose-700',
    '英文綜合': 'bg-green-100 border-green-200 text-green-700',
    '課後輔導': 'bg-teal-100 border-teal-200 text-teal-700',
};

const SLOT_TYPE_ICON: Record<SlotType, string> = {
    '聽說': '🎧', '文法': '📖', '閱讀': '📚', '英文綜合': '🌟', '課後輔導': '📒',
};

// ── Helpers ────────────────────────────────────────────────────────────────
const PRESET_CLASSES = [
    ...Array.from({ length: 26 }, (_, i) => `CEI-${String.fromCharCode(65 + i)}`),
    '安親班',
];

function buildClassGroups(slots: ScheduleSlot[], assignments: Assignment[]) {
    const set = new Set<string>(PRESET_CLASSES);
    slots.forEach(s => set.add(s.class_group));
    assignments.forEach(a => set.add(a.class_group));
    return Array.from(set).sort();
}

// ══════════════════════════════════════════════════════════════════════════
export default function SchedulePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);

    // Data
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [slots, setSlots] = useState<ScheduleSlot[]>([]);
    const [semester, setSemester] = useState('2025下');

    // UI state
    const [tab, setTab] = useState<'teachers' | 'assign' | 'add' | 'grid'>('teachers');
    const [assignView, setAssignView] = useState<'teacher' | 'class'>('class');

    // Teacher modal (edit existing)
    const [teacherModal, setTeacherModal] = useState<Partial<Teacher> | null>(null);
    const [saving, setSaving] = useState(false);

    // Add teacher modal (create without account)
    const [addTeacherModal, setAddTeacherModal] = useState(false);
    const [newTeacher, setNewTeacher] = useState<{ name: string; teacher_type: string; available_days: number[] }>({ name: '', teacher_type: 'staff', available_days: [] });

    // Assignment modal
    const [assignModal, setAssignModal] = useState<{ teacher: Teacher } | null>(null);
    const [pendingAssigns, setPendingAssigns] = useState<Assignment[]>([]);

    // Add slot modal
    const [addSlot, setAddSlot] = useState<Partial<ScheduleSlot> & { _open?: boolean }>({ _open: false });

    useEffect(() => { init(); }, []);

    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }
        const { data: user } = await supabase.from('users').select('*').eq('id', session.user.id).single();
        if (!user || !['director', 'manager', 'admin', 'english_director', 'care_director'].includes(user.role)) {
            alert('⛔ 您沒有權限進入排課系統');
            router.push('/'); return;
        }
        setCurrentUser(user);
        await fetchAll();
        setLoading(false);
    }

    const fetchAll = useCallback(async () => {
        const [{ data: t }, { data: a }, { data: s }] = await Promise.all([
            supabase.from('users').select('id,name,email,teacher_type,available_days').eq('role', 'teacher').order('name'),
            supabase.from('teacher_assignments').select('*'),
            supabase.from('schedule_slots').select('*').eq('semester', semester).order('day_of_week').order('start_time'),
        ]);
        setTeachers((t || []) as Teacher[]);
        setAssignments((a || []) as Assignment[]);
        setSlots((s || []) as ScheduleSlot[]);
    }, [semester]);

    useEffect(() => { if (!loading) fetchAll(); }, [semester]);

    // ── Teacher CRUD ────────────────────────────────────────────────────
    async function saveTeacher() {
        if (!teacherModal) return;
        setSaving(true);
        const { id, name, teacher_type, available_days } = teacherModal;
        await supabase.from('users').update({ name, teacher_type, available_days: available_days || [] }).eq('id', id!);
        await fetchAll();
        setSaving(false);
        setTeacherModal(null);
    }

    async function createTeacher() {
        if (!newTeacher.name.trim()) { alert('請填寫老師姓名'); return; }
        setSaving(true);
        try {
            const { createClient } = await import('@supabase/supabase-js');
            const isolatedClient = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
                { auth: { persistSession: false, autoRefreshToken: false, storageKey: '__teacher_signup_tmp__' } }
            );
            const placeholderEmail = 'teacher_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + '@tombear.internal';
            const placeholderPassword = Math.random().toString(36).substring(2, 10) + 'Aa1!';
            const { data: signUpData, error: signUpError } = await isolatedClient.auth.signUp({
                email: placeholderEmail,
                password: placeholderPassword,
            });
            if (signUpError || !signUpData.user) {
                alert('新增失敗(auth): ' + (signUpError?.message ?? '無法建立帳號'));
                setSaving(false);
                return;
            }
            const teacherId = signUpData.user.id;
            const { error } = await supabase.from('users').upsert({
                id: teacherId,
                name: newTeacher.name.trim(),
                email: placeholderEmail,
                role: 'teacher',
                is_approved: true,
                teacher_type: newTeacher.teacher_type || null,
                available_days: newTeacher.available_days,
            });
            if (error) { alert('新增失敗：' + error.message); }
            else {
                setAddTeacherModal(false);
                setNewTeacher({ name: '', teacher_type: 'staff', available_days: [] });
                await fetchAll();
            }
        } catch (e) {
            alert('新增失敗：' + e.message);
        }
        setSaving(false);
    }

    // ── Assignment CRUD ─────────────────────────────────────────────────
    async function openAssignModal(teacher: Teacher) {
        const myAssigns = assignments.filter(a => a.teacher_id === teacher.id);
        setPendingAssigns(myAssigns);
        setAssignModal({ teacher });
    }

    async function saveAssignments(teacher: Teacher, next: Assignment[]) {
        setSaving(true);
        // delete all existing for this teacher, then re-insert
        await supabase.from('teacher_assignments').delete().eq('teacher_id', teacher.id);
        if (next.length > 0) {
            const rows = next.map(({ teacher_id, class_group, slot_type, role }) => ({ teacher_id, class_group, slot_type, role }));
            await supabase.from('teacher_assignments').insert(rows);
        }
        await fetchAll();
        setSaving(false);
        setAssignModal(null);
    }

    // ── Schedule Slot CRUD ──────────────────────────────────────────────
    async function saveSlot() {
        if (!addSlot.class_group || !addSlot.slot_type || !addSlot.day_of_week || !addSlot.start_time) {
            alert('請填寫班級、課程類型、星期與開始時間');
            return;
        }
        setSaving(true);
        const row = {
            semester,
            class_group: addSlot.class_group,
            slot_type: addSlot.slot_type,
            lead_teacher_id: addSlot.lead_teacher_id || null,
            assistant_teacher_id: addSlot.assistant_teacher_id || null,
            day_of_week: addSlot.day_of_week,
            start_time: addSlot.start_time,
            end_time: addSlot.end_time || null,
            note: addSlot.note || null,
        };
        if (addSlot.id) {
            await supabase.from('schedule_slots').update(row).eq('id', addSlot.id);
        } else {
            await supabase.from('schedule_slots').insert([row]);
        }
        await fetchAll();
        setSaving(false);
        setAddSlot({ _open: false });
    }

    async function deleteSlot(id: string) {
        if (!confirm('確定要刪除這堂課嗎？')) return;
        await supabase.from('schedule_slots').delete().eq('id', id);
        await fetchAll();
    }

    // ── Derived: who can teach what ─────────────────────────────────────
    function getEligibleTeachers(classGroup: string, slotType: SlotType, role: AssignRole = 'lead') {
        return teachers.filter(t =>
            assignments.some(a =>
                a.teacher_id === t.id &&
                a.class_group === classGroup &&
                a.slot_type === slotType &&
                a.role === role
            )
        );
    }

    // ── Available days filter for slot ──────────────────────────────────
    function getAvailableDays(classGroup: string, slotType: SlotType): DayOfWeek[] {
        // 聽說課 → 只能外師有來的天；其他課 → 所有天
        if (slotType === '聽說') {
            const foreignTeachers = teachers.filter(t =>
                t.teacher_type === 'foreign' &&
                assignments.some(a => a.teacher_id === t.id && a.class_group === classGroup && a.slot_type === '聽說' && a.role === 'lead')
            );
            const days = new Set<DayOfWeek>();
            foreignTeachers.forEach(t => (t.available_days || []).forEach(d => days.add(d as DayOfWeek)));
            return days.size > 0 ? Array.from(days).sort() : DAY_NUMS;
        }
        return DAY_NUMS;
    }

    const teacherName = (id: string | null) => teachers.find(t => t.id === id)?.name || '—';

    if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400 text-lg">載入中...</div>;

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-gray-800">📅 排課系統</h1>
                    <p className="text-sm text-gray-400 mt-0.5">{currentUser?.name} · 學期：
                        <select value={semester} onChange={e => setSemester(e.target.value)}
                            className="ml-1 text-sm font-bold text-indigo-700 border-none bg-transparent cursor-pointer">
                            <option>2025下</option>
                            <option>2026上</option>
                            <option>2026下</option>
                        </select>
                    </p>
                </div>
                <button onClick={() => router.push('/')}
                    className="px-4 py-2 text-sm font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-xl transition">
                    ← 回首頁
                </button>
            </div>

            {/* Tabs */}
            <div className="bg-white border-b border-gray-100 px-6 flex gap-2 overflow-x-auto">
                {([
                    { key: 'teachers', label: '👩‍🏫 老師管理' },
                    { key: 'assign',   label: '📌 負責設定' },
                    { key: 'add',      label: '➕ 新增課程' },
                    { key: 'grid',     label: '📅 週課表' },
                ] as const).map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        className={`px-5 py-3.5 text-sm font-black border-b-2 transition whitespace-nowrap
                            ${tab === t.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="max-w-6xl mx-auto p-6">

                {/* ══ TAB: 老師管理 ══════════════════════════════════════════════ */}
                {tab === 'teachers' && (
                    <div>
                        <div className="mb-4 flex justify-between items-center">
                            <h2 className="text-lg font-black text-gray-700">老師列表（{teachers.length} 位）</h2>
                            <button
                                onClick={() => { setNewTeacher({ name: '', teacher_type: 'staff', available_days: [] }); setAddTeacherModal(true); }}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm rounded-xl shadow transition">
                                ＋ 新增老師
                            </button>
                        </div>

                        {/* 類型說明 */}
                        <div className="grid grid-cols-3 gap-3 mb-6">
                            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                                <div className="text-2xl mb-1">🌍</div>
                                <div className="font-black text-amber-800 text-sm">外師</div>
                                <div className="text-xs text-amber-600 mt-1">外籍母語老師<br />固定天數・聽說課主教</div>
                            </div>
                            <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 text-center">
                                <div className="text-2xl mb-1">📝</div>
                                <div className="font-black text-violet-800 text-sm">外聘老師</div>
                                <div className="text-xs text-violet-600 mt-1">外部聘請・非正職<br />固定天數・文法/閱讀主教</div>
                            </div>
                            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                                <div className="text-2xl mb-1">👩‍🏫</div>
                                <div className="font-black text-emerald-800 text-sm">英文老師（正職）</div>
                                <div className="text-xs text-emerald-600 mt-1">全職員工・週一到五<br />文法/閱讀主教 或 助教</div>
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                            {teachers.map(t => (
                                <TeacherCard key={t.id} teacher={t}
                                    assignments={assignments.filter(a => a.teacher_id === t.id)}
                                    onEdit={() => setTeacherModal({ ...t })}
                                    onAssign={() => openAssignModal(t)} />
                            ))}
                            {teachers.length === 0 && (
                                <div className="col-span-2 bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-400">
                                    尚無老師資料，請先在用戶管理中建立 role=teacher 的帳號
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ══ TAB: 負責設定矩陣 ══════════════════════════════════════════ */}
                {tab === 'assign' && (
                    <div>
                        {/* View toggle */}
                        <div className="flex items-center gap-2 mb-5">
                            <span className="text-xs font-black text-gray-400 mr-2">視角切換</span>
                            <button
                                onClick={() => setAssignView('class')}
                                className={`px-4 py-2 rounded-xl text-sm font-black transition ${assignView === 'class' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600'}`}>
                                🏫 班級視角
                            </button>
                            <button
                                onClick={() => setAssignView('teacher')}
                                className={`px-4 py-2 rounded-xl text-sm font-black transition ${assignView === 'teacher' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600'}`}>
                                👩‍🏫 老師視角
                            </button>
                            <span className="text-xs text-gray-400 ml-2">點老師名字可修改負責設定</span>
                        </div>
                        {assignView === 'class'
                            ? <ClassMatrix teachers={teachers} assignments={assignments} onEditTeacher={t => openAssignModal(t)} />
                            : <AssignMatrix teachers={teachers} assignments={assignments} onEditTeacher={t => openAssignModal(t)} />
                        }
                    </div>
                )}

                {/* ══ TAB: 新增課程 ══════════════════════════════════════════════ */}
                {tab === 'add' && (
                    <AddSlotPanel
                        teachers={teachers}
                        assignments={assignments}
                        slots={slots}
                        onAdd={() => setAddSlot({ _open: true })}
                        onEdit={s => setAddSlot({ ...s, _open: true })}
                        onDelete={deleteSlot}
                        getEligibleTeachers={getEligibleTeachers}
                        teacherName={teacherName}
                    />
                )}

                {/* ══ TAB: 週課表 ════════════════════════════════════════════════ */}
                {tab === 'grid' && (
                    <WeekGrid slots={slots} teacherName={teacherName} onAdd={() => setAddSlot({ _open: true })} />
                )}
            </div>

            {/* ── Teacher Edit Modal ──────────────────────────────────────────── */}
            {teacherModal && (
                <Modal onClose={() => setTeacherModal(null)}>
                    <h3 className="text-xl font-black mb-5">編輯老師資料</h3>
                    <div className="space-y-5">
                        <div>
                            <label className="text-xs font-black text-gray-400 block mb-2">姓名</label>
                            <input
                                value={teacherModal.name || ''}
                                onChange={e => setTeacherModal(p => ({ ...p!, name: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-300"
                                placeholder="老師姓名"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-black text-gray-400 block mb-2">老師類型</label>
                            <div className="grid grid-cols-3 gap-2">
                                {(['foreign', 'external', 'staff'] as TeacherType[]).map(type => (
                                    <button key={type}
                                        onClick={() => setTeacherModal(p => ({ ...p!, teacher_type: type }))}
                                        className={`p-3 rounded-xl text-xs font-black border-2 transition
                                            ${teacherModal.teacher_type === type
                                                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                                : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                                        {TEACHER_TYPE_LABEL[type]}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {teacherModal.teacher_type !== 'staff' && (
                            <div>
                                <label className="text-xs font-black text-gray-400 block mb-2">可來天數（可複選）</label>
                                <div className="flex gap-2">
                                    {DAY_NUMS.map((d, i) => {
                                        const active = (teacherModal.available_days || []).includes(d);
                                        return (
                                            <button key={d}
                                                onClick={() => {
                                                    const cur = teacherModal.available_days || [];
                                                    setTeacherModal(p => ({
                                                        ...p!,
                                                        available_days: active ? cur.filter(x => x !== d) : [...cur, d].sort()
                                                    }));
                                                }}
                                                className={`w-10 h-10 rounded-xl text-sm font-black transition
                                                    ${active
                                                        ? (teacherModal.teacher_type === 'foreign' ? 'bg-amber-500 text-white' : 'bg-violet-500 text-white')
                                                        : 'bg-gray-100 text-gray-300 hover:bg-gray-200'}`}>
                                                {DAY_SHORT[i]}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3 mt-6">
                            <button onClick={saveTeacher} disabled={saving}
                                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl transition disabled:opacity-50">
                                {saving ? '儲存中...' : '✅ 儲存'}
                            </button>
                            <button onClick={() => setTeacherModal(null)}
                                className="px-5 py-3 bg-gray-100 text-gray-500 font-bold rounded-xl hover:bg-gray-200 transition">
                                取消
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* ── Add Teacher Modal (無帳號新增) ────────────────────────────── */}
            {addTeacherModal && (
                <Modal onClose={() => setAddTeacherModal(false)}>
                    <h3 className="text-xl font-black mb-1">新增老師</h3>
                    <p className="text-xs text-gray-400 mb-5">無需帳號，直接輸入姓名即可加入排課系統</p>
                    <div className="space-y-5">
                        <div>
                            <label className="text-xs font-black text-gray-400 block mb-2">姓名 <span className="text-red-400">*</span></label>
                            <input
                                value={newTeacher.name}
                                onChange={e => setNewTeacher(p => ({ ...p, name: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-300"
                                placeholder="輸入老師姓名"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="text-xs font-black text-gray-400 block mb-2">老師類型</label>
                            <div className="grid grid-cols-3 gap-2">
                                {(['foreign', 'external', 'staff'] as TeacherType[]).map(type => (
                                    <button key={type}
                                        onClick={() => setNewTeacher(p => ({ ...p, teacher_type: type, available_days: type === 'staff' ? [] : p.available_days }))}
                                        className={`p-3 rounded-xl text-xs font-black border-2 transition
                                            ${newTeacher.teacher_type === type
                                                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                                : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                                        {TEACHER_TYPE_LABEL[type]}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {newTeacher.teacher_type !== 'staff' && (
                            <div>
                                <label className="text-xs font-black text-gray-400 block mb-2">可來天數（可複選）</label>
                                <div className="flex gap-2">
                                    {DAY_NUMS.map((d, i) => {
                                        const active = newTeacher.available_days.includes(d);
                                        return (
                                            <button key={d}
                                                onClick={() => setNewTeacher(p => ({
                                                    ...p,
                                                    available_days: active ? p.available_days.filter(x => x !== d) : [...p.available_days, d].sort()
                                                }))}
                                                className={`w-10 h-10 rounded-xl text-sm font-black transition
                                                    ${active
                                                        ? (newTeacher.teacher_type === 'foreign' ? 'bg-amber-500 text-white' : 'bg-violet-500 text-white')
                                                        : 'bg-gray-100 text-gray-300 hover:bg-gray-200'}`}>
                                                {DAY_SHORT[i]}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        <div className="flex gap-3 mt-6">
                            <button onClick={createTeacher} disabled={saving}
                                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl transition disabled:opacity-50">
                                {saving ? '新增中...' : '✅ 新增老師'}
                            </button>
                            <button onClick={() => setAddTeacherModal(false)}
                                className="px-5 py-3 bg-gray-100 text-gray-500 font-bold rounded-xl hover:bg-gray-200 transition">
                                取消
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* ── Assignment Modal ──────────────────────────────────────────────── */}
            {assignModal && (
                <AssignmentModal
                    teacher={assignModal.teacher}
                    allAssignments={assignments}
                    pendingAssigns={pendingAssigns}
                    setPendingAssigns={setPendingAssigns}
                    saving={saving}
                    onSave={() => saveAssignments(assignModal.teacher, pendingAssigns)}
                    onClose={() => setAssignModal(null)}
                />
            )}

            {/* ── Add/Edit Slot Modal ───────────────────────────────────────────── */}
            {addSlot._open && (
                <SlotModal
                    slot={addSlot}
                    setSlot={setAddSlot}
                    teachers={teachers}
                    assignments={assignments}
                    getEligibleTeachers={getEligibleTeachers}
                    getAvailableDays={getAvailableDays}
                    saving={saving}
                    onSave={saveSlot}
                    onClose={() => setAddSlot({ _open: false })}
                />
            )}
        </div>
    );
}

// ══ Sub-Components ══════════════════════════════════════════════════════════

function TeacherCard({ teacher, assignments, onEdit, onAssign }: {
    teacher: Teacher;
    assignments: Assignment[];
    onEdit: () => void;
    onAssign: () => void;
}) {
    const type = teacher.teacher_type;
    const typeColor = type === 'foreign' ? 'badge-amber' : type === 'external' ? 'badge-violet' : 'badge-emerald';
    const bgColor = type === 'foreign' ? 'bg-amber-500' : type === 'external' ? 'bg-violet-500' : 'bg-emerald-500';
    const lightBg = type === 'foreign' ? 'bg-amber-50' : type === 'external' ? 'bg-violet-50' : 'bg-emerald-50';
    const dayColor = type === 'foreign' ? 'bg-amber-500' : type === 'external' ? 'bg-violet-500' : 'bg-emerald-500';

    const uniqueClasses = Array.from(new Set(assignments.map(a => a.class_group)));
    const uniqueTypes = Array.from(new Set(assignments.map(a => a.slot_type)));

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-4">
                <div className={`w-14 h-14 rounded-2xl ${lightBg} flex items-center justify-center text-2xl`}>
                    {type === 'foreign' ? '🌍' : type === 'external' ? '📝' : '👩‍🏫'}
                </div>
                <div className="flex-1">
                    <div className="font-black text-gray-800">{teacher.name}</div>
                    {type ? (
                        <span className={`inline-block text-[11px] font-black px-2 py-0.5 rounded-full mt-0.5
                            ${type === 'foreign' ? 'bg-amber-100 text-amber-700' : type === 'external' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {TEACHER_TYPE_LABEL[type]}
                        </span>
                    ) : (
                        <span className="text-xs text-gray-300">尚未設定類型</span>
                    )}
                </div>
                <div className="flex gap-2">
                    <button onClick={onEdit} className="text-xs font-bold px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition">設定</button>
                    <button onClick={onAssign} className="text-xs font-bold px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-600 hover:bg-indigo-100 transition">負責班級</button>
                </div>
            </div>

            {/* Available days */}
            {type !== 'staff' && (
                <div className="mb-3">
                    <div className="text-[11px] font-black text-gray-400 mb-1.5">可來天數</div>
                    <div className="flex gap-1.5">
                        {DAY_NUMS.map((d, i) => (
                            <span key={d} className={`w-8 h-8 rounded-lg text-xs font-black flex items-center justify-center
                                ${(teacher.available_days || []).includes(d) ? `${dayColor} text-white` : 'bg-gray-100 text-gray-300'}`}>
                                {DAY_SHORT[i]}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Classes & course types */}
            {uniqueClasses.length > 0 && (
                <div className="mb-2">
                    <div className="text-[11px] font-black text-gray-400 mb-1.5">負責班級</div>
                    <div className="flex flex-wrap gap-1.5">
                        {uniqueClasses.map(c => (
                            <span key={c} className="bg-blue-50 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-lg border border-blue-100">{c}</span>
                        ))}
                    </div>
                </div>
            )}
            {uniqueTypes.length > 0 && (
                <div>
                    <div className="text-[11px] font-black text-gray-400 mb-1.5">可教課程</div>
                    <div className="flex flex-wrap gap-1.5">
                        {uniqueTypes.map(tp => (
                            <span key={tp} className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${SLOT_TYPE_COLOR[tp as SlotType]}`}>
                                {SLOT_TYPE_ICON[tp as SlotType]} {tp}
                            </span>
                        ))}
                    </div>
                </div>
            )}
            {assignments.length === 0 && (
                <p className="text-xs text-gray-300 italic mt-2">尚未設定負責班級與課程</p>
            )}
        </div>
    );
}

// ── Assignment Matrix ────────────────────────────────────────────────────────
// ── Class-Centric Matrix (班級視角) ──────────────────────────────────────────
function ClassMatrix({ teachers, assignments, onEditTeacher }: {
    teachers: Teacher[];
    assignments: Assignment[];
    onEditTeacher: (t: Teacher) => void;
}) {
    const activeClasses = Array.from(
        new Set([...PRESET_CLASSES, ...assignments.map(a => a.class_group)])
    ).sort().filter(cls => assignments.some(a => a.class_group === cls));

    const getTeacher = (cls: string, slotType: SlotType, role: AssignRole) => {
        const a = assignments.find(a => a.class_group === cls && a.slot_type === slotType && a.role === role);
        return a ? teachers.find(t => t.id === a.teacher_id) ?? null : null;
    };

    const typeIcon = (t: Teacher | null) => {
        if (!t) return null;
        if (t.teacher_type === 'foreign') return '🌍';
        if (t.teacher_type === 'external') return '📝';
        return '👩‍🏫';
    };

    if (activeClasses.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-400">
                尚無負責設定資料。請先在「老師管理」點每位老師的「負責班級」進行設定。
            </div>
        );
    }

    return (
        <div>
            <div className="bg-white rounded-2xl shadow-sm border overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[700px]">
                    <thead>
                        <tr className="bg-gray-50 border-b">
                            <th className="p-3 text-left font-black text-gray-500 w-24 border-r">班級</th>
                            {SLOT_TYPES.map(st => (
                                <th key={st} className="p-2 text-center font-black text-gray-500 border-r" colSpan={2}>
                                    {SLOT_TYPE_ICON[st]} {st}
                                </th>
                            ))}
                        </tr>
                        <tr className="bg-gray-50/50 border-b text-[10px]">
                            <th className="border-r p-1"></th>
                            {SLOT_TYPES.map(st => (
                                [
                                    <th key={st + '-lead'} className="p-1.5 border-r text-green-600 font-black text-center">主教</th>,
                                    <th key={st + '-ass'} className="p-1.5 border-r text-gray-400 font-black text-center">助教</th>
                                ]
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {activeClasses.map(cls => (
                            <tr key={cls} className="border-b hover:bg-indigo-50/20 transition">
                                <td className="p-3 font-black text-gray-800 border-r text-sm">{cls}</td>
                                {SLOT_TYPES.map(st => {
                                    const lead = getTeacher(cls, st, 'lead');
                                    const asst = getTeacher(cls, st, 'assistant');
                                    return [
                                        <td key={st + '-lead'} className="p-2 text-center border-r">
                                            {lead
                                                ? <button onClick={() => onEditTeacher(lead)} className={`text-[11px] font-black px-2 py-1 rounded-lg hover:opacity-80 transition ${SLOT_TYPE_COLOR[st]}`}>
                                                    {typeIcon(lead)} {lead.name}
                                                </button>
                                                : <span className="text-gray-200">—</span>}
                                        </td>,
                                        <td key={st + '-ass'} className="p-2 text-center border-r">
                                            {asst
                                                ? <button onClick={() => onEditTeacher(asst)} className="text-[11px] font-black px-2 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
                                                    {typeIcon(asst)} {asst.name}
                                                </button>
                                                : <span className="text-gray-200">—</span>}
                                        </td>
                                    ];
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="mt-3 bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-xs text-indigo-700">
                💡 點老師名字可直接修改該老師的負責班級設定。顏色代表課程類型，圖示代表老師類型（🌍外師 / 📝外聘 / 👩‍🏫正職）。
            </div>
        </div>
    );
}

// ── Teacher-Centric Matrix (老師視角) ─────────────────────────────────────────
function AssignMatrix({ teachers, assignments, onEditTeacher }: {
    teachers: Teacher[];
    assignments: Assignment[];
    onEditTeacher: (t: Teacher) => void;
}) {
    const classes = Array.from(new Set(assignments.map(a => a.class_group))).sort();
    if (classes.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-400">
                尚無負責設定資料。請先到「老師管理」點選每位老師的「負責班級」進行設定。
            </div>
        );
    }
    return (
        <div>
            <div className="mb-3 text-right text-xs text-gray-400">點一位老師的名字可修改負責設定</div>
            <div className="bg-white rounded-2xl shadow-sm border overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                    <thead>
                        <tr className="border-b bg-gray-50">
                            <th className="p-3 text-left font-black text-gray-500 w-36">老師</th>
                            {classes.map(c => (
                                <th key={c} className="p-3 text-center font-black text-gray-500 text-xs">{c}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {teachers.map(t => {
                            const ta = assignments.filter(a => a.teacher_id === t.id);
                            if (ta.length === 0) return null;
                            return (
                                <tr key={t.id} className="border-b hover:bg-indigo-50/30 transition">
                                    <td className="p-3">
                                        <button onClick={() => onEditTeacher(t)} className="flex items-center gap-2 text-left hover:text-indigo-600 transition">
                                            <span className="text-lg">{t.teacher_type === 'foreign' ? '🌍' : t.teacher_type === 'external' ? '📝' : '👩‍🏫'}</span>
                                            <div>
                                                <div className="font-black text-gray-800 text-sm underline decoration-dotted">{t.name}</div>
                                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full
                                                    ${t.teacher_type === 'foreign' ? 'bg-amber-100 text-amber-700' : t.teacher_type === 'external' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                    {t.teacher_type ? TEACHER_TYPE_LABEL[t.teacher_type].replace(/^[^ ]+ /, '') : '?'}
                                                </span>
                                            </div>
                                        </button>
                                    </td>
                                    {classes.map(c => {
                                        const entries = ta.filter(a => a.class_group === c);
                                        return (
                                            <td key={c} className="p-2 text-center">
                                                {entries.length === 0
                                                    ? <span className="text-gray-200">—</span>
                                                    : (
                                                        <div className="inline-flex flex-col gap-1">
                                                            {entries.map(e => (
                                                                <span key={e.id} className={`text-[10px] font-black px-2 py-0.5 rounded border
                                                                    ${SLOT_TYPE_COLOR[e.slot_type as SlotType]}`}>
                                                                    {SLOT_TYPE_ICON[e.slot_type as SlotType]} {e.slot_type} {e.role === 'lead' ? '主教' : '助教'}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="mt-3 bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-xs text-indigo-700">
                💡 排課時選了班級與課程類型後，老師選單只會顯示有設定該課程負責的老師，大幅減少選擇錯誤的機會。
            </div>
        </div>
    );
}

// ── Add Slot Panel ────────────────────────────────────────────────────────────
function AddSlotPanel({ teachers, assignments, slots, onAdd, onEdit, onDelete, getEligibleTeachers, teacherName }: {
    teachers: Teacher[];
    assignments: Assignment[];
    slots: ScheduleSlot[];
    onAdd: () => void;
    onEdit: (s: ScheduleSlot) => void;
    onDelete: (id: string) => void;
    getEligibleTeachers: (c: string, t: SlotType, r?: AssignRole) => Teacher[];
    teacherName: (id: string | null) => string;
}) {
    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-black text-gray-700">課程清單（{slots.length} 堂）</h2>
                <button onClick={onAdd}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm rounded-xl shadow transition">
                    ＋ 新增課程
                </button>
            </div>

            {slots.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-400">
                    尚未排課，點「新增課程」開始建立課程時間表
                </div>
            ) : (
                <div className="space-y-2">
                    {slots.map(s => (
                        <div key={s.id} className={`bg-white rounded-xl border p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition ${SLOT_TYPE_COLOR[s.slot_type as SlotType]}`}>
                            <div className="text-2xl">{SLOT_TYPE_ICON[s.slot_type as SlotType]}</div>
                            <div className="flex-1">
                                <div className="font-black text-gray-800">
                                    {s.class_group} · {s.slot_type}
                                    <span className="ml-2 text-sm font-normal text-gray-500">
                                        {DAYS[s.day_of_week - 1]} {s.start_time}{s.end_time ? `~${s.end_time}` : ''}
                                    </span>
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                    主教：{teacherName(s.lead_teacher_id)}
                                    {s.assistant_teacher_id && ` · 助教：${teacherName(s.assistant_teacher_id)}`}
                                    {s.note && ` · 備註：${s.note}`}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => onEdit(s)} className="text-xs font-bold px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition">編輯</button>
                                <button onClick={() => onDelete(s.id)} className="text-xs font-bold px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-red-500 hover:bg-red-100 transition">刪除</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Week Grid ────────────────────────────────────────────────────────────────
function WeekGrid({ slots, teacherName, onAdd }: {
    slots: ScheduleSlot[];
    teacherName: (id: string | null) => string;
    onAdd: () => void;
}) {
    const times = Array.from(new Set(slots.map(s => s.start_time))).sort();
    if (times.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-400">
                尚未排課，請先到「新增課程」建立課程
            </div>
        );
    }
    return (
        <div className="bg-white rounded-2xl shadow-sm border overflow-x-auto">
            <div className="p-4 border-b flex justify-between items-center">
                <h2 className="font-black text-gray-700">週課表</h2>
                <button onClick={onAdd} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 transition">＋ 新增課程</button>
            </div>
            <table className="w-full min-w-[640px]">
                <thead>
                    <tr className="bg-gray-50 border-b">
                        <th className="p-3 text-xs font-black text-gray-400 text-left w-16">時間</th>
                        {DAYS.map(d => (
                            <th key={d} className="p-3 text-xs font-black text-center text-gray-500">{d}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {times.map(time => (
                        <tr key={time} className="border-b">
                            <td className="p-2 text-[10px] font-black text-gray-400 bg-gray-50 border-r align-top pt-3">{time}</td>
                            {DAY_NUMS.map(day => {
                                const daySlots = slots.filter(s => s.start_time === time && s.day_of_week === day);
                                return (
                                    <td key={day} className="p-1.5 align-top">
                                        {daySlots.length === 0 ? (
                                            <div className="border-2 border-dashed border-gray-100 rounded-xl h-14 flex items-center justify-center text-gray-200 text-xl cursor-pointer hover:border-indigo-200 hover:text-indigo-300 transition" onClick={onAdd}>
                                                ＋
                                            </div>
                                        ) : (
                                            <div className="space-y-1">
                                                {daySlots.map(s => (
                                                    <div key={s.id} className={`rounded-xl p-2 border ${SLOT_TYPE_COLOR[s.slot_type as SlotType]}`}>
                                                        <div className="text-[10px] font-black">{SLOT_TYPE_ICON[s.slot_type as SlotType]} {s.slot_type}</div>
                                                        <div className="text-[9px] opacity-70 mt-0.5">{s.class_group}・{teacherName(s.lead_teacher_id)}{s.assistant_teacher_id ? `＋${teacherName(s.assistant_teacher_id)}(助)` : ''}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ── Assignment Modal ─────────────────────────────────────────────────────────
function AssignmentModal({ teacher, allAssignments, pendingAssigns, setPendingAssigns, saving, onSave, onClose }: {
    teacher: Teacher;
    allAssignments: Assignment[];
    pendingAssigns: Assignment[];
    setPendingAssigns: (a: Assignment[]) => void;
    saving: boolean;
    onSave: () => void;
    onClose: () => void;
}) {
    const [classInput, setClassInput] = useState('');
    const [classes, setClasses] = useState<string[]>(
        Array.from(new Set([...PRESET_CLASSES, ...allAssignments.map(a => a.class_group), ...pendingAssigns.map(a => a.class_group)])).sort()
    );

    function addClass() {
        const v = classInput.trim().toUpperCase();
        if (!v || classes.includes(v)) return;
        setClasses(c => [...c, v].sort());
        setClassInput('');
    }

    function toggle(classGroup: string, slotType: SlotType, role: AssignRole) {
        const exists = pendingAssigns.some(a => a.teacher_id === teacher.id && a.class_group === classGroup && a.slot_type === slotType && a.role === role);
        if (exists) {
            setPendingAssigns(pendingAssigns.filter(a => !(a.teacher_id === teacher.id && a.class_group === classGroup && a.slot_type === slotType && a.role === role)));
        } else {
            setPendingAssigns([...pendingAssigns, { id: '', teacher_id: teacher.id, class_group: classGroup, slot_type: slotType, role }]);
        }
    }

    const checked = (classGroup: string, slotType: SlotType, role: AssignRole) =>
        pendingAssigns.some(a => a.teacher_id === teacher.id && a.class_group === classGroup && a.slot_type === slotType && a.role === role);

    return (
        <Modal onClose={onClose} wide>
            <div className="flex items-center gap-3 mb-5">
                <span className="text-3xl">{teacher.teacher_type === 'foreign' ? '🌍' : teacher.teacher_type === 'external' ? '📝' : '👩‍🏫'}</span>
                <div>
                    <h3 className="text-xl font-black">{teacher.name}</h3>
                    <span className="text-xs text-gray-400">{teacher.teacher_type ? TEACHER_TYPE_LABEL[teacher.teacher_type] : '未設類型'}</span>
                </div>
            </div>

            {/* Add class */}
            <div className="flex gap-2 mb-4">
                <input value={classInput} onChange={e => setClassInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addClass()}
                    placeholder="輸入班級名稱（如 CEI-A）再按 Enter"
                    className="flex-1 px-3 py-2 border rounded-xl text-sm font-bold" />
                <button onClick={addClass} className="px-4 py-2 bg-indigo-600 text-white font-black rounded-xl text-sm hover:bg-indigo-700">新增班級</button>
            </div>

            {classes.length === 0 && (
                <p className="text-xs text-gray-400 italic mb-4">輸入班級名稱開始設定</p>
            )}

            {/* Matrix */}
            {classes.length > 0 && (
                <div className="overflow-x-auto mb-5">
                    <table className="w-full text-xs border-collapse">
                        <thead>
                            <tr className="bg-gray-50">
                                <th className="p-2 text-left font-black text-gray-400 border">班級</th>
                                {SLOT_TYPES.map(st => (
                                    <th key={st} className="p-2 text-center border font-black text-gray-500" colSpan={2}>
                                        {SLOT_TYPE_ICON[st]} {st}
                                    </th>
                                ))}
                            </tr>
                            <tr className="bg-gray-50/50">
                                <th className="border"></th>
                                {SLOT_TYPES.map(st => (
                                    <>
                                        <th key={st + '-lead'} className="p-1.5 border text-center text-[10px] font-black text-green-600">主教</th>
                                        <th key={st + '-ass'} className="p-1.5 border text-center text-[10px] font-black text-gray-400">助教</th>
                                    </>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {classes.map(c => (
                                <tr key={c} className="hover:bg-indigo-50/30 transition">
                                    <td className="p-2 font-black text-gray-700 border bg-white">{c}</td>
                                    {SLOT_TYPES.map(st => (
                                        <>
                                            <td key={st + '-lead'} className="p-1.5 text-center border">
                                                <input type="checkbox"
                                                    checked={checked(c, st, 'lead')}
                                                    onChange={() => toggle(c, st, 'lead')}
                                                    className="w-4 h-4 accent-green-500 cursor-pointer" />
                                            </td>
                                            <td key={st + '-ass'} className="p-1.5 text-center border">
                                                <input type="checkbox"
                                                    checked={checked(c, st, 'assistant')}
                                                    onChange={() => toggle(c, st, 'assistant')}
                                                    className="w-4 h-4 accent-gray-400 cursor-pointer" />
                                            </td>
                                        </>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="text-[10px] text-gray-400 mb-4">✅ 綠色核選 = 主教  ⬜ 灰色核選 = 助教</div>

            <div className="flex gap-3">
                <button onClick={onSave} disabled={saving}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl transition disabled:opacity-50">
                    {saving ? '儲存中...' : '✅ 儲存負責設定'}
                </button>
                <button onClick={onClose} className="px-5 py-3 bg-gray-100 text-gray-500 font-bold rounded-xl hover:bg-gray-200 transition">取消</button>
            </div>
        </Modal>
    );
}

// ── Slot Modal ────────────────────────────────────────────────────────────────
function SlotModal({ slot, setSlot, teachers, assignments, getEligibleTeachers, getAvailableDays, saving, onSave, onClose }: {
    slot: Partial<ScheduleSlot> & { _open?: boolean };
    setSlot: (v: any) => void;
    teachers: Teacher[];
    assignments: Assignment[];
    getEligibleTeachers: (c: string, t: SlotType, r?: AssignRole) => Teacher[];
    getAvailableDays: (c: string, t: SlotType) => DayOfWeek[];
    saving: boolean;
    onSave: () => void;
    onClose: () => void;
}) {
    const allClasses = Array.from(new Set([...PRESET_CLASSES, ...assignments.map(a => a.class_group)])).sort();
    const leadOptions = (slot.class_group && slot.slot_type)
        ? getEligibleTeachers(slot.class_group, slot.slot_type as SlotType, 'lead') : [];
    const assistOptions = (slot.class_group && slot.slot_type)
        ? getEligibleTeachers(slot.class_group, slot.slot_type as SlotType, 'assistant') : [];
    const availDays = (slot.class_group && slot.slot_type)
        ? getAvailableDays(slot.class_group, slot.slot_type as SlotType) : DAY_NUMS;

    const upd = (key: string, val: any) => setSlot((p: any) => ({ ...p, [key]: val }));

    return (
        <Modal onClose={onClose}>
            <h3 className="text-xl font-black mb-5">{slot.id ? '編輯課程' : '➕ 新增課程'}</h3>
            <div className="space-y-4">
                {/* 班級 */}
                <div>
                    <label className="text-xs font-black text-gray-400 block mb-1.5">① 班級</label>
                    <select value={slot.class_group || ''} onChange={e => upd('class_group', e.target.value)}
                        className="w-full p-3 border-2 border-indigo-200 bg-indigo-50 rounded-xl font-bold text-sm focus:outline-none focus:border-indigo-400">
                        <option value="">— 請選擇班級 —</option>
                        {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>

                {/* 課程類型 */}
                <div>
                    <label className="text-xs font-black text-gray-400 block mb-1.5">② 課程類型</label>
                    <div className="grid grid-cols-3 gap-2">
                        {SLOT_TYPES.map(st => (
                            <button key={st} onClick={() => upd('slot_type', st)}
                                className={`p-2.5 rounded-xl text-sm font-black border-2 transition
                                    ${slot.slot_type === st ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}>
                                {SLOT_TYPE_ICON[st]} {st}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 主教老師 */}
                {slot.class_group && slot.slot_type && (
                    <div>
                        <label className="text-xs font-black text-gray-400 block mb-1.5">③ 主教老師（自動篩選）</label>
                        {leadOptions.length === 0 ? (
                            <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-600 font-bold">
                                ⚠️ 此班級尚未設定可教此課程的老師，請先到「老師管理」→「負責班級」設定
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                {leadOptions.map(t => (
                                    <label key={t.id} className={`flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer transition
                                        ${slot.lead_teacher_id === t.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 hover:border-indigo-200'}`}>
                                        <input type="radio" name="lead-teacher" value={t.id}
                                            checked={slot.lead_teacher_id === t.id}
                                            onChange={() => upd('lead_teacher_id', t.id)}
                                            className="accent-indigo-500" />
                                        <div>
                                            <div className="font-black text-sm text-gray-800">{t.name}</div>
                                            <div className="text-[10px] text-gray-400">
                                                {t.teacher_type ? TEACHER_TYPE_LABEL[t.teacher_type] : ''}
                                                {t.teacher_type !== 'staff' && t.available_days?.length ? `・可來：${t.available_days.map(d => DAY_SHORT[d - 1]).join('、')}` : '・正職全天'}
                                            </div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* 助教 */}
                {assistOptions.length > 0 && (
                    <div>
                        <label className="text-xs font-black text-gray-400 block mb-1.5">④ 助教（選填）</label>
                        <select value={slot.assistant_teacher_id || ''} onChange={e => upd('assistant_teacher_id', e.target.value || null)}
                            className="w-full p-3 border rounded-xl font-bold text-sm bg-gray-50">
                            <option value="">— 不需助教 —</option>
                            {assistOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                )}

                {/* 星期 & 時間 */}
                <div>
                    <label className="text-xs font-black text-gray-400 block mb-1.5">⑤ 星期 ＆ 時間</label>
                    <div className="grid grid-cols-2 gap-3">
                        <select value={slot.day_of_week || ''} onChange={e => upd('day_of_week', Number(e.target.value))}
                            className="p-3 border rounded-xl font-bold text-sm bg-gray-50">
                            <option value="">— 選星期 —</option>
                            {availDays.map((d, i) => (
                                <option key={d} value={d}>{DAYS[d - 1]}</option>
                            ))}
                        </select>
                        <select value={slot.start_time || ''} onChange={e => upd('start_time', e.target.value)}
                            className="p-3 border rounded-xl font-bold text-sm bg-gray-50">
                            <option value="">— 開始時間 —</option>
                            {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <select value={slot.end_time || ''} onChange={e => upd('end_time', e.target.value || null)}
                        className="w-full mt-2 p-3 border rounded-xl font-bold text-sm bg-gray-50">
                        <option value="">結束時間（選填）</option>
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>

                {/* 備註 */}
                <div>
                    <label className="text-xs font-black text-gray-400 block mb-1.5">備註（選填）</label>
                    <input value={slot.note || ''} onChange={e => upd('note', e.target.value)}
                        placeholder="例：與 CEI-B 倂班"
                        className="w-full px-3 py-2 border rounded-xl text-sm font-bold bg-gray-50" />
                </div>

                <div className="flex gap-3 pt-2">
                    <button onClick={onSave} disabled={saving}
                        className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl transition disabled:opacity-50">
                        {saving ? '儲存中...' : '✅ 確認新增'}
                    </button>
                    <button onClick={onClose}
                        className="px-5 py-3 bg-gray-100 text-gray-500 font-bold rounded-xl hover:bg-gray-200 transition">
                        取消
                    </button>
                </div>
            </div>
        </Modal>
    );
}

// ── Generic Modal Wrapper ─────────────────────────────────────────────────────
function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={e => e.target === e.currentTarget && onClose()}>
            <div className={`bg-white rounded-3xl shadow-2xl overflow-y-auto max-h-[90vh] ${wide ? 'w-full max-w-4xl' : 'w-full max-w-md'} p-6`}>
                {children}
            </div>
        </div>
    );
}
