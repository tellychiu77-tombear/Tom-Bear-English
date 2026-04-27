'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

const BRAND = '#E8695A';

type CourseSession = {
    id: string;
    class_group: string;
    date: string;
    topic: string;
    content: string | null;
    homework: string | null;
    homework_due: string | null;
    teacher_id: string | null;
    created_at: string;
    teacher?: { name: string };
};

type StudentProgressNote = {
    id: string;
    session_id: string;
    student_id: string;
    homework_status: 'completed' | 'incomplete' | 'pending';
    note: string | null;
    student?: { chinese_name: string; grade: string };
};

type Student = {
    id: string;
    chinese_name: string;
    grade: string;
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    completed:  { label: '已完成', color: 'bg-green-100 text-green-700' },
    incomplete: { label: '未完成', color: 'bg-red-100 text-red-600' },
    pending:    { label: '待確認', color: 'bg-gray-100 text-gray-500' },
};

export default function ProgressPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);

    // Data
    const [sessions, setSessions] = useState<CourseSession[]>([]);
    const [myClass, setMyClass] = useState<string>('');            // parent's child class
    const [classes, setClasses] = useState<string[]>([]);          // admin: all classes
    const [selectedClass, setSelectedClass] = useState<string>(''); // admin filter
    const [classStudents, setClassStudents] = useState<Student[]>([]); // teacher: students in expanded session

    // Teacher assigned classes
    const [teacherClasses, setTeacherClasses] = useState<string[]>([]);

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [editingSession, setEditingSession] = useState<CourseSession | null>(null);
    const [form, setForm] = useState({
        class_group: '',
        date: new Date().toISOString().split('T')[0],
        topic: '',
        content: '',
        homework: '',
        homework_due: '',
    });
    const [formLoading, setFormLoading] = useState(false);

    // Expanded rows (teacher: show student progress)
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [progressNotes, setProgressNotes] = useState<StudentProgressNote[]>([]);
    const [progressLoading, setProgressLoading] = useState(false);

    // Toast
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => { init(); }, []);

    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        const { data: profile } = await supabase.from('users').select('*').eq('id', session.user.id).single();
        if (!profile) { router.push('/'); return; }
        setCurrentUser(profile);

        const role = profile.role as string;

        if (role === 'parent') {
            // Get child's class
            const { data: kids } = await supabase.from('students').select('grade').eq('parent_id', session.user.id).limit(1);
            const childClass = kids?.[0]?.grade ?? '';
            setMyClass(childClass);
            if (childClass) {
                await fetchSessions(childClass);
            }
        } else if (role === 'teacher') {
            // Get teacher's assigned classes
            const { data: assigns } = await supabase
                .from('teacher_assignments')
                .select('class_group')
                .eq('teacher_id', session.user.id);
            const tc = assigns ? Array.from(new Set(assigns.map((a: any) => a.class_group))) : [];
            setTeacherClasses(tc as string[]);
            const defaultClass = tc[0] ?? '';
            setSelectedClass(defaultClass);
            if (defaultClass) {
                await fetchSessions(defaultClass);
                // pre-fill form
                setForm(prev => ({ ...prev, class_group: defaultClass }));
            }
        } else {
            // admin/director/manager: fetch all classes
            const { data: allSessions } = await supabase
                .from('course_sessions')
                .select('class_group')
                .order('class_group');
            const { data: slotClasses } = await supabase
                .from('schedule_slots')
                .select('class_group')
                .order('class_group');
            const allClasses = Array.from(new Set([
                ...(allSessions?.map((s: any) => s.class_group) ?? []),
                ...(slotClasses?.map((s: any) => s.class_group) ?? []),
            ])).sort() as string[];
            setClasses(allClasses);
            const firstClass = allClasses[0] ?? '';
            setSelectedClass(firstClass);
            if (firstClass) {
                await fetchSessions(firstClass);
            }
        }

        setLoading(false);
    }

    async function fetchSessions(classGroup: string) {
        if (!classGroup) { setSessions([]); return; }
        const { data, error } = await supabase
            .from('course_sessions')
            .select('*, teacher:users(name)')
            .eq('class_group', classGroup)
            .order('date', { ascending: false });
        if (error) { showToast('載入失敗: ' + error.message, 'error'); return; }
        setSessions((data as any[]) ?? []);
    }

    async function fetchProgressNotes(sessionId: string) {
        setProgressLoading(true);
        const { data: notes } = await supabase
            .from('student_progress_notes')
            .select('*, student:students(chinese_name, grade)')
            .eq('session_id', sessionId);

        // Also get all students in this class for the session
        const sess = sessions.find(s => s.id === sessionId);
        if (sess) {
            const { data: studs } = await supabase
                .from('students')
                .select('id, chinese_name, grade')
                .eq('grade', sess.class_group);
            setClassStudents(studs ?? []);
        }
        setProgressNotes((notes as any[]) ?? []);
        setProgressLoading(false);
    }

    async function handleSaveSession(e: React.FormEvent) {
        e.preventDefault();
        if (!form.class_group || !form.date || !form.topic) {
            showToast('請填寫班級、日期、主題', 'error');
            return;
        }
        setFormLoading(true);
        const payload = {
            class_group: form.class_group,
            date: form.date,
            topic: form.topic,
            content: form.content || null,
            homework: form.homework || null,
            homework_due: form.homework_due || null,
            teacher_id: currentUser?.id ?? null,
            updated_at: new Date().toISOString(),
        };

        let error;
        if (editingSession) {
            ({ error } = await supabase.from('course_sessions').update(payload).eq('id', editingSession.id));
        } else {
            ({ error } = await supabase.from('course_sessions').insert(payload));
        }

        if (error) {
            showToast('儲存失敗: ' + error.message, 'error');
        } else {
            showToast(editingSession ? '已更新課程記錄' : '課程記錄已新增');
            setShowForm(false);
            setEditingSession(null);
            resetForm();
            await fetchSessions(form.class_group);
        }
        setFormLoading(false);
    }

    async function handleDeleteSession(id: string) {
        if (!confirm('確定刪除此課程記錄？')) return;
        const { error } = await supabase.from('course_sessions').delete().eq('id', id);
        if (error) showToast('刪除失敗', 'error');
        else {
            showToast('已刪除');
            setSessions(prev => prev.filter(s => s.id !== id));
            if (expandedId === id) setExpandedId(null);
        }
    }

    async function handleSaveProgressNote(sessionId: string, studentId: string, status: string, note: string) {
        const { error } = await supabase
            .from('student_progress_notes')
            .upsert({
                session_id: sessionId,
                student_id: studentId,
                homework_status: status,
                note: note || null,
            }, { onConflict: 'session_id,student_id' });
        if (error) showToast('儲存失敗', 'error');
        else {
            showToast('作業狀態已儲存');
            await fetchProgressNotes(sessionId);
        }
    }

    function resetForm() {
        const defaultClass =
            currentUser?.role === 'teacher' ? (teacherClasses[0] ?? '') : selectedClass;
        setForm({
            class_group: defaultClass,
            date: new Date().toISOString().split('T')[0],
            topic: '',
            content: '',
            homework: '',
            homework_due: '',
        });
    }

    function startEdit(sess: CourseSession) {
        setEditingSession(sess);
        setForm({
            class_group: sess.class_group,
            date: sess.date,
            topic: sess.topic,
            content: sess.content ?? '',
            homework: sess.homework ?? '',
            homework_due: sess.homework_due ?? '',
        });
        setShowForm(true);
    }

    function toggleExpand(id: string) {
        if (expandedId === id) {
            setExpandedId(null);
        } else {
            setExpandedId(id);
            fetchProgressNotes(id);
        }
    }

    const role = currentUser?.role as string;
    const isTeacher = role === 'teacher';
    const isParent = role === 'parent';
    const isAdmin = ['director', 'english_director', 'care_director', 'admin', 'manager'].includes(role);

    // For parent: find child's progress note on each session
    async function getChildNote(sessionId: string, childId: string): Promise<StudentProgressNote | null> {
        const { data } = await supabase
            .from('student_progress_notes')
            .select('*')
            .eq('session_id', sessionId)
            .eq('student_id', childId)
            .single();
        return data ?? null;
    }

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 animate-pulse">
            載入中...
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 pb-12">
            {/* Header */}
            <div className="bg-white border-b shadow-sm sticky top-0 z-20">
                <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">📖</span>
                        <div>
                            <h1 className="font-black text-gray-800 text-lg leading-tight">課程進度追蹤</h1>
                            <p className="text-xs text-gray-400">
                                {isParent ? `${myClass} 班` : isTeacher ? '老師工作台' : '管理員總覽'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => router.push('/')}
                        className="text-sm text-gray-500 hover:text-gray-800 font-bold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
                    >
                        ← 回首頁
                    </button>
                </div>
            </div>

            <div className="max-w-6xl mx-auto p-4 space-y-5">

                {/* Admin: class picker */}
                {(isAdmin) && (
                    <div className="flex items-center gap-3 bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                        <span className="text-sm font-bold text-gray-600">選擇班級：</span>
                        <select
                            className="flex-1 md:flex-none border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-700 focus:outline-none focus:ring-2"
                            style={{ '--tw-ring-color': BRAND } as any}
                            value={selectedClass}
                            onChange={async e => {
                                setSelectedClass(e.target.value);
                                setExpandedId(null);
                                await fetchSessions(e.target.value);
                            }}
                        >
                            <option value="">-- 選擇班級 --</option>
                            {classes.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Teacher: class picker (if multiple) + Add button */}
                {isTeacher && (
                    <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
                        {teacherClasses.length > 1 && (
                            <div className="flex items-center gap-2 bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                                <span className="text-sm font-bold text-gray-600">班級：</span>
                                <select
                                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-700 focus:outline-none focus:ring-2"
                                    value={selectedClass}
                                    onChange={async e => {
                                        setSelectedClass(e.target.value);
                                        setForm(prev => ({ ...prev, class_group: e.target.value }));
                                        setExpandedId(null);
                                        await fetchSessions(e.target.value);
                                    }}
                                >
                                    {teacherClasses.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <button
                            onClick={() => {
                                setEditingSession(null);
                                resetForm();
                                setShowForm(true);
                            }}
                            className="px-5 py-2.5 text-white font-bold rounded-xl shadow-sm transition hover:opacity-90"
                            style={{ backgroundColor: BRAND }}
                        >
                            ＋ 新增課程記錄
                        </button>
                    </div>
                )}

                {/* Two-column layout for teacher */}
                {isTeacher ? (
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                        {/* Left: session list */}
                        <div className="lg:col-span-3 space-y-4">
                            <h2 className="font-black text-gray-700 text-base flex items-center gap-2">
                                <span className="w-1 h-5 rounded" style={{ backgroundColor: BRAND, display: 'inline-block' }}></span>
                                課程記錄列表
                                <span className="text-xs text-gray-400 font-normal">（共 {sessions.length} 筆）</span>
                            </h2>
                            {sessions.length === 0 ? (
                                <EmptyState title="尚無課程記錄" sub="點選右側「新增課程記錄」開始建立" />
                            ) : (
                                sessions.map(sess => (
                                    <TeacherSessionCard
                                        key={sess.id}
                                        sess={sess}
                                        expanded={expandedId === sess.id}
                                        progressNotes={progressNotes}
                                        classStudents={classStudents}
                                        progressLoading={progressLoading}
                                        onToggle={() => toggleExpand(sess.id)}
                                        onEdit={() => startEdit(sess)}
                                        onDelete={() => handleDeleteSession(sess.id)}
                                        onSaveNote={handleSaveProgressNote}
                                    />
                                ))
                            )}
                        </div>

                        {/* Right: form */}
                        <div className="lg:col-span-2">
                            {showForm ? (
                                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden sticky top-20">
                                    <div className="p-4 text-white font-black text-base flex justify-between items-center" style={{ backgroundColor: BRAND }}>
                                        <span>{editingSession ? '✏️ 編輯課程記錄' : '➕ 新增課程記錄'}</span>
                                        <button
                                            onClick={() => { setShowForm(false); setEditingSession(null); resetForm(); }}
                                            className="bg-white/20 hover:bg-white/30 rounded-full w-7 h-7 flex items-center justify-center text-sm"
                                        >✕</button>
                                    </div>
                                    <form onSubmit={handleSaveSession} className="p-5 space-y-4">
                                        {/* Class */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">班級 *</label>
                                            {teacherClasses.length === 1 ? (
                                                <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm font-bold text-gray-700 border border-gray-100">{form.class_group}</div>
                                            ) : (
                                                <select
                                                    required
                                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-700 focus:outline-none focus:ring-2"
                                                    value={form.class_group}
                                                    onChange={e => setForm(prev => ({ ...prev, class_group: e.target.value }))}
                                                >
                                                    <option value="">-- 選班級 --</option>
                                                    {teacherClasses.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            )}
                                        </div>
                                        {/* Date */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">上課日期 *</label>
                                            <input
                                                type="date" required
                                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-700 focus:outline-none focus:ring-2"
                                                value={form.date}
                                                onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
                                            />
                                        </div>
                                        {/* Topic */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">教學主題 *</label>
                                            <input
                                                type="text" required maxLength={100}
                                                placeholder="本節課主題"
                                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-700 focus:outline-none focus:ring-2"
                                                value={form.topic}
                                                onChange={e => setForm(prev => ({ ...prev, topic: e.target.value }))}
                                            />
                                        </div>
                                        {/* Content */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">教學內容摘要</label>
                                            <textarea
                                                rows={3}
                                                placeholder="本節教學重點..."
                                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 resize-none"
                                                value={form.content}
                                                onChange={e => setForm(prev => ({ ...prev, content: e.target.value }))}
                                            />
                                        </div>
                                        {/* Homework */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">作業內容</label>
                                            <textarea
                                                rows={2}
                                                placeholder="作業說明..."
                                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 resize-none"
                                                value={form.homework}
                                                onChange={e => setForm(prev => ({ ...prev, homework: e.target.value }))}
                                            />
                                        </div>
                                        {/* Due */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">作業截止日</label>
                                            <input
                                                type="date"
                                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2"
                                                value={form.homework_due}
                                                onChange={e => setForm(prev => ({ ...prev, homework_due: e.target.value }))}
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={formLoading}
                                            className="w-full py-3 text-white font-black rounded-xl transition hover:opacity-90 disabled:opacity-50"
                                            style={{ backgroundColor: BRAND }}
                                        >
                                            {formLoading ? '儲存中...' : editingSession ? '更新記錄' : '儲存課程記錄'}
                                        </button>
                                    </form>
                                </div>
                            ) : (
                                <div className="bg-white rounded-2xl shadow-sm border-2 border-dashed border-gray-200 p-10 text-center text-gray-400 sticky top-20">
                                    <div className="text-5xl mb-3 opacity-40">📖</div>
                                    <p className="font-bold text-sm">點選「新增課程記錄」</p>
                                    <p className="text-xs mt-1">或點選左側記錄的✏️編輯</p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : isParent ? (
                    <ParentView
                        sessions={sessions}
                        myClass={myClass}
                        currentUserId={currentUser?.id}
                    />
                ) : (
                    // Admin view
                    <div className="space-y-4">
                        <h2 className="font-black text-gray-700 text-base flex items-center gap-2">
                            <span className="w-1 h-5 rounded inline-block" style={{ backgroundColor: BRAND }}></span>
                            {selectedClass ? `${selectedClass} 班課程記錄` : '請選擇班級'}
                            <span className="text-xs text-gray-400 font-normal">（共 {sessions.length} 筆）</span>
                        </h2>
                        {!selectedClass ? (
                            <EmptyState title="請先選擇班級" sub="使用上方下拉選單選擇班級" />
                        ) : sessions.length === 0 ? (
                            <EmptyState title="此班尚無課程記錄" sub="老師尚未建立課程記錄" />
                        ) : (
                            sessions.map(sess => (
                                <AdminSessionCard key={sess.id} sess={sess} />
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Toast */}
            {toast && (
                <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-white font-bold transition-all ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
                    {toast.msg}
                </div>
            )}
        </div>
    );
}

// ---- Teacher Session Card ----
function TeacherSessionCard({
    sess,
    expanded,
    progressNotes,
    classStudents,
    progressLoading,
    onToggle,
    onEdit,
    onDelete,
    onSaveNote,
}: {
    sess: CourseSession;
    expanded: boolean;
    progressNotes: StudentProgressNote[];
    classStudents: Student[];
    progressLoading: boolean;
    onToggle: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onSaveNote: (sessionId: string, studentId: string, status: string, note: string) => Promise<void>;
}) {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4">
                <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: BRAND }}>
                                {sess.class_group}
                            </span>
                            <span className="text-xs text-gray-400">{sess.date}</span>
                        </div>
                        <h3 className="font-black text-gray-800 text-base truncate">{sess.topic}</h3>
                        {sess.content && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{sess.content}</p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button onClick={onEdit} className="text-xs font-bold text-indigo-500 hover:text-indigo-700 px-2 py-1 rounded hover:bg-indigo-50 transition">
                            ✏️
                        </button>
                        <button onClick={onDelete} className="text-xs font-bold text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition">
                            🗑️
                        </button>
                    </div>
                </div>

                {sess.homework && (
                    <div className="mt-3 bg-amber-50 rounded-lg px-3 py-2 flex items-start gap-2">
                        <span className="text-sm">📝</span>
                        <div>
                            <span className="text-xs font-bold text-amber-700">作業：</span>
                            <span className="text-xs text-amber-800">{sess.homework}</span>
                            {sess.homework_due && (
                                <span className="ml-2 text-xs text-amber-500">（截止：{sess.homework_due}）</span>
                            )}
                        </div>
                    </div>
                )}

                <button
                    onClick={onToggle}
                    className="mt-3 text-xs font-bold text-gray-500 hover:text-gray-800 flex items-center gap-1 transition"
                >
                    {expanded ? '▲ 收合學生進度' : '▼ 展開學生進度'}
                </button>
            </div>

            {expanded && (
                <div className="border-t border-gray-100 bg-gray-50/50 p-4">
                    {progressLoading ? (
                        <div className="text-center text-gray-400 text-sm py-4 animate-pulse">載入學生資料...</div>
                    ) : classStudents.length === 0 ? (
                        <div className="text-center text-gray-400 text-sm py-4">此班暫無學生資料</div>
                    ) : (
                        <div className="space-y-3">
                            {classStudents.map(stu => {
                                const note = progressNotes.find(n => n.student_id === stu.id);
                                return (
                                    <StudentProgressRow
                                        key={stu.id}
                                        student={stu}
                                        sessionId={sess.id}
                                        note={note}
                                        onSave={onSaveNote}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ---- Student Progress Row (inside expanded card) ----
function StudentProgressRow({
    student,
    sessionId,
    note,
    onSave,
}: {
    student: Student;
    sessionId: string;
    note?: StudentProgressNote;
    onSave: (sessionId: string, studentId: string, status: string, note: string) => Promise<void>;
}) {
    const [status, setStatus] = useState(note?.homework_status ?? 'pending');
    const [noteText, setNoteText] = useState(note?.note ?? '');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setStatus(note?.homework_status ?? 'pending');
        setNoteText(note?.note ?? '');
    }, [note]);

    async function save() {
        setSaving(true);
        await onSave(sessionId, student.id, status, noteText);
        setSaving(false);
    }

    return (
        <div className="bg-white rounded-xl p-3 border border-gray-100 flex flex-col md:flex-row gap-3 items-start md:items-center">
            <div className="w-24 shrink-0 font-bold text-sm text-gray-800">{student.chinese_name}</div>
            <div className="flex gap-1 flex-wrap shrink-0">
                {(['completed', 'incomplete', 'pending'] as const).map(s => (
                    <button
                        key={s}
                        onClick={() => setStatus(s)}
                        className={`px-2 py-0.5 rounded-full text-xs font-bold border transition ${
                            status === s
                                ? STATUS_LABELS[s].color + ' border-transparent'
                                : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
                        }`}
                    >
                        {STATUS_LABELS[s].label}
                    </button>
                ))}
            </div>
            <input
                type="text"
                placeholder="老師備注..."
                className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 min-w-0"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
            />
            <button
                onClick={save}
                disabled={saving}
                className="shrink-0 px-3 py-1.5 text-xs font-bold text-white rounded-lg transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: BRAND }}
            >
                {saving ? '...' : '儲存'}
            </button>
        </div>
    );
}

// ---- Parent View ----
function ParentView({
    sessions,
    myClass,
    currentUserId,
}: {
    sessions: CourseSession[];
    myClass: string;
    currentUserId: string;
}) {
    const [childId, setChildId] = useState<string | null>(null);
    const [noteMap, setNoteMap] = useState<Record<string, StudentProgressNote | null>>({});

    useEffect(() => {
        fetchChild();
    }, [currentUserId]);

    useEffect(() => {
        if (childId && sessions.length > 0) fetchNotes();
    }, [childId, sessions]);

    async function fetchChild() {
        const { data } = await supabase.from('students').select('id').eq('parent_id', currentUserId).limit(1);
        if (data?.[0]) setChildId(data[0].id);
    }

    async function fetchNotes() {
        if (!childId) return;
        const sessionIds = sessions.map(s => s.id);
        const { data } = await supabase
            .from('student_progress_notes')
            .select('*')
            .eq('student_id', childId)
            .in('session_id', sessionIds);
        const map: Record<string, StudentProgressNote | null> = {};
        sessions.forEach(s => {
            map[s.id] = (data ?? []).find((n: any) => n.session_id === s.id) ?? null;
        });
        setNoteMap(map);
    }

    if (!myClass) {
        return <EmptyState title="尚未綁定學生" sub="請聯絡行政人員完成家長綁定" />;
    }

    return (
        <div className="space-y-4">
            <h2 className="font-black text-gray-700 text-base flex items-center gap-2">
                <span className="w-1 h-5 rounded inline-block" style={{ backgroundColor: BRAND }}></span>
                {myClass} 班課程進度
                <span className="text-xs text-gray-400 font-normal">（共 {sessions.length} 筆）</span>
            </h2>
            {sessions.length === 0 ? (
                <EmptyState title="老師尚未建立課程記錄" sub="敬請期待" />
            ) : (
                sessions.map(sess => {
                    const note = noteMap[sess.id];
                    return (
                        <div key={sess.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: BRAND }}>
                                    {sess.class_group}
                                </span>
                                <span className="text-xs text-gray-400">{sess.date}</span>
                                {sess.teacher?.name && (
                                    <span className="text-xs text-gray-400">老師：{sess.teacher.name}</span>
                                )}
                            </div>
                            <h3 className="font-black text-gray-800 text-base">{sess.topic}</h3>
                            {sess.content && (
                                <p className="text-sm text-gray-600 mt-2 leading-relaxed">{sess.content}</p>
                            )}
                            {sess.homework && (
                                <div className="mt-3 bg-amber-50 rounded-xl px-4 py-3">
                                    <div className="flex items-start gap-2">
                                        <span className="text-sm shrink-0">📝</span>
                                        <div>
                                            <p className="text-xs font-bold text-amber-700 mb-0.5">作業</p>
                                            <p className="text-sm text-amber-900">{sess.homework}</p>
                                            {sess.homework_due && (
                                                <p className="text-xs text-amber-500 mt-1">截止日：{sess.homework_due}</p>
                                            )}
                                        </div>
                                    </div>
                                    {/* Child status */}
                                    {note && (
                                        <div className="mt-2 flex items-center gap-2">
                                            <span className="text-xs text-gray-500">孩子狀態：</span>
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_LABELS[note.homework_status]?.color ?? ''}`}>
                                                {STATUS_LABELS[note.homework_status]?.label ?? note.homework_status}
                                            </span>
                                            {note.note && (
                                                <span className="text-xs text-gray-500">— {note.note}</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
}

// ---- Admin Session Card ----
function AdminSessionCard({ sess }: { sess: CourseSession }) {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: BRAND }}>
                    {sess.class_group}
                </span>
                <span className="text-xs text-gray-400">{sess.date}</span>
                {sess.teacher?.name && (
                    <span className="text-xs text-gray-400">老師：{sess.teacher.name}</span>
                )}
            </div>
            <h3 className="font-black text-gray-800 text-base">{sess.topic}</h3>
            {sess.content && (
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">{sess.content}</p>
            )}
            {sess.homework && (
                <div className="mt-3 bg-amber-50 rounded-xl px-4 py-3">
                    <div className="flex items-start gap-2">
                        <span className="text-sm shrink-0">📝</span>
                        <div>
                            <p className="text-xs font-bold text-amber-700 mb-0.5">作業</p>
                            <p className="text-sm text-amber-900">{sess.homework}</p>
                            {sess.homework_due && (
                                <p className="text-xs text-amber-500 mt-1">截止日：{sess.homework_due}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ---- Shared ----
function EmptyState({ title, sub }: { title: string; sub: string }) {
    return (
        <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
            <div className="text-5xl mb-4 opacity-40">📭</div>
            <h3 className="text-base font-black text-gray-400">{title}</h3>
            <p className="text-sm text-gray-300 mt-1">{sub}</p>
        </div>
    );
}
