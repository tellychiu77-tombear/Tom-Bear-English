'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { getEffectivePermissions } from '../../lib/permissions';

// ── 常數 ──────────────────────────────────────────────────────────────────────

const LEVEL_OPTIONS = [
    "Let's Go 1", "Let's Go 2", "Let's Go 3",
    "Let's Go 4", "Let's Go 5", "Let's Go 6",
    'Smart Choice 1', 'Smart Choice 2', 'Smart Choice 3+',
    'Beginner', '待評估'
];

const STRENGTH_TAGS = [
    '自然發音', '字彙量豐富', '閱讀理解強', '口語表達佳',
    '主動參與', '文法掌握好', '聽力佳', '書寫工整',
    '學習動機高', '記憶力好', '上課專注', '喜歡閱讀'
];

const IMPROVEMENT_TAGS = [
    '發音需加強', '字彙量不足', '閱讀需加強', '口語需練習',
    '較被動', '文法錯誤多', '聽力需加強', '書寫需加強',
    '注意力不集中', '作業完成率低', '容易分心', '情緒管理需加強'
];

const ENGLISH_CLASS_OPTIONS = [
    { value: 'NONE', label: '❌ 無英文主修 (純安親/課輔)' },
    ...Array.from({ length: 26 }, (_, i) => ({
        value: `CEI-${String.fromCharCode(65 + i)}`,
        label: `CEI-${String.fromCharCode(65 + i)}`
    }))
];

const SCHOOL_GRADE_OPTIONS = [
    '國小 一年級', '國小 二年級', '國小 三年級',
    '國小 四年級', '國小 五年級', '國小 六年級',
    '國中 七年級', '國中 八年級', '國中 九年級'
];

// ── 主頁面 ────────────────────────────────────────────────────────────────────

export default function StudentsPage() {
    const router = useRouter();
    const [students, setStudents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterClass, setFilterClass] = useState('');
    const [canEditStudents, setCanEditStudents] = useState(false);

    // 列表選中的學生 → 開啟 Profile Modal
    const [profileStudent, setProfileStudent] = useState<any>(null);
    const [profileTab, setProfileTab] = useState<'basic' | 'learning' | 'analytics'>('basic');

    // 新增 Modal
    const [addModalOpen, setAddModalOpen] = useState(false);

    useEffect(() => { checkPermissionAndFetch(); }, []);

    async function checkPermissionAndFetch() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }
        const { data: userData } = await supabase.from('users').select('role, extra_permissions').eq('id', session.user.id).single();
        if (!userData) { router.push('/'); return; }
        const { data: roleConfigRow } = await supabase.from('role_configs').select('permissions').eq('role', userData.role).single();
        const perms = getEffectivePermissions(userData.role, roleConfigRow?.permissions ?? null, userData.extra_permissions ?? null);
        if (!perms.viewAllStudents) { alert('⛔ 您沒有查看學生資料的權限'); router.push('/'); return; }
        setCanEditStudents(perms.editStudents);
        fetchStudents();
    }

    async function fetchStudents() {
        setLoading(true);
        const { data, error } = await supabase
            .from('students')
            .select(`*, parent:users!parent_id(email), parent2:users!parent_id_2(email)`)
            .order('grade').order('chinese_name');
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

    if (loading) return <div className="p-10 text-center font-bold text-gray-400">載入中...</div>;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <button onClick={() => router.push('/')} className="text-gray-400 hover:text-gray-600 font-bold text-sm">← 首頁</button>
                        <h1 className="text-xl font-black text-gray-800">📂 學生資料庫</h1>
                        <span className="text-xs text-gray-400 font-bold bg-gray-100 px-2 py-0.5 rounded-full">{filteredStudents.length} 位</span>
                    </div>
                    <div className="flex gap-2">
                        <select value={filterClass} onChange={e => setFilterClass(e.target.value)}
                            className="p-2 border border-gray-200 rounded-lg font-bold text-sm text-gray-700 outline-none bg-white">
                            <option value="">🏫 全部班級</option>
                            {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        {canEditStudents && (
                            <button onClick={() => setAddModalOpen(true)}
                                className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow hover:bg-indigo-700 transition">
                                + 新增學生
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
                                <th className="p-4 text-xs font-black text-gray-400 uppercase">學生</th>
                                <th className="p-4 text-xs font-black text-gray-400 uppercase">班級 / 程度</th>
                                <th className="p-4 text-xs font-black text-gray-400 uppercase">家長狀態</th>
                                <th className="p-4 text-xs font-black text-gray-400 uppercase">學習標籤</th>
                                <th className="p-4 text-right text-xs font-black text-gray-400 uppercase">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredStudents.map(s => (
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
                                                <div className="text-xs text-gray-400">{s.english_name || '未設英文名'}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex flex-col gap-1">
                                            {s.grade && s.grade.split(',').map((g: string, i: number) => (
                                                <span key={i} className={`px-2 py-0.5 rounded text-[11px] font-black border inline-block w-fit
                                                    ${g.includes('課後輔導') ? 'bg-orange-50 text-orange-600 border-orange-100'
                                                        : g.includes('CEI') ? 'bg-indigo-50 text-indigo-600 border-indigo-100'
                                                            : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                                    {g.trim()}
                                                </span>
                                            ))}
                                            {s.level && (
                                                <span className="text-xs text-purple-600 font-bold">📚 {s.level}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        {s.parent
                                            ? <span className="text-green-600 text-xs font-bold">✅ 已綁定</span>
                                            : <span className="text-gray-300 text-xs font-bold">❌ 未綁定</span>
                                        }
                                    </td>
                                    <td className="p-4">
                                        <div className="flex flex-wrap gap-1">
                                            {(s.strength_tags || []).slice(0, 2).map((t: string) => (
                                                <span key={t} className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">✦ {t}</span>
                                            ))}
                                            {(s.improvement_tags || []).slice(0, 1).map((t: string) => (
                                                <span key={t} className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">△ {t}</span>
                                            ))}
                                            {((s.strength_tags || []).length + (s.improvement_tags || []).length) > 3 && (
                                                <span className="text-[10px] text-gray-400 font-bold">+{((s.strength_tags || []).length + (s.improvement_tags || []).length) - 3}</span>
                                            )}
                                            {!(s.strength_tags?.length) && !(s.improvement_tags?.length) && (
                                                <span className="text-[10px] text-gray-300">尚未設定</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 text-right" onClick={e => e.stopPropagation()}>
                                        <button onClick={() => openProfile(s, 'analytics')}
                                            className="text-purple-500 hover:bg-purple-50 px-2 py-1 rounded font-bold text-xs transition mr-1">
                                            📊
                                        </button>
                                        <button onClick={() => openProfile(s, 'learning')}
                                            className="text-teal-500 hover:bg-teal-50 px-2 py-1 rounded font-bold text-xs transition mr-1">
                                            📚
                                        </button>
                                        <button onClick={() => openProfile(s, 'basic')}
                                            className="text-indigo-600 hover:bg-indigo-50 px-3 py-1 rounded font-bold text-xs transition">
                                            {canEditStudents ? '編輯' : '查看'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredStudents.length === 0 && (
                        <div className="p-16 text-center text-gray-300 font-bold">尚無學生資料</div>
                    )}
                </div>
            </div>

            {/* Profile Modal */}
            {profileStudent && (
                <StudentProfileModal
                    student={profileStudent}
                    activeTab={profileTab}
                    onTabChange={setProfileTab}
                    canEdit={canEditStudents}
                    onClose={() => setProfileStudent(null)}
                    onSaved={() => { fetchStudents(); }}
                />
            )}

            {/* Add Modal */}
            {addModalOpen && (
                <AddStudentModal
                    onClose={() => setAddModalOpen(false)}
                    onSaved={fetchStudents}
                />
            )}
        </div>
    );
}

// ── Student Profile Modal (3 tabs) ────────────────────────────────────────────

function StudentProfileModal({ student, activeTab, onTabChange, canEdit, onClose, onSaved }: any) {
    // Basic info state
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);

    function parseGradeToForm(fullGrade: string) {
        if (!fullGrade) return { eng: 'CEI-A', after: false };
        const hasAfterSchool = fullGrade.includes('課後輔導');
        let engClass = fullGrade.replace(', 課後輔導', '').replace('課後輔導', '').trim();
        if (engClass.endsWith(',')) engClass = engClass.slice(0, -1).trim();
        if (!engClass || engClass === '未分類') engClass = 'NONE';
        return { eng: engClass || 'CEI-A', after: hasAfterSchool };
    }

    function combineFormToGrade(eng: string, after: boolean) {
        if (eng === 'NONE' && after) return '課後輔導';
        if (eng === 'NONE' && !after) return '未分類';
        if (after) return `${eng}, 課後輔導`;
        return eng;
    }

    const { eng: initEng, after: initAfter } = parseGradeToForm(student.grade);

    const [basicForm, setBasicForm] = useState({
        chinese_name: student.chinese_name || '',
        english_name: student.english_name || '',
        birthday: student.birthday || '',
        school_grade: student.school_grade || '國小 一年級',
        english_class: initEng,
        is_after_school: initAfter,
        parent_email: student.parent?.email || '',
        parent_relationship: student.parent_relationship || '',
        parent_phone: student.parent_phone || '',
        parent_2_email: student.parent2?.email || '',
        parent_2_relationship: student.parent_2_relationship || '',
        parent_2_phone: student.parent_2_phone || '',
        pickup_method: student.pickup_method || '家長接送',
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
        } catch (err: any) { alert('上傳失敗: ' + err.message); }
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
            alert('✅ 基本資料已儲存');
        } catch (e: any) { alert('❌ 失敗: ' + e.message); }
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
            alert('✅ 學習檔案已儲存');
        } catch (e: any) { alert('❌ 失敗: ' + e.message); }
        finally { setSaving(false); }
    }

    function toggleTag(field: 'strength_tags' | 'improvement_tags', tag: string) {
        setLearningForm(f => {
            const arr = f[field] as string[];
            return { ...f, [field]: arr.includes(tag) ? arr.filter((t: string) => t !== tag) : [...arr, tag] };
        });
    }

    const TABS = [
        { id: 'basic', label: '📋 基本資料' },
        { id: 'learning', label: '📚 學習檔案' },
        { id: 'analytics', label: '📊 學習表現' }
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
                            <p className="text-xs text-gray-400">{student.english_name} · {student.school_grade}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold text-gray-500">✕</button>
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

                    {/* ── Tab 1: 基本資料 ── */}
                    {activeTab === 'basic' && (
                        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* 左：照片 + 姓名 */}
                            <div className="space-y-4">
                                <div className="flex flex-col items-center">
                                    <div onClick={() => canEdit && fileInputRef.current?.click()}
                                        className={`w-28 h-28 rounded-full bg-gray-100 border-4 border-white shadow-lg overflow-hidden relative group ${canEdit ? 'cursor-pointer' : ''}`}>
                                        {basicForm.photo_url
                                            ? <img src={basicForm.photo_url} className="w-full h-full object-cover" />
                                            : <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                                                <span className="text-3xl">📷</span>
                                                <span className="text-xs font-bold mt-1">上傳照片</span>
                                            </div>}
                                        {canEdit && <div className="absolute inset-0 bg-black/30 flex items-center justify-center text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition">更換</div>}
                                    </div>
                                    <input type="file" ref={fileInputRef} className="hidden" onChange={handlePhotoUpload} accept="image/*" />
                                    {uploading && <span className="text-xs text-indigo-500 mt-1 font-bold">上傳中...</span>}
                                </div>
                                <Field label="中文姓名 *" value={basicForm.chinese_name} onChange={v => setBasicForm(f => ({ ...f, chinese_name: v }))} disabled={!canEdit} />
                                <Field label="英文姓名" value={basicForm.english_name} onChange={v => setBasicForm(f => ({ ...f, english_name: v }))} disabled={!canEdit} />
                                <Field label="生日" type="date" value={basicForm.birthday} onChange={v => setBasicForm(f => ({ ...f, birthday: v }))} disabled={!canEdit} />
                            </div>

                            {/* 中：班級 + 家長 */}
                            <div className="space-y-4">
                                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                                    <h3 className="text-xs font-black text-indigo-700 mb-3 uppercase">🎓 班級設定</h3>
                                    <div className="space-y-2">
                                        <div>
                                            <label className="text-xs font-bold text-indigo-400 ml-1">學校年級</label>
                                            <select value={basicForm.school_grade} onChange={e => setBasicForm(f => ({ ...f, school_grade: e.target.value }))}
                                                disabled={!canEdit} className="w-full p-2 border rounded-lg font-bold text-sm bg-white disabled:bg-gray-50">
                                                {SCHOOL_GRADE_OPTIONS.map(opt => <option key={opt}>{opt}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-indigo-400 ml-1">英文主修班級</label>
                                            <select value={basicForm.english_class} onChange={e => setBasicForm(f => ({ ...f, english_class: e.target.value }))}
                                                disabled={!canEdit} className="w-full p-2 border rounded-lg font-bold text-sm bg-white disabled:bg-gray-50">
                                                {ENGLISH_CLASS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                            </select>
                                        </div>
                                        <label className="flex items-center gap-2 bg-white p-2 rounded-lg border cursor-pointer">
                                            <input type="checkbox" checked={basicForm.is_after_school}
                                                onChange={e => setBasicForm(f => ({ ...f, is_after_school: e.target.checked }))}
                                                disabled={!canEdit} className="w-4 h-4 accent-indigo-600" />
                                            <span className="text-sm font-bold text-gray-700">參加課後輔導</span>
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-xs font-black text-gray-400 mb-2 uppercase">📞 家長聯繫</h3>
                                    <div className="space-y-2">
                                        <div className="p-3 border rounded-xl bg-gray-50 space-y-2">
                                            <p className="text-xs font-bold text-gray-500">主要照顧者</p>
                                            <input type="email" placeholder="家長 Email" value={basicForm.parent_email}
                                                onChange={e => setBasicForm(f => ({ ...f, parent_email: e.target.value }))}
                                                disabled={!canEdit} className="w-full p-2 border rounded-lg text-sm font-bold bg-white disabled:bg-gray-50" />
                                            <div className="flex gap-2">
                                                <input type="text" placeholder="稱謂" value={basicForm.parent_relationship}
                                                    onChange={e => setBasicForm(f => ({ ...f, parent_relationship: e.target.value }))}
                                                    disabled={!canEdit} className="w-1/3 p-2 border rounded-lg text-sm bg-white disabled:bg-gray-50" />
                                                <input type="text" placeholder="電話" value={basicForm.parent_phone}
                                                    onChange={e => setBasicForm(f => ({ ...f, parent_phone: e.target.value }))}
                                                    disabled={!canEdit} className="w-2/3 p-2 border rounded-lg text-sm bg-white disabled:bg-gray-50" />
                                            </div>
                                        </div>
                                        <div className="p-3 border rounded-xl bg-gray-50 space-y-2 border-dashed">
                                            <p className="text-xs font-bold text-gray-400">第二位家長 (選填)</p>
                                            <input type="email" placeholder="Email" value={basicForm.parent_2_email}
                                                onChange={e => setBasicForm(f => ({ ...f, parent_2_email: e.target.value }))}
                                                disabled={!canEdit} className="w-full p-2 border rounded-lg text-sm font-bold bg-white disabled:bg-gray-50" />
                                            <div className="flex gap-2">
                                                <input type="text" placeholder="稱謂" value={basicForm.parent_2_relationship}
                                                    onChange={e => setBasicForm(f => ({ ...f, parent_2_relationship: e.target.value }))}
                                                    disabled={!canEdit} className="w-1/3 p-2 border rounded-lg text-sm bg-white disabled:bg-gray-50" />
                                                <input type="text" placeholder="電話" value={basicForm.parent_2_phone}
                                                    onChange={e => setBasicForm(f => ({ ...f, parent_2_phone: e.target.value }))}
                                                    disabled={!canEdit} className="w-2/3 p-2 border rounded-lg text-sm bg-white disabled:bg-gray-50" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 右：備註 */}
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 ml-1">放學接送方式</label>
                                    <select value={basicForm.pickup_method} onChange={e => setBasicForm(f => ({ ...f, pickup_method: e.target.value }))}
                                        disabled={!canEdit} className="w-full p-2.5 border rounded-xl font-bold text-sm mt-1 bg-gray-50 disabled:bg-gray-100">
                                        <option>🚗 家長接送</option>
                                        <option>🚶 自行回家</option>
                                        <option>🚌 安親班接送</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 ml-1">❤️ 過敏 / 健康備註</label>
                                    <textarea rows={3} value={basicForm.allergies}
                                        onChange={e => setBasicForm(f => ({ ...f, allergies: e.target.value }))}
                                        disabled={!canEdit} placeholder="例如：花生過敏、蠶豆症..."
                                        className="w-full p-3 border rounded-xl text-sm font-bold resize-none mt-1 bg-red-50 focus:bg-white outline-none disabled:bg-gray-50" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 ml-1">特殊照護需求</label>
                                    <textarea rows={2} value={basicForm.special_needs}
                                        onChange={e => setBasicForm(f => ({ ...f, special_needs: e.target.value }))}
                                        disabled={!canEdit} placeholder="例如：需協助餵藥..."
                                        className="w-full p-3 border rounded-xl text-sm font-bold resize-none mt-1 bg-gray-50 focus:bg-white outline-none disabled:bg-gray-50" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 ml-1">🔒 內部備註 (家長不可見)</label>
                                    <textarea rows={3} value={basicForm.internal_note}
                                        onChange={e => setBasicForm(f => ({ ...f, internal_note: e.target.value }))}
                                        disabled={!canEdit} placeholder="例如：個性活潑、注意與同學互動..."
                                        className="w-full p-3 border rounded-xl text-sm font-bold resize-none mt-1 bg-yellow-50 focus:bg-white outline-none disabled:bg-gray-50" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Tab 2: 學習檔案 ── */}
                    {activeTab === 'learning' && (
                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* 左：基礎學習資訊 */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs font-black text-gray-500 ml-1 uppercase">📚 英文程度</label>
                                        <select value={learningForm.level} onChange={e => setLearningForm(f => ({ ...f, level: e.target.value }))}
                                            disabled={!canEdit}
                                            className="w-full p-3 border rounded-xl font-bold text-sm mt-1 bg-purple-50 focus:bg-white outline-none disabled:bg-gray-50">
                                            <option value="">— 尚未設定 —</option>
                                            {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-black text-gray-500 ml-1 uppercase">📅 入學日期</label>
                                        <input type="date" value={learningForm.join_date}
                                            onChange={e => setLearningForm(f => ({ ...f, join_date: e.target.value }))}
                                            disabled={!canEdit}
                                            className="w-full p-3 border rounded-xl font-bold text-sm mt-1 bg-gray-50 focus:bg-white outline-none disabled:bg-gray-50" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-black text-gray-500 ml-1 uppercase">🎯 學習目標</label>
                                        <textarea rows={4} value={learningForm.learning_goal}
                                            onChange={e => setLearningForm(f => ({ ...f, learning_goal: e.target.value }))}
                                            disabled={!canEdit} placeholder="例如：半年內完成 Let's Go 2、提升口語表達..."
                                            className="w-full p-3 border rounded-xl text-sm font-bold resize-none mt-1 bg-teal-50 focus:bg-white outline-none disabled:bg-gray-50" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-black text-gray-500 ml-1 uppercase">🔒 老師總評 (內部)</label>
                                        <textarea rows={4} value={learningForm.teacher_assessment}
                                            onChange={e => setLearningForm(f => ({ ...f, teacher_assessment: e.target.value }))}
                                            disabled={!canEdit} placeholder="整體學習評估、個性特質、建議..."
                                            className="w-full p-3 border rounded-xl text-sm font-bold resize-none mt-1 bg-yellow-50 focus:bg-white outline-none disabled:bg-gray-50" />
                                    </div>
                                </div>

                                {/* 右：標籤 */}
                                <div className="space-y-4">
                                    <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                                        <h3 className="text-sm font-black text-green-700 mb-3">✦ 優勢標籤</h3>
                                        <div className="flex flex-wrap gap-2">
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
                                        </div>
                                        {learningForm.strength_tags.length > 0 && (
                                            <p className="text-xs text-green-600 mt-2 font-bold">
                                                已選：{learningForm.strength_tags.join('、')}
                                            </p>
                                        )}
                                    </div>

                                    <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                                        <h3 className="text-sm font-black text-amber-700 mb-3">△ 待加強標籤</h3>
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
                                        </div>
                                        {learningForm.improvement_tags.length > 0 && (
                                            <p className="text-xs text-amber-600 mt-2 font-bold">
                                                已選：{learningForm.improvement_tags.join('、')}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Tab 3: 學習表現 ── */}
                    {activeTab === 'analytics' && (
                        <AnalyticsTab studentId={student.id} studentName={student.chinese_name} />
                    )}
                </div>

                {/* Footer Actions */}
                {activeTab !== 'analytics' && (
                    <div className="px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex gap-3 flex-shrink-0">
                        <button onClick={onClose}
                            className="flex-1 py-2.5 rounded-xl font-bold text-gray-500 bg-white border hover:bg-gray-50 transition text-sm">
                            關閉
                        </button>
                        {canEdit && (
                            <button
                                onClick={activeTab === 'basic' ? saveBasic : saveLearning}
                                disabled={saving}
                                className="flex-1 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition text-sm disabled:opacity-60">
                                {saving ? '儲存中...' : '💾 儲存修改'}
                            </button>
                        )}
                    </div>
                )}
                {activeTab === 'analytics' && (
                    <div className="px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex-shrink-0">
                        <button onClick={onClose}
                            className="w-full py-2.5 rounded-xl font-bold text-gray-500 bg-white border hover:bg-gray-50 transition text-sm">
                            關閉
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Analytics Tab ─────────────────────────────────────────────────────────────

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

    if (loading) return <div className="p-10 text-center text-gray-400 font-bold">分析中...</div>;

    if (records.length === 0) {
        return (
            <div className="p-10 text-center text-gray-300">
                <div className="text-5xl mb-3">📊</div>
                <p className="font-bold text-gray-400">近 90 天尚無聯絡簿紀錄</p>
                <p className="text-xs text-gray-300 mt-1">老師填寫聯絡簿後，這裡會顯示學習趨勢分析</p>
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
        const week = `W${Math.ceil((d.getDate()) / 7)}-${d.getMonth() + 1}月`;
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
    if (attendancePct < 70) risks.push({ level: 'high', msg: `出席率僅 ${attendancePct}%，可能影響學習連貫性`, icon: '🔴' });
    else if (attendancePct < 85) risks.push({ level: 'medium', msg: `出席率 ${attendancePct}%，略低於建議標準`, icon: '🟡' });

    let consecutive = 0, maxConsecutive = 0;
    for (const r of presentRecords) {
        if (r.focus && r.focus <= 2) { consecutive++; maxConsecutive = Math.max(maxConsecutive, consecutive); }
        else consecutive = 0;
    }
    if (maxConsecutive >= 3) risks.push({ level: 'medium', msg: `曾連續 ${maxConsecutive} 次專注度偏低`, icon: '🟡' });

    const unsignedCount = presentRecords.filter(r => !r.parent_signature).length;
    const unsignedPct = presentRecords.length > 0 ? Math.round((unsignedCount / presentRecords.length) * 100) : 0;
    if (unsignedPct > 50) risks.push({ level: 'low', msg: `家長簽名率僅 ${100 - unsignedPct}%，溝通頻率偏低`, icon: '🟡' });

    if (risks.length === 0) risks.push({ level: 'ok', msg: '目前無異常，學習狀況良好 👍', icon: '🟢' });

    return (
        <div className="p-6 space-y-6">
            {/* 頂部摘要 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="出席率" value={`${attendancePct}%`} sub={`${presentRecords.length}/${totalDays} 天`}
                    color={attendancePct >= 85 ? 'text-green-600' : attendancePct >= 70 ? 'text-amber-500' : 'text-red-500'} />
                <StatCard label="平均專注度" value={avgFocus > 0 ? avgFocus.toFixed(1) : '—'} sub="滿分 5 顆星" color="text-indigo-600" />
                <StatCard label="平均互動性" value={avgParticipation > 0 ? avgParticipation.toFixed(1) : '—'} sub="課堂互動" color="text-purple-600" />
                <StatCard label="整體趨勢"
                    value={trend === 0 ? '—' : trend > 0 ? `↑ +${trend.toFixed(1)}` : `↓ ${trend.toFixed(1)}`}
                    sub={trend > 0.2 ? '持續進步中' : trend < -0.2 ? '需要關注' : '穩定維持'}
                    color={trend > 0.2 ? 'text-green-600' : trend < -0.2 ? 'text-red-500' : 'text-gray-500'} />
            </div>

            {/* 趨勢圖 */}
            {weeks.length >= 2 && (
                <div className="bg-white border rounded-xl p-4">
                    <h3 className="text-sm font-black text-gray-700 mb-4">📈 近期學習趨勢 (週平均)</h3>
                    <div className="flex items-end gap-6">
                        <div className="flex-1">
                            <TrendChart
                                series={[
                                    { label: '專注度', data: weeklyFocus, color: '#6366f1' },
                                    { label: '課堂互動', data: weeklyParticipation, color: '#10b981' },
                                    { label: '主動表達', data: weeklyExpression, color: '#f59e0b' }
                                ]}
                                labels={weeks}
                            />
                        </div>
                        <div className="flex flex-col gap-2 text-xs font-bold shrink-0">
                            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-indigo-500 inline-block rounded" /> 專注度</span>
                            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-500 inline-block rounded" /> 課堂互動</span>
                            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-amber-400 inline-block rounded" /> 主動表達</span>
                        </div>
                    </div>
                    <div className="flex gap-2 mt-2 overflow-x-auto">
                        {weeks.map(w => (
                            <span key={w} className="text-[10px] text-gray-400 flex-shrink-0">{w}</span>
                        ))}
                    </div>
                </div>
            )}

            {/* 風險預警 */}
            <div className="bg-white border rounded-xl p-4">
                <h3 className="text-sm font-black text-gray-700 mb-3">⚠️ 學習預警</h3>
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

            {/* 近期紀錄快覽 */}
            <div className="bg-white border rounded-xl p-4">
                <h3 className="text-sm font-black text-gray-700 mb-3">📋 最近 10 次紀錄</h3>
                <div className="space-y-1">
                    {[...records].reverse().slice(0, 10).map((r, i) => (
                        <div key={i} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                            <span className="text-xs text-gray-400 font-bold w-20 shrink-0">{r.date}</span>
                            {r.is_absent
                                ? <span className="text-xs text-red-400 font-bold">缺席</span>
                                : <>
                                    <MiniStars n={r.mood} color="text-yellow-400" />
                                    <span className="text-xs text-gray-300">|</span>
                                    <MiniStars n={r.focus} color="text-indigo-400" />
                                    <span className="text-xs text-gray-300">|</span>
                                    <MiniStars n={r.participation} color="text-emerald-400" />
                                    {r.parent_signature && <span className="text-[10px] text-green-500 font-bold ml-auto">✍️ 已簽</span>}
                                </>
                            }
                        </div>
                    ))}
                </div>
                <p className="text-[10px] text-gray-300 mt-2">⭐ 心情 | 🔵 專注 | 🟢 互動</p>
            </div>
        </div>
    );
}

// ── Add Student Modal ─────────────────────────────────────────────────────────

function AddStudentModal({ onClose, onSaved }: any) {
    const [form, setForm] = useState({
        chinese_name: '', english_name: '', birthday: '',
        school_grade: '國小 一年級', english_class: 'CEI-A', is_after_school: false,
        parent_email: '', parent_relationship: '', parent_phone: '',
        allergies: '', pickup_method: '家長接送'
    });
    const [saving, setSaving] = useState(false);

    async function handleSubmit() {
        if (!form.chinese_name) return alert('請輸入中文姓名');
        setSaving(true);
        try {
            let p1_id = null;
            if (form.parent_email) {
                const { data } = await supabase.from('users').select('id').eq('email', form.parent_email).single();
                if (data) p1_id = data.id;
            }
            const grade = form.english_class === 'NONE' && form.is_after_school ? '課後輔導'
                : form.english_class === 'NONE' ? '未分類'
                    : form.is_after_school ? `${form.english_class}, 課後輔導`
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
        } catch (e: any) { alert('❌ 失敗: ' + e.message); }
        finally { setSaving(false); }
    }

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
                <div className="flex justify-between items-center mb-5 pb-3 border-b">
                    <h2 className="text-xl font-black text-gray-800">➕ 新增學生</h2>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold text-gray-500">✕</button>
                </div>
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="中文姓名 *" value={form.chinese_name} onChange={v => setForm(f => ({ ...f, chinese_name: v }))} />
                        <Field label="英文姓名" value={form.english_name} onChange={v => setForm(f => ({ ...f, english_name: v }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="生日" type="date" value={form.birthday} onChange={v => setForm(f => ({ ...f, birthday: v }))} />
                        <div>
                            <label className="text-xs font-bold text-gray-400 ml-1">學校年級</label>
                            <select value={form.school_grade} onChange={e => setForm(f => ({ ...f, school_grade: e.target.value }))}
                                className="w-full p-2.5 border rounded-xl text-sm font-bold mt-1 bg-gray-50">
                                {SCHOOL_GRADE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-bold text-gray-400 ml-1">英文班級</label>
                            <select value={form.english_class} onChange={e => setForm(f => ({ ...f, english_class: e.target.value }))}
                                className="w-full p-2.5 border rounded-xl text-sm font-bold mt-1 bg-gray-50">
                                {ENGLISH_CLASS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div className="flex items-end pb-1">
                            <label className="flex items-center gap-2 cursor-pointer p-2.5 border rounded-xl w-full bg-gray-50">
                                <input type="checkbox" checked={form.is_after_school} onChange={e => setForm(f => ({ ...f, is_after_school: e.target.checked }))} className="w-4 h-4 accent-indigo-600" />
                                <span className="text-sm font-bold text-gray-700">課後輔導</span>
                            </label>
                        </div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-xl border">
                        <p className="text-xs font-bold text-gray-500 mb-2">📞 主要照顧者</p>
                        <Field label="家長 Email" type="email" value={form.parent_email} onChange={v => setForm(f => ({ ...f, parent_email: v }))} />
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <Field label="稱謂" value={form.parent_relationship} onChange={v => setForm(f => ({ ...f, parent_relationship: v }))} />
                            <Field label="電話" value={form.parent_phone} onChange={v => setForm(f => ({ ...f, parent_phone: v }))} />
                        </div>
                    </div>
                </div>
                <div className="flex gap-3 mt-5 pt-4 border-t">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition text-sm">取消</button>
                    <button onClick={handleSubmit} disabled={saving}
                        className="flex-1 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition text-sm disabled:opacity-60">
                        {saving ? '新增中...' : '確認新增'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── 小工具元件 ─────────────────────────────────────────────────────────────────

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
            {'★'.repeat(Math.round(n || 0))}{'☆'.repeat(5 - Math.round(n || 0))}
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
