'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

// Types
type Role = 'director' | 'manager' | 'teacher' | 'parent' | 'admin' | 'loading';
type ViewMode = 'today' | 'history';

export default function ContactBookPage() {
    const router = useRouter();
    const [role, setRole] = useState<Role>('loading');
    const [userId, setUserId] = useState('');
    const [loading, setLoading] = useState(true);

    // Data State
    const [classes, setClasses] = useState<string[]>([]);
    const [selectedClass, setSelectedClass] = useState<string>('');
    const [students, setStudents] = useState<any[]>([]);
    const [myChildren, setMyChildren] = useState<any[]>([]);
    const [selectedChildId, setSelectedChildId] = useState<string>('');
    const [logs, setLogs] = useState<any[]>([]);

    // Teacher View State
    const [viewMode, setViewMode] = useState<ViewMode>('today');
    const [todayStatus, setTodayStatus] = useState<Record<string, boolean>>({});
    const [existingLogs, setExistingLogs] = useState<Record<string, any>>({});

    // 🔥 全班發布設定
    const [standardHomework, setStandardHomework] = useState('');
    const [standardPhotoUrl, setStandardPhotoUrl] = useState('');
    const [batchUploading, setBatchUploading] = useState(false);

    // History Mode State
    const [historyLogs, setHistoryLogs] = useState<any[]>([]);
    const [historyMonth, setHistoryMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

    // Modal & Upload State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentStudent, setCurrentStudent] = useState<any>(null);
    const [editingLogId, setEditingLogId] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    const [formData, setFormData] = useState({
        date: '',
        mood: 3,
        focus: 3,
        appetite: 3,
        homework: '',
        comment: '',
        photo_url: ''
    });

    useEffect(() => {
        fetchData();
    }, []);

    // 1. Fetch Strategy
    async function fetchData() {
        try {
            setLoading(true);
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.push('/'); return; }
            setUserId(session.user.id);

            const email = session.user.email;
            let userRole: Role = 'parent';

            if (email === 'teacheryoyo@demo.com') {
                userRole = 'director';
                setRole('director');
            } else {
                const { data: profile } = await supabase.from('users').select('role').eq('id', session.user.id).single();
                userRole = profile?.role || 'parent';
                setRole(userRole);
            }

            if (['director', 'manager', 'admin'].includes(userRole)) {
                const { data: list } = await supabase.from('classes').select('name').order('name');
                if (list) {
                    const classNames = list.map(c => c.name);
                    setClasses(classNames);
                    if (classNames.length > 0) setSelectedClass(classNames[0]);
                }
            } else if (userRole === 'teacher') {
                const { data: assignments } = await supabase
                    .from('class_assignments')
                    .select('class_name')
                    .eq('teacher_id', session.user.id);
                if (assignments) {
                    const myClasses = assignments.map(a => a.class_name);
                    setClasses(myClasses);
                    if (myClasses.length > 0) setSelectedClass(myClasses[0]);
                }
            } else if (userRole === 'parent') {
                const { data: children } = await supabase
                    .from('students')
                    .select('*')
                    .eq('parent_id', session.user.id);
                if (children) {
                    setMyChildren(children);
                    if (children.length > 0) {
                        setSelectedChildId(children[0].id);
                        fetchChildLogs(children[0].id);
                    }
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (role === 'parent') return;
        if (!selectedClass) return;

        setStudents([]);
        setHistoryLogs([]);
        setTodayStatus({});

        fetchStudentsInClass(selectedClass);
    }, [selectedClass, role]);

    useEffect(() => {
        if (viewMode === 'history' && selectedClass && students.length > 0) {
            fetchClassHistory();
        }
    }, [viewMode, selectedClass, historyMonth, students]);

    async function fetchStudentsInClass(className: string) {
        const { data: classData } = await supabase.from('classes').select('id').eq('name', className).single();

        if (!classData) {
            const { data: list } = await supabase.from('students').select('*').eq('grade', className).order('chinese_name');
            if (list) {
                setStudents(list);
                checkTodaysLogs(list);
            }
            return;
        }

        const { data: listById } = await supabase.from('students').select('*').eq('class_id', classData.id).order('chinese_name');

        if (listById) {
            setStudents(listById);
            checkTodaysLogs(listById);
        }
    }

    async function checkTodaysLogs(studentList: any[]) {
        const today = new Date().toISOString().split('T')[0];
        const { data: todaysLogs } = await supabase
            .from('contact_books')
            .select('*')
            .in('student_id', studentList.map(s => s.id))
            .eq('date', today);

        const statusMap: Record<string, boolean> = {};
        const logsMap: Record<string, any> = {};

        todaysLogs?.forEach((log: any) => {
            statusMap[log.student_id] = true;
            logsMap[log.student_id] = log;
        });
        setTodayStatus(statusMap);
        setExistingLogs(logsMap);
    }

    async function fetchClassHistory() {
        if (!students.length) return;
        const studentIds = students.map(s => s.id);

        const startDate = `${historyMonth}-01`;
        const [y, m] = historyMonth.split('-').map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        const endDate = `${historyMonth}-${lastDay}`;

        const { data } = await supabase
            .from('contact_books')
            .select('*')
            .in('student_id', studentIds)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: false });

        if (data) setHistoryLogs(data);
    }

    async function fetchChildLogs(studentId: string) {
        setLogs([]);
        const { data } = await supabase
            .from('contact_books')
            .select('*')
            .eq('student_id', studentId)
            .order('date', { ascending: false });
        if (data) setLogs(data);
    }

    // 🔥 全班發布：上傳照片
    async function handleBatchImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
        try {
            if (!event.target.files || event.target.files.length === 0) return;

            setBatchUploading(true);
            const file = event.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `batch-${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('contact-book-photos')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('contact-book-photos')
                .getPublicUrl(filePath);

            setStandardPhotoUrl(publicUrl);

        } catch (error: any) {
            alert('全班照片上傳失敗: ' + error.message);
        } finally {
            setBatchUploading(false);
        }
    }

    // 🔥🔥【關鍵修復】全班發布：執行 (安全分流版)
    async function handleBatchPublish() {
        if (!standardHomework && !standardPhotoUrl) {
            alert('請至少輸入「作業內容」或「上傳一張照片」再按發布！');
            return;
        }

        const msg = standardPhotoUrl
            ? `確定要將「作業：${standardHomework || '無'}」與「照片」發布給全班 ${students.length} 位學生嗎？`
            : `確定要將「${standardHomework}」發布給全班 ${students.length} 位學生嗎？`;

        if (!confirm(`${msg}\n(已填寫過的學生將更新作業與照片，不會覆蓋評語)`)) {
            return;
        }

        try {
            const today = new Date().toISOString().split('T')[0];

            const toInsert: any[] = [];
            const toUpdate: any[] = [];

            students.forEach(student => {
                const existing = existingLogs[student.id];

                const payload = {
                    student_id: student.id,
                    date: today,
                    homework: standardHomework ? standardHomework : (existing?.homework || ''),
                    photo_url: standardPhotoUrl ? standardPhotoUrl : (existing?.photo_url || ''),
                    mood: existing?.mood || 3,
                    focus: existing?.focus || 3,
                    appetite: existing?.appetite || 3,
                    comment: existing?.comment || '',
                };

                if (existing?.id) {
                    toUpdate.push({ ...payload, id: existing.id });
                } else {
                    toInsert.push(payload);
                }
            });

            const promises = [];
            if (toInsert.length > 0) {
                promises.push(supabase.from('contact_books').insert(toInsert));
            }
            if (toUpdate.length > 0) {
                promises.push(supabase.from('contact_books').upsert(toUpdate));
            }

            const results = await Promise.all(promises);

            const errors = results.filter(r => r.error).map(r => r.error?.message);
            if (errors.length > 0) throw new Error(errors.join(', '));

            alert('🎉 全班發布成功！');
            checkTodaysLogs(students);

        } catch (e: any) {
            alert('發布失敗: ' + e.message);
        }
    }

    // 單人照片上傳
    async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
        try {
            if (!event.target.files || event.target.files.length === 0) return;

            setUploading(true);
            const file = event.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('contact-book-photos')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('contact-book-photos')
                .getPublicUrl(filePath);

            setFormData(prev => ({ ...prev, photo_url: publicUrl }));

        } catch (error: any) {
            alert('上傳失敗: ' + error.message);
        } finally {
            setUploading(false);
        }
    }

    function removeImage() {
        setFormData(prev => ({ ...prev, photo_url: '' }));
    }

    function openModal(student: any, logData: any = null) {
        const targetStudent = student || { id: logData?.student_id, chinese_name: '未知學生' };

        setCurrentStudent(targetStudent);
        const today = new Date().toISOString().split('T')[0];

        if (logData) {
            setEditingLogId(logData.id);
            setFormData({
                date: logData.date,
                mood: logData.mood || 3,
                focus: logData.focus || 3,
                appetite: logData.appetite || 3,
                homework: logData.homework || '',
                comment: logData.comment || '',
                photo_url: logData.photo_url || ''
            });
        } else {
            const todayLog = existingLogs[targetStudent.id];
            setEditingLogId(todayLog ? todayLog.id : null);
            setFormData({
                date: today,
                mood: todayLog?.mood || 3,
                focus: todayLog?.focus || 3,
                appetite: todayLog?.appetite || 3,
                homework: todayLog?.homework || standardHomework || '',
                comment: todayLog?.comment || '',
                photo_url: todayLog?.photo_url || standardPhotoUrl || ''
            });
        }
        setIsModalOpen(true);
    }

    async function handleSave() {
        if (!currentStudent) return;

        try {
            const payload = {
                student_id: currentStudent.id,
                date: formData.date,
                mood: formData.mood,
                focus: formData.focus,
                appetite: formData.appetite,
                homework: formData.homework,
                comment: formData.comment,
                photo_url: formData.photo_url
            };

            let error;

            if (editingLogId) {
                const { error: updateError } = await supabase
                    .from('contact_books')
                    .update(payload)
                    .eq('id', editingLogId);
                error = updateError;
            } else {
                const { data: check } = await supabase
                    .from('contact_books')
                    .select('id')
                    .eq('student_id', currentStudent.id)
                    .eq('date', formData.date)
                    .single();

                if (check) {
                    const { error: updateError } = await supabase
                        .from('contact_books')
                        .update(payload)
                        .eq('id', check.id);
                    error = updateError;
                } else {
                    const { error: insertError } = await supabase
                        .from('contact_books')
                        .insert(payload);
                    error = insertError;
                }
            }

            if (error) throw error;

            const today = new Date().toISOString().split('T')[0];
            if (formData.date === today) {
                setTodayStatus(prev => ({ ...prev, [currentStudent.id]: true }));
                setExistingLogs(prev => ({ ...prev, [currentStudent.id]: { ...payload, id: editingLogId } }));
            }

            if (viewMode === 'history') {
                fetchClassHistory();
            }

            setIsModalOpen(false);
            setEditingLogId(null);

        } catch (e: any) {
            alert('儲存失敗: ' + e.message);
        }
    }

    function applyStandardHomework() {
        setFormData(prev => ({ ...prev, homework: standardHomework }));
    }

    const renderStars = (count: number, type: string) => {
        let icon = '⭐';
        if (type === 'mood') icon = count === 1 ? '😢' : count === 2 ? '😐' : '😊';
        if (type === 'focus') icon = count === 1 ? '☁️' : count === 2 ? '⚡' : '🔥';
        if (type === 'appetite') icon = count === 1 ? '🥣' : count === 2 ? '🍱' : '🍗';
        return <span className="text-xl">{icon}</span>;
    };

    if (loading) return <div className="p-10 text-center animate-pulse">載入聯絡簿資料中...</div>;

    if (role === 'parent') {
        return (
            <div className="min-h-screen bg-gray-50 p-4">
                <div className="max-w-md mx-auto">
                    <h1 className="text-2xl font-black mb-6 text-gray-800">📖 寶寶聯絡簿</h1>
                    {myChildren.length > 1 && (
                        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                            {myChildren.map(child => (
                                <button
                                    key={child.id}
                                    onClick={() => { setSelectedChildId(child.id); fetchChildLogs(child.id); }}
                                    className={`px-4 py-2 rounded-full whitespace-nowrap font-bold transition
                                        ${selectedChildId === child.id ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-gray-500 border'}
                                    `}
                                >
                                    {child.chinese_name || child.name}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="space-y-4">
                        {logs.map(log => (
                            <div key={log.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                                <div className="flex justify-between items-start mb-4 pb-4 border-b border-gray-50">
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">DATE</span>
                                        <span className="text-xl font-black text-indigo-900">{log.date}</span>
                                    </div>
                                    {log.photo_url && (
                                        <a href={log.photo_url} target="_blank" className="block w-12 h-12 rounded-lg bg-gray-100 bg-cover bg-center border" style={{ backgroundImage: `url(${log.photo_url})` }} />
                                    )}
                                </div>
                                <div className="grid grid-cols-3 gap-2 mb-5">
                                    <div className="bg-orange-50 rounded-xl p-3 text-center"><div className="text-xs text-orange-400 font-bold mb-1">心情</div>{renderStars(log.mood, 'mood')}</div>
                                    <div className="bg-blue-50 rounded-xl p-3 text-center"><div className="text-xs text-blue-400 font-bold mb-1">專注</div>{renderStars(log.focus, 'focus')}</div>
                                    <div className="bg-green-50 rounded-xl p-3 text-center"><div className="text-xs text-green-400 font-bold mb-1">食慾</div>{renderStars(log.appetite, 'appetite')}</div>
                                </div>
                                <div className="space-y-3">
                                    <div className="bg-gray-50 p-3 rounded-xl text-gray-700 text-sm">{log.homework || '無作業'}</div>
                                    {log.comment && <div className="p-1 text-gray-600 text-sm">💡 {log.comment}</div>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                        <div>
                            <h1 className="text-2xl font-black text-gray-800">📝 電子聯絡簿</h1>
                            <p className="text-gray-400 text-xs mt-1">
                                {role === 'director' ? '管理員模式' : '教師模式'}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                            <select
                                value={selectedClass}
                                onChange={e => setSelectedClass(e.target.value)}
                                className="p-2 border rounded-lg font-bold text-gray-700 w-32"
                            >
                                <option value="" disabled>班級</option>
                                {classes.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>

                            <div className="bg-gray-100 p-1 rounded-lg flex">
                                <button
                                    onClick={() => setViewMode('today')}
                                    className={`px-3 py-1.5 rounded-md text-sm font-bold transition ${viewMode === 'today' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                                >
                                    今日作業
                                </button>
                                <button
                                    onClick={() => setViewMode('history')}
                                    className={`px-3 py-1.5 rounded-md text-sm font-bold transition ${viewMode === 'history' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                                >
                                    歷史總覽
                                </button>
                            </div>

                            <button onClick={() => router.push('/')} className="px-3 py-2 text-gray-500 hover:bg-gray-100 rounded-lg">離開</button>
                        </div>
                    </div>

                    {viewMode === 'today' && (
                        <div className="flex gap-2 items-center bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                            <span className="text-xl">⚡</span>
                            <input
                                type="text"
                                placeholder="設定今日全班預設作業..."
                                value={standardHomework}
                                onChange={e => setStandardHomework(e.target.value)}
                                className="flex-1 bg-transparent border-none outline-none font-bold text-indigo-900 placeholder-indigo-300"
                            />

                            {/* 🔥 全班照片按鈕 */}
                            <div className="relative">
                                {standardPhotoUrl ? (
                                    <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-gray-200 group">
                                        <img src={standardPhotoUrl} className="w-full h-full object-cover" />
                                        <button
                                            onClick={() => setStandardPhotoUrl('')}
                                            className="absolute inset-0 bg-black/50 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ) : (
                                    <div className="relative w-10 h-10 bg-white rounded-lg border border-indigo-200 flex items-center justify-center cursor-pointer hover:bg-indigo-50 transition">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                            onChange={handleBatchImageUpload}
                                            disabled={batchUploading}
                                        />
                                        <span className="text-xl">📷</span>
                                    </div>
                                )}
                            </div>

                            {/* 一鍵發布 */}
                            <button
                                onClick={handleBatchPublish}
                                disabled={batchUploading}
                                className={`whitespace-nowrap px-4 py-2 text-white font-bold rounded-lg shadow-md transition flex items-center gap-1
                                    ${batchUploading ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'}
                                `}
                            >
                                {batchUploading ? '上傳中...' : '🚀 一鍵發布'}
                            </button>
                        </div>
                    )}

                    {viewMode === 'history' && (
                        <div className="flex gap-2 items-center bg-orange-50 p-4 rounded-xl border border-orange-100">
                            <span className="text-xl">📅</span>
                            <span className="text-sm font-bold text-orange-800 mr-2">選擇月份:</span>
                            <input
                                type="month"
                                value={historyMonth}
                                onChange={e => setHistoryMonth(e.target.value)}
                                className="bg-white border border-orange-200 rounded px-2 py-1 text-gray-700 font-bold"
                            />
                        </div>
                    )}
                </div>

                {!selectedClass ? (
                    <div className="text-center py-20 text-gray-400">請先選擇班級</div>
                ) : (
                    <>
                        {viewMode === 'today' && (
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {students.map(s => {
                                    const isDone = todayStatus[s.id];
                                    return (
                                        <button
                                            key={s.id}
                                            onClick={() => openModal(s)}
                                            className={`relative p-4 rounded-2xl border transition text-left group
                                                ${isDone
                                                    ? 'bg-green-50/50 border-green-200 hover:bg-green-100'
                                                    : 'bg-white hover:bg-gray-50 border-gray-100 hover:border-indigo-200 hover:shadow-md'
                                                }
                                            `}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <span className={`font-bold text-lg ${isDone ? 'text-green-800' : 'text-gray-800'}`}>
                                                    {s.chinese_name || s.name}
                                                </span>
                                                {isDone ? <span>✅</span> : <span className="opacity-0 group-hover:opacity-100">✏️</span>}
                                            </div>
                                            <div className="text-xs text-gray-400 truncate">{s.grade || selectedClass}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {viewMode === 'history' && (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>
                                                <th className="p-4 font-bold text-gray-600 w-32">日期</th>
                                                <th className="p-4 font-bold text-gray-600 w-24">學生</th>
                                                <th className="p-4 font-bold text-gray-600 w-32 text-center">狀態</th>
                                                {/* 🔥 新增照片欄位 */}
                                                <th className="p-4 font-bold text-gray-600 w-16 text-center">照片</th>
                                                <th className="p-4 font-bold text-gray-600">作業內容</th>
                                                <th className="p-4 font-bold text-gray-600 w-48">評語</th>
                                                <th className="p-4 font-bold text-gray-600 w-20 text-center">修改</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {historyLogs.map(log => {
                                                const student = students.find(s => s.id === log.student_id);
                                                return (
                                                    <tr key={log.id} className="hover:bg-indigo-50/50 transition cursor-pointer" onClick={() => openModal(student, log)}>
                                                        <td className="p-4 font-mono text-indigo-900 font-bold">{log.date}</td>
                                                        <td className="p-4 font-bold text-gray-800">
                                                            {student?.chinese_name || <span className="text-red-300 italic">已刪除</span>}
                                                        </td>
                                                        <td className="p-4 text-center">
                                                            <div className="flex justify-center gap-1 text-sm">
                                                                <span title="心情">{renderStars(log.mood, 'mood')}</span>
                                                                <span title="專注">{renderStars(log.focus, 'focus')}</span>
                                                            </div>
                                                        </td>
                                                        {/* 🔥 新增照片縮圖儲存格 */}
                                                        <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}> {/* 防止觸發列點擊 */}
                                                            {log.photo_url ? (
                                                                <a
                                                                    href={log.photo_url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="inline-block w-8 h-8 bg-gray-100 rounded-lg bg-cover bg-center border border-gray-200 hover:scale-110 transition shadow-sm"
                                                                    style={{ backgroundImage: `url(${log.photo_url})` }}
                                                                    title="點擊查看大圖"
                                                                >
                                                                    {/* 縮圖內容為空，背景圖顯示 */}
                                                                </a>
                                                            ) : (
                                                                <span className="text-gray-300">-</span>
                                                            )}
                                                        </td>
                                                        <td className="p-4 text-gray-600 text-sm">{log.homework}</td>
                                                        <td className="p-4 text-gray-500 text-sm truncate max-w-xs">{log.comment}</td>
                                                        <td className="p-4 text-center">
                                                            <button className="text-indigo-600 hover:text-indigo-800 font-bold text-sm">編輯</button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {historyLogs.length === 0 && (
                                                <tr>
                                                    <td colSpan={6} className="p-10 text-center text-gray-400">本月尚無紀錄</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {isModalOpen && currentStudent && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl animate-fade-in-up flex flex-col max-h-[90vh]">
                            <div className="flex justify-between items-center mb-4">
                                <div>
                                    <h2 className="text-2xl font-black text-gray-800">{currentStudent.chinese_name}</h2>
                                    <p className="text-gray-400 text-xs">
                                        {editingLogId ? `正在編輯 ${formData.date} 的紀錄` : '填寫今日紀錄'}
                                    </p>
                                </div>
                                <button onClick={() => setIsModalOpen(false)} className="bg-gray-100 p-2 rounded-full hover:bg-gray-200 transition">✕</button>
                            </div>
                            <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                                <div className="bg-yellow-50 p-3 rounded-xl border border-yellow-100 flex items-center justify-between">
                                    <label className="text-xs font-bold text-yellow-700">📅 日期</label>
                                    <input
                                        type="date"
                                        value={formData.date}
                                        onChange={e => setFormData({ ...formData, date: e.target.value })}
                                        className="bg-transparent border-none font-bold text-gray-800 text-right outline-none"
                                    />
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    {[
                                        { label: '心情', key: 'mood', options: ['😢', '😐', '😊'] },
                                        { label: '專注', key: 'focus', options: ['☁️', '⚡', '🔥'] },
                                        { label: '食慾', key: 'appetite', options: ['🥣', '🍱', '🍗'] }
                                    ].map((m: any) => (
                                        <div key={m.key} className="text-center">
                                            <div className="text-xs font-bold text-gray-400 mb-2">{m.label}</div>
                                            <div className="flex justify-center gap-1">
                                                {m.options.map((emoji: string, idx: number) => {
                                                    const val = idx + 1;
                                                    const isActive = (formData as any)[m.key] === val;
                                                    return (
                                                        <button
                                                            key={idx}
                                                            onClick={() => setFormData({ ...formData, [m.key]: val })}
                                                            className={`w-10 h-10 rounded-full flex items-center justify-center text-xl transition
                                                                ${isActive ? 'bg-indigo-100 scale-110 shadow-inner' : 'grayscale opacity-50 hover:grayscale-0 hover:opacity-100'}
                                                            `}
                                                        >
                                                            {emoji}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-xs font-bold text-gray-500">🏠 回家作業</label>
                                        {!editingLogId && (
                                            <button onClick={applyStandardHomework} className="text-xs text-indigo-600 font-bold hover:underline">
                                                📥 套用全班作業
                                            </button>
                                        )}
                                    </div>
                                    <textarea
                                        className="w-full p-3 border rounded-xl h-24 font-medium text-gray-700 resize-none bg-gray-50 focus:bg-white transition"
                                        placeholder="請輸入作業內容..."
                                        value={formData.homework}
                                        onChange={e => setFormData({ ...formData, homework: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 mb-1 block">💬 老師評語</label>
                                    <textarea
                                        className="w-full p-3 border rounded-xl h-20 font-medium text-gray-700 resize-none bg-gray-50 focus:bg-white transition"
                                        placeholder="給家長的話..."
                                        value={formData.comment}
                                        onChange={e => setFormData({ ...formData, comment: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-gray-500 mb-1 block">📷 照片紀錄</label>

                                    {!formData.photo_url ? (
                                        <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center hover:bg-gray-50 transition cursor-pointer relative">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                onChange={handleImageUpload}
                                                disabled={uploading}
                                            />
                                            {uploading ? (
                                                <div className="text-indigo-500 font-bold">⏳ 上傳中...</div>
                                            ) : (
                                                <>
                                                    <div className="text-3xl mb-1">📸</div>
                                                    <div className="text-sm text-gray-400 font-bold">點擊拍攝或上傳照片</div>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="relative rounded-xl overflow-hidden border border-gray-200">
                                            <img src={formData.photo_url} alt="Uploaded" className="w-full h-48 object-cover" />
                                            <button
                                                onClick={removeImage}
                                                className="absolute top-2 right-2 bg-red-500 text-white w-8 h-8 rounded-full flex items-center justify-center shadow-lg hover:bg-red-600"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    )}
                                </div>

                            </div>
                            <div className="mt-6 pt-4 border-t">
                                <button
                                    onClick={handleSave}
                                    className={`w-full py-3 text-white font-black rounded-xl shadow-lg transform hover:scale-[1.02] transition
                                        ${editingLogId ? 'bg-orange-500 hover:bg-orange-600' : 'bg-indigo-600 hover:bg-indigo-700'}
                                    `}
                                >
                                    {editingLogId ? '💾 儲存修改' : '✅ 完成並儲存'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}