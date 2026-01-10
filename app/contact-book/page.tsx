'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

// Types
type Role = 'director' | 'manager' | 'teacher' | 'parent' | 'admin' | 'loading';
type Tab = 'write' | 'history'; // 新增頁籤狀態

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
    const [todayStatus, setTodayStatus] = useState<Record<string, boolean>>({});
    const [existingLogs, setExistingLogs] = useState<Record<string, any>>({});
    const [standardHomework, setStandardHomework] = useState('');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentStudent, setCurrentStudent] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<Tab>('write'); // 控制當前是「填寫」還是「歷史」
    const [studentHistory, setStudentHistory] = useState<any[]>([]); // 該學生的歷史紀錄

    const [formData, setFormData] = useState({
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

    // Teacher: Fetch Students
    useEffect(() => {
        if (role === 'parent') return;
        if (!selectedClass) return;
        fetchStudentsInClass(selectedClass);
    }, [selectedClass, role]);

    async function fetchStudentsInClass(className: string) {
        // 先嘗試用文字匹配 (兼容舊資料)
        const { data: list } = await supabase
            .from('students')
            .select('*')
            .eq('grade', className) // 這裡改回用 grade 抓，因為我們剛剛做了同步，這樣比較直觀
            .order('chinese_name');

        // 如果抓不到，嘗試用 Class ID 邏輯 (備用)
        if (!list || list.length === 0) {
            const { data: classData } = await supabase.from('classes').select('id').eq('name', className).single();
            if (classData) {
                const { data: listById } = await supabase.from('students').select('*').eq('class_id', classData.id).order('chinese_name');
                if (listById) {
                    setStudents(listById);
                    checkTodaysLogs(listById);
                    return;
                }
            }
        }

        if (list) {
            setStudents(list);
            checkTodaysLogs(list);
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

    // Parent: Fetch Logs
    async function fetchChildLogs(studentId: string) {
        setLogs([]);
        const { data } = await supabase
            .from('contact_books')
            .select('*')
            .eq('student_id', studentId)
            .order('date', { ascending: false });
        if (data) setLogs(data);
    }

    // Fetch History for Teacher Modal
    async function fetchStudentHistory(studentId: string) {
        const { data } = await supabase
            .from('contact_books')
            .select('*')
            .eq('student_id', studentId)
            .order('date', { ascending: false })
            .limit(10); // 只抓最近 10 筆

        if (data) setStudentHistory(data);
    }

    // Modal Actions
    function openModal(student: any) {
        setCurrentStudent(student);
        setActiveTab('write'); // 預設打開是填寫頁面
        fetchStudentHistory(student.id); // 順便偷抓歷史紀錄備用

        const todayLog = existingLogs[student.id];

        if (todayLog) {
            // ✅ 編輯模式：帶入舊資料
            setFormData({
                mood: todayLog.mood || 3,
                focus: todayLog.focus || 3,
                appetite: todayLog.appetite || 3,
                homework: todayLog.homework || '',
                comment: todayLog.comment || '',
                photo_url: todayLog.photo_url || ''
            });
        } else {
            // ✅ 新增模式
            setFormData({
                mood: 3,
                focus: 3,
                appetite: 3,
                homework: standardHomework || '',
                comment: '',
                photo_url: ''
            });
        }
        setIsModalOpen(true);
    }

    async function handleSave() {
        if (!currentStudent) return;

        try {
            const today = new Date().toISOString().split('T')[0];

            const payload = {
                student_id: currentStudent.id,
                date: today,
                mood: formData.mood,
                focus: formData.focus,
                appetite: formData.appetite,
                homework: formData.homework,
                comment: formData.comment,
                photo_url: formData.photo_url
            };

            const { data: existing } = await supabase
                .from('contact_books')
                .select('id')
                .eq('student_id', currentStudent.id)
                .eq('date', today)
                .single();

            let error;
            if (existing) {
                // Update
                const { error: updateError } = await supabase
                    .from('contact_books')
                    .update(payload)
                    .eq('id', existing.id);
                error = updateError;
            } else {
                // Insert
                const { error: insertError } = await supabase
                    .from('contact_books')
                    .insert(payload);
                error = insertError;
            }

            if (error) throw error;

            // Success
            setTodayStatus(prev => ({ ...prev, [currentStudent.id]: true }));
            setExistingLogs(prev => ({ ...prev, [currentStudent.id]: payload }));

            setIsModalOpen(false);

        } catch (e: any) {
            alert('儲存失敗: ' + e.message);
        }
    }

    function applyStandardHomework() {
        setFormData(prev => ({ ...prev, homework: standardHomework }));
    }

    // Helpers
    const renderStars = (count: number, type: string) => {
        let icon = '⭐';
        if (type === 'mood') icon = count === 1 ? '😢' : count === 2 ? '😐' : '😊';
        if (type === 'focus') icon = count === 1 ? '☁️' : count === 2 ? '⚡' : '🔥';
        if (type === 'appetite') icon = count === 1 ? '🥣' : count === 2 ? '🍱' : '🍗';
        return <span className="text-xl">{icon}</span>;
    };

    if (loading) return <div className="p-10 text-center animate-pulse">載入聯絡簿資料中...</div>;

    // --- PARENT VIEW ---
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
                        {logs.length === 0 ? (
                            <div className="text-center py-10 text-gray-400">尚無聯絡簿紀錄</div>
                        ) : (
                            logs.map(log => (
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
                                        <div className="bg-orange-50 rounded-xl p-3 text-center">
                                            <div className="text-xs text-orange-400 font-bold mb-1">心情</div>
                                            {renderStars(log.mood || 0, 'mood')}
                                        </div>
                                        <div className="bg-blue-50 rounded-xl p-3 text-center">
                                            <div className="text-xs text-blue-400 font-bold mb-1">專注</div>
                                            {renderStars(log.focus || 0, 'focus')}
                                        </div>
                                        <div className="bg-green-50 rounded-xl p-3 text-center">
                                            <div className="text-xs text-green-400 font-bold mb-1">食慾</div>
                                            {renderStars(log.appetite || 0, 'appetite')}
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <div>
                                            <div className="text-xs font-bold text-gray-400 mb-1">🏠 回家作業</div>
                                            <div className="bg-gray-50 p-3 rounded-xl text-gray-700 text-sm whitespace-pre-line">
                                                {log.homework || '無作業'}
                                            </div>
                                        </div>
                                        {log.comment && (
                                            <div>
                                                <div className="text-xs font-bold text-gray-400 mb-1">💬 老師評語</div>
                                                <div className="p-1 text-gray-600 text-sm">
                                                    {log.comment}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    <button onClick={() => router.push('/')} className="mt-8 w-full py-3 text-gray-400 font-bold text-sm">返回首頁</button>
                </div>
            </div>
        );
    }

    // --- TEACHER / DIRECTOR VIEW ---
    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-5xl mx-auto">
                {/* Control Header */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <div>
                            <h1 className="text-2xl font-black text-gray-800">📝 電子聯絡簿</h1>
                            <p className="text-gray-400 text-xs mt-1">
                                {role === 'director' || role === 'manager' ? '管理員模式' : '教師模式'} | {new Date().toLocaleDateString()}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <select
                                value={selectedClass}
                                onChange={e => setSelectedClass(e.target.value)}
                                className="p-2 border rounded-lg font-bold text-gray-700 w-full md:w-48"
                            >
                                <option value="" disabled>選擇班級</option>
                                {classes.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <button onClick={() => router.push('/')} className="px-4 py-2 text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200">離開</button>
                        </div>
                    </div>

                    {/* Quick Homework Setter */}
                    <div className="flex gap-2 items-center bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                        <span className="text-xl">⚡</span>
                        <input
                            type="text"
                            placeholder="設定今日全班預設作業內容 (例如: Math P.10)"
                            value={standardHomework}
                            onChange={e => setStandardHomework(e.target.value)}
                            className="flex-1 bg-transparent border-none outline-none font-bold text-indigo-900 placeholder-indigo-300"
                        />
                    </div>
                </div>

                {/* Students Grid */}
                {!selectedClass ? (
                    <div className="text-center py-20 text-gray-400">請先選擇班級</div>
                ) : (
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

                {/* 🟢 寫聯絡簿 Modal (包含歷史紀錄頁籤) */}
                {isModalOpen && currentStudent && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl animate-fade-in-up flex flex-col max-h-[90vh]">

                            {/* Header */}
                            <div className="flex justify-between items-center mb-4">
                                <div>
                                    <h2 className="text-2xl font-black text-gray-800">{currentStudent.chinese_name}</h2>
                                    <p className="text-gray-400 text-xs">
                                        {todayStatus[currentStudent.id] ? '已完成 (可編輯修改)' : '今日尚未填寫'}
                                    </p>
                                </div>
                                <button onClick={() => setIsModalOpen(false)} className="bg-gray-100 p-2 rounded-full hover:bg-gray-200 transition">✕</button>
                            </div>

                            {/* Tabs */}
                            <div className="flex p-1 bg-gray-100 rounded-xl mb-6">
                                <button
                                    onClick={() => setActiveTab('write')}
                                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'write' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                                >
                                    ✏️ 填寫今日
                                </button>
                                <button
                                    onClick={() => setActiveTab('history')}
                                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'history' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                                >
                                    📅 歷史紀錄
                                </button>
                            </div>

                            {/* Body - Scrollable */}
                            <div className="flex-1 overflow-y-auto pr-2">

                                {/* 📝 填寫模式 */}
                                {activeTab === 'write' && (
                                    <div className="space-y-6">
                                        {/* Metrics */}
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

                                        {/* Inputs */}
                                        <div>
                                            <div className="flex justify-between items-center mb-1">
                                                <label className="text-xs font-bold text-gray-500">🏠 回家作業</label>
                                                <button onClick={applyStandardHomework} className="text-xs text-indigo-600 font-bold hover:underline">
                                                    📥 套用全班作業
                                                </button>
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
                                            <label className="text-xs font-bold text-gray-500 mb-1 block">📷 照片連結 (選填)</label>
                                            <input
                                                type="text"
                                                className="w-full p-3 border rounded-xl bg-gray-50 focus:bg-white transition"
                                                placeholder="https://..."
                                                value={formData.photo_url}
                                                onChange={e => setFormData({ ...formData, photo_url: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* 📅 歷史紀錄模式 */}
                                {activeTab === 'history' && (
                                    <div className="space-y-4">
                                        {studentHistory.length === 0 ? (
                                            <div className="text-center text-gray-400 py-10">尚無歷史紀錄</div>
                                        ) : (
                                            studentHistory.map(log => (
                                                <div key={log.id} className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="font-bold text-indigo-900">{log.date}</span>
                                                        <div className="flex gap-2 text-sm">
                                                            <span>{renderStars(log.mood, 'mood')}</span>
                                                            <span>{renderStars(log.focus, 'focus')}</span>
                                                        </div>
                                                    </div>
                                                    {log.homework && (
                                                        <div className="text-sm text-gray-600 mb-1">
                                                            <span className="font-bold text-gray-400 text-xs">作業: </span>
                                                            {log.homework}
                                                        </div>
                                                    )}
                                                    {log.comment && (
                                                        <div className="text-sm text-gray-600">
                                                            <span className="font-bold text-gray-400 text-xs">評語: </span>
                                                            {log.comment}
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}

                            </div>

                            {/* Footer Action */}
                            {activeTab === 'write' && (
                                <div className="mt-6 pt-4 border-t">
                                    <button
                                        onClick={handleSave}
                                        className={`w-full py-3 text-white font-black rounded-xl shadow-lg transform hover:scale-[1.02] transition
                                            ${todayStatus[currentStudent.id] ? 'bg-green-600 hover:bg-green-700' : 'bg-indigo-600 hover:bg-indigo-700'}
                                        `}
                                    >
                                        {todayStatus[currentStudent.id] ? '✅ 更新紀錄' : '💾 完成並儲存'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}