'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

// ââ Types ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
type TeacherType = 'foreign' | 'external' | 'staff';
type SlotType = 'è½èªª' | 'ææ³' | 'é±è®' | 'è±æç¶å' | 'èª²å¾è¼å°';
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

// ââ Constants ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const SLOT_TYPES: SlotType[] = ['è½èªª', 'ææ³', 'é±è®', 'è±æç¶å', 'èª²å¾è¼å°'];
const DAYS = ['é±ä¸', 'é±äº', 'é±ä¸', 'é±å', 'é±äº'];
const DAY_NUMS: DayOfWeek[] = [1, 2, 3, 4, 5];
const DAY_SHORT = ['ä¸', 'äº', 'ä¸', 'å', 'äº'];

const TIME_OPTIONS = ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00'];

const TEACHER_TYPE_LABEL: Record<TeacherType, string> = {
    foreign: 'ð å¤å¸«',
    external: 'ð å¤èèå¸«',
    staff: 'ð©âð« è±æèå¸«ï¼æ­£è·ï¼',
};

const SLOT_TYPE_COLOR: Record<SlotType, string> = {
    'è½èªª':   'bg-blue-100 border-blue-200 text-blue-700',
    'ææ³':   'bg-purple-100 border-purple-200 text-purple-700',
    'é±è®':   'bg-rose-100 border-rose-200 text-rose-700',
    'è±æç¶å': 'bg-green-100 border-green-200 text-green-700',
    'èª²å¾è¼å°': 'bg-teal-100 border-teal-200 text-teal-700',
};

const SLOT_TYPE_ICON: Record<SlotType, string> = {
    'è½èªª': 'ð§', 'ææ³': 'ð', 'é±è®': 'ð', 'è±æç¶å': 'ð', 'èª²å¾è¼å°': 'ð',
};

// ââ Helpers ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const PRESET_CLASSES = [
    ...Array.from({ length: 26 }, (_, i) => `CEI-${String.fromCharCode(65 + i)}`),
    'å®è¦ªç­',
];

function buildClassGroups(slots: ScheduleSlot[], assignments: Assignment[]) {
    const set = new Set<string>(PRESET_CLASSES);
    slots.forEach(s => set.add(s.class_group));
    assignments.forEach(a => set.add(a.class_group));
    return Array.from(set).sort();
}

// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
export default function SchedulePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);

    // Data
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [slots, setSlots] = useState<ScheduleSlot[]>([]);
    const [semester, setSemester] = useState('2025ä¸');

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
            alert('â æ¨æ²ææ¬éé²å¥æèª²ç³»çµ±');
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

    // ââ Teacher CRUD ââââââââââââââââââââââââââââââââââââââââââââââââââââ
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
                alert('新增失敗（auth）：' + (signUpError?.message ?? '無法建立帳號'));
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

    // ââ Assignment CRUD âââââââââââââââââââââââââââââââââââââââââââââââââ
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

    // ââ Schedule Slot CRUD ââââââââââââââââââââââââââââââââââââââââââââââ
    async function saveSlot() {
        if (!addSlot.class_group || !addSlot.slot_type || !addSlot.day_of_week || !addSlot.start_time) {
            alert('è«å¡«å¯«ç­ç´ãèª²ç¨é¡åãææèéå§æé');
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
        if (!confirm('ç¢ºå®è¦åªé¤éå èª²åï¼')) return;
        await supabase.from('schedule_slots').delete().eq('id', id);
        await fetchAll();
    }

    // ââ Derived: who can teach what âââââââââââââââââââââââââââââââââââââ
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

    // ââ Available days filter for slot ââââââââââââââââââââââââââââââââââ
    function getAvailableDays(classGroup: string, slotType: SlotType): DayOfWeek[] {
        // è½èªªèª² â åªè½å¤å¸«æä¾çå¤©ï¼å¶ä»èª² â ææå¤©
        if (slotType === 'è½èªª') {
            const foreignTeachers = teachers.filter(t =>
                t.teacher_type === 'foreign' &&
                assignments.some(a => a.teacher_id === t.id && a.class_group === classGroup && a.slot_type === 'è½èªª' && a.role === 'lead')
            );
            const days = new Set<DayOfWeek>();
            foreignTeachers.forEach(t => (t.available_days || []).forEach(d => days.add(d as DayOfWeek)));
            return days.size > 0 ? Array.from(days).sort() : DAY_NUMS;
        }
        return DAY_NUMS;
    }

    const teacherName = (id: string | null) => teachers.find(t => t.id === id)?.name || 'â';

    if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400 text-lg">è¼å¥ä¸­...</div>;

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-gray-800">ð æèª²ç³»çµ±</h1>
                    <p className="text-sm text-gray-400 mt-0.5">{currentUser?.name} Â· å­¸æï¼
                        <select value={semester} onChange={e => setSemester(e.target.value)}
                            className="ml-1 text-sm font-bold text-indigo-700 border-none bg-transparent cursor-pointer">
                            <option>2025ä¸</option>
                            <option>2026ä¸</option>
                            <option>2026ä¸</option>
                        </select>
                    </p>
                </div>
                <button onClick={() => router.push('/')}
                    className="px-4 py-2 text-sm font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-xl transition">
                    â åé¦é 
                </button>
            </div>

            {/* Tabs */}
            <div className="bg-white border-b border-gray-100 px-6 flex gap-2 overflow-x-auto">
                {([
                    { key: 'teachers', label: 'ð©âð« èå¸«ç®¡ç' },
                    { key: 'assign',   label: 'ð è² è²¬è¨­å®' },
                    { key: 'add',      label: 'â æ°å¢èª²ç¨' },
                    { key: 'grid',     label: 'ð é±èª²è¡¨' },
                ] as const).map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        className={`px-5 py-3.5 text-sm font-black border-b-2 transition whitespace-nowrap
                            ${tab === t.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="max-w-6xl mx-auto p-6">

                {/* ââ TAB: èå¸«ç®¡ç ââââââââââââââââââââââââââââââââââââââââââââââ */}
                {tab === 'teachers' && (
                    <div>
                        <div className="mb-4 flex justify-between items-center">
                            <h2 className="text-lg font-black text-gray-700">èå¸«åè¡¨ï¼{teachers.length} ä½ï¼</h2>
                            <button
                                onClick={() => { setNewTeacher({ name: '', teacher_type: 'staff', available_days: [] }); setAddTeacherModal(true); }}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm rounded-xl shadow transition">
                                ï¼ æ°å¢èå¸«
                            </button>
                        </div>

                        {/* é¡åèªªæ */}
                        <div className="grid grid-cols-3 gap-3 mb-6">
                            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                                <div className="text-2xl mb-1">ð</div>
                                <div className="font-black text-amber-800 text-sm">å¤å¸«</div>
                                <div className="text-xs text-amber-600 mt-1">å¤ç±æ¯èªèå¸«<br />åºå®å¤©æ¸ã»è½èªªèª²ä¸»æ</div>
                            </div>
                            <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 text-center">
                                <div className="text-2xl mb-1">ð</div>
                                <div className="font-black text-violet-800 text-sm">å¤èèå¸«</div>
                                <div className="text-xs text-violet-600 mt-1">å¤é¨èè«ã»éæ­£è·<br />åºå®å¤©æ¸ã»ææ³/é±è®ä¸»æ</div>
                            </div>
                            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                                <div className="text-2xl mb-1">ð©âð«</div>
                                <div className="font-black text-emerald-800 text-sm">è±æèå¸«ï¼æ­£è·ï¼</div>
                                <div className="text-xs text-emerald-600 mt-1">å¨è·å¡å·¥ã»é±ä¸å°äº<br />ææ³/é±è®ä¸»æ æ å©æ</div>
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
                                    å°ç¡èå¸«è³æï¼è«åå¨ç¨æ¶ç®¡çä¸­å»ºç« role=teacher çå¸³è
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ââ TAB: è² è²¬è¨­å®ç©é£ ââââââââââââââââââââââââââââââââââââââââââ */}
                {tab === 'assign' && (
                    <div>
                        {/* View toggle */}
                        <div className="flex items-center gap-2 mb-5">
                            <span className="text-xs font-black text-gray-400 mr-2">è¦è§åæ</span>
                            <button
                                onClick={() => setAssignView('class')}
                                className={`px-4 py-2 rounded-xl text-sm font-black transition ${assignView === 'class' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600'}`}>
                                ð« ç­ç´è¦è§
                            </button>
                            <button
                                onClick={() => setAssignView('teacher')}
                                className={`px-4 py-2 rounded-xl text-sm font-black transition ${assignView === 'teacher' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600'}`}>
                                ð©âð« èå¸«è¦è§
                            </button>
                            <span className="text-xs text-gray-400 ml-2">é»èå¸«åå­å¯ä¿®æ¹è² è²¬è¨­å®</span>
                        </div>
                        {assignView === 'class'
                            ? <ClassMatrix teachers={teachers} assignments={assignments} onEditTeacher={t => openAssignModal(t)} />
                            : <AssignMatrix teachers={teachers} assignments={assignments} onEditTeacher={t => openAssignModal(t)} />
                        }
                    </div>
                )}

                {/* ââ TAB: æ°å¢èª²ç¨ ââââââââââââââââââââââââââââââââââââââââââââââ */}
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

                {/* ââ TAB: é±èª²è¡¨ ââââââââââââââââââââââââââââââââââââââââââââââââ */}
                {tab === 'grid' && (
                    <WeekGrid slots={slots} teacherName={teacherName} onAdd={() => setAddSlot({ _open: true })} />
                )}
            </div>

            {/* ââ Teacher Edit Modal ââââââââââââââââââââââââââââââââââââââââââââ */}
            {teacherModal && (
                <Modal onClose={() => setTeacherModal(null)}>
                    <h3 className="text-xl font-black mb-5">ç·¨è¼¯èå¸«è³æ</h3>
                    <div className="space-y-5">
                        <div>
                            <label className="text-xs font-black text-gray-400 block mb-2">å§å</label>
                            <input
                                value={teacherModal.name || ''}
                                onChange={e => setTeacherModal(p => ({ ...p!, name: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-300"
                                placeholder="èå¸«å§å"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-black text-gray-400 block mb-2">èå¸«é¡å</label>
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
                                <label className="text-xs font-black text-gray-400 block mb-2">å¯ä¾å¤©æ¸ï¼å¯è¤é¸ï¼</label>
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
                                {saving ? 'å²å­ä¸­...' : 'â å²å­'}
                            </button>
                            <button onClick={() => setTeacherModal(null)}
                                className="px-5 py-3 bg-gray-100 text-gray-500 font-bold rounded-xl hover:bg-gray-200 transition">
                                åæ¶
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* ââ Add Teacher Modal (ç¡å¸³èæ°å¢) ââââââââââââââââââââââââââââââ */}
            {addTeacherModal && (
                <Modal onClose={() => setAddTeacherModal(false)}>
                    <h3 className="text-xl font-black mb-1">æ°å¢èå¸«</h3>
                    <p className="text-xs text-gray-400 mb-5">ç¡éå¸³èï¼ç´æ¥è¼¸å¥å§åå³å¯å å¥æèª²ç³»çµ±</p>
                    <div className="space-y-5">
                        <div>
                            <label className="text-xs font-black text-gray-400 block mb-2">å§å <span className="text-red-400">*</span></label>
                            <input
                                value={newTeacher.name}
                                onChange={e => setNewTeacher(p => ({ ...p, name: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-300"
                                placeholder="è¼¸å¥èå¸«å§å"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="text-xs font-black text-gray-400 block mb-2">èå¸«é¡å</label>
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
                                <label className="text-xs font-black text-gray-400 block mb-2">å¯ä¾å¤©æ¸ï¼å¯è¤é¸ï¼</label>
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
                                {saving ? 'æ°å¢ä¸­...' : 'â æ°å¢èå¸«'}
                            </button>
                            <button onClick={() => setAddTeacherModal(false)}
                                className="px-5 py-3 bg-gray-100 text-gray-500 font-bold rounded-xl hover:bg-gray-200 transition">
                                åæ¶
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* ââ Assignment Modal ââââââââââââââââââââââââââââââââââââââââââââââââ */}
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

            {/* ââ Add/Edit Slot Modal âââââââââââââââââââââââââââââââââââââââââââââ */}
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

// ââ Sub-Components ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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
                    {type === 'foreign' ? 'ð' : type === 'external' ? 'ð' : 'ð©âð«'}
                </div>
                <div className="flex-1">
                    <div className="font-black text-gray-800">{teacher.name}</div>
                    {type ? (
                        <span className={`inline-block text-[11px] font-black px-2 py-0.5 rounded-full mt-0.5
                            ${type === 'foreign' ? 'bg-amber-100 text-amber-700' : type === 'external' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {TEACHER_TYPE_LABEL[type]}
                        </span>
                    ) : (
                        <span className="text-xs text-gray-300">å°æªè¨­å®é¡å</span>
                    )}
                </div>
                <div className="flex gap-2">
                    <button onClick={onEdit} className="text-xs font-bold px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition">è¨­å®</button>
                    <button onClick={onAssign} className="text-xs font-bold px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-600 hover:bg-indigo-100 transition">è² è²¬ç­ç´</button>
                </div>
            </div>

            {/* Available days */}
            {type !== 'staff' && (
                <div className="mb-3">
                    <div className="text-[11px] font-black text-gray-400 mb-1.5">å¯ä¾å¤©æ¸</div>
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
                    <div className="text-[11px] font-black text-gray-400 mb-1.5">è² è²¬ç­ç´</div>
                    <div className="flex flex-wrap gap-1.5">
                        {uniqueClasses.map(c => (
                            <span key={c} className="bg-blue-50 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-lg border border-blue-100">{c}</span>
                        ))}
                    </div>
                </div>
            )}
            {uniqueTypes.length > 0 && (
                <div>
                    <div className="text-[11px] font-black text-gray-400 mb-1.5">å¯æèª²ç¨</div>
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
                <p className="text-xs text-gray-300 italic mt-2">å°æªè¨­å®è² è²¬ç­ç´èèª²ç¨</p>
            )}
        </div>
    );
}

// ââ Assignment Matrix ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// ââ Class-Centric Matrix (ç­ç´è¦è§) ââââââââââââââââââââââââââââââââââââââââââ
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
        if (t.teacher_type === 'foreign') return 'ð';
        if (t.teacher_type === 'external') return 'ð';
        return 'ð©âð«';
    };

    if (activeClasses.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-400">
                å°ç¡è² è²¬è¨­å®è³æãè«åå¨ãèå¸«ç®¡çãé»æ¯ä½èå¸«çãè² è²¬ç­ç´ãé²è¡è¨­å®ã
            </div>
        );
    }

    return (
        <div>
            <div className="bg-white rounded-2xl shadow-sm border overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[700px]">
                    <thead>
                        <tr className="bg-gray-50 border-b">
                            <th className="p-3 text-left font-black text-gray-500 w-24 border-r">ç­ç´</th>
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
                                    <th key={st + '-lead'} className="p-1.5 border-r text-green-600 font-black text-center">ä¸»æ</th>,
                                    <th key={st + '-ass'} className="p-1.5 border-r text-gray-400 font-black text-center">å©æ</th>
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
                                                : <span className="text-gray-200">â</span>}
                                        </td>,
                                        <td key={st + '-ass'} className="p-2 text-center border-r">
                                            {asst
                                                ? <button onClick={() => onEditTeacher(asst)} className="text-[11px] font-black px-2 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
                                                    {typeIcon(asst)} {asst.name}
                                                </button>
                                                : <span className="text-gray-200">â</span>}
                                        </td>
                                    ];
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="mt-3 bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-xs text-indigo-700">
                ð¡ é»èå¸«åå­å¯ç´æ¥ä¿®æ¹è©²èå¸«çè² è²¬ç­ç´è¨­å®ãé¡è²ä»£è¡¨èª²ç¨é¡åï¼åç¤ºä»£è¡¨èå¸«é¡åï¼ðå¤å¸« / ðå¤è / ð©âð«æ­£è·ï¼ã
            </div>
        </div>
    );
}

// ââ Teacher-Centric Matrix (èå¸«è¦è§) âââââââââââââââââââââââââââââââââââââââââ
function AssignMatrix({ teachers, assignments, onEditTeacher }: {
    teachers: Teacher[];
    assignments: Assignment[];
    onEditTeacher: (t: Teacher) => void;
}) {
    const classes = Array.from(new Set(assignments.map(a => a.class_group))).sort();
    if (classes.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-400">
                å°ç¡è² è²¬è¨­å®è³æãè«åå°ãèå¸«ç®¡çãé»é¸æ¯ä½èå¸«çãè² è²¬ç­ç´ãé²è¡è¨­å®ã
            </div>
        );
    }
    return (
        <div>
            <div className="mb-3 text-right text-xs text-gray-400">é»ä¸ä½èå¸«çåå­å¯ä¿®æ¹è² è²¬è¨­å®</div>
            <div className="bg-white rounded-2xl shadow-sm border overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                    <thead>
                        <tr className="border-b bg-gray-50">
                            <th className="p-3 text-left font-black text-gray-500 w-36">èå¸«</th>
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
                                            <span className="text-lg">{t.teacher_type === 'foreign' ? 'ð' : t.teacher_type === 'external' ? 'ð' : 'ð©âð«'}</span>
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
                                                    ? <span className="text-gray-200">â</span>
                                                    : (
                                                        <div className="inline-flex flex-col gap-1">
                                                            {entries.map(e => (
                                                                <span key={e.id} className={`text-[10px] font-black px-2 py-0.5 rounded border
                                                                    ${SLOT_TYPE_COLOR[e.slot_type as SlotType]}`}>
                                                                    {SLOT_TYPE_ICON[e.slot_type as SlotType]} {e.slot_type} {e.role === 'lead' ? 'ä¸»æ' : 'å©æ'}
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
                ð¡ æèª²æé¸äºç­ç´èèª²ç¨é¡åå¾ï¼èå¸«é¸å®åªæé¡¯ç¤ºæè¨­å®è©²èª²ç¨è² è²¬çèå¸«ï¼å¤§å¹æ¸å°é¸æé¯èª¤çæ©æã
            </div>
        </div>
    );
}

// ââ Add Slot Panel ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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
                <h2 className="text-lg font-black text-gray-700">èª²ç¨æ¸å®ï¼{slots.length} å ï¼</h2>
                <button onClick={onAdd}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm rounded-xl shadow transition">
                    ï¼ æ°å¢èª²ç¨
                </button>
            </div>

            {slots.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-400">
                    å°æªæèª²ï¼é»ãæ°å¢èª²ç¨ãéå§å»ºç«èª²ç¨æéè¡¨
                </div>
            ) : (
                <div className="space-y-2">
                    {slots.map(s => (
                        <div key={s.id} className={`bg-white rounded-xl border p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition ${SLOT_TYPE_COLOR[s.slot_type as SlotType]}`}>
                            <div className="text-2xl">{SLOT_TYPE_ICON[s.slot_type as SlotType]}</div>
                            <div className="flex-1">
                                <div className="font-black text-gray-800">
                                    {s.class_group} Â· {s.slot_type}
                                    <span className="ml-2 text-sm font-normal text-gray-500">
                                        {DAYS[s.day_of_week - 1]} {s.start_time}{s.end_time ? `~${s.end_time}` : ''}
                                    </span>
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                    ä¸»æï¼{teacherName(s.lead_teacher_id)}
                                    {s.assistant_teacher_id && ` Â· å©æï¼${teacherName(s.assistant_teacher_id)}`}
                                    {s.note && ` Â· åè¨»ï¼${s.note}`}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => onEdit(s)} className="text-xs font-bold px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition">ç·¨è¼¯</button>
                                <button onClick={() => onDelete(s.id)} className="text-xs font-bold px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-red-500 hover:bg-red-100 transition">åªé¤</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ââ Week Grid ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function WeekGrid({ slots, teacherName, onAdd }: {
    slots: ScheduleSlot[];
    teacherName: (id: string | null) => string;
    onAdd: () => void;
}) {
    const times = Array.from(new Set(slots.map(s => s.start_time))).sort();
    if (times.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-400">
                å°æªæèª²ï¼è«åå°ãæ°å¢èª²ç¨ãå»ºç«èª²ç¨
            </div>
        );
    }
    return (
        <div className="bg-white rounded-2xl shadow-sm border overflow-x-auto">
            <div className="p-4 border-b flex justify-between items-center">
                <h2 className="font-black text-gray-700">é±èª²è¡¨</h2>
                <button onClick={onAdd} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 transition">ï¼ æ°å¢èª²ç¨</button>
            </div>
            <table className="w-full min-w-[640px]">
                <thead>
                    <tr className="bg-gray-50 border-b">
                        <th className="p-3 text-xs font-black text-gray-400 text-left w-16">æé</th>
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
                                                ï¼
                                            </div>
                                        ) : (
                                            <div className="space-y-1">
                                                {daySlots.map(s => (
                                                    <div key={s.id} className={`rounded-xl p-2 border ${SLOT_TYPE_COLOR[s.slot_type as SlotType]}`}>
                                                        <div className="text-[10px] font-black">{SLOT_TYPE_ICON[s.slot_type as SlotType]} {s.slot_type}</div>
                                                        <div className="text-[9px] opacity-70 mt-0.5">{s.class_group}ã»{teacherName(s.lead_teacher_id)}{s.assistant_teacher_id ? `ï¼${teacherName(s.assistant_teacher_id)}(å©)` : ''}</div>
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

// ââ Assignment Modal âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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
                <span className="text-3xl">{teacher.teacher_type === 'foreign' ? 'ð' : teacher.teacher_type === 'external' ? 'ð' : 'ð©âð«'}</span>
                <div>
                    <h3 className="text-xl font-black">{teacher.name}</h3>
                    <span className="text-xs text-gray-400">{teacher.teacher_type ? TEACHER_TYPE_LABEL[teacher.teacher_type] : 'æªè¨­é¡å'}</span>
                </div>
            </div>

            {/* Add class */}
            <div className="flex gap-2 mb-4">
                <input value={classInput} onChange={e => setClassInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addClass()}
                    placeholder="è¼¸å¥ç­ç´åç¨±ï¼å¦ CEI-Aï¼åæ Enter"
                    className="flex-1 px-3 py-2 border rounded-xl text-sm font-bold" />
                <button onClick={addClass} className="px-4 py-2 bg-indigo-600 text-white font-black rounded-xl text-sm hover:bg-indigo-700">æ°å¢ç­ç´</button>
            </div>

            {classes.length === 0 && (
                <p className="text-xs text-gray-400 italic mb-4">è¼¸å¥ç­ç´åç¨±éå§è¨­å®</p>
            )}

            {/* Matrix */}
            {classes.length > 0 && (
                <div className="overflow-x-auto mb-5">
                    <table className="w-full text-xs border-collapse">
                        <thead>
                            <tr className="bg-gray-50">
                                <th className="p-2 text-left font-black text-gray-400 border">ç­ç´</th>
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
                                        <th key={st + '-lead'} className="p-1.5 border text-center text-[10px] font-black text-green-600">ä¸»æ</th>
                                        <th key={st + '-ass'} className="p-1.5 border text-center text-[10px] font-black text-gray-400">å©æ</th>
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

            <div className="text-[10px] text-gray-400 mb-4">â ç¶ è²æ ¸é¸ = ä¸»æ  â¬ ç°è²æ ¸é¸ = å©æ</div>

            <div className="flex gap-3">
                <button onClick={onSave} disabled={saving}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl transition disabled:opacity-50">
                    {saving ? 'å²å­ä¸­...' : 'â å²å­è² è²¬è¨­å®'}
                </button>
                <button onClick={onClose} className="px-5 py-3 bg-gray-100 text-gray-500 font-bold rounded-xl hover:bg-gray-200 transition">åæ¶</button>
            </div>
        </Modal>
    );
}

// ââ Slot Modal ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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
            <h3 className="text-xl font-black mb-5">{slot.id ? 'ç·¨è¼¯èª²ç¨' : 'â æ°å¢èª²ç¨'}</h3>
            <div className="space-y-4">
                {/* ç­ç´ */}
                <div>
                    <label className="text-xs font-black text-gray-400 block mb-1.5">â  ç­ç´</label>
                    <select value={slot.class_group || ''} onChange={e => upd('class_group', e.target.value)}
                        className="w-full p-3 border-2 border-indigo-200 bg-indigo-50 rounded-xl font-bold text-sm focus:outline-none focus:border-indigo-400">
                        <option value="">â è«é¸æç­ç´ â</option>
                        {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>

                {/* èª²ç¨é¡å */}
                <div>
                    <label className="text-xs font-black text-gray-400 block mb-1.5">â¡ èª²ç¨é¡å</label>
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

                {/* ä¸»æèå¸« */}
                {slot.class_group && slot.slot_type && (
                    <div>
                        <label className="text-xs font-black text-gray-400 block mb-1.5">â¢ ä¸»æèå¸«ï¼èªåç¯©é¸ï¼</label>
                        {leadOptions.length === 0 ? (
                            <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-600 font-bold">
                                â ï¸ æ­¤ç­ç´å°æªè¨­å®å¯ææ­¤èª²ç¨çèå¸«ï¼è«åå°ãèå¸«ç®¡çãâãè² è²¬ç­ç´ãè¨­å®
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
                                                {t.teacher_type !== 'staff' && t.available_days?.length ? `ã»å¯ä¾ï¼${t.available_days.map(d => DAY_SHORT[d - 1]).join('ã')}` : 'ã»æ­£è·å¨å¤©'}
                                            </div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* å©æ */}
                {assistOptions.length > 0 && (
                    <div>
                        <label className="text-xs font-black text-gray-400 block mb-1.5">â£ å©æï¼é¸å¡«ï¼</label>
                        <select value={slot.assistant_teacher_id || ''} onChange={e => upd('assistant_teacher_id', e.target.value || null)}
                            className="w-full p-3 border rounded-xl font-bold text-sm bg-gray-50">
                            <option value="">â ä¸éå©æ â</option>
                            {assistOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                )}

                {/* ææ & æé */}
                <div>
                    <label className="text-xs font-black text-gray-400 block mb-1.5">â¤ ææ ï¼ æé</label>
                    <div className="grid grid-cols-2 gap-3">
                        <select value={slot.day_of_week || ''} onChange={e => upd('day_of_week', Number(e.target.value))}
                            className="p-3 border rounded-xl font-bold text-sm bg-gray-50">
                            <option value="">â é¸ææ â</option>
                            {availDays.map((d, i) => (
                                <option key={d} value={d}>{DAYS[d - 1]}</option>
                            ))}
                        </select>
                        <select value={slot.start_time || ''} onChange={e => upd('start_time', e.target.value)}
                            className="p-3 border rounded-xl font-bold text-sm bg-gray-50">
                            <option value="">â éå§æé â</option>
                            {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <select value={slot.end_time || ''} onChange={e => upd('end_time', e.target.value || null)}
                        className="w-full mt-2 p-3 border rounded-xl font-bold text-sm bg-gray-50">
                        <option value="">çµææéï¼é¸å¡«ï¼</option>
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>

                {/* åè¨» */}
                <div>
                    <label className="text-xs font-black text-gray-400 block mb-1.5">åè¨»ï¼é¸å¡«ï¼</label>
                    <input value={slot.note || ''} onChange={e => upd('note', e.target.value)}
                        placeholder="ä¾ï¼è CEI-B åç­"
                        className="w-full px-3 py-2 border rounded-xl text-sm font-bold bg-gray-50" />
                </div>

                <div className="flex gap-3 pt-2">
                    <button onClick={onSave} disabled={saving}
                        className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl transition disabled:opacity-50">
                        {saving ? 'å²å­ä¸­...' : 'â ç¢ºèªæ°å¢'}
                    </button>
                    <button onClick={onClose}
                        className="px-5 py-3 bg-gray-100 text-gray-500 font-bold rounded-xl hover:bg-gray-200 transition">
                        åæ¶
                    </button>
                </div>
            </div>
        </Modal>
    );
}

// ââ Generic Modal Wrapper âââââââââââââââââââââââââââââââââââââââââââââââââââââ
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
