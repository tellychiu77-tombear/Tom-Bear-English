'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

const DEFAULT_FORM = {
    mood: 3,
    focus: 3,
    participation: 3,
    expression: 3,
    lesson_topic: '',
    homework: '',
    note: '',
    public_note: '',
    photos: [] as string[],
    is_absent: false,
    signature: null as string | null
};

export default function ContactBookPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [userRole, setUserRole] = useState<string>('');

    const [students, setStudents] = useState<any[]>([]);
    const [forms, setForms] = useState<Record<string, typeof DEFAULT_FORM>>({});

    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedClass, setSelectedClass] = useState<string | null>(null);
    const [uniqueClasses, setUniqueClasses] = useState<string[]>([]);
    const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

    // Calendar
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [calendarMonth, setCalendarMonth] = useState(new Date());
    const [monthStats, setMonthStats] = useState<Record<string, any>>({});

    // Upload
    const fileInputRef = useRef<HTMLInputElement>(null);
    const bulkFileInputRef = useRef<HTMLInputElement>(null);
    const [uploadingStudentId, setUploadingStudentId] = useState<string | null>(null);

    // Bulk broadcast
    const [broadcastTopic, setBroadcastTopic] = useState('');
    const [broadcastHomework, setBroadcastHomework] = useState('');
    const [broadcastAnnouncement, setBroadcastAnnouncement] = useState('');
    const [broadcastSent, setBroadcastSent] = useState(false);

    // Mobile collapsible cards
    const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());
    const [showOnlyUnfilled, setShowOnlyUnfilled] = useState(false);
    const [savedStudentIds, setSavedStudentIds] = useState<Set<string>>(new Set());
    const [savingAll, setSavingAll] = useState(false);

    // ── Desktop workspace states ──────────────────────────────────────────────
    const [desktopStudentId, setDesktopStudentId] = useState<string | null>(null);
    const [chatOpen, setChatOpen] = useState(false);
    const [chatConversations, setChatConversations] = useState<any[]>([]);
    const [selectedChatUserId, setSelectedChatUserId] = useState<string | null>(null);
    const [chatMessages, setChatMessages] = useState<any[]>([]);
    const [replyText, setReplyText] = useState('');
    const [totalUnread, setTotalUnread] = useState(0);
    const chatBottomRef = useRef<HTMLDivElement>(null);

    const parseClassTags = (gradeString: string): string[] => {
        if (!gradeString) return ['待分班'];
        return gradeString.split(/[,，]/).map(s => s.trim()).filter(Boolean).map(tag => {
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
        if (role === 'parent') query = query.or(`parent_id.eq.${session.user.id},parent_id_2.eq.${session.user.id}`);

        const { data } = await query;
        const studentList = data || [];
        setStudents(studentList);

        const classesSet = new Set<string>();
        studentList.forEach(s => parseClassTags(s.grade).forEach(tag => classesSet.add(tag)));
        setUniqueClasses(Array.from(classesSet).sort());

        if (role === 'parent') setSelectedClass('ALL');
        setLoading(false);
    }, [router]);

    const fetchHistory = useCallback(async () => {
        if (!selectedClass) return;
        const targetStudents = (userRole === 'parent' || selectedClass === 'ALL')
            ? students
            : students.filter(s => parseClassTags(s.grade).includes(selectedClass));
        const ids = targetStudents.map(s => s.id);
        if (ids.length === 0) return;

        const { data: historyLogs } = await supabase.from('contact_books').select('*').in('student_id', ids).eq('date', selectedDate);
        const newForms: Record<string, typeof DEFAULT_FORM> = {};
        ids.forEach(id => { newForms[id] = { ...DEFAULT_FORM }; });
        if (historyLogs?.length) {
            historyLogs.forEach(log => {
                newForms[log.student_id] = {
                    mood: log.mood ?? 3, focus: log.focus ?? 3,
                    participation: log.participation ?? 3, expression: log.expression ?? 3,
                    lesson_topic: log.lesson_topic || '', homework: log.homework || '',
                    note: log.teacher_note || '', public_note: log.public_note || '',
                    photos: log.photos || [], is_absent: log.is_absent || false,
                    signature: log.parent_signature
                };
            });
            setSavedStudentIds(new Set(historyLogs.map((l: any) => l.student_id)));
        }
        setForms(prev => ({ ...prev, ...newForms }));
    }, [selectedClass, selectedDate, students, userRole]);

    const fetchMonthStats = useCallback(async (date: Date) => {
        if (!selectedClass) return;
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
        const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];
        const targetStudents = (userRole === 'parent' || selectedClass === 'ALL') ? students : students.filter(s => parseClassTags(s.grade).includes(selectedClass));
        const ids = targetStudents.map(s => s.id);
        if (ids.length === 0) { setMonthStats({}); return; }
        const { data } = await supabase.from('contact_books').select('date, student_id, parent_signature').in('student_id', ids).gte('date', startOfMonth).lte('date', endOfMonth);
        if (!data) return;
        const stats: Record<string, any> = {};
        if (userRole === 'parent') {
            data.forEach(row => {
                if (!stats[row.date]) stats[row.date] = { hasData: false, signed: true };
                stats[row.date].hasData = true;
                if (!row.parent_signature) stats[row.date].signed = false;
            });
        } else {
            data.forEach(row => {
                if (!stats[row.date]) stats[row.date] = { count: 0, total: ids.length };
                stats[row.date].count += 1;
            });
        }
        setMonthStats(stats);
    }, [selectedClass, students, userRole]);

    // ── Chat fetch ────────────────────────────────────────────────────────────
    const fetchChatConversations = useCallback(async () => {
        if (!currentUser) return;
        const { data } = await supabase
            .from('chat_messages')
            .select('id, sender_id, receiver_id, content, is_read, created_at, sender:users!sender_id(id, name, email), receiver:users!receiver_id(id, name, email)')
            .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
            .order('created_at', { ascending: false });
        if (!data) return;

        // Group by conversation partner
        const convMap = new Map<string, any>();
        data.forEach(msg => {
            const partnerId = msg.sender_id === currentUser.id ? msg.receiver_id : msg.sender_id;
            const partner = msg.sender_id === currentUser.id ? msg.receiver : msg.sender;
            if (!convMap.has(partnerId)) {
                convMap.set(partnerId, { partnerId, partner, lastMsg: msg, unread: 0 });
            }
            if (msg.receiver_id === currentUser.id && !msg.is_read) {
                convMap.get(partnerId).unread += 1;
            }
        });
        const convs = Array.from(convMap.values());
        setChatConversations(convs);
        setTotalUnread(convs.reduce((sum, c) => sum + c.unread, 0));
    }, [currentUser]);

    const fetchChatMessages = useCallback(async (partnerId: string) => {
        if (!currentUser) return;
        const { data } = await supabase
            .from('chat_messages')
            .select('*')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: true });
        setChatMessages(data || []);
        // Mark as read
        await supabase.from('chat_messages').update({ is_read: true }).eq('sender_id', partnerId).eq('receiver_id', currentUser.id).eq('is_read', false);
        setChatConversations(prev => prev.map(c => c.partnerId === partnerId ? { ...c, unread: 0 } : c));
        setTotalUnread(prev => Math.max(0, prev - (chatConversations.find(c => c.partnerId === partnerId)?.unread || 0)));
    }, [currentUser, chatConversations]);

    const handleSendChat = async () => {
        if (!replyText.trim() || !selectedChatUserId || !currentUser) return;
        const { data } = await supabase.from('chat_messages').insert({
            sender_id: currentUser.id,
            receiver_id: selectedChatUserId,
            content: replyText,
            is_read: false
        }).select().single();
        if (data) setChatMessages(prev => [...prev, data]);
        setReplyText('');
        fetchChatConversations();
    };

    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => { if (students.length > 0) fetchHistory(); }, [fetchHistory, students.length]);
    useEffect(() => { setExpandedStudents(new Set()); setShowOnlyUnfilled(false); setSavedStudentIds(new Set()); setBroadcastTopic(''); setBroadcastHomework(''); setBroadcastAnnouncement(''); setDesktopStudentId(null); }, [selectedClass, selectedDate]);
    useEffect(() => { if (isCalendarOpen) fetchMonthStats(calendarMonth); }, [isCalendarOpen, calendarMonth, fetchMonthStats]);
    useEffect(() => { if (currentUser) fetchChatConversations(); }, [currentUser, fetchChatConversations]);
    useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

    // Auto-select first unfilled student on desktop when class loads
    // Note: compute inline to avoid TDZ with filteredStudents (defined after early return)
    useEffect(() => {
        const filtered = (userRole === 'parent' || selectedClass === 'ALL')
            ? students
            : students.filter((s: any) => {
                if (!s.grade) return selectedClass === '待分班';
                const tags = s.grade.split(/[,，]/).map((t: string) => t.trim()).filter(Boolean).map((tag: string) => {
                    if (tag === '課後輔導' || tag === '課後') return '課後輔導班';
                    if (tag === '未分類' || tag === '未分班') return '待分班';
                    return tag;
                });
                return selectedClass ? tags.includes(selectedClass) : false;
            });
        if (filtered.length > 0 && !desktopStudentId) {
            const firstUnfilled = filtered.find((s: any) => !savedStudentIds.has(s.id));
            setDesktopStudentId(firstUnfilled?.id || filtered[0].id);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedClass, students.length]);

    // ── Actions ───────────────────────────────────────────────────────────────
    const handleFormChange = (studentId: string, field: string, value: any) => {
        setForms(prev => ({ ...prev, [studentId]: { ...(prev[studentId] || DEFAULT_FORM), [field]: value } }));
    };

    const handleSave = async (student: any, autoAdvance = false) => {
        const formData = forms[student.id] || DEFAULT_FORM;
        try {
            const { data: existing } = await supabase.from('contact_books').select('id').eq('student_id', student.id).eq('date', selectedDate).single();
            const payload = {
                student_id: student.id, date: selectedDate,
                mood: formData.mood, focus: formData.focus,
                participation: formData.participation, expression: formData.expression,
                lesson_topic: formData.lesson_topic, homework: formData.homework,
                teacher_note: formData.note, public_note: formData.public_note,
                photos: formData.photos, is_absent: formData.is_absent
            };
            if (existing) await supabase.from('contact_books').update(payload).eq('id', existing.id);
            else await supabase.from('contact_books').insert(payload);
            setSavedStudentIds(prev => new Set([...prev, student.id]));
            if (isCalendarOpen) fetchMonthStats(calendarMonth);

            // Desktop auto-advance
            if (autoAdvance) {
                const unfilled = filteredStudents.filter(s => !savedStudentIds.has(s.id) && s.id !== student.id);
                if (unfilled.length > 0) setDesktopStudentId(unfilled[0].id);
            }
        } catch (e: any) { alert('❌ 儲存失敗: ' + e.message); }
    };

    const handleSign = async (student: any) => {
        if (!confirm('確認簽名？')) return;
        const now = new Date().toISOString();
        await supabase.from('contact_books').update({ parent_signature: now }).eq('student_id', student.id).eq('date', selectedDate);
        handleFormChange(student.id, 'signature', now);
    };

    const handleSaveAll = async () => {
        if (!filteredStudents.length) return;
        if (!confirm(`確定要儲存全班 ${filteredStudents.length} 位學生的資料嗎？`)) return;
        setSavingAll(true);
        const ids = filteredStudents.map(s => s.id);
        const { data: existingRecords } = await supabase.from('contact_books').select('id, student_id').in('student_id', ids).eq('date', selectedDate);
        const existingMap = new Map((existingRecords || []).map((r: any) => [r.student_id, r.id]));
        const toInsert: any[] = [], toUpdate: any[] = [];
        filteredStudents.forEach(student => {
            const f = forms[student.id] || DEFAULT_FORM;
            const payload = {
                student_id: student.id, date: selectedDate,
                mood: f.mood, focus: f.focus, participation: f.participation, expression: f.expression,
                lesson_topic: f.lesson_topic, homework: f.homework,
                teacher_note: f.note, public_note: f.public_note,
                photos: f.photos, is_absent: f.is_absent,
            };
            if (existingMap.has(student.id)) toUpdate.push({ id: existingMap.get(student.id), ...payload });
            else toInsert.push(payload);
        });
        try {
            if (toInsert.length) await supabase.from('contact_books').insert(toInsert);
            for (const { id, ...d } of toUpdate) await supabase.from('contact_books').update(d).eq('id', id);
            setSavedStudentIds(new Set(filteredStudents.map(s => s.id)));
        } catch (e: any) { alert('❌ 儲存失敗：' + e.message); }
        setSavingAll(false);
    };

    const handleBroadcast = () => {
        if (!broadcastTopic && !broadcastHomework && !broadcastAnnouncement) return;
        setForms(prev => {
            const next = { ...prev };
            filteredStudents.forEach(s => {
                const cur = next[s.id] || { ...DEFAULT_FORM };
                const newPublicNote = broadcastAnnouncement
                    ? (cur.public_note ? `${cur.public_note}\n\n【班級叮嚀】${broadcastAnnouncement}` : `【班級叮嚀】${broadcastAnnouncement}`)
                    : cur.public_note;
                next[s.id] = {
                    ...cur,
                    lesson_topic: broadcastTopic || cur.lesson_topic,
                    homework: broadcastHomework || cur.homework,
                    public_note: newPublicNote
                };
            });
            return next;
        });
        setBroadcastSent(true);
        setTimeout(() => setBroadcastSent(false), 2500);
    };

    const handleUploadClick = (studentId: string) => { setUploadingStudentId(studentId); fileInputRef.current?.click(); };
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, isBulk = false) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        const targetIds = isBulk ? filteredStudents.map(s => s.id) : [uploadingStudentId!];
        if (!targetIds[0]) return;
        try {
            const uploadedUrls: string[] = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const filePath = `${selectedDate}/${Date.now()}_${i}.${file.name.split('.').pop()}`;
                const { error } = await supabase.storage.from('contact_photos').upload(filePath, file);
                if (error) throw error;
                const { data } = supabase.storage.from('contact_photos').getPublicUrl(filePath);
                uploadedUrls.push(data.publicUrl);
            }
            setForms(prev => {
                const next = { ...prev };
                targetIds.forEach(id => { if (id) next[id] = { ...next[id], photos: [...(next[id]?.photos || []), ...uploadedUrls] }; });
                return next;
            });
        } catch (err: any) { alert('❌ 上傳失敗: ' + err.message); }
        finally { if (fileInputRef.current) fileInputRef.current.value = ''; if (bulkFileInputRef.current) bulkFileInputRef.current.value = ''; setUploadingStudentId(null); }
    };

    const StarRating = ({ value, onChange, label, color = 'text-yellow-400', disabled }: any) => (
        <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-bold text-gray-400 uppercase">{label}</span>
            <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(star => (
                    <button key={star} disabled={disabled} onClick={() => onChange(star)}
                        className={`text-lg ${star <= value ? color : 'text-gray-200'} ${!disabled ? 'hover:scale-110' : ''} transition-transform`}>★</button>
                ))}
            </div>
        </div>
    );

    const renderCalendar = () => {
        const year = calendarMonth.getFullYear();
        const month = calendarMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const days = [];
        for (let i = 0; i < firstDay.getDay(); i++) days.push(<div key={`e-${i}`} className="h-16 bg-gray-50/50" />);
        for (let i = 1; i <= lastDay.getDate(); i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const isToday = dateStr === new Date().toISOString().split('T')[0];
            const isSelected = dateStr === selectedDate;
            const isWeekend = new Date(dateStr).getDay() === 0 || new Date(dateStr).getDay() === 6;
            const stats = monthStats[dateStr];
            let content = null;
            if (stats) {
                if (userRole === 'parent') {
                    content = stats.hasData ? (stats.signed ? <span className="text-xs bg-green-100 text-green-600 px-1 rounded">✅</span> : <span className="text-xs bg-red-100 text-red-500 px-1 rounded">🔴</span>) : null;
                } else {
                    const ratio = stats.count / stats.total;
                    content = <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-1 ${ratio === 1 ? 'bg-green-100 text-green-600' : ratio === 0 ? 'bg-gray-100 text-gray-400' : 'bg-orange-100 text-orange-600'}`}>{stats.count}/{stats.total}</div>;
                }
            }
            days.push(
                <button key={i} onClick={() => { setSelectedDate(dateStr); setIsCalendarOpen(false); }}
                    className={`h-16 border border-gray-100 flex flex-col items-center justify-start pt-1 transition hover:bg-indigo-50 ${isWeekend ? 'bg-gray-50' : 'bg-white'} ${isSelected ? 'ring-2 ring-indigo-500 z-10' : ''}`}>
                    <span className={`text-sm font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-indigo-600 text-white' : 'text-gray-700'}`}>{i}</span>
                    {content}
                </button>
            );
        }
        return (
            <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
                {['日', '一', '二', '三', '四', '五', '六'].map(d => <div key={d} className="bg-gray-100 text-center text-xs font-bold text-gray-500 py-1">{d}</div>)}
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
    const moodDot = (v: number) => v <= 2 ? 'bg-red-400' : v === 3 ? 'bg-amber-400' : 'bg-emerald-400';
    const toggleExpand = (id: string) => setExpandedStudents(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const displayedStudents = showOnlyUnfilled ? filteredStudents.filter(s => !savedStudentIds.has(s.id) && !forms[s.id]?.is_absent) : filteredStudents;
    const desktopStudent = students.find(s => s.id === desktopStudentId);
    const desktopForm = desktopStudentId ? (forms[desktopStudentId] || DEFAULT_FORM) : DEFAULT_FORM;
    const filledCount = filteredStudents.filter(s => savedStudentIds.has(s.id)).length;

    return (
        <div className="font-sans">
            <input type="file" multiple accept="image/*" ref={fileInputRef} className="hidden" onChange={e => handleFileChange(e, false)} />
            <input type="file" multiple accept="image/*" ref={bulkFileInputRef} className="hidden" onChange={e => handleFileChange(e, true)} />

            {/* Lightbox */}
            {lightboxPhoto && (
                <div className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4" onClick={() => setLightboxPhoto(null)}>
                    <img src={lightboxPhoto} className="max-w-full max-h-[90vh] rounded shadow-2xl" />
                    <button className="absolute top-6 right-6 text-white text-4xl">×</button>
                </div>
            )}

            {/* Calendar Modal */}
            {isCalendarOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="p-4 bg-indigo-600 flex justify-between items-center text-white">
                            <h2 className="text-lg font-black">📅 歷史紀錄月曆</h2>
                            <button onClick={() => setIsCalendarOpen(false)} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">✕</button>
                        </div>
                        <div className="p-4">
                            <div className="flex justify-between items-center mb-4 px-2">
                                <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} className="p-2 hover:bg-gray-100 rounded-full">⬅</button>
                                <span className="font-black text-xl text-gray-700">{calendarMonth.getFullYear()}年 {calendarMonth.getMonth() + 1}月</span>
                                <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} className="p-2 hover:bg-gray-100 rounded-full">➡</button>
                            </div>
                            {renderCalendar()}
                            <p className="mt-4 text-xs text-gray-400 text-center font-bold">{userRole === 'parent' ? '💡 點擊日期查看該日作業' : '💡 點擊日期可補發或修改紀錄'}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                DESKTOP TEACHER WORKSPACE (md+, teacher role, class selected)
            ══════════════════════════════════════════════════════════════════ */}
            {isTeacher && !isDashboard && (
                <div className="hidden md:flex h-screen bg-gray-100 overflow-hidden">

                    {/* ── 左側：學生名單 ───────────────────────────────────────── */}
                    <div className="bg-white border-r border-gray-100 flex flex-col flex-shrink-0" style={{ width: 210 }}>
                        {/* Header */}
                        <div className="p-3 border-b border-gray-50">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-black text-gray-800">📒 聯絡簿</span>
                                <button onClick={() => setSelectedClass(null)} className="text-xs text-gray-400 hover:text-indigo-500 font-bold">← 返回</button>
                            </div>
                            <select value={selectedClass || ''} onChange={e => setSelectedClass(e.target.value)}
                                className="w-full p-1.5 text-xs font-bold border rounded-lg bg-indigo-50 text-indigo-700 outline-none">
                                {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        {/* Date + Progress */}
                        <div className="px-3 py-2 border-b border-gray-100 space-y-1.5">
                            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                                className="w-full p-1.5 text-xs font-bold border rounded-lg bg-gray-50 outline-none" />
                            <div className="flex justify-between text-xs font-bold text-gray-400">
                                <span>今日進度</span>
                                <span className={filledCount === filteredStudents.length && filteredStudents.length > 0 ? 'text-green-500' : 'text-indigo-500'}>
                                    {filledCount}/{filteredStudents.length}
                                </span>
                            </div>
                            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                                    style={{ width: filteredStudents.length > 0 ? `${(filledCount / filteredStudents.length) * 100}%` : '0%' }} />
                            </div>
                        </div>

                        {/* Student list */}
                        <div className="flex-1 overflow-y-auto">
                            {filteredStudents.map(s => {
                                const isSaved = savedStudentIds.has(s.id);
                                const isSelected = desktopStudentId === s.id;
                                return (
                                    <button key={s.id} onClick={() => setDesktopStudentId(s.id)}
                                        className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition border-l-2 ${isSelected ? 'bg-indigo-50 border-indigo-500' : 'border-transparent hover:bg-gray-50'}`}>
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${isSaved ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                            {s.chinese_name[0]}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1">
                                                <span className={`text-sm font-bold truncate ${isSelected ? 'text-indigo-700' : 'text-gray-700'}`}>{s.chinese_name}</span>
                                                {isSaved && <span className="text-green-400 text-xs">✓</span>}
                                                {forms[s.id]?.is_absent && <span className="text-gray-400 text-[10px]">假</span>}
                                            </div>
                                            <span className="text-xs text-gray-400">{s.english_name || s.grade}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Save All */}
                        <div className="p-3 border-t border-gray-100">
                            <button onClick={handleSaveAll} disabled={savingAll || filledCount === filteredStudents.length}
                                className={`w-full py-2 text-xs font-black rounded-lg transition ${filledCount === filteredStudents.length ? 'bg-green-100 text-green-600 cursor-default' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                                {savingAll ? '儲存中...' : filledCount === filteredStudents.length ? '✅ 全班完成' : '💾 一鍵全班儲存'}
                            </button>
                        </div>
                    </div>

                    {/* ── 中間：填寫區 ─────────────────────────────────────────── */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {/* Top bar */}
                        <div className="bg-white border-b border-gray-100 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
                            <div className="flex items-center gap-2.5">
                                {desktopStudent ? (
                                    <>
                                        <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black">
                                            {desktopStudent.chinese_name[0]}
                                        </div>
                                        <div>
                                            <span className="font-black text-gray-800">{desktopStudent.chinese_name}</span>
                                            <span className="text-gray-400 text-xs ml-1.5">{desktopStudent.english_name} · {desktopStudent.school_grade}</span>
                                        </div>
                                        {savedStudentIds.has(desktopStudentId!) && (
                                            <span className="bg-green-100 text-green-600 text-xs font-bold px-2 py-0.5 rounded-full">✓ 已儲存</span>
                                        )}
                                    </>
                                ) : <span className="text-gray-400 font-bold text-sm">← 請從左側選擇學生</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setIsCalendarOpen(true)}
                                    className="bg-orange-50 text-orange-500 border border-orange-200 px-2.5 py-1.5 rounded-lg text-xs font-bold hover:bg-orange-100">📅 月曆</button>
                                <button onClick={() => router.push('/')} className="text-gray-400 text-xs font-bold hover:text-gray-600">退出</button>
                            </div>
                        </div>

                        {/* Form area */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">

                            {/* 統發區塊 */}
                            <div className="bg-violet-50 rounded-xl p-3.5 border border-violet-200">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-black text-violet-700">📡 統發全班</span>
                                    <span className="text-[10px] text-violet-400">填好後按統發，自動套用給全班</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 mb-2">
                                    <input value={broadcastTopic} onChange={e => setBroadcastTopic(e.target.value)}
                                        placeholder="今日主題（全班共用）"
                                        className="p-2 border border-violet-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-violet-200" />
                                    <input value={broadcastHomework} onChange={e => setBroadcastHomework(e.target.value)}
                                        placeholder="複習功課（全班共用）"
                                        className="p-2 border border-violet-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-violet-200" />
                                </div>
                                <input value={broadcastAnnouncement} onChange={e => setBroadcastAnnouncement(e.target.value)}
                                    placeholder="班級叮嚀給家長（選填）"
                                    className="w-full p-2 border border-violet-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-violet-200 mb-2" />
                                <button onClick={handleBroadcast}
                                    className={`w-full py-2 text-sm font-black rounded-lg transition ${broadcastSent ? 'bg-green-500 text-white' : 'bg-violet-600 text-white hover:bg-violet-700'}`}>
                                    {broadcastSent ? '✅ 已套用給全班！' : '📡 統發給全班'}
                                </button>
                            </div>

                            {desktopStudent && (
                                <>
                                    {/* Absent toggle */}
                                    <div className="flex justify-between items-center px-1">
                                        <span className="text-xs font-black text-gray-500 uppercase">個別填寫 — {desktopStudent.chinese_name}</span>
                                        <label className="flex items-center gap-1.5 text-xs font-bold text-gray-400 cursor-pointer">
                                            <input type="checkbox" checked={desktopForm.is_absent}
                                                onChange={e => handleFormChange(desktopStudentId!, 'is_absent', e.target.checked)}
                                                className="accent-gray-400" />
                                            標記請假
                                        </label>
                                    </div>

                                    <div className={desktopForm.is_absent ? 'opacity-40 pointer-events-none space-y-3' : 'space-y-3'}>
                                        {/* 主題 + 功課 */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
                                                <label className="text-xs font-black text-indigo-500 block mb-1.5">📖 今日主題</label>
                                                <input value={desktopForm.lesson_topic}
                                                    onChange={e => handleFormChange(desktopStudentId!, 'lesson_topic', e.target.value)}
                                                    placeholder="可個別修改..."
                                                    className="w-full p-2 border border-indigo-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-200" />
                                            </div>
                                            <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                                                <label className="text-xs font-black text-blue-500 block mb-1.5">📝 複習功課</label>
                                                <input value={desktopForm.homework}
                                                    onChange={e => handleFormChange(desktopStudentId!, 'homework', e.target.value)}
                                                    placeholder="可個別修改..."
                                                    className="w-full p-2 border border-blue-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-200" />
                                            </div>
                                        </div>

                                        {/* Ratings */}
                                        <div className="bg-white rounded-xl p-3.5 border border-gray-100 shadow-sm">
                                            <label className="text-xs font-black text-gray-400 block mb-3">⭐ 課堂表現</label>
                                            <div className="grid grid-cols-4 gap-2">
                                                <StarRating label="😊 心情" value={desktopForm.mood} color="text-yellow-400" onChange={(v: number) => handleFormChange(desktopStudentId!, 'mood', v)} />
                                                <StarRating label="🎯 專注度" value={desktopForm.focus} color="text-indigo-400" onChange={(v: number) => handleFormChange(desktopStudentId!, 'focus', v)} />
                                                <StarRating label="🙋 互動" value={desktopForm.participation} color="text-emerald-400" onChange={(v: number) => handleFormChange(desktopStudentId!, 'participation', v)} />
                                                <StarRating label="💬 表達" value={desktopForm.expression} color="text-purple-400" onChange={(v: number) => handleFormChange(desktopStudentId!, 'expression', v)} />
                                            </div>
                                        </div>

                                        {/* Notes */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-green-50 rounded-xl p-3 border border-green-100">
                                                <label className="text-xs font-black text-green-600 block mb-1.5">📤 給家長</label>
                                                <textarea rows={3} value={desktopForm.public_note}
                                                    onChange={e => handleFormChange(desktopStudentId!, 'public_note', e.target.value)}
                                                    placeholder="家長看得到..."
                                                    className="w-full text-sm p-2 border border-green-200 rounded-lg bg-white resize-none outline-none focus:ring-2 focus:ring-green-200" />
                                            </div>
                                            <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                                                <label className="text-xs font-black text-gray-400 block mb-1.5">🔒 內部備注</label>
                                                <textarea rows={3} value={desktopForm.note}
                                                    onChange={e => handleFormChange(desktopStudentId!, 'note', e.target.value)}
                                                    placeholder="僅老師可見..."
                                                    className="w-full text-sm p-2 border border-gray-200 rounded-lg bg-white resize-none outline-none focus:ring-2 focus:ring-gray-300" />
                                            </div>
                                        </div>

                                        {/* Photos */}
                                        <div>
                                            <div className="flex justify-between items-center mb-1.5">
                                                <label className="text-xs font-black text-gray-400">📸 照片</label>
                                                <button onClick={() => handleUploadClick(desktopStudentId!)} className="text-xs text-indigo-500 font-bold hover:bg-indigo-50 px-2 py-0.5 rounded">➕ 上傳</button>
                                            </div>
                                            <div className="flex gap-2 overflow-x-auto min-h-[56px]">
                                                {desktopForm.photos?.map((url: string, i: number) => (
                                                    <img key={i} src={url} onClick={() => setLightboxPhoto(url)}
                                                        className="w-14 h-14 rounded-lg object-cover border border-gray-100 cursor-zoom-in flex-shrink-0" />
                                                ))}
                                                {!desktopForm.photos?.length && <span className="text-xs text-gray-300 italic flex items-center">無照片</span>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Save buttons */}
                                    <div className="flex gap-2 pb-4">
                                        <button onClick={() => {
                                            const unfilled = filteredStudents.filter(s => !savedStudentIds.has(s.id) && s.id !== desktopStudentId);
                                            if (unfilled.length > 0) setDesktopStudentId(unfilled[0].id);
                                        }} className="px-4 py-2.5 text-sm font-bold text-gray-400 bg-white border rounded-xl hover:bg-gray-50 transition">
                                            略過
                                        </button>
                                        <button onClick={() => handleSave(desktopStudent, true)}
                                            className={`flex-1 py-2.5 text-sm font-bold text-white rounded-xl shadow-md transition ${selectedDate !== new Date().toISOString().split('T')[0] ? 'bg-orange-500 hover:bg-orange-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                                            {selectedDate !== new Date().toISOString().split('T')[0] ? '💾 修改歷史紀錄' : '💾 儲存並跳下一位'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* ── 右側：聊天面板 ───────────────────────────────────────── */}
                    <div className="transition-all duration-300 bg-white border-l border-gray-100 flex flex-col overflow-hidden flex-shrink-0"
                        style={{ width: chatOpen ? 270 : 0 }}>
                        {chatOpen && (
                            <>
                                <div className="px-3 py-2.5 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
                                    <span className="font-black text-gray-800 text-sm">💬 親師對話</span>
                                    <button onClick={() => { setChatOpen(false); setSelectedChatUserId(null); }}
                                        className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-xs text-gray-500 font-bold">✕</button>
                                </div>
                                {!selectedChatUserId ? (
                                    <div className="flex-1 overflow-y-auto">
                                        {chatConversations.length === 0 && (
                                            <div className="p-6 text-center text-gray-300 text-xs font-bold">目前沒有對話</div>
                                        )}
                                        {chatConversations.map(c => (
                                            <button key={c.partnerId} onClick={() => { setSelectedChatUserId(c.partnerId); fetchChatMessages(c.partnerId); }}
                                                className="w-full flex items-center gap-2.5 px-3 py-3 text-left hover:bg-gray-50 border-b border-gray-50 transition">
                                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-black text-sm flex-shrink-0">
                                                    {(c.partner?.name || c.partner?.email || '?')[0]}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between">
                                                        <span className="text-sm font-bold text-gray-800 truncate">{c.partner?.name || c.partner?.email}</span>
                                                        <span className="text-[10px] text-gray-400 flex-shrink-0">{new Date(c.lastMsg.created_at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}</span>
                                                    </div>
                                                    <p className="text-xs text-gray-400 truncate">{c.lastMsg.content}</p>
                                                </div>
                                                {c.unread > 0 && <span className="w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center flex-shrink-0">{c.unread}</span>}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <>
                                        <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
                                            <button onClick={() => { setSelectedChatUserId(null); fetchChatConversations(); }} className="text-gray-400 text-sm font-bold hover:text-gray-600">←</button>
                                            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xs">
                                                {(chatConversations.find(c => c.partnerId === selectedChatUserId)?.partner?.name || '?')[0]}
                                            </div>
                                            <p className="text-xs font-bold text-gray-800">
                                                {chatConversations.find(c => c.partnerId === selectedChatUserId)?.partner?.name || '家長'}
                                            </p>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                                            {chatMessages.map((m, i) => (
                                                <div key={i} className={`flex ${m.sender_id === currentUser?.id ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs font-medium ${m.sender_id === currentUser?.id ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-700 rounded-bl-sm'}`}>
                                                        {m.content}
                                                        <span className={`block text-[9px] mt-0.5 ${m.sender_id === currentUser?.id ? 'text-indigo-200' : 'text-gray-400'}`}>
                                                            {new Date(m.created_at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                            <div ref={chatBottomRef} />
                                        </div>
                                        <div className="p-2.5 border-t border-gray-100 flex gap-2 flex-shrink-0">
                                            <input value={replyText} onChange={e => setReplyText(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                                                placeholder="回覆..."
                                                className="flex-1 px-3 py-1.5 text-xs border rounded-full outline-none focus:ring-2 focus:ring-indigo-200" />
                                            <button onClick={handleSendChat} className="w-7 h-7 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs hover:bg-indigo-700">↑</button>
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </div>

                    {/* Floating chat button */}
                    {!chatOpen && (
                        <button onClick={() => setChatOpen(true)}
                            className="fixed bottom-5 right-5 w-12 h-12 bg-indigo-600 text-white rounded-full shadow-xl flex items-center justify-center text-xl hover:bg-indigo-700 transition hover:scale-110 z-50">
                            💬
                            {totalUnread > 0 && (
                                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center">{totalUnread > 99 ? '99+' : totalUnread}</span>
                            )}
                        </button>
                    )}
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                MOBILE / PARENT / DASHBOARD — original layout
            ══════════════════════════════════════════════════════════════════ */}
            <div className={isTeacher && !isDashboard ? 'md:hidden' : ''}>
                <div className="min-h-screen bg-[#F3F4F6] pb-20">
                    {/* Sticky header */}
                    <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm">
                        <div className="max-w-6xl mx-auto px-4 py-3">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <button onClick={() => setSelectedClass(null)} className="bg-indigo-600 text-white p-2 rounded-lg shadow-lg hover:bg-indigo-700 transition">📖</button>
                                    <div>
                                        <h1 className="text-lg font-black text-gray-800">
                                            {isDashboard ? '班級大廳' : selectedClass === 'ALL' ? '我的孩子' : selectedClass}
                                        </h1>
                                        <p className="text-[10px] text-gray-400 font-bold flex items-center gap-1">
                                            {selectedDate}
                                            {selectedDate !== new Date().toISOString().split('T')[0] && <span className="text-orange-500">(歷史紀錄)</span>}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2 items-center">
                                    {!isDashboard && (
                                        <button onClick={() => setIsCalendarOpen(true)} className="bg-orange-50 text-orange-600 border border-orange-200 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-orange-100 flex items-center gap-1">
                                            <span>📅</span><span className="hidden sm:inline">歷史月曆</span>
                                        </button>
                                    )}
                                    <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="bg-gray-100 rounded-lg px-3 py-1.5 text-sm font-bold text-gray-600 outline-none" />
                                    <button onClick={() => router.push('/')} className="text-gray-400 hover:text-gray-600 text-sm font-bold px-2">退出</button>
                                </div>
                            </div>
                            {!isDashboard && isTeacher && (
                                <div className="mt-2 flex">
                                    <button onClick={() => setSelectedClass(null)} className="text-xs text-indigo-500 font-bold hover:underline">⬅ 回到班級選單</button>
                                </div>
                            )}
                        </div>

                        {/* Bulk broadcast (mobile) */}
                        {!isDashboard && isTeacher && selectedClass !== 'ALL' && (
                            <div className="bg-indigo-50/80 border-b border-indigo-100 px-4 py-3">
                                <div className="max-w-6xl mx-auto">
                                    <details className="group">
                                        <summary className="flex items-center gap-2 font-bold text-indigo-900 cursor-pointer list-none select-none">
                                            <span className="w-6 h-6 bg-indigo-200 text-indigo-700 rounded-full flex items-center justify-center text-xs">📢</span>
                                            <span>班級廣播站</span>
                                            <span className="text-[10px] text-indigo-400 ml-2 font-normal">(點擊展開)</span>
                                        </summary>
                                        <div className="mt-3 space-y-2 pl-8 animate-fade-in">
                                            <input type="text" placeholder="📖 今日主題（全班）" value={broadcastTopic} onChange={e => setBroadcastTopic(e.target.value)} className="w-full p-2 bg-white border border-indigo-100 rounded-lg text-sm font-bold" />
                                            <input type="text" placeholder="📝 複習功課（全班）" value={broadcastHomework} onChange={e => setBroadcastHomework(e.target.value)} className="w-full p-2 bg-white border border-indigo-100 rounded-lg text-sm font-bold" />
                                            <input type="text" placeholder="🔔 班級叮嚀給家長" value={broadcastAnnouncement} onChange={e => setBroadcastAnnouncement(e.target.value)} className="w-full p-2 bg-white border border-indigo-100 rounded-lg text-sm font-bold" />
                                            <button onClick={handleBroadcast} className={`w-full py-2.5 rounded-xl font-bold text-sm transition ${broadcastSent ? 'bg-green-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                                                {broadcastSent ? '✅ 已套用全班！' : '⚡ 套用到全班'}
                                            </button>
                                        </div>
                                    </details>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="max-w-6xl mx-auto p-4">
                        {/* Dashboard — class grid */}
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

                        {/* Student card list */}
                        {!isDashboard && (
                            <>
                                {filteredStudents.length > 0 && isTeacher && (
                                    <div className="mb-4 space-y-3">
                                        {(() => {
                                            const saved = filteredStudents.filter(s => savedStudentIds.has(s.id)).length;
                                            const total = filteredStudents.length;
                                            const pct = Math.round((saved / total) * 100);
                                            const allDone = saved === total;
                                            return (
                                                <div className={`rounded-xl p-3 border ${allDone ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className={`text-xs font-black ${allDone ? 'text-green-700' : 'text-gray-600'}`}>{allDone ? '✅ 今日全班完成！' : `今日進度：${saved} / ${total} 已儲存`}</span>
                                                        <button onClick={handleSaveAll} disabled={savingAll || allDone}
                                                            className={`text-xs font-black px-4 py-1.5 rounded-lg transition ${allDone ? 'bg-green-100 text-green-600 cursor-default' : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50'}`}>
                                                            {savingAll ? '儲存中...' : allDone ? '✅ 完成' : '💾 全班一鍵儲存'}
                                                        </button>
                                                    </div>
                                                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                                                        <div className={`h-1.5 rounded-full transition-all duration-500 ${allDone ? 'bg-green-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                        <div className="flex items-center justify-between px-1">
                                            <button onClick={() => setShowOnlyUnfilled(v => !v)}
                                                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition ${showOnlyUnfilled ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-orange-300 hover:text-orange-500'}`}>
                                                {showOnlyUnfilled ? `✓ 只看未儲存 (${displayedStudents.length})` : '只看未儲存'}
                                            </button>
                                            <div className="flex gap-2">
                                                <button onClick={() => setExpandedStudents(new Set(filteredStudents.map(s => s.id)))} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white text-gray-500 border border-gray-200 hover:border-indigo-300 hover:text-indigo-500 transition">全部展開</button>
                                                <button onClick={() => setExpandedStudents(new Set())} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white text-gray-500 border border-gray-200 transition">全部收合</button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-3">
                                    {displayedStudents.length === 0 ? (
                                        <div className="text-center py-20 text-gray-300 font-bold">{showOnlyUnfilled ? '所有學生都已填寫完成 🎉' : '此班級無學生'}</div>
                                    ) : displayedStudents.map(student => {
                                        const form = forms[student.id] || DEFAULT_FORM;
                                        const absent = form.is_absent;
                                        const tags = parseClassTags(student.grade);
                                        const otherTags = tags.filter(t => t !== selectedClass);
                                        const isExpanded = expandedStudents.has(student.id);
                                        const isSaved = savedStudentIds.has(student.id);
                                        return (
                                            <div key={student.id} className={`bg-white rounded-2xl shadow-sm border transition-all duration-200 ${absent ? 'border-gray-200 bg-gray-50/50 opacity-70' : isSaved && !isExpanded ? 'border-green-200 bg-green-50/30' : isExpanded ? 'border-indigo-200 shadow-md' : 'border-gray-100 hover:border-gray-200'}`}>
                                                <button type="button" onClick={() => toggleExpand(student.id)} className="w-full p-4 flex items-center gap-3 text-left">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg flex-shrink-0 ${absent ? 'bg-gray-200 text-gray-400' : 'bg-indigo-50 text-indigo-600'}`}>{student.chinese_name[0]}</div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className={`font-black text-base ${absent ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{student.chinese_name}</span>
                                                            {absent && <span className="bg-gray-400 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">請假</span>}
                                                            {otherTags.map(t => <span key={t} className="bg-orange-100 text-orange-600 text-[10px] px-2 py-0.5 rounded-full border border-orange-200 font-bold">🧸 {t}</span>)}
                                                        </div>
                                                        {!isExpanded && (
                                                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                                {[{ label: '心情', val: form.mood }, { label: '專注', val: form.focus }, { label: '互動', val: form.participation }, { label: '表達', val: form.expression }].map(({ label, val }) => (
                                                                    <div key={label} className="flex items-center gap-1">
                                                                        <div className={`w-2 h-2 rounded-full ${moodDot(val)}`} />
                                                                        <span className="text-[10px] text-gray-400">{label}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        {form.signature ? <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">✅ 簽名</span> : <span className="text-[10px] bg-red-50 text-red-400 px-2 py-0.5 rounded-full font-bold">未簽</span>}
                                                        <span className={`text-gray-300 text-sm transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                                                    </div>
                                                </button>

                                                {isExpanded && (
                                                    <div className={`border-t border-gray-50 ${absent ? 'opacity-50 pointer-events-none' : ''}`}>
                                                        {isTeacher && (
                                                            <div className="px-4 py-2 flex justify-end">
                                                                <label className="text-[11px] font-bold text-gray-400 flex items-center gap-1.5 cursor-pointer">
                                                                    <input type="checkbox" checked={form.is_absent} onChange={e => handleFormChange(student.id, 'is_absent', e.target.checked)} className="accent-gray-500" />
                                                                    標記請假
                                                                </label>
                                                            </div>
                                                        )}
                                                        <div className="px-4 pb-4 space-y-4">
                                                            {form.lesson_topic && (
                                                                <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 flex items-center gap-2">
                                                                    <span className="text-indigo-400 text-sm">📖</span>
                                                                    <div>
                                                                        <span className="text-[10px] font-black text-indigo-400">今日主題</span>
                                                                        <p className="font-bold text-sm text-indigo-700">{form.lesson_topic}</p>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-2">
                                                                <p className="text-[10px] font-black text-gray-400 uppercase mb-2">課堂表現</p>
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    {[{ field: 'mood', label: '心情', color: 'text-yellow-400' }, { field: 'focus', label: '專注度', color: 'text-indigo-400' }, { field: 'participation', label: '課堂互動', color: 'text-emerald-400' }, { field: 'expression', label: '主動表達', color: 'text-purple-400' }].map(({ field, label, color }) => (
                                                                        <div key={field} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                                                                            <StarRating label={label} value={form[field as keyof typeof form] as number} color={color} onChange={(v: any) => handleFormChange(student.id, field, v)} disabled={!isTeacher} />
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] font-black text-gray-400 ml-1 uppercase">📝 複習建議</label>
                                                                {isTeacher
                                                                    ? <input type="text" value={form.homework} onChange={e => handleFormChange(student.id, 'homework', e.target.value)} className="w-full p-3 bg-gray-50 border-transparent hover:border-indigo-100 focus:bg-white focus:border-indigo-500 rounded-xl font-bold text-sm text-gray-700 outline-none transition-all" placeholder="例如：練習 p.30 生字卡..." />
                                                                    : <div className="p-3 bg-gray-50 rounded-xl font-bold text-sm text-gray-700 min-h-[46px]">{form.homework || '無'}</div>}
                                                            </div>
                                                            <div className="rounded-xl border border-green-100 bg-green-50/50 p-3">
                                                                <label className="text-[10px] font-black text-green-600 ml-1 flex items-center gap-1 mb-1.5"><span>📤</span> 給家長的留言 <span className="text-green-400 font-normal">（家長看得到）</span></label>
                                                                {isTeacher
                                                                    ? <textarea rows={2} value={form.public_note} onChange={e => handleFormChange(student.id, 'public_note', e.target.value)} className="w-full p-2.5 bg-white border border-green-100 hover:border-green-300 focus:border-green-500 rounded-lg font-bold text-sm text-gray-700 outline-none transition-all resize-none" placeholder="今天表現很棒！..." />
                                                                    : <div className="p-2.5 bg-white rounded-lg font-bold text-sm text-gray-700 min-h-[60px] whitespace-pre-wrap">{form.public_note || '無留言'}</div>}
                                                            </div>
                                                            {isTeacher && (
                                                                <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-3">
                                                                    <label className="text-[10px] font-black text-gray-400 ml-1 flex items-center gap-1 mb-1.5"><span>🔒</span> 內部備註 <span className="text-gray-300 font-normal">（家長看不到）</span></label>
                                                                    <textarea rows={2} value={form.note} onChange={e => handleFormChange(student.id, 'note', e.target.value)} className="w-full p-2.5 bg-white border border-gray-100 hover:border-gray-300 focus:border-gray-400 rounded-lg font-bold text-sm text-gray-600 outline-none transition-all resize-none" placeholder="內部觀察..." />
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
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
