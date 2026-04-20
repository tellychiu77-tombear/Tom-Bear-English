'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

const DEFAULT_FORM = {
    mood: 3,           // 心情
    focus: 3,          // 專注度
    participation: 3,  // 課堂互動
    expression: 3,     // 主動表達
    lesson_topic: '',  // 今日主題（班級共用）
    homework: '',      // 複習建議
    note: '',          // 🔒 內部備註（家長看不到）
    public_note: '',   // 📤 公開留言（家長看得到）
    photos: [] as string[],
    is_absent: false,
    signature: null as string | null
};

export default function ContactBookPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [userRole, setUserRole] = useState<string>('');

    // Data
    const [students, setStudents] = useState<any[]>([]);
    const [forms, setForms] = useState<Record<string, typeof DEFAULT_FORM>>({});

    // UI
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedClass, setSelectedClass] = useState<string | null>(null);
    const [uniqueClasses, setUniqueClasses] = useState<string[]>([]);
    const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

    // 📅 月曆相關狀態 (Calendar State)
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [calendarMonth, setCalendarMonth] = useState(new Date()); // 記錄目前查看的月份
    const [monthStats, setMonthStats] = useState<Record<string, any>>({}); // 該月份的統計資料

    // Upload
    const fileInputRef = useRef<HTMLInputElement>(null);
    const bulkFileInputRef = useRef<HTMLInputElement>(null);
    const [uploadingStudentId, setUploadingStudentId] = useState<string | null>(null);

    // Bulk Actions
    const [bulkLessonTopic, setBulkLessonTopic] = useState('');
    const [bulkHomework, setBulkHomework] = useState('');
    const [bulkAnnouncement, setBulkAnnouncement] = useState('');

    // Collapsible cards
    const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());
    const [showOnlyUnfilled, setShowOnlyUnfilled] = useState(false);

    // Save tracking
    const [savedStudentIds, setSavedStudentIds] = useState<Set<string>>(new Set());
    const [savingAll, setSavingAll] = useState(false);

    const parseClassTags = (gradeString: string): string[] => {
        if (!gradeString) return ['待分班'];
        const tags = gradeString.split(/[,，]/).map(s => s.trim()).filter(s => s !== '');
        // 標準化常見的班級名稱寫法
        return tags.map(tag => {
            if (tag === '課後輔導' || tag === '課後') return '課後輔導班';
            if (tag === '未分類' || tag === '未分班') return '待分班';
            return tag;
        });
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        setCurrentUser(session.user);
        const { data: userData } = await supabase.from('users').select('role').eq('id', session.user.id).single();
        const role = userData?.role || 'parent';
        setUserRole(role);

        let query = supabase.from('students').select('*').order('grade').order('chinese_name');
        if (role === 'parent') {
            query = query.or(`parent_id.eq.${session.user.id},parent_id_2.eq.${session.user.id}`);
        }

        const { data } = await query;
        const studentList = data || [];
        setStudents(studentList);

        const classesSet = new Set<string>();
        studentList.forEach(s => {
            const tags = parseClassTags(s.grade);
            tags.forEach(tag => classesSet.add(tag));
        });

        const sortedClasses = Array.from(classesSet).sort();
        setUniqueClasses(sortedClasses);

        if (role === 'parent') {
            setSelectedClass('ALL');
        }
        setLoading(false);
    }, [router]);

    // 抓取單日詳細內容
    const fetchHistory = useCallback(async () => {
        if (!selectedClass) return;

        const targetStudents = (userRole === 'parent' || selectedClass === 'ALL')
            ? students
            : students.filter(s => parseClassTags(s.grade).includes(selectedClass));

        const ids = targetStudents.map(s => s.id);
        if (ids.length === 0) return;

        const { data: historyLogs } = await supabase
            .from('contact_books')
            .select('*')
            .in('student_id', ids)
            .eq('date', selectedDate);

        const newForms: Record<string, typeof DEFAULT_FORM> = {};
        ids.forEach(id => { newForms[id] = { ...DEFAULT_FORM }; });

        if (historyLogs && historyLogs.length > 0) {
            historyLogs.forEach(log => {
                newForms[log.student_id] = {
                    mood: log.mood ?? 3,
                    focus: log.focus ?? 3,
                    participation: log.participation ?? 3,
                    expression: log.expression ?? 3,
                    lesson_topic: log.lesson_topic || '',
                    homework: log.homework || '',
                    note: log.teacher_note || '',
                    public_note: log.public_note || '',
                    photos: log.photos || [],
                    is_absent: log.is_absent || false,
                    signature: log.parent_signature
                };
            });
        }
        setForms(prev => ({ ...prev, ...newForms }));
        // Mark students that already have a record today as saved
        if (historyLogs && historyLogs.length > 0) {
            setSavedStudentIds(new Set(historyLogs.map((l: any) => l.student_id)));
        }
    }, [selectedClass, selectedDate, students, userRole]);

    // 📅 抓取整個月的統計資料 (用於月曆)
    const fetchMonthStats = useCallback(async (date: Date) => {
        if (!selectedClass) return;

        const year = date.getFullYear();
        const month = date.getMonth() + 1; // JS month is 0-indexed

        // 1. 計算該月的第一天與最後一天
        const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
        const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];

        // 2. 確定要查詢的學生群
        const targetStudents = (userRole === 'parent' || selectedClass === 'ALL')
            ? students
            : students.filter(s => parseClassTags(s.grade).includes(selectedClass));
        const ids = targetStudents.map(s => s.id);

        if (ids.length === 0) {
            setMonthStats({});
            return;
        }

        // 3. 查詢該月的所有紀錄 (只取必要欄位以優化效能)
        const { data } = await supabase
            .from('contact_books')
            .select('date, student_id, parent_signature')
            .in('student_id', ids)
            .gte('date', startOfMonth)
            .lte('date', endOfMonth);

        if (!data) return;

        // 4. 統計數據
        const stats: Record<string, any> = {};

        if (userRole === 'parent') {
            // 家長模式：每天的狀態 (是否未簽名)
            data.forEach(row => {
                if (!stats[row.date]) stats[row.date] = { hasData: false, signed: true };
                stats[row.date].hasData = true;
                if (!row.parent_signature) stats[row.date].signed = false; // 只要有一個沒簽就算沒簽
            });
        } else {
            // 老師模式：每天的完成數
            data.forEach(row => {
                if (!stats[row.date]) stats[row.date] = { count: 0, total: ids.length };
                stats[row.date].count += 1;
            });
        }
        setMonthStats(stats);

    }, [selectedClass, students, userRole]);

    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => { if (students.length > 0) fetchHistory(); }, [fetchHistory, students.length]);
    // Reset card expanded state when class or date changes
    useEffect(() => {
        setExpandedStudents(new Set());
        setShowOnlyUnfilled(false);
        setSavedStudentIds(new Set());
    }, [selectedClass, selectedDate]);

    // 當月曆打開或切換月份時，重新抓統計
    useEffect(() => {
        if (isCalendarOpen) {
            fetchMonthStats(calendarMonth);
        }
    }, [isCalendarOpen, calendarMonth, fetchMonthStats]);

    // --- Actions ---

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

    const handleBulkUploadClick = () => {
        bulkFileInputRef.current?.click();
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, isBulk: boolean = false) => {
        // ... (保持原有的上傳邏輯)
        const files = e.target.files;
        if (!files || files.length === 0) return;
        if (!isBulk && !uploadingStudentId) return;

        const targetIds = isBulk
            ? students.filter(s => parseClassTags(s.grade).includes(selectedClass!)).map(s => s.id)
            : [uploadingStudentId!];

        if (targetIds.length === 0) return;

        if (isBulk && !confirm(`即將上傳 ${files.length} 張照片給本班 ${targetIds.length} 位學生，確定嗎？`)) {
            if (bulkFileInputRef.current) bulkFileInputRef.current.value = '';
            return;
        }

        try {
            const uploadedUrls: string[] = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const filePath = `${selectedDate}/BULK_${Date.now()}_${i}.${file.name.split('.').pop()}`;
                const { error } = await supabase.storage.from('contact_photos').upload(filePath, file);
                if (error) throw error;
                const { data } = supabase.storage.from('contact_photos').getPublicUrl(filePath);
                uploadedUrls.push(data.publicUrl);
            }
            setForms(prev => {
                const next = { ...prev };
                targetIds.forEach(id => {
                    next[id] = { ...next[id], photos: [...(next[id]?.photos || []), ...uploadedUrls] };
                });
                return next;
            });
            alert(`✅ 上傳成功`);
        } catch (err: any) {
            alert('❌ 上傳失敗: ' + err.message);
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (bulkFileInputRef.current) bulkFileInputRef.current.value = '';
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

    const handleSave = async (student: any, silent = false) => {
        const formData = forms[student.id] || DEFAULT_FORM;
        try {
            const { data: existing } = await supabase.from('contact_books').select('id').eq('student_id', student.id).eq('date', selectedDate).single();
            const payload = {
                student_id: student.id,
                date: selectedDate,
                mood: formData.mood,
                focus: formData.focus,
                participation: formData.participation,
                expression: formData.expression,
                lesson_topic: formData.lesson_topic,
                homework: formData.homework,
                teacher_note: formData.note,
                public_note: formData.public_note,
                photos: formData.photos,
                is_absent: formData.is_absent
            };

            if (existing) {
                await supabase.from('contact_books').update(payload).eq('id', existing.id);
            } else {
                await supabase.from('contact_books').insert(payload);
            }
            setSavedStudentIds(prev => new Set([...prev, student.id]));
            if (isCalendarOpen) fetchMonthStats(calendarMonth);
        } catch (e: any) {
            if (!silent) alert('❌ 儲存失敗: ' + e.message);
        }
    };

    const handleSaveAll = async () => {
        if (!filteredStudents.length) return;
        if (!confirm(`確定要儲存全班 ${filteredStudents.length} 位學生的資料嗎？`)) return;
        setSavingAll(true);

        // 一次查出全班今日現有紀錄
        const ids = filteredStudents.map(s => s.id);
        const { data: existingRecords } = await supabase
            .from('contact_books').select('id, student_id')
            .in('student_id', ids).eq('date', selectedDate);
        const existingMap = new Map((existingRecords || []).map((r: any) => [r.student_id, r.id]));

        const toInsert: any[] = [];
        const toUpdate: any[] = [];

        filteredStudents.forEach(student => {
            const f = forms[student.id] || DEFAULT_FORM;
            const payload = {
                student_id: student.id, date: selectedDate,
                mood: f.mood, focus: f.focus,
                participation: f.participation, expression: f.expression,
                lesson_topic: f.lesson_topic, homework: f.homework,
                teacher_note: f.note, public_note: f.public_note,
                photos: f.photos, is_absent: f.is_absent,
            };
            if (existingMap.has(student.id)) toUpdate.push({ id: existingMap.get(student.id), ...payload });
            else toInsert.push(payload);
        });

        try {
            if (toInsert.length) await supabase.from('contact_books').insert(toInsert);
            for (const { id, ...data } of toUpdate) {
                await supabase.from('contact_books').update(data).eq('id', id);
            }
            setSavedStudentIds(new Set(filteredStudents.map(s => s.id)));
            if (isCalendarOpen) fetchMonthStats(calendarMonth);
        } catch (e: any) {
            alert('❌ 儲存失敗：' + e.message);
        }
        setSavingAll(false);
    };

    const handleBulkApply = () => {
        // ... (保持原有的群發邏輯)
        if (!bulkLessonTopic && !bulkHomework && !bulkAnnouncement) return alert('請輸入內容');
        if (!confirm(`確定要套用給 ${selectedClass} 全班嗎？`)) return;

        setForms(prev => {
            const next = { ...prev };
            const targets = students.filter(s => parseClassTags(s.grade).includes(selectedClass!));
            targets.forEach(s => {
                const currentPublicNote = next[s.id].public_note || '';
                const newPublicNote = bulkAnnouncement && !currentPublicNote.includes(bulkAnnouncement)
                    ? (currentPublicNote ? `${currentPublicNote}\n\n【班級叮嚀】${bulkAnnouncement}` : `【班級叮嚀】${bulkAnnouncement}`)
                    : currentPublicNote;
                next[s.id] = {
                    ...next[s.id],
                    lesson_topic: bulkLessonTopic || next[s.id].lesson_topic,
                    homework: bulkHomework || next[s.id].homework,
                    public_note: newPublicNote
                };
            });
            return next;
        });
        alert('✅ 已套用！請記得按下方的發送按鈕儲存。');
    };

    const StarRating = ({ value, onChange, label, disabled }: any) => (
        <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-bold text-gray-400 uppercase">{label}</span>
            <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button key={star} disabled={disabled} onClick={() => onChange(star)} className={`text-lg ${star <= value ? 'text-yellow-400' : 'text-gray-200'} ${!disabled && 'hover:scale-110'}`}>★</button>
                ))}
            </div>
        </div>
    );

    // --- 月曆輔助元件 ---
    const renderCalendar = () => {
        const year = calendarMonth.getFullYear();
        const month = calendarMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startDayOfWeek = firstDay.getDay(); // 0 = Sunday

        const days = [];
        // 空白格子 (上個月的)
        for (let i = 0; i < startDayOfWeek; i++) {
            days.push(<div key={`empty-${i}`} className="h-16 bg-gray-50/50"></div>);
        }
        // 日期格子
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const isToday = dateStr === new Date().toISOString().split('T')[0];
            const isSelected = dateStr === selectedDate;
            const isWeekend = new Date(dateStr).getDay() === 0 || new Date(dateStr).getDay() === 6;

            const stats = monthStats[dateStr];
            let content = null;

            if (stats) {
                if (userRole === 'parent') {
                    // 家長顯示
                    if (stats.hasData) {
                        content = stats.signed
                            ? <span className="text-xs bg-green-100 text-green-600 px-1 rounded">✅ 已簽</span>
                            : <span className="text-xs bg-red-100 text-red-500 px-1 rounded animate-pulse">🔴 未簽</span>;
                    }
                } else {
                    // 老師顯示
                    const ratio = stats.count / stats.total;
                    let color = 'bg-orange-100 text-orange-600';
                    if (ratio === 1) color = 'bg-green-100 text-green-600';
                    if (ratio === 0) color = 'bg-gray-100 text-gray-400';

                    content = (
                        <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-1 ${color}`}>
                            {stats.count}/{stats.total}
                        </div>
                    );
                }
            }

            days.push(
                <button
                    key={i}
                    onClick={() => { setSelectedDate(dateStr); setIsCalendarOpen(false); }}
                    className={`h-16 border border-gray-100 flex flex-col items-center justify-start pt-1 transition hover:bg-indigo-50 ${isWeekend ? 'bg-gray-50' : 'bg-white'} ${isSelected ? 'ring-2 ring-indigo-500 z-10' : ''}`}
                >
                    <span className={`text-sm font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-indigo-600 text-white' : 'text-gray-700'}`}>
                        {i}
                    </span>
                    {content}
                </button>
            );
        }

        return (
            <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
                {['日', '一', '二', '三', '四', '五', '六'].map(d => (
                    <div key={d} className="bg-gray-100 text-center text-xs font-bold text-gray-500 py-1">{d}</div>
                ))}
                {days}
            </div>
        );
    };

    if (loading) return <div className="min-h-screen flex justify-center items-center text-gray-400 font-bold">載入中...</div>;

    const isDashboard = !selectedClass && userRole !== 'parent';
    const filteredStudents = (userRole === 'parent' || selectedClass === 'ALL')
        ? students
        : students.filter(s => parseClassTags(s.grade).includes(selectedClass!));
    const isTeacher = userRole !== 'parent';

    // Collapsible card helpers
    const toggleExpand = (id: string) => {
        setExpandedStudents(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const displayedStudents = showOnlyUnfilled
        ? filteredStudents.filter(s => !savedStudentIds.has(s.id) && !(forms[s.id]?.is_absent))
        : filteredStudents;
    const moodDot = (v: number) => v <= 2 ? 'bg-red-400' : v === 3 ? 'bg-amber-400' : 'bg-emerald-400';

    return (
        <div className="min-h-screen bg-[#F3F4F6] pb-20 font-sans">
            <input type="file" multiple accept="image/*" ref={fileInputRef} className="hidden" onChange={(e) => handleFileChange(e, false)} />
            <input type="file" multiple accept="image/*" ref={bulkFileInputRef} className="hidden" onChange={(e) => handleFileChange(e, true)} />

            {lightboxPhoto && (
                <div className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setLightboxPhoto(null)}>
                    <img src={lightboxPhoto} alt="Zoom" className="max-w-full max-h-[90vh] rounded shadow-2xl" />
                    <button className="absolute top-6 right-6 text-white text-4xl">×</button>
                </div>
            )}

            {/* 📅 歷史月曆 Modal */}
            {isCalendarOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in">
                        <div className="p-4 bg-indigo-600 flex justify-between items-center text-white">
                            <h2 className="text-lg font-black flex items-center gap-2">📅 歷史紀錄月曆</h2>
                            <button onClick={() => setIsCalendarOpen(false)} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center">✕</button>
                        </div>
                        <div className="p-4">
                            <div className="flex justify-between items-center mb-4 px-2">
                                <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} className="p-2 hover:bg-gray-100 rounded-full">⬅</button>
                                <span className="font-black text-xl text-gray-700">
                                    {calendarMonth.getFullYear()}年 {calendarMonth.getMonth() + 1}月
                                </span>
                                <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} className="p-2 hover:bg-gray-100 rounded-full">➡</button>
                            </div>

                            {/* Render Calendar Grid */}
                            {renderCalendar()}

                            <div className="mt-4 text-xs text-gray-400 text-center font-bold">
                                {userRole === 'parent' ? '💡 點擊日期可查看該日作業' : '💡 點擊日期可補發或修改該日紀錄'}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm">
                <div className="max-w-6xl mx-auto px-4 py-3">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <button onClick={() => setSelectedClass(null)} className="bg-indigo-600 text-white p-2 rounded-lg shadow-lg hover:bg-indigo-700 transition">📖</button>
                            <div>
                                <h1 className="text-lg font-black text-gray-800">
                                    {isDashboard ? '班級大廳' : (selectedClass === 'ALL' ? '我的孩子' : `${selectedClass}`)}
                                </h1>
                                <p className="text-[10px] text-gray-400 font-bold flex items-center gap-1">
                                    {selectedDate}
                                    {selectedDate !== new Date().toISOString().split('T')[0] && <span className="text-orange-500">(歷史紀錄)</span>}
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-2 items-center">
                            {/* 📅 月曆開啟按鈕 */}
                            {!isDashboard && (
                                <button
                                    onClick={() => setIsCalendarOpen(true)}
                                    className="bg-orange-50 text-orange-600 border border-orange-200 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-orange-100 flex items-center gap-1 shadow-sm"
                                >
                                    <span>📅</span> <span className="hidden sm:inline">歷史月曆</span>
                                </button>
                            )}
                            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-gray-100 rounded-lg px-3 py-1.5 text-sm font-bold text-gray-600 outline-none" />
                            <button onClick={() => router.push('/')} className="text-gray-400 hover:text-gray-600 text-sm font-bold px-2">退出</button>
                        </div>
                    </div>
                    {!isDashboard && isTeacher && (
                        <div className="mt-2 flex">
                            <button onClick={() => setSelectedClass(null)} className="text-xs text-indigo-500 font-bold hover:underline flex items-center gap-1">⬅ 回到班級選單</button>
                        </div>
                    )}
                </div>

                {/* 群發介面 (保持不變) */}
                {!isDashboard && isTeacher && selectedClass !== 'ALL' && (
                    <div className="bg-indigo-50/80 border-b border-indigo-100 px-4 py-3">
                        <div className="max-w-6xl mx-auto">
                            <details className="group">
                                <summary className="flex items-center gap-2 font-bold text-indigo-900 cursor-pointer list-none select-none">
                                    <span className="w-6 h-6 bg-indigo-200 text-indigo-700 rounded-full flex items-center justify-center text-xs">📢</span>
                                    <span>班級廣播站</span>
                                    <span className="text-[10px] text-indigo-400 ml-2 font-normal">(點擊展開)</span>
                                </summary>
                                <div className="mt-4 grid md:grid-cols-2 gap-4 animate-fade-in pl-8">
                                    <div className="col-span-full">
                                        <label className="text-xs font-bold text-indigo-400 ml-1">📖 今日課程主題（全班共用）</label>
                                        <input type="text" placeholder="例如：Unit 5 Animals / Phonics 長母音 ea" value={bulkLessonTopic} onChange={e => setBulkLessonTopic(e.target.value)} className="w-full p-2 bg-white border border-indigo-100 rounded-lg text-sm font-bold mt-1" />
                                    </div>
                                    <div className="col-span-full md:col-span-1">
                                        <label className="text-xs font-bold text-indigo-400 ml-1">📝 複習建議（全班共用）</label>
                                        <input type="text" placeholder="例如：練習 p.30 生字卡、複習本週單字..." value={bulkHomework} onChange={e => setBulkHomework(e.target.value)} className="w-full p-2 bg-white border border-indigo-100 rounded-lg text-sm font-bold mt-1" />
                                    </div>
                                    <div className="col-span-full md:col-span-1">
                                        <label className="text-xs font-bold text-indigo-400 ml-1">🔔 班級統一叮嚀（給家長）</label>
                                        <input type="text" placeholder="附加叮嚀..." value={bulkAnnouncement} onChange={e => setBulkAnnouncement(e.target.value)} className="w-full p-2 bg-white border border-indigo-100 rounded-lg text-sm font-bold mt-1" />
                                    </div>
                                    <div className="col-span-full flex gap-3 mt-1">
                                        <button onClick={handleBulkApply} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 shadow-sm">⚡ 套用到全班</button>
                                        <button onClick={handleBulkUploadClick} className="flex-1 bg-pink-500 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-pink-600 shadow-sm flex items-center justify-center gap-2"><span>📸</span> 上傳全班照片</button>
                                    </div>
                                </div>
                            </details>
                        </div>
                    </div>
                )}
            </div>

            {/* 學生卡片列表 (保持不變) */}
            <div className="max-w-6xl mx-auto p-4">
                {isDashboard && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-8">
                        {uniqueClasses.map(cls => {
                            const count = students.filter(s => parseClassTags(s.grade).includes(cls)).length;
                            return (
                                <button key={cls} onClick={() => setSelectedClass(cls)} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 hover:shadow-xl hover:border-indigo-100 hover:-translate-y-1 transition-all text-left group">
                                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-2xl mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">🏫</div>
                                    <h3 className="text-xl font-black text-gray-800 mb-1">{cls}</h3>
                                    <p className="text-sm font-bold text-gray-400">{count} 位學生</p>
                                </button>
                            );
                        })}
                        {uniqueClasses.length === 0 && <div className="col-span-full text-center text-gray-400 py-20 font-bold">目前沒有任何班級資料</div>}
                    </div>
                )}

                {!isDashboard && (
                    <>
                        {/* Toolbar */}
                        {filteredStudents.length > 0 && isTeacher && (
                            <div className="mb-4 space-y-3">
                                {/* 進度條 */}
                                {(() => {
                                    const saved = filteredStudents.filter(s => savedStudentIds.has(s.id)).length;
                                    const total = filteredStudents.length;
                                    const pct = Math.round((saved / total) * 100);
                                    const allDone = saved === total;
                                    return (
                                        <div className={`rounded-xl p-3 border ${allDone ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className={`text-xs font-black ${allDone ? 'text-green-700' : 'text-gray-600'}`}>
                                                    {allDone ? '✅ 今日已全部儲存！' : `今日進度：${saved} / ${total} 已儲存`}
                                                </span>
                                                <button
                                                    onClick={handleSaveAll}
                                                    disabled={savingAll || allDone}
                                                    className={`text-xs font-black px-4 py-1.5 rounded-lg transition-all ${allDone ? 'bg-green-100 text-green-600 cursor-default' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm disabled:opacity-50'}`}
                                                >
                                                    {savingAll ? '儲存中...' : allDone ? '✅ 完成' : '💾 全班一鍵儲存'}
                                                </button>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-1.5">
                                                <div
                                                    className={`h-1.5 rounded-full transition-all duration-500 ${allDone ? 'bg-green-500' : 'bg-indigo-500'}`}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })()}
                                {/* 篩選與展開按鈕 */}
                                <div className="flex items-center justify-between px-1">
                                    <button
                                        onClick={() => setShowOnlyUnfilled(v => !v)}
                                        className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${showOnlyUnfilled ? 'bg-orange-500 text-white shadow-sm' : 'bg-white text-gray-500 border border-gray-200 hover:border-orange-300 hover:text-orange-500'}`}
                                    >
                                        {showOnlyUnfilled ? `✓ 只看未儲存 (${displayedStudents.length})` : '只看未儲存'}
                                    </button>
                                    <div className="flex gap-2">
                                        <button onClick={() => setExpandedStudents(new Set(filteredStudents.map(s => s.id)))} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white text-gray-500 border border-gray-200 hover:border-indigo-300 hover:text-indigo-500 transition-all">全部展開</button>
                                        <button onClick={() => setExpandedStudents(new Set())} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white text-gray-500 border border-gray-200 hover:border-gray-400 hover:text-gray-700 transition-all">全部收合</button>
                                    </div>
                                </div>
                            </div>
                        )}
                        {filteredStudents.length > 0 && !isTeacher && (
                            <div className="flex items-center justify-between mb-4 px-1">
                                <div className="flex gap-2">
                                    <button onClick={() => setExpandedStudents(new Set(filteredStudents.map(s => s.id)))} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white text-gray-500 border border-gray-200 hover:border-indigo-300 hover:text-indigo-500 transition-all">全部展開</button>
                                    <button onClick={() => setExpandedStudents(new Set())} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white text-gray-500 border border-gray-200 transition-all">全部收合</button>
                                </div>
                            </div>
                        )}

                        <div className="space-y-3">
                            {displayedStudents.length === 0 ? (
                                <div className="text-center py-20 text-gray-300 font-bold">{showOnlyUnfilled ? '所有學生都已填寫完成 🎉' : '此班級無學生'}</div>
                            ) : (
                                displayedStudents.map(student => {
                                    const form = forms[student.id] || DEFAULT_FORM;
                                    const absent = form.is_absent;
                                    const tags = parseClassTags(student.grade);
                                    const otherTags = tags.filter(t => t !== selectedClass);
                                    const isExpanded = expandedStudents.has(student.id);
                                    const isSaved = savedStudentIds.has(student.id);

                                    return (
                                        <div key={student.id} className={`bg-white rounded-2xl shadow-sm border transition-all duration-200 ${absent ? 'border-gray-200 bg-gray-50/50 opacity-70' : isSaved && !isExpanded ? 'border-green-200 bg-green-50/30' : isExpanded ? 'border-indigo-200 shadow-md' : 'border-gray-100 hover:border-gray-200'}`}>
                                            {/* Always-visible header — click to toggle */}
                                            <button
                                                type="button"
                                                onClick={() => toggleExpand(student.id)}
                                                className="w-full p-4 flex items-center gap-3 text-left"
                                            >
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg flex-shrink-0 ${absent ? 'bg-gray-200 text-gray-400' : 'bg-indigo-50 text-indigo-600'}`}>
                                                    {student.chinese_name.charAt(0)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={`font-black text-base ${absent ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{student.chinese_name}</span>
                                                        {absent && <span className="bg-gray-400 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">請假</span>}
                                                        {otherTags.map(t => (<span key={t} className="bg-orange-100 text-orange-600 text-[10px] px-2 py-0.5 rounded-full border border-orange-200 font-bold">🧸 {t}</span>))}
                                                    </div>
                                                    {/* Status dots row */}
                                                    {!isExpanded && (
                                                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                            {[
                                                                { label: '心情', val: form.mood },
                                                                { label: '專注', val: form.focus },
                                                                { label: '互動', val: form.participation },
                                                                { label: '表達', val: form.expression },
                                                            ].map(({ label, val }) => (
                                                                <div key={label} className="flex items-center gap-1">
                                                                    <div className={`w-2 h-2 rounded-full ${moodDot(val)}`}></div>
                                                                    <span className="text-[10px] text-gray-400">{label}</span>
                                                                </div>
                                                            ))}
                                                            {!form.public_note && isTeacher && <span className="text-[10px] text-orange-400 font-bold">留言未填</span>}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    {form.signature
                                                        ? <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">✅ 簽名</span>
                                                        : <span className="text-[10px] bg-red-50 text-red-400 px-2 py-0.5 rounded-full font-bold">未簽</span>
                                                    }
                                                    <span className={`text-gray-300 text-sm transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                                                </div>
                                            </button>

                                            {/* Expandable content */}
                                            {isExpanded && (
                                                <div className={`border-t border-gray-50 ${absent ? 'opacity-50 pointer-events-none' : ''}`}>
                                                    {/* Absent toggle for teacher */}
                                                    {isTeacher && (
                                                        <div className="px-4 py-2 flex justify-end">
                                                            <label className="text-[11px] font-bold text-gray-400 flex items-center gap-1.5 cursor-pointer">
                                                                <input type="checkbox" checked={form.is_absent} onChange={e => handleFormChange(student.id, 'is_absent', e.target.checked)} className="accent-gray-500" />
                                                                標記請假
                                                            </label>
                                                        </div>
                                                    )}
                                                    <div className="px-4 pb-4 space-y-4">
                                                        {/* 今日主題（班級共用，顯示用） */}
                                                        {form.lesson_topic && (
                                                            <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 flex items-center gap-2">
                                                                <span className="text-indigo-400 text-sm">📖</span>
                                                                <div>
                                                                    <span className="text-[10px] font-black text-indigo-400">今日主題</span>
                                                                    <p className="font-bold text-sm text-indigo-700">{form.lesson_topic}</p>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* 課堂表現評分 */}
                                                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-2">
                                                            <p className="text-[10px] font-black text-gray-400 uppercase mb-2">課堂表現</p>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                                                                    <StarRating label="心情" value={form.mood} onChange={(v: any) => handleFormChange(student.id, 'mood', v)} disabled={!isTeacher} />
                                                                </div>
                                                                <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                                                                    <StarRating label="專注度" value={form.focus} onChange={(v: any) => handleFormChange(student.id, 'focus', v)} disabled={!isTeacher} />
                                                                </div>
                                                                <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                                                                    <StarRating label="課堂互動" value={form.participation} onChange={(v: any) => handleFormChange(student.id, 'participation', v)} disabled={!isTeacher} />
                                                                </div>
                                                                <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                                                                    <StarRating label="主動表達" value={form.expression} onChange={(v: any) => handleFormChange(student.id, 'expression', v)} disabled={!isTeacher} />
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* 複習建議 */}
                                                        <div>
                                                            <label className="text-[10px] font-black text-gray-400 ml-1 uppercase">📝 複習建議</label>
                                                            {isTeacher
                                                                ? <input type="text" value={form.homework} onChange={e => handleFormChange(student.id, 'homework', e.target.value)} className="w-full p-3 bg-gray-50 border-transparent hover:border-indigo-100 focus:bg-white focus:border-indigo-500 rounded-xl font-bold text-sm text-gray-700 outline-none transition-all" placeholder="例如：練習 p.30 生字卡..." />
                                                                : <div className="p-3 bg-gray-50 rounded-xl font-bold text-sm text-gray-700 min-h-[46px]">{form.homework || '無'}</div>}
                                                        </div>
                                                        {/* 📤 公開留言 — 家長看得到 */}
                                                        <div className="rounded-xl border border-green-100 bg-green-50/50 p-3">
                                                            <label className="text-[10px] font-black text-green-600 ml-1 flex items-center gap-1 mb-1.5">
                                                                <span>📤</span> 給家長的留言
                                                                <span className="text-green-400 font-normal">（家長看得到）</span>
                                                            </label>
                                                            {isTeacher
                                                                ? <textarea rows={2} value={form.public_note} onChange={e => handleFormChange(student.id, 'public_note', e.target.value)} className="w-full p-2.5 bg-white border border-green-100 hover:border-green-300 focus:border-green-500 rounded-lg font-bold text-sm text-gray-700 outline-none transition-all resize-none" placeholder="今天表現很棒！作業記得完成..." />
                                                                : <div className="p-2.5 bg-white rounded-lg font-bold text-sm text-gray-700 min-h-[60px] whitespace-pre-wrap">{form.public_note || '無留言'}</div>
                                                            }
                                                        </div>

                                                        {/* 🔒 內部備註 — 僅老師/主任可見 */}
                                                        {isTeacher && (
                                                            <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-3">
                                                                <label className="text-[10px] font-black text-gray-400 ml-1 flex items-center gap-1 mb-1.5">
                                                                    <span>🔒</span> 內部備註
                                                                    <span className="text-gray-300 font-normal">（家長看不到）</span>
                                                                </label>
                                                                <textarea rows={2} value={form.note} onChange={e => handleFormChange(student.id, 'note', e.target.value)} className="w-full p-2.5 bg-white border border-gray-100 hover:border-gray-300 focus:border-gray-400 rounded-lg font-bold text-sm text-gray-600 outline-none transition-all resize-none" placeholder="內部觀察，例如：注意力渙散、與同學起衝突..." />
                                                            </div>
                                                        )}
                                                        <div>
                                                            <div className="flex justify-between items-center mb-1">
                                                                <label className="text-[10px] font-black text-gray-400 ml-1 uppercase">📸 照片</label>
                                                                {isTeacher && <button onClick={() => handleUploadClick(student.id)} className="text-[10px] text-indigo-500 font-bold hover:bg-indigo-50 px-2 py-0.5 rounded">➕ 上傳</button>}
                                                            </div>
                                                            <div className="flex gap-2 overflow-x-auto min-h-[60px] pb-1">
                                                                {form.photos?.map((url: string, i: number) => <img key={i} src={url} onClick={() => setLightboxPhoto(url)} className="w-16 h-16 rounded-lg object-cover border border-gray-100 cursor-zoom-in" />)}
                                                                {!form.photos?.length && <div className="text-xs text-gray-300 italic flex items-center pl-1">無照片</div>}
                                                            </div>
                                                        </div>
                                                        <div className="pt-1">
                                                            {isTeacher ? (
                                                                <button onClick={() => handleSave(student)} className={`w-full py-2.5 rounded-xl font-bold text-sm text-white shadow-sm transition-all active:scale-95 ${selectedDate !== new Date().toISOString().split('T')[0] ? 'bg-orange-500 hover:bg-orange-600' : isSaved ? 'bg-green-500 hover:bg-green-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                                                                    {selectedDate !== new Date().toISOString().split('T')[0] ? '💾 修改歷史紀錄' : isSaved ? '✅ 已儲存（再次儲存）' : '💾 儲存'}
                                                                </button>
                                                            ) : !form.signature && (
                                                                <button onClick={() => handleSign(student)} className="w-full py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-black text-base shadow-lg shadow-green-200 animate-pulse">✍️ 簽名確認</button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}