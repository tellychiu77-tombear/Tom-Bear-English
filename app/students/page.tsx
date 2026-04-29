'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { getEffectivePermissions } from '../../lib/permissions';
import { useToast, TOAST_CLASSES } from '../../lib/useToast';

// ââ å¸¸æ¸ ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

const LEVEL_OPTIONS = [
    "Let's Go 1", "Let's Go 2", "Let's Go 3",
    "Let's Go 4", "Let's Go 5", "Let's Go 6",
    'Smart Choice 1', 'Smart Choice 2', 'Smart Choice 3+',
    'Beginner', 'å¾è©ä¼°'
];

const STRENGTH_TAGS = [
    'èªç¶ç¼é³', 'å­å½éè±å¯', 'é±è®çè§£å¼·', 'å£èªè¡¨éä½³',
    'ä¸»ååè', 'ææ³ææ¡å¥½', 'è½åä½³', 'æ¸å¯«å·¥æ´',
    'å­¸ç¿åæ©é«', 'è¨æ¶åå¥½', 'ä¸èª²å°æ³¨', 'åæ­¡é±è®'
];

const IMPROVEMENT_TAGS = [
    'ç¼é³éå å¼·', 'å­å½éä¸è¶³', 'é±è®éå å¼·', 'å£èªéç·´ç¿',
    'è¼è¢«å', 'ææ³é¯èª¤å¤', 'è½åéå å¼·', 'æ¸å¯«éå å¼·',
    'æ³¨æåä¸éä¸­', 'ä½æ¥­å®æçä½', 'å®¹æåå¿', 'æç·ç®¡çéå å¼·'
];

const ENGLISH_CLASS_OPTIONS = [
    { value: 'NONE', label: 'â ç¡è±æä¸»ä¿® (ç´å®è¦ª/èª²è¼)' },
    ...Array.from({ length: 26 }, (_, i) => ({
        value: `CEI-${String.fromCharCode(65 + i)}`,
        label: `CEI-${String.fromCharCode(65 + i)}`
    }))
];

const SCHOOL_GRADE_OPTIONS = [
    'åå° ä¸å¹´ç´', 'åå° äºå¹´ç´', 'åå° ä¸å¹´ç´',
    'åå° åå¹´ç´', 'åå° äºå¹´ç´', 'åå° å­å¹´ç´',
    'åä¸­ ä¸å¹´ç´', 'åä¸­ å«å¹´ç´', 'åä¸­ ä¹å¹´ç´'
];

// ââ ä¸»é é¢ ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

const PAGE_SIZE = 30;

export default function StudentsPage() {
    const router = useRouter();
    const [students, setStudents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterClass, setFilterClass] = useState('');
    const [canEditStudents, setCanEditStudents] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [isTeacherView, setIsTeacherView] = useState(false);
    const [teacherClasses, setTeacherClasses] = useState<string[]>([]);
    const [noClassTeacher, setNoClassTeacher] = useState(false);

    // åè¡¨é¸ä¸­çå­¸ç â éå Profile Modal
    const [profileStudent, setProfileStudent] = useState<any>(null);
    const [profileTab, setProfileTab] = useState<'basic' | 'learning' | 'analytics'>('basic');

    // æ°å¢ Modal
    const [addModalOpen, setAddModalOpen] = useState(false);
    const { toast, showToast } = useToast();

    useEffect(() => { checkPermissionAndFetch(); }, []);

    // Reset to page 1 when filter changes
    useEffect(() => { setCurrentPage(1); }, [filterClass]);

    async function checkPermissionAndFetch() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }
        const { data: userData } = await supabase.from('users').select('id, role, extra_permissions').eq('id', session.user.id).single();
        if (!userData) { router.push('/'); return; }

        if (userData.role === 'teacher') {
            // èå¸«ï¼æ¥è©¢è² è²¬ç­ç´ï¼åªé¡¯ç¤ºèªå·±ç­çå­¸ç
            const { data: assignments } = await supabase
                .from('teacher_assignments')
                .select('class_group')
                .eq('teacher_id', userData.id);
            const classes = [...new Set((assignments || []).map((a: any) => a.class_group as string))];
            setTeacherClasses(classes);
            setIsTeacherView(true);
            setCanEditStudents(false);
            if (classes.length === 0) {
                // å°æªåéç­ç´çèå¸«ï¼ä¸é¡¯ç¤ºå­¸çï¼é¡¯ç¤ºæç¤ºè¨æ¯
                setNoClassTeacher(true);
                setLoading(false);
                return;
            }
            fetchStudents(classes);
            return;
        }

        const { data: roleConfigRow } = await supabase.from('role_configs').select('permissions').eq('role', userData.role).single();
        const perms = getEffectivePermissions(userData.role, roleConfigRow?.permissions ?? null, userData.extra_permissions ?? null);
        if (!perms.viewAllStudents) { router.push('/'); return; }
        setCanEditStudents(perms.editStudents);
        fetchStudents([]);
    }

    async function fetchStudents(teacherClassFilter: string[] = []) {
        setLoading(true);
        let query = supabase
            .from('students')
            .select(`*, parent:users!parent_id(email), parent2:users!parent_id_2(email)`)
            .order('grade').order('chinese_name');

        if (teacherClassFilter.length > 0) {
            // ç¨ OR éæ¿¾ï¼grade æ¬ä½åå«ä»»ä¸èå¸«è² è²¬ç­ç´
            const filterStr = teacherClassFilter.map(c => `grade.ilike.%${c}%`).join(',');
            query = (query as any).or(filterStr);
        }

        const { data, error } = await query;
        if (error) console.error(error);
        else setStudents(data || []);
        setLoading(false);
    }

    function openProfile(s: any, tab: 'basic' | 'learning' | 'analytics' = 'basic') {
        setProfileStudent(s);
        setProfileTab(tab);
    }

    const filteredStudents = filterClass
        ? students.filter(s => s.grade?.includes(filterClass))
        : students;

    const uniqueClasses = Array.from(new Set(students.map(s => s.grade))).filter(Boolean).sort() as string[];

    const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
    const paginatedStudents = filteredStudents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    if (loading) return <div className="p-10 text-center font-bold text-gray-400">è¼å¥ä¸­...</div>;

    if (noClassTeacher) return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 text-center p-8">
            <div className="text-6xl">ð«</div>
            <h2 className="text-2xl font-black text-gray-700">å°æªè¢«åéç­ç´</h2>
            <p className="text-gray-500 font-medium max-w-sm">æ¨ç®åæ²æè² è²¬çç­ç´ï¼è«è¯çµ¡ç®¡çå¡çºæ¨è¨­å®ç­ç´ææ´¾å¾ï¼åæ¥çå­¸çè³æã</p>
            <button onClick={() => router.push('/')} className="mt-2 px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition">
                è¿åé¦é 
            </button>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50">
            {toast && (
                <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-white font-bold text-sm ${TOAST_CLASSES[toast.type]}`}>
                    {toast.msg}
                </div>
            )}
            {/* èå¸«è¦è§æç¤ºæ©«æ¢ */}
            {isTeacherView && !noClassTeacher && (
                <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-center text-sm font-bold text-blue-700">
                    ð©âð« èå¸«è¦è§ï¼åé¡¯ç¤ºæ¨è² è²¬ç­ç´ï¼{teacherClasses.join('ã')}ï¼çå­¸ç
                </div>
            )}
            {/* Header */}
            <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <button onClick={() => router.push('/')} className="text-gray-400 hover:text-gray-600 font-bold text-sm">â é¦é </button>
                        <h1 className="text-xl font-black text-gray-800">ð å­¸çè³æåº«</h1>
                        <span className="text-xs text-gray-400 font-bold bg-gray-100 px-2 py-0.5 rounded-full">{filteredStudents.length} ä½</span>
                    </div>
                    <div className="flex gap-2">
                        <select value={filterClass} onChange={e => setFilterClass(e.target.value)}
                            className="p-2 border border-gray-200 rounded-lg font-bold text-sm text-gray-700 outline-none bg-white">
                            <option value="">ð« å¨é¨ç­ç´</option>
                            {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        {canEditStudents && (
                            <button onClick={() => setAddModalOpen(true)}
                                className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow hover:bg-indigo-700 transition">
                                + æ°å¢å­¸ç
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="max-w-7xl mx-auto p-4">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="p-4 text-xs font-black text-gray-400 uppercase">å­¸ç</th>
                                <th className="p-4 text-xs font-black text-gray-400 uppercase">ç­ç´ / ç¨åº¦</th>
                                <th className="p-4 text-xs font-black text-gray-400 uppercase">å®¶é·çæ</th>
                                <th className="p-4 text-xs font-black text-gray-400 uppercase">å­¸ç¿æ¨ç±¤</th>
                                <th className="p-4 text-right text-xs font-black text-gray-400 uppercase">æä½</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {paginatedStudents.map(s => (
                                <tr key={s.id} className="hover:bg-indigo-50/30 transition cursor-pointer group"
                                    onClick={() => openProfile(s, 'basic')}>
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            {s.photo_url ? (
                                                <img src={s.photo_url} className="w-10 h-10 rounded-full object-cover border-2 border-white shadow" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-lg shadow-sm">
                                                    {s.chinese_name?.[0]}
                                                </div>
                                            )}
                                            <div>
                                                <div className="font-bold text-gray-800">{s.chinese_name}</div>
                                                <div className="text-xs text-gray-400">{s.english_name || 'æªè¨­è±æå'}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex flex-col gap-1">
                                            {s.grade && s.grade.split(',').map((g: string, i: number) => (
                                                <span key={i} className={`px-2 py-0.5 rounded text-[11px] font-black border inline-block w-fit
                                                    ${g.includes('èª²å¾è¼å°') ? 'bg-orange-50 text-orange-600 border-orange-100'
                                                        : g.includes('CEI') ? 'bg-indigo-50 text-indigo-600 border-indigo-100'
                                                            : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                                    {g.trim()}
                                                </span>
                                            ))}
                                            {s.level && (
                                                <span className="text-xs text-purple-600 font-bold">ð {s.level}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        {s.parent
                                            ? <span className="text-green-600 text-xs font-bold">â å·²ç¶å®</span>
                                            : <span className="text-gray-300 text-xs font-bold">â æªç¶å®</span>
                                        }
                                    </td>
                                    <td className="p-4">
                                        <div className="flex flex-wrap gap-1">
                                            {(s.strength_tags || []).slice(0, 2).map((t: string) => (
                                                <span key={t} className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">â¦ {t}</span>
                                            ))}
                                            {(s.improvement_tags || []).slice(0, 1).map((t: string) => (
                                                <span key={t} className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">â³ {t}</span>
                                            ))}
                                            {((s.strength_tags || []).length + (s.improvement_tags || []).length) > 3 && (
                                                <span className="text-[10px] text-gray-400 font-bold">+{((s.strength_tags || []).length + (s.improvement_tags || []).length) - 3}</span>
                                            )}
                                            {!(s.strength_tags?.length) && !(s.improvement_tags?.length) && (
                                                <span className="text-[10px] text-gray-300">å°æªè¨­å®</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 text-right" onClick={e => e.stopPropagation()}>
                                        <button onClick={() => openProfile(s, 'analytics')}
                                            className="text-purple-500 hover:bg-purple-50 px-2 py-1 rounded font-bold text-xs transition mr-1">
                                            ð
                                        </button>
                                        <button onClick={() => openProfile(s, 'learning')}
                                            className="text-teal-500 hover:bg-teal-50 px-2 py-1 rounded font-bold text-xs transition mr-1">
                                            ð
                                        </button>
                                        <button onClick={() => openProfile(s, 'basic')}
                                            className="text-indigo-600 hover:bg-indigo-50 px-3 py-1 rounded font-bold text-xs transition">
                                            {canEditStudents ? 'ç·¨è¼¯' : 'æ¥ç'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredStudents.length === 0 && (
                        <div className="p-16 text-center text-gray-300 font-bold">å°ç¡å­¸çè³æ</div>
                    )}
                </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="max-w-7xl mx-auto px-4 pb-4 flex items-center justify-between">
                    <span className="text-xs text-gray-400 font-bold">
                        é¡¯ç¤º {(currentPage - 1) * PAGE_SIZE + 1}â{Math.min(currentPage * PAGE_SIZE, filteredStudents.length)} ä½ï¼å± {filteredStudents.length} ä½
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1.5 rounded-lg border text-sm font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition">
                            â ä¸ä¸é 
                        </button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                            <button key={page}
                                onClick={() => setCurrentPage(page)}
                                className={`w-8 h-8 rounded-lg text-xs font-black transition
                                    ${page === currentPage ? 'bg-indigo-600 text-white shadow' : 'border text-gray-500 hover:bg-gray-100'}`}>
                                {page}
                            </button>
                        ))}
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1.5 rounded-lg border text-sm font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition">
                            ä¸ä¸é  â
                        </button>
                    </div>
                </div>
            )}

            {/* Profile Modal */}
            {profileStudent && (
                <StudentProfileModal
                    student={profileStudent}
                    activeTab={profileTab}
                    onTabChange={setProfileTab}
                    canEdit={canEditStudents}
                    onClose={() => setProfileStudent(null)}
                    onSaved={() => { fetchStudents(); }}
                    showToast={showToast}
                />
            )}

            {/* Add Modal */}
            {addModalOpen && (
                <AddStudentModal
                    onClose={() => setAddModalOpen(false)}
                    onSaved={fetchStudents}
                    showToast={showToast}
                />
            )}
        </div>
    );
}

// ââ Student Profile Modal (3 tabs) ââââââââââââââââââââââââââââââââââââââââââââ

function StudentProfileModal({ student, activeTab, onTabChange, canEdit, onClose, onSaved, showToast }: any) {
    // Basic info state
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);

    function parseGradeToForm(fullGrade: string) {
        if (!fullGrade) return { eng: 'CEI-A', after: false };
        const hasAfterSchool = fullGrade.includes('èª²å¾è¼å°');
        let engClass = fullGrade.replace(', èª²å¾è¼å°', '').replace('èª²å¾è¼å°', '').trim();
        if (engClass.endsWith(',')) engClass = engClass.slice(0, -1).trim();
        if (!engClass || engClass === 'æªåé¡') engClass = 'NONE';
        return { eng: engClass || 'CEI-A', after: hasAfterSchool };
    }

    function combineFormToGrade(eng: string, after: boolean) {
        if (eng === 'NONE' && after) return 'èª²å¾è¼å°';
        if (eng === 'NONE' && !after) return 'æªåé¡';
        if (after) return `${eng}, èª²å¾è¼å°`;
        return eng;
    }

    const { eng: initEng, after: initAfter } = parseGradeToForm(student.grade);

    const [basicForm, setBasicForm] = useState({
        chinese_name: student.chinese_name || '',
        english_name: student.english_name || '',
        birthday: student.birthday || '',
        school_grade: student.school_grade || 'åå° ä¸å¹´ç´',
        english_class: initEng,
        is_after_school: initAfter,
        parent_email: student.parent?.email || '',
        parent_relationship: student.parent_relationship || '',
        parent_phone: student.parent_phone || '',
        parent_2_email: student.parent2?.email || '',
        parent_2_relationship: student.parent_2_relationship || '',
        parent_2_phone: student.parent_2_phone || '',
        pickup_method: student.pickup_method || 'å®¶é·æ¥é',
        allergies: student.allergies || '',
        special_needs: student.special_needs || '',
        internal_note: student.internal_note || '',
        photo_url: student.photo_url || ''
    });

    const [learningForm, setLearningForm] = useState({
        level: student.level || '',
        join_date: student.join_date || '',
        learning_goal: student.learning_goal || '',
        strength_tags: student.strength_tags || [],
        improvement_tags: student.improvement_tags || [],
        teacher_assessment: student.teacher_assessment || ''
    });

    const [customStrengthInput, setCustomStrengthInput] = useState('');
    const [customImprovementInput, setCustomImprovementInput] = useState('');

    function addCustomTag(field: 'strength_tags' | 'improvement_tags', input: string, clearFn: () => void) {
        const trimmed = input.trim();
        if (!trimmed) return;
        setLearningForm(f => {
            const arr = f[field] as string[];
            if (arr.includes(trimmed)) return f;
            return { ...f, [field]: [...arr, trimmed] };
        });
        clearFn();
    }

    function removeTag(field: 'strength_tags' | 'improvement_tags', tag: string) {
        setLearningForm(f => ({ ...f, [field]: (f[field] as string[]).filter((t: string) => t !== tag) }));
    }

    async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const fileName = `avatars/${Date.now()}_${file.name}`;
            const { error } = await supabase.storage.from('contact_photos').upload(fileName, file);
            if (error) throw error;
            const { data } = supabase.storage.from('contact_photos').getPublicUrl(fileName);
            setBasicForm(f => ({ ...f, photo_url: data.publicUrl }));
        } catch (err: any) { showToast('ä¸å³å¤±æ: ' + err.message, 'error'); }
        finally { setUploading(false); }
    }

    async function saveBasic() {
        setSaving(true);
        try {
            let p1_id = null;
            if (basicForm.parent_email) {
                const { data } = await supabase.from('users').select('id').eq('email', basicForm.parent_email).single();
                if (data) p1_id = data.id;
            }
            let p2_id = null;
            if (basicForm.parent_2_email) {
                const { data } = await supabase.from('users').select('id').eq('email', basicForm.parent_2_email).single();
                if (data) p2_id = data.id;
            }
            const finalGrade = combineFormToGrade(basicForm.english_class, basicForm.is_after_school);
            const { error } = await supabase.from('students').update({
                chinese_name: basicForm.chinese_name, english_name: basicForm.english_name,
                grade: finalGrade, school_grade: basicForm.school_grade,
                birthday: basicForm.birthday || null, pickup_method: basicForm.pickup_method,
                allergies: basicForm.allergies, special_needs: basicForm.special_needs,
                internal_note: basicForm.internal_note, photo_url: basicForm.photo_url,
                parent_id: p1_id, parent_relationship: basicForm.parent_relationship,
                parent_phone: basicForm.parent_phone, parent_id_2: p2_id,
                parent_2_relationship: basicForm.parent_2_relationship, parent_2_phone: basicForm.parent_2_phone
            }).eq('id', student.id);
            if (error) throw error;
            onSaved();
            showToast('â åºæ¬è³æå·²å²å­');
        } catch (e: any) { showToast('â å¤±æ: ' + e.message, 'error'); }
        finally { setSaving(false); }
    }

    async function saveLearning() {
        setSaving(true);
        try {
            const { error } = await supabase.from('students').update({
                level: learningForm.level || null,
                join_date: learningForm.join_date || null,
                learning_goal: learningForm.learning_goal,
                strength_tags: learningForm.strength_tags,
                improvement_tags: learningForm.improvement_tags,
                teacher_assessment: learningForm.teacher_assessment
            }).eq('id', student.id);
            if (error) throw error;
            onSaved();
            showToast('â å­¸ç¿æªæ¡å·²å²å­');
        } catch (e: any) { showToast('â å¤±æ: ' + e.message, 'error'); }
        finally { setSaving(false); }
    }

    function toggleTag(field: 'strength_tags' | 'improvement_tags', tag: string) {
        setLearningForm(f => {
            const arr = f[field] as string[];
            return { ...f, [field]: arr.includes(tag) ? arr.filter((t: string) => t !== tag) : [...arr, tag] };
        });
    }

    const TABS = [
        { id: 'basic', label: 'ð åºæ¬è³æ' },
        { id: 'learning', label: 'ð å­¸ç¿æªæ¡' },
        { id: 'analytics', label: 'ð å­¸ç¿è¡¨ç¾' }
    ];

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col animate-fade-in">
                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b flex-shrink-0">
                    <div className="flex items-center gap-3">
                        {basicForm.photo_url ? (
                            <img src={basicForm.photo_url} className="w-12 h-12 rounded-full object-cover border-2 border-white shadow" />
                        ) : (
                            <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-xl">
                                {student.chinese_name?.[0]}
                            </div>
                        )}
                        <div>
                            <h2 className="font-black text-gray-800 text-lg">{student.chinese_name}</h2>
                            <p className="text-xs text-gray-400">{student.english_name} Â· {student.school_grade}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold text-gray-500">â</button>
                </div>

                {/* Tabs */}
                <div className="flex gap-0 px-6 pt-3 border-b flex-shrink-0">
                    {TABS.map(tab => (
                        <button key={tab.id} onClick={() => onTabChange(tab.id as any)}
                            className={`px-4 py-2 text-sm font-bold border-b-2 transition mr-1
                                ${activeTab === tab.id
                                    ? 'border-indigo-600 text-indigo-600'
                                    : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto">

                    {/* ââ Tab 1: åºæ¬è³æ ââ */}
                    {activeTab === 'basic' && (
                        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* å·¦ï¼ç§ç + å§å */}
                            <div className="space-y-4">
                                <div className="flex flex-col items-center">
                                    <div onClick={() => canEdit && fileInputRef.current?.click()}
                                        className={`w-28 h-28 rounded-full bg-gray-100 border-4 border-white shadow-lg overflow-hidden relative group ${canEdit ? 'cursor-pointer' : ''}`}>
                                        {basicForm.photo_url
                                            ? <img src={basicForm.photo_url} className="w-full h-full object-cover" />
                                            : <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                                                <span className="text-3xl">ð·</span>
                                                <span className="text-xs font-bold mt-1">ä¸å³ç§ç</span>
                                            </div>}
                                        {canEdit && <div className="absolute inset-0 bg-black/30 flex items-center justify-center text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition">æ´æ</div>}
                                    </div>
                                    <input type="file" ref={fileInputRef} className="hidden" onChange={handlePhotoUpload} accept="image/*" />
                                    {uploading && <span className="text-xs text-indigo-500 mt-1 font-bold">ä¸å³ä¸­...</span>}
                                </div>
                                <Field label="ä¸­æå§å *" value={basicForm.chinese_name} onChange={v => setBasicForm(f => ({ ...f, chinese_name: v }))} disabled={!canEdit} />
                                <Field label="è±æå§å" value={basicForm.english_name} onChange={v => setBasicForm(f => ({ ...f, english_name: v }))} disabled={!canEdit} />
                                <Field label="çæ¥" type="date" value={basicForm.birthday} onChange={v => setBasicForm(f => ({ ...f, birthday: v }))} disabled={!canEdit} />
                            </div>

                            {/* ä¸­ï¼ç­ç´ + å®¶é· */}
                            <div className="space-y-4">
                                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                                    <h3 className="text-xs font-black text-indigo-700 mb-3 uppercase">ð ç­ç´è¨­å®</h3>
                                    <div className="space-y-2">
                                        <div>
                                            <label className="text-xs font-bold text-indigo-400 ml-1">å­¸æ ¡å¹´ç´</label>
                                            <select value={basicForm.school_grade} onChange={e => setBasicForm(f => ({ ...f, school_grade: e.target.value }))}
                                                disabled={!canEdit} className="w-full p-2 border rounded-lg font-bold text-sm bg-white disabled:bg-gray-50">
                                                {SCHOOL_GRADE_OPTIONS.map(opt => <option key={opt}>{opt}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-indigo-400 ml-1">è±æä¸»ä¿®ç­ç´</label>
                                            <select value={basicForm.english_class} onChange={e => setBasicForm(f => ({ ...f, english_class: e.target.value }))}
                                                disabled={!canEdit} className="w-full p-2 border rounded-lg font-bold text-sm bg-white disabled:bg-gray-50">
                                                {ENGLISH_CLASS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                            </select>
                                        </div>
                                        <label className="flex items-center gap-2 bg-white p-2 rounded-lg border cursor-pointer">
                                            <input type="checkbox" checked={basicForm.is_after_school}
                                                onChange={e => setBasicForm(f => ({ ...f, is_after_school: e.target.checked }))}
                                                disabled={!canEdit} className="w-4 h-4 accent-indigo-600" />
                                            <span className="text-sm font-bold text-gray-700">åå èª²å¾è¼å°</span>
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-xs font-black text-gray-400 mb-2 uppercase">ð å®¶é·è¯ç¹«</h3>
                                    <div className="space-y-2">
                                        <div className="p-3 border rounded-xl bg-gray-50 space-y-2">
                                            <p className="text-xs font-bold text-gray-500">ä¸»è¦ç§é¡§è</p>
                                            <input type="email" placeholder="å®¶é· Email" value={basicForm.parent_email}
                                                onChange={e => setBasicForm(f => ({ ...f, parent_email: e.target.value }))}
                                                disabled={!canEdit} className="w-full p-2 border rounded-lg text-sm font-bold bg-white disabled:bg-gray-50" />
                                            <div className="flex gap-2">
                                                <input type="text" placeholder="ç¨±è¬" value={basicForm.parent_relationship}
                                                    onChange={e => setBasicForm(f => ({ ...f, parent_relationship: e.target.value }))}
                                                    disabled={!canEdit} className="w-1/3 p-2 border rounded-lg text-sm bg-white disabled:bg-gray-50" />
                                                <input type="text" placeholder="é»è©±" value={basicForm.parent_phone}
                                                    onChange={e => setBasicForm(f => ({ ...f, parent_phone: e.target.value }))}
                                                    disabled={!canEdit} className="w-2/3 p-2 border rounded-lg text-sm bg-white disabled:bg-gray-50" />
                                            </div>
                                        </div>
                                        <div className="p-3 border rounded-xl bg-gray-50 space-y-2 border-dashed">
                                            <p className="text-xs font-bold text-gray-400">ç¬¬äºä½å®¶é· (é¸å¡«)</p>
                                            <input type="email" placeholder="Email" value={basicForm.parent_2_email}
                                                onChange={e => setBasicForm(f => ({ ...f, parent_2_email: e.target.value }))}
                                                disabled={!canEdit} className="w-full p-2 border rounded-lg text-sm font-bold bg-white disabled:bg-gray-50" />
                                            <div className="flex gap-2">
                                                <input type="text" placeholder="ç¨±è¬" value={basicForm.parent_2_relationship}
                                                    onChange={e => setBasicForm(f => ({ ...f, parent_2_relationship: e.target.value }))}
                                                    disabled={!canEdit} className="w-1/3 p-2 border rounded-lg text-sm bg-white disabled:bg-gray-50" />
                                                <input type="text" placeholder="é»è©±" value={basicForm.parent_2_phone}
                                                    onChange={e => setBasicForm(f => ({ ...f, parent_2_phone: e.target.value }))}
                                                    disabled={!canEdit} className="w-2/3 p-2 border rounded-lg text-sm bg-white disabled:bg-gray-50" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* å³ï¼åè¨» */}
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 ml-1">æ¾å­¸æ¥éæ¹å¼</label>
                                    <select value={basicForm.pickup_method} onChange={e => setBasicForm(f => ({ ...f, pickup_method: e.target.value }))}
                                        disabled={!canEdit} className="w-full p-2.5 border rounded-xl font-bold text-sm mt-1 bg-gray-50 disabled:bg-gray-100">
                                        <option>ð å®¶é·æ¥é</option>
                                        <option>ð¶ èªè¡åå®¶</option>
                                        <option>ð å®è¦ªç­æ¥é</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 ml-1">â¤ï¸ éæ / å¥åº·åè¨»</label>
                                    <textarea rows={3} value={basicForm.allergies}
                                        onChange={e => setBasicForm(f => ({ ...f, allergies: e.target.value }))}
                                        disabled={!canEdit} placeholder="ä¾å¦ï¼è±çéæãè ¶è±ç..."
                                        className="w-full p-3 border rounded-xl text-sm font-bold resize-none mt-1 bg-red-50 focus:bg-white outline-none disabled:bg-gray-50" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 ml-1">ç¹æ®ç§è­·éæ±</label>
                                    <textarea rows={2} value={basicForm.special_needs}
                                        onChange={e => setBasicForm(f => ({ ...f, special_needs: e.target.value }))}
                                        disabled={!canEdit} placeholder="ä¾å¦ï¼éåå©é¤µè¥..."
                                        className="w-full p-3 border rounded-xl text-sm font-bold resize-none mt-1 bg-gray-50 focus:bg-white outline-none disabled:bg-gray-50" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 ml-1">ð å§é¨åè¨» (å®¶é·ä¸å¯è¦)</label>
                                    <textarea rows={3} value={basicForm.internal_note}
                                        onChange={e => setBasicForm(f => ({ ...f, internal_note: e.target.value }))}
                                        disabled={!canEdit} placeholder="ä¾å¦ï¼åæ§æ´»æ½ãæ³¨æèåå­¸äºå..."
                                        className="w-full p-3 border rounded-xl text-sm font-bold resize-none mt-1 bg-yellow-50 focus:bg-white outline-none disabled:bg-gray-50" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ââ Tab 2: å­¸ç¿æªæ¡ ââ */}
                    {activeTab === 'learning' && (
                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* å·¦ï¼åºç¤å­¸ç¿è³è¨ */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs font-black text-gray-500 ml-1 uppercase">ð è±æç¨åº¦</label>
                                        <select value={learningForm.level} onChange={e => setLearningForm(f => ({ ...f, level: e.target.value }))}
                                            disabled={!canEdit}
                                            className="w-full p-3 border rounded-xl font-bold text-sm mt-1 bg-purple-50 focus:bg-white outline-none disabled:bg-gray-50">
                                            <option value="">â å°æªè¨­å® â</option>
                                            {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-black text-gray-500 ml-1 uppercase">ð å¥å­¸æ¥æ</label>
                                          nput type="date" value={learningForm.join_date}
                                            onChange={e => setLearningForm(f => ({ ...f, join_date: e.target.value }))}
                                            disabled={!canEdit}
                                            className="w-full p-3 border rounded-xl font-bold text-sm mt-1 bg-gray-50 focus:bg-white outline-none disabled:bg-gray-50" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-black text-gray-500 ml-1 uppercase">ð¯ å­¸ç¿ç®æ¨</label>
                                        <textarea rows={4} value={learningForm.learning_goal}
                                            onChange={e => setLearningForm(f => ({ ...f, learning_goal: e.target.value }))}
                                            disabled={!canEdit} placeholder="ä¾å¦ï¼åå¹´å§å®æ Let's Go 2ãæåå£èªè¡¨é..."
                                            className="w-full p-3 border rounded-xl text-sm font-bold resize-none mt-1 bg-teal-50 focus:bg-white outline-none disabled:bg-gray-50" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-black text-gray-500 ml-1 uppercase">ð èå¸«ç¸½è© (å§é¨)</label>
                                        <textarea rows={4} value={learningForm.teacher_assessment}
                                            onChange={e => setLearningForm(f => ({ ...f, teacher_assessment: e.target.value }))}
                                            disabled={!canEdit} placeholder="æ´é«å­¸ç¿è©ä¼°ãåæ§ç¹è³ªãå»ºè­°..."
                                            className="w-full p-3 border rounded-xl text-sm font-bold resize-none mt-1 bg-yellow-50 focus:bg-white outline-none disabled:bg-gray-50" />
                                    </div>
                                </div>

                                {/* å³ï¼æ¨ç±¤ */}
                                <div className="space-y-4">
                                    {/* åªå¢æ¨ç±¤ */}
                                    <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                                        <h3 className="text-sm font-black text-green-700 mb-3">â¦ åªå¢æ¨ç±¤</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {/* é è¨­æ¨ç±¤ */}
                                            {STRENGTH_TAGS.map(tag => (
                                                <button key={tag} onClick={() => canEdit && toggleTag('strength_tags', tag)}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition
                                                        ${learningForm.strength_tags.includes(tag)
                                                            ? 'bg-green-500 text-white border-green-500 shadow-sm'
                                                            : 'bg-white text-green-600 border-green-200 hover:border-green-400'
                                                        } ${!canEdit ? 'cursor-default' : 'cursor-pointer'}`}>
                                                    {tag}
                                                </button>
                                            ))}
                                            {/* èªè¨æ¨ç±¤ (ä¸å¨é è¨­æ¸å®ä¸­ç) */}
                                            {learningForm.strength_tags
                                                .filter((t: string) => !STRENGTH_TAGS.includes(t))
                                                .map((tag: string) => (
                                                    <span key={tag} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-green-500 text-white border border-green-500 shadow-sm">
                                                        {tag}
                                                        {canEdit && (
                                                            <button onClick={() => removeTag('strength_tags', tag)}
                                                                className="ml-0.5 hover:text-green-200 transition font-black">Ã</button>
                                                        )}
                                                    </span>
                                                ))}
                                        </div>
                                        {/* èªè¨è¼¸å¥æ¡ */}
                                        {canEdit && (
                                            <div className="flex gap-2 mt-3">
                                                <input
                                                    type="text"
                                                    value={customStrengthInput}
                                                    onChange={e => setCustomStrengthInput(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && addCustomTag('strength_tags', customStrengthInput, () => setCustomStrengthInput(''))}
                                                    placeholder="èªè¨æ¨ç±¤ï¼æ Enter æ°å¢..."
                                                    className="flex-1 px-3 py-1.5 text-xs border border-green-200 rounded-full bg-white outline-none focus:ring-2 focus:ring-green-300 font-bold text-green-700 placeholder-green-300"
                                                />
                                                <button
                                                    onClick={() => addCustomTag('strength_tags', customStrengthInput, () => setCustomStrengthInput(''))}
                                                    className="px-3 py-1.5 bg-green-500 text-white text-xs font-black rounded-full hover:bg-green-600 transition">
                                                    ï¼
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* å¾å å¼·æ¨ç±¤ */}
                                    <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                                        <h3 className="text-sm font-black text-amber-700 mb-3">â³ å¾å å¼·æ¨ç±¤</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {IMPROVEMENT_TAGS.map(tag => (
                                                <button key={tag} onClick={() => canEdit && toggleTag('improvement_tags', tag)}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition
                                                        ${learningForm.improvement_tags.includes(tag)
                                                            ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                                                            : 'bg-white text-amber-600 border-amber-200 hover:border-amber-400'
                                                        } ${!canEdit ? 'cursor-default' : 'cursor-pointer'}`}>
                                                    {tag}
                                                </button>
                                            ))}
                                            {/* èªè¨æ¨ç±¤ */}
                                            {learningForm.improvement_tags
                                                .filter((t: string) => !IMPROVEMENT_TAGS.includes(t))
                                                .map((tag: string) => (
                                                    <span key={tag} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500 text-white border border-amber-500 shadow-sm">
                                                        {tag}
                                                        {canEdit && (
                                                            <button onClick={() => removeTag('improvement_tags', tag)}
                                                                className="ml-0.5 hover:text-amber-200 transition font-black">Ã</button>
                                                        )}
                                                    </span>
                                                ))}
                                        </div>
                                        {canEdit && (
                                            <div className="flex gap-2 mt-3">
                                                <input
                                                    type="text"
                                                    value={customImprovementInput}
                                                    onChange={e => setCustomImprovementInput(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && addCustomTag('improvement_tags', customImprovementInput, () => setCustomImprovementInput(''))}
                                                    placeholder="èªè¨æ¨ç±¤ï¼æ Enter æ°å¢..."
                                                    className="flex-1 px-3 py-1.5 text-xs border border-amber-200 rounded-full bg-white outline-none focus:ring-2 focus:ring-amber-300 font-bold text-amber-700 placeholder-amber-300"
                                                />
                                                <button
                                                    onClick={() => addCustomTag('improvement_tags', customImprovementInput, () => setCustomImprovementInput(''))}
                                                    className="px-3 py-1.5 bg-amber-500 text-white text-xs font-black rounded-full hover:bg-amber-600 transition">
                                                    ï¼
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ââ Tab 3: å­¸ç¿è¡¨ç¾ ââ */}
                    {activeTab === 'analytics' && (
                        <AnalyticsTab studentId={student.id} studentName={student.chinese_name} />
                    )}
                </div>

                {/* Footer Actions */}
                {activeTab !== 'analytics' && (
                    <div className="px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex gap-3 flex-shrink-0">
                        <button onClick={onClose}
                            className="flex-1 py-2.5 rounded-xl font-bold text-gray-500 bg-white border hover:bg-gray-50 transition text-sm">
                            éé
                        </button>
                        {canEdit && (
                            <button
                                onClick={activeTab === 'basic' ? saveBasic : saveLearning}
                                disabled={saving}
                                className="flex-1 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition text-sm disabled:opacity-60">
                                {saving ? 'å²å­ä¸­...' : 'ð¾ å²å­ä¿®æ¹'}
                            </button>
                        )}
                    </div>
                )}
                {activeTab === 'analytics' && (
                    <div className="px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex-shrink-0">
                        <button onClick={onClose}
                            className="w-full py-2.5 rounded-xl font-bold text-gray-500 bg-white border hover:bg-gray-50 transition text-sm">
                            éé
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ââ Analytics Tab âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function AnalyticsTab({ studentId, studentName }: { studentId: string; studentName: string }) {
    const [records, setRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        supabase.from('contact_books')
            .select('date, mood, focus, participation, expression, is_absent, parent_signature')
            .eq('student_id', studentId)
            .gte('date', since)
            .order('date')
            .then(({ data }) => { setRecords(data || []); setLoading(false); });
    }, [studentId]);

    if (loading) return <div className="p-10 text-center text-gray-400 font-bold">åæä¸­...</div>;

    if (records.length === 0) {
        return (
            <div className="p-10 text-center text-gray-300">
                <div className="text-5xl mb-3">ð</div>
                <p className="font-bold text-gray-400">è¿ 90 å¤©å°ç¡è¯çµ¡ç°¿ç´é</p>
                <p className="text-xs text-gray-300 mt-1">èå¸«å¡«å¯«è¯çµ¡ç°¿å¾ï¼éè£¡æé¡¯ç¤ºå­¸ç¿è¶¨å¢åæ</p>
            </div>
        );
    }

    const presentRecords = records.filter(r => !r.is_absent);
    const totalDays = records.length;
    const attendancePct = totalDays > 0 ? Math.round((presentRecords.length / totalDays) * 100) : 100;

    // Weekly averages
    const weeklyMap: Record<string, { focus: number[]; participation: number[]; expression: number[]; mood: number[] }> = {};
    for (const r of presentRecords) {
        const d = new Date(r.date);
        const week = `W${Math.ceil((d.getDate()) / 7)}-${d.getMonth() + 1}æ`;
        if (!weeklyMap[week]) weeklyMap[week] = { focus: [], participation: [], expression: [], mood: [] };
        if (r.focus) weeklyMap[week].focus.push(r.focus);
        if (r.participation) weeklyMap[week].participation.push(r.participation);
        if (r.expression) weeklyMap[week].expression.push(r.expression);
        if (r.mood) weeklyMap[week].mood.push(r.mood);
    }
    const weeks = Object.keys(weeklyMap).slice(-8);
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const weeklyFocus = weeks.map(w => avg(weeklyMap[w].focus));
    const weeklyParticipation = weeks.map(w => avg(weeklyMap[w].participation));
    const weeklyExpression = weeks.map(w => avg(weeklyMap[w].expression));

    // Overall averages
    const allFocus = presentRecords.filter(r => r.focus).map(r => r.focus);
    const allParticipation = presentRecords.filter(r => r.participation).map(r => r.participation);
    const allExpression = presentRecords.filter(r => r.expression).map(r => r.expression);
    const avgFocus = avg(allFocus);
    const avgParticipation = avg(allParticipation);
    const avgExpression = avg(allExpression);

    // Trend: compare first half vs second half
    const half = Math.floor(presentRecords.length / 2);
    const firstHalf = presentRecords.slice(0, half);
    const secondHalf = presentRecords.slice(half);
    const avgScore = (recs: any[]) => {
        const vals = recs.filter(r => r.focus).map(r => (r.focus + (r.participation || 3) + (r.expression || 3)) / 3);
        return vals.length > 0 ? avg(vals) : 0;
    };
    const trend = secondHalf.length > 0 ? avgScore(secondHalf) - avgScore(firstHalf) : 0;

    // Risk flags
    const risks: { level: string; msg: string; icon: string }[] = [];
    if (attendancePct < 70) risks.push({ level: 'high', msg: `åºå¸­çå ${attendancePct}%ï¼å¯è½å½±é¿å­¸ç¿é£è²«æ§`, icon: 'ð´' });
    else if (attendancePct < 85) risks.push({ level: 'medium', msg: `åºå¸­ç ${attendancePct}%ï¼ç¥ä½æ¼å»ºè­°æ¨æº`, icon: 'ð¡' });

    let consecutive = 0, maxConsecutive = 0;
    for (const r of presentRecords) {
        if (r.focus && r.focus <= 2) { consecutive++; maxConsecutive = Math.max(maxConsecutive, consecutive); }
        else consecutive = 0;
    }
    if (maxConsecutive >= 3) risks.push({ level: 'medium', msg: `æ¾é£çº ${maxConsecutive} æ¬¡å°æ³¨åº¦åä½`, icon: 'ð¡' });

    const unsignedCount = presentRecords.filter(r => !r.parent_signature).length;
    const unsignedPct = presentRecords.length > 0 ? Math.round((unsignedCount / presentRecords.length) * 100) : 0;
    if (unsignedPct > 50) risks.push({ level: 'low', msg: `å®¶é·ç°½åçå ${100 - unsignedPct}%ï¼æºéé »çåä½`, icon: 'ð¡' });

    if (risks.length === 0) risks.push({ level: 'ok', msg: 'ç®åç¡ç°å¸¸ï¼å­¸ç¿çæ³è¯å¥½ ð', icon: 'ð¢' });

    return (
        <div className="p-6 space-y-6">
            {/* é é¨æè¦ */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="åºå¸­ç" value={`${attendancePct}%`} sub={`${presentRecords.length}/${totalDays} å¤©`}
                    color={attendancePct >= 85 ? 'text-green-600' : attendancePct >= 70 ? 'text-amber-500' : 'text-red-500'} />
                <StatCard label="å¹³åå°æ³¨åº¦" value={avgFocus > 0 ? avgFocus.toFixed(1) : 'â'} sub="æ»¿å 5 é¡æ" color="text-indigo-600" />
                <StatCard label="å¹³åäºåæ§" value={avgParticipation > 0 ? avgParticipation.toFixed(1) : 'â'} sub="èª²å äºå" color="text-purple-600" />
                <StatCard label="æ´é«è¶¨å¢"
                    value={trend === 0 ? 'â' : trend > 0 ? `â +${trend.toFixed(1)}` : `â ${trend.toFixed(1)}`}
                    sub={trend > 0.2 ? 'æçºé²æ­¥ä¸­' : trend < -0.2 ? 'éè¦éæ³¨' : 'ç©©å®ç¶­æ'}
                    color={trend > 0.2 ? 'text-green-600' : trend < -0.2 ? 'text-red-500' : 'text-gray-500'} />
            </div>

            {/* è¶¨å¢å */}
            {weeks.length >= 2 && (
                <div className="bg-white border rounded-xl p-4">
                    <h3 className="text-sm font-black text-gray-700 mb-4">ð è¿æå­¸ç¿è¶¨å¢ (é±å¹³å)</h3>
                    <div className="flex items-end gap-6">
                        <div className="flex-1">
                            <TrendChart
                                series={[
                                    { label: 'å°æ³¨åº¦', data: weeklyFocus, color: '#6366f1' },
                                    { label: 'èª²å äºå', data: weeklyParticipation, color: '#10b981' },
                                    { label: 'ä¸»åè¡¨é', data: weeklyExpression, color: '#f59e0b' }
                                ]}
                                labels={weeks}
                            />
                        </div>
                        <div className="flex flex-col gap-2 text-xs font-bold shrink-0">
                            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-indigo-500 inline-block rounded" /> å°æ³¨åº¦</span>
                            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-500 inline-block rounded" /> èª²å äºå</span>
                            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-amber-400 inline-block rounded" /> ä¸»åè¡¨é</span>
                        </div>
                    </div>
                    <div className="flex gap-2 mt-2 overflow-x-auto">
                        {weeks.map(w => (
                            <span key={w} className="text-[10px] text-gray-400 flex-shrink-0">{w}</span>
                        ))}
                    </div>
                </div>
            )}

            {/* é¢¨éªé è­¦ */}
            <div className="bg-white border rounded-xl p-4">
                <h3 className="text-sm font-black text-gray-700 mb-3">â ï¸ å­¸ç¿é è­¦</h3>
                <div className="space-y-2">
                    {risks.map((r, i) => (
                        <div key={i} className={`flex items-start gap-2 p-3 rounded-lg text-sm font-bold
                            ${r.level === 'high' ? 'bg-red-50 text-red-700'
                                : r.level === 'medium' ? 'bg-amber-50 text-amber-700'
                                    : r.level === 'ok' ? 'bg-green-50 text-green-700'
                                        : 'bg-gray-50 text-gray-600'}`}>
                            <span>{r.icon}</span>
                            <span>{r.msg}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* è¿æç´éå¿«è¦½ */}
            <div className="bg-white border rounded-xl p-4">
                <h3 className="text-sm font-black text-gray-700 mb-3">ð æè¿ 10 æ¬¡ç´é</h3>
                <div className="space-y-1">
                    {[...records].reverse().slice(0, 10).map((r, i) => (
                        <div key={i} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                            <span className="text-xs text-gray-400 font-bold w-20 shrink-0">{r.date}</span>
                            {r.is_absent
                                ? <span className="text-xs text-red-400 font-bold">ç¼ºå¸­</span>
                                : <>
                                    <MiniStars n={r.mood} color="text-yellow-400" />
                                    <span className="text-xs text-gray-300">|</span>
                                    <MiniStars n={r.focus} color="text-indigo-400" />
                                    <span className="text-xs text-gray-300">|</span>
                                    <MiniStars n={r.participation} color="text-emerald-400" />
                                    {r.parent_signature && <span className="text-[10px] text-green-500 font-bold ml-auto">âï¸ å·²ç°½</span>}
                                </>
                            }
                        </div>
                    ))}
                </div>
                <p className="text-[10px] text-gray-300 mt-2">â­ å¿æ | ðµ å°æ³¨ | ð¢ äºå</p>
            </div>
        </div>
    );
}

// ââ Add Student Modal âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function AddStudentModal({ onClose, onSaved, showToast }: any) {
    const [form, setForm] = useState({
        chinese_name: '', english_name: '', birthday: '',
        school_grade: 'åå° ä¸å¹´ç´', english_class: 'CEI-A', is_after_school: false,
        parent_email: '', parent_relationship: '', parent_phone: '',
        allergies: '', pickup_method: 'å®¶é·æ¥é'
    });
    const [saving, setSaving] = useState(false);

    async function handleSubmit() {
        if (!form.chinese_name) { showToast('è«è¼¸å¥ä¸­æå§å', 'error'); return; }
        setSaving(true);
        try {
            let p1_id = null;
            if (form.parent_email) {
                const { data } = await supabase.from('users').select('id').eq('email', form.parent_email).single();
                if (data) p1_id = data.id;
            }
            const grade = form.english_class === 'NONE' && form.is_after_school ? 'èª²å¾è¼å°'
                : form.english_class === 'NONE' ? 'æªåé¡'
                    : form.is_after_school ? `${form.english_class}, èª²å¾è¼å°`
                        : form.english_class;
            const { error } = await supabase.from('students').insert({
                chinese_name: form.chinese_name, english_name: form.english_name,
                birthday: form.birthday || null, school_grade: form.school_grade,
                grade, pickup_method: form.pickup_method,
                allergies: form.allergies, parent_id: p1_id,
                parent_relationship: form.parent_relationship, parent_phone: form.parent_phone
            });
            if (error) throw error;
            onSaved(); onClose();
        } catch (e: any) { showToast('â å¤±æ: ' + e.message, 'error'); }
        finally { setSaving(false); }
    }

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
                <div className="flex justify-between items-center mb-5 pb-3 border-b">
                    <h2 className="text-xl font-black text-gray-800">â æ°å¢å­¸ç</h2>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold text-gray-500">â</button>
                </div>
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="ä¸­æå§å *" value={form.chinese_name} onChange={v => setForm(f => ({ ...f, chinese_name: v }))} />
                        <Field label="è±æå§å" value={form.english_name} onChange={v => setForm(f => ({ ...f, english_name: v }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="çæ¥" type="date" value={form.birthday} onChange={v => setForm(f => ({ ...f, birthday: v }))} />
                        <div>
                            <label className="text-xs font-bold text-gray-400 ml-1">å­¸æ ¡å¹´ç´</label>
                            <select value={form.school_grade} onChange={e => setForm(f => ({ ...f, school_grade: e.target.value }))}
                                className="w-full p-2.5 border rounded-xl text-sm font-bold mt-1 bg-gray-50">
                                {SCHOOL_GRADE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-bold text-gray-400 ml-1">è±æç­ç´</label>
                            <select value={form.english_class} onChange={e => setForm(f => ({ ...f, english_class: e.target.value }))}
                                className="w-full p-2.5 border rounded-xl text-sm font-bold mt-1 bg-gray-50">
                                {ENGLISH_CLASS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div className="flex items-end pb-1">
                            <label className="flex items-center gap-2 cursor-pointer p-2.5 border rounded-xl w-full bg-gray-50">
                                <input type="checkbox" checked={form.is_after_school} onChange={e => setForm(f => ({ ...f, is_after_school: e.target.checked }))} className="w-4 h-4 accent-indigo-600" />
                                <span className="text-sm font-bold text-gray-700">èª²å¾è¼å°</span>
                            </label>
                        </div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-xl border">
                        <p className="text-xs font-bold text-gray-500 mb-2">ð ä¸»è¦ç§é¡§è</p>
                        <Field label="å®¶é· Email" type="email" value={form.parent_email} onChange={v => setForm(f => ({ ...f, parent_email: v }))} />
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <Field label="ç¨±è¬" value={form.parent_relationship} onChange={v => setForm(f => ({ ...f, parent_relationship: v }))} />
                            <Field label="é»è©±" value={form.parent_phone} onChange={v => setForm(f => ({ ...f, parent_phone: v }))} />
                        </div>
                    </div>
                </div>
                <div className="flex gap-3 mt-5 pt-4 border-t">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition text-sm">åæ¶</button>
                    <button onClick={handleSubmit} disabled={saving}
                        className="flex-1 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition text-sm disabled:opacity-60">
                        {saving ? 'æ°å¢ä¸­...' : 'ç¢ºèªæ°å¢'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ââ å°å·¥å·åä»¶ âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function Field({ label, value, onChange, type = 'text', disabled = false }: any) {
    return (
        <div>
            <label className="text-xs font-bold text-gray-400 ml-1">{label}</label>
            <input type={type} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
                className="w-full p-2.5 border rounded-xl font-bold text-sm mt-1 bg-gray-50 focus:bg-white outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-gray-50 disabled:text-gray-500" />
        </div>
    );
}

function StatCard({ label, value, sub, color }: any) {
    return (
        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
            <p className="text-xs text-gray-400 font-bold mb-1">{label}</p>
            <p className={`text-2xl font-black ${color}`}>{value}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
        </div>
    );
}

function MiniStars({ n, color }: { n: number; color: string }) {
    return (
        <span className={`text-xs ${color}`}>
            {'â'.repeat(Math.round(n || 0))}{'â'.repeat(5 - Math.round(n || 0))}
        </span>
    );
}

function TrendChart({ series, labels }: { series: { label: string; data: number[]; color: string }[]; labels: string[] }) {
    const W = 400, H = 100;
    const maxVal = 5, minVal = 1;
    const xStep = labels.length > 1 ? W / (labels.length - 1) : W;

    function toPath(data: number[]) {
        if (data.length === 0) return '';
        return data.map((v, i) => {
            const x = i * xStep;
            const y = H - ((v - minVal) / (maxVal - minVal)) * H;
            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
        }).join(' ');
    }

    return (
        <div className="w-full overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" preserveAspectRatio="none">
                {/* Grid lines */}
                {[1, 2, 3, 4, 5].map(v => {
                    const y = H - ((v - minVal) / (maxVal - minVal)) * H;
                    return <line key={v} x1={0} y1={y} x2={W} y2={y} stroke="#f3f4f6" strokeWidth="1" />;
                })}
                {series.map(s => (
                    <path key={s.label} d={toPath(s.data)} fill="none" stroke={s.color} strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round" />
                ))}
                {/* Dots */}
                {series.map(s =>
                    s.data.map((v, i) => {
                        const x = i * xStep;
                        const y = H - ((v - minVal) / (maxVal - minVal)) * H;
                        return <circle key={`${s.label}-${i}`} cx={x} cy={y} r="3" fill={s.color} />;
                    })
                )}
            </svg>
        </div>
    );
}
