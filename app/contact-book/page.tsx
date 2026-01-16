'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

// 預設表單資料結構
const DEFAULT_FORM = {
    mood: 3,
    focus: 3,
    appetite: 3,
    homework: '',
    note: '',
    photos: [] as string[],
    is_absent: false,
    signature: null as string | null
};

export default function ContactBookPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [userRole, setUserRole] = useState<string>('');

    // 資料狀態
    const [students, setStudents] = useState<any[]>([]);
    const [forms, setForms] = useState<Record<string, typeof DEFAULT_FORM>>({});

    // UI 狀態
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedClass, setSelectedClass] = useState<string | null>(null); // null 代表在「班級大廳」
    const [uniqueClasses, setUniqueClasses] = useState<string[]>([]);
    const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

    // 上傳相關
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadingStudentId, setUploadingStudentId] = useState<string | null>(null);

    // 群發相關
    const [bulkHomework, setBulkHomework] = useState('');
    const [bulkAnnouncement, setBulkAnnouncement] = useState('');

    // 1. 初始化資料抓取
    const fetchData = useCallback(async () => {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        setCurrentUser(session.user);
        const { data: userData } = await supabase.from('users').select('role').eq('id', session.user.id).single();
        const role = userData?.role || 'parent';
        setUserRole(role);

        // 抓學生資料
        let query = supabase.from('students').select('*').order('grade').order('chinese_name');
        if (role === 'parent') {
            query = query.or(`parent_id.eq.${session.user.id},parent_id_2.eq.${session.user.id}`);
        }

        const { data } = await query;
        const studentList = data || [];
        setStudents(studentList);

        // 整理出所有班級
        const classes = Array.from(new Set(studentList.map(s => s.grade || '未分類')));
        setUniqueClasses(classes);

        // 如果是家長，直接顯示所有小孩，不需要選班級
        if (role === 'parent') {
            setSelectedClass('ALL');
        }

        setLoading(false);
    }, [router]);

    // 2. 抓取歷史紀錄
    const fetchHistory = useCallback(async () => {
        if (!selectedClass) return;

        // 篩選出要查的學生 ID
        const targetStudents = (userRole === 'parent' || selectedClass === 'ALL')
            ? students
            : students.filter(s => (s.grade || '未分類') === selectedClass);

        const ids = targetStudents.map(s => s.id);
        if (ids.length === 0) return;

        const { data: historyLogs } = await supabase
            .from('contact_books')
            .select('*')
            .in('student_id', ids)
            .eq('date', selectedDate);

        const newForms: Record<string, typeof DEFAULT_FORM> = {};

        // 先初始化
        ids.forEach(id => { newForms[id] = { ...DEFAULT_FORM }; });

        // 填入資料
        if (historyLogs && historyLogs.length > 0) {
            historyLogs.forEach(log => {
                newForms[log.student_id] = {
                    mood: log.mood,
                    focus: log.focus,
                    appetite: log.appetite,
                    homework: log.homework || '',
                    note: log.teacher_note || '',
                    photos: log.photos || [],
                    is_absent: log.is_absent || false,
                    signature: log.parent_signature
                };
            });
        }
        setForms(prev => ({ ...prev, ...newForms }));
    }, [selectedClass, selectedDate, students, userRole]);

    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => { if (students.length > 0) fetchHistory(); }, [fetchHistory, students.length]);

    // --- 功能函式 ---

    const handleFormChange = (studentId: string, field: string, value: any) => {
        setForms(prev => ({
            ...prev,
            [studentId]: { ...(prev[studentId] || DEFAULT_FORM), [field]: value }
        }));
    };

    const handleUploadClick = (studentId: string) => {
        setUploadingStudentId(studentId);
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0 || !uploadingStudentId) return;

        const uploadedUrls: string[] = [];
        const studentName = students.find(s => s.id === uploadingStudentId)?.chinese_name || 'unknown';

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const filePath = `${selectedDate}/${studentName}_${Date.now()}_${i}.${file.name.split('.').pop()}`;
                const { error } = await supabase.storage.from('contact_photos').upload(filePath, file);
                if (error) throw error;
                const { data } = supabase.storage.from('contact_photos').getPublicUrl(filePath);
                uploadedUrls.push(data.publicUrl);
            }

            setForms(prev => ({
                ...prev,
                [uploadingStudentId]: {
                    ...prev[uploadingStudentId],
                    photos: [...(prev[uploadingStudentId]?.photos || []), ...uploadedUrls]
                }
            }));
            alert(`✅ 成功上傳 ${uploadedUrls.length} 張照片`);
        } catch (err: any) {
            alert('❌ 上傳失敗: ' + err.message);
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
            setUploadingStudentId(null);
        }
    };

    const handleSign = async (student: any) => {
        if (!confirm('確認簽名？')) return;
        try {
            const now = new Date().toISOString();
            await supabase.from('contact_books').update({ parent_signature: now }).eq('student_id', student.id).eq('date', selectedDate);
            handleFormChange(student.id, 'signature', now);
            alert('✅ 簽名完成');
        } catch (e: any) {
            alert('失敗: ' + e.message);
        }
    };

    const handleSave = async (student: any) => {
        const formData = forms[student.id] || DEFAULT_FORM;
        try {
            const { data: existing } = await supabase.from('contact_books').select('id').eq('student_id', student.id).eq('date', selectedDate).single();
            const payload = {
                student_id: student.id,
                date: selectedDate,
                mood: formData.mood,
                focus: formData.focus,
                appetite: formData.appetite,
                homework: formData.homework,
                teacher_note: formData.note,
                photos: formData.photos,
                is_absent: formData.is_absent
            };

            if (existing) {
                await supabase.from('contact_books').update(payload).eq('id', existing.id);
                await supabase.from('system_logs').insert({
                    operator_email: currentUser?.email,
                    action: 'UPDATE_CONTACT_BOOK',
                    details: `更新 ${student.chinese_name} ${selectedDate} 聯絡簿`
                });
            } else {
                await supabase.from('contact_books').insert(payload);
            }
            alert(`💾 ${student.chinese_name} 儲存成功`);
        } catch (e: any) {
            alert('❌ 儲存失敗: ' + e.message);
        }
    };

    // 📢 群發邏輯 (作業覆蓋 + 叮嚀附加)
    const handleBulkApply = () => {
        if (!bulkHomework && !bulkAnnouncement) return alert('請輸入內容');
        if (!confirm(`確定要套用給 ${selectedClass} 全班嗎？`)) return;

        setForms(prev => {
            const next = { ...prev };
            const targets = students.filter(s => (s.grade || '未分類') === selectedClass);
            targets.forEach(s => {
                const currentNote = next[s.id].note || '';
                // 只有當尚未加入該叮嚀時才附加，避免重複
                const newNote = bulkAnnouncement && !currentNote.includes(bulkAnnouncement)
                    ? (currentNote ? `${currentNote}\n\n【班級叮嚀】${bulkAnnouncement}` : `【班級叮嚀】${bulkAnnouncement}`)
                    : currentNote;

                next[s.id] = {
                    ...next[s.id],
                    homework: bulkHomework || next[s.id].homework, // 只覆蓋作業
                    note: newNote // 叮嚀是附加的
                };
            });
            return next;
        });
        alert('✅ 已套用！');
    };

    // --- 元件 ---

    const StarRating = ({ value, onChange, label, disabled }: any) => (
        <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-bold text-gray-400 uppercase">{label}</span>
            <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        disabled={disabled}
                        onClick={() => onChange(star)}
                        className={`text-lg ${star <= value ? 'text-yellow-400' : 'text-gray-200'} ${!disabled && 'hover:scale-110'}`}
                    >
                        ★
                    </button>
                ))}
            </div>
        </div>
    );

    if (loading) return <div className="min-h-screen flex justify-center items-center text-gray-400 font-bold">載入中...</div>;

    // 判斷是否為「班級大廳」模式
    const isDashboard = !selectedClass && userRole !== 'parent';
    // 篩選出目前要顯示的學生
    const filteredStudents = (userRole === 'parent' || selectedClass === 'ALL')
        ? students
        : students.filter(s => (s.grade || '未分類') === selectedClass);

    const isTeacher = userRole !== 'parent';

    return (
        <div className="min-h-screen bg-[#F3F4F6] pb-20 font-sans">
            <input type="file" multiple accept="image/*" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
            {lightboxPhoto && (
                <div className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setLightboxPhoto(null)}>
                    <img src={lightboxPhoto} alt="Zoom" className="max-w-full max-h-[90vh] rounded shadow-2xl" />
                    <button className="absolute top-6 right-6 text-white text-4xl">×</button>
                </div>
            )}

            {/* Header */}
            <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm">
                <div className="max-w-6xl mx-auto px-4 py-3">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setSelectedClass(null)} // 點擊 Logo 回到大廳
                                className="bg-indigo-600 text-white p-2 rounded-lg shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition"
                            >
                                📖
                            </button>
                            <div>
                                <h1 className="text-lg font-black text-gray-800">
                                    {isDashboard ? '班級大廳' : (selectedClass === 'ALL' ? '我的孩子' : `${selectedClass} 教室`)}
                                </h1>
                                <p className="text-[10px] text-gray-400 font-bold">{selectedDate}</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-gray-100 rounded-lg px-3 py-1.5 text-sm font-bold text-gray-600 outline-none" />
                            <button onClick={() => router.push('/')} className="text-gray-400 hover:text-gray-600 text-sm font-bold px-2">退出</button>
                        </div>
                    </div>

                    {/* 如果在教室內，顯示「切換班級」按鈕 */}
                    {!isDashboard && isTeacher && (
                        <div className="mt-2 flex">
                            <button onClick={() => setSelectedClass(null)} className="text-xs text-indigo-500 font-bold hover:underline flex items-center gap-1">
                                ⬅ 回到班級選單
                            </button>
                        </div>
                    )}
                </div>

                {/* 群發控制台 (只在進入特定班級時顯示) */}
                {!isDashboard && isTeacher && selectedClass !== 'ALL' && (
                    <div className="bg-indigo-50/80 border-b border-indigo-100 px-4 py-3">
                        <div className="max-w-6xl mx-auto">
                            <details className="group">
                                <summary className="flex items-center gap-2 font-bold text-indigo-900 cursor-pointer list-none select-none">
                                    <span className="w-6 h-6 bg-indigo-200 text-indigo-700 rounded-full flex items-center justify-center text-xs">📢</span>
                                    <span>班級廣播站 (Bulk Actions)</span>
                                    <span className="text-[10px] text-indigo-400 ml-2 font-normal">(點擊展開)</span>
                                </summary>
                                <div className="mt-4 grid md:grid-cols-2 gap-3 animate-fade-in pl-8">
                                    <div>
                                        <label className="text-xs font-bold text-indigo-400 ml-1">📚 全班今日作業</label>
                                        <input type="text" placeholder="輸入作業..." value={bulkHomework} onChange={e => setBulkHomework(e.target.value)} className="w-full p-2 bg-white border border-indigo-100 rounded-lg text-sm font-bold" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-indigo-400 ml-1">🔔 全班統一叮嚀 (附加在評語後)</label>
                                        <input type="text" placeholder="例如: 明天穿運動服..." value={bulkAnnouncement} onChange={e => setBulkAnnouncement(e.target.value)} className="w-full p-2 bg-white border border-indigo-100 rounded-lg text-sm font-bold" />
                                    </div>
                                    <button onClick={handleBulkApply} className="md:col-span-2 bg-indigo-600 text-white py-2 rounded-lg font-bold text-sm hover:bg-indigo-700 shadow-sm">⚡ 套用設定</button>
                                </div>
                            </details>
                        </div>
                    </div>
                )}
            </div>

            <div className="max-w-6xl mx-auto p-4">
                {/* MODE 1: 班級大廳 (Dashboard) */}
                {isDashboard && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-8">
                        {uniqueClasses.map(cls => {
                            const count = students.filter(s => (s.grade || '未分類') === cls).length;
                            return (
                                <button
                                    key={cls}
                                    onClick={() => setSelectedClass(cls)}
                                    className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 hover:shadow-xl hover:border-indigo-100 hover:-translate-y-1 transition-all text-left group"
                                >
                                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-2xl mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                        🏫
                                    </div>
                                    <h3 className="text-xl font-black text-gray-800 mb-1">{cls}</h3>
                                    <p className="text-sm font-bold text-gray-400">{count} 位學生</p>
                                </button>
                            );
                        })}
                        {uniqueClasses.length === 0 && <div className="col-span-full text-center text-gray-400 py-20 font-bold">目前沒有任何班級資料</div>}
                    </div>
                )}

                {/* MODE 2: 學生列表 (Classroom) */}
                {!isDashboard && (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {filteredStudents.length === 0 ? (
                            <div className="col-span-full text-center py-20 text-gray-300 font-bold">此班級無學生</div>
                        ) : (
                            filteredStudents.map(student => {
                                const form = forms[student.id] || DEFAULT_FORM;
                                const absent = form.is_absent;

                                return (
                                    <div key={student.id} className={`bg-white rounded-3xl shadow-sm border transition-all ${absent ? 'border-gray-200 bg-gray-50/50 grayscale' : 'border-gray-100 hover:shadow-xl hover:border-indigo-100'}`}>

                                        {/* 卡片標頭 */}
                                        <div className="p-5 flex justify-between items-start border-b border-gray-50">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl ${absent ? 'bg-gray-200 text-gray-400' : 'bg-[#EEF2FF] text-[#4F46E5]'}`}>
                                                    {student.chinese_name.charAt(0)}
                                                </div>
                                                <div>
                                                    <h3 className="font-black text-lg text-gray-800 flex items-center gap-2">
                                                        {student.chinese_name}
                                                        {absent && <span className="bg-gray-500 text-white text-[10px] px-2 py-0.5 rounded-full">請假</span>}
                                                    </h3>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase">{student.grade}</p>
                                                </div>
                                            </div>

                                            <div className="flex flex-col items-end gap-2">
                                                {form.signature ? (
                                                    <span className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded font-bold">✅ 已簽名</span>
                                                ) : (
                                                    <span className="text-[10px] bg-red-50 text-red-400 px-2 py-1 rounded font-bold">尚未簽名</span>
                                                )}
                                                {isTeacher && (
                                                    <label className="text-[10px] font-bold text-gray-400 flex items-center gap-1 cursor-pointer">
                                                        <input type="checkbox" checked={form.is_absent} onChange={e => handleFormChange(student.id, 'is_absent', e.target.checked)} className="accent-gray-500" />
                                                        請假
                                                    </label>
                                                )}
                                            </div>
                                        </div>

                                        {/* 內容區 */}
                                        <div className={`p-5 space-y-4 ${absent ? 'opacity-50 pointer-events-none' : ''}`}>
                                            <div className="flex justify-between bg-gray-50 p-3 rounded-xl border border-gray-100">
                                                <StarRating label="心情" value={form.mood} onChange={(v: any) => handleFormChange(student.id, 'mood', v)} disabled={!isTeacher} />
                                                <div className="w-px bg-gray-200"></div>
                                                <StarRating label="專注" value={form.focus} onChange={(v: any) => handleFormChange(student.id, 'focus', v)} disabled={!isTeacher} />
                                                <div className="w-px bg-gray-200"></div>
                                                <StarRating label="食慾" value={form.appetite} onChange={(v: any) => handleFormChange(student.id, 'appetite', v)} disabled={!isTeacher} />
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-black text-gray-400 ml-1 uppercase">📚 今日作業</label>
                                                {isTeacher ? (
                                                    <input type="text" value={form.homework} onChange={e => handleFormChange(student.id, 'homework', e.target.value)} className="w-full p-3 bg-gray-50 border-transparent hover:border-indigo-100 focus:bg-white focus:border-indigo-500 rounded-xl font-bold text-sm text-gray-700 outline-none transition-all" placeholder="輸入作業..." />
                                                ) : (
                                                    <div className="p-3 bg-gray-50 rounded-xl font-bold text-sm text-gray-700 min-h-[46px]">{form.homework || '無'}</div>
                                                )}
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-black text-gray-400 ml-1 uppercase">💬 老師叮嚀</label>
                                                {isTeacher ? (
                                                    <textarea rows={3} value={form.note} onChange={e => handleFormChange(student.id, 'note', e.target.value)} className="w-full p-3 bg-gray-50 border-transparent hover:border-indigo-100 focus:bg-white focus:border-indigo-500 rounded-xl font-bold text-sm text-gray-700 outline-none transition-all resize-none" placeholder="個別評語..." />
                                                ) : (
                                                    <div className="p-3 bg-gray-50 rounded-xl font-bold text-sm text-gray-700 min-h-[80px] whitespace-pre-wrap">{form.note || '無'}</div>
                                                )}
                                            </div>

                                            {/* 照片 */}
                                            <div>
                                                <div className="flex justify-between items-center mb-1">
                                                    <label className="text-[10px] font-black text-gray-400 ml-1 uppercase">📸 照片</label>
                                                    {isTeacher && <button onClick={() => handleUploadClick(student.id)} className="text-[10px] text-indigo-500 font-bold hover:bg-indigo-50 px-2 py-0.5 rounded">➕ 上傳</button>}
                                                </div>
                                                <div className="flex gap-2 overflow-x-auto min-h-[60px] pb-1">
                                                    {form.photos?.map((url: string, i: number) => (
                                                        <img key={i} src={url} onClick={() => setLightboxPhoto(url)} className="w-16 h-16 rounded-lg object-cover border border-gray-100 cursor-zoom-in" />
                                                    ))}
                                                    {!form.photos?.length && <div className="text-xs text-gray-300 italic flex items-center pl-1">無照片</div>}
                                                </div>
                                            </div>

                                            {/* 按鈕 */}
                                            <div className="pt-2">
                                                {isTeacher ? (
                                                    <button onClick={() => handleSave(student)} className={`w-full py-2.5 rounded-xl font-bold text-sm text-white shadow-md transition-all active:scale-95 ${selectedDate !== new Date().toISOString().split('T')[0] ? 'bg-orange-500 hover:bg-orange-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                                                        {selectedDate !== new Date().toISOString().split('T')[0] ? '💾 修改歷史紀錄' : '📤 發送 / 儲存'}
                                                    </button>
                                                ) : (
                                                    !form.signature && <button onClick={() => handleSign(student)} className="w-full py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-black text-base shadow-lg shadow-green-200 animate-pulse">✍️ 簽名確認</button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}