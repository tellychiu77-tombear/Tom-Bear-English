'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

// Types
type Role = 'director' | 'manager' | 'teacher' | 'parent' | 'admin' | 'loading';

export default function ContactBookPage() {
    const router = useRouter();
    const [role, setRole] = useState<Role>('loading');
    const [userId, setUserId] = useState('');
    const [loading, setLoading] = useState(true);

    // Data State
    const [classes, setClasses] = useState<string[]>([]);
    const [selectedClass, setSelectedClass] = useState<string>('');
    const [students, setStudents] = useState<any[]>([]); // Students in selected class (Teacher view)
    const [myChildren, setMyChildren] = useState<any[]>([]); // Children (Parent view)
    const [selectedChildId, setSelectedChildId] = useState<string>('');
    const [logs, setLogs] = useState<any[]>([]); // Logs for selected child (Parent view)

    // Teacher View State
    const [todayStatus, setTodayStatus] = useState<Record<string, boolean>>({}); // student_id -> has_log
    const [standardHomework, setStandardHomework] = useState(''); // Global homework setting

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentStudent, setCurrentStudent] = useState<any>(null);
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

            // Admin Bypass
            if (email === 'teacheryoyo@demo.com') {
                userRole = 'director';
                setRole('director');
            } else {
                const { data: profile } = await supabase.from('users').select('role').eq('id', session.user.id).single();
                userRole = profile?.role || 'parent';
                setRole(userRole);
            }

            // Role-based Fetching
            if (['director', 'manager', 'admin'].includes(userRole)) {
                // Director: Fetch ALL distinct classes
                const { data: list } = await supabase.from('students').select('class_name');
                if (list) {
                    const uniqueClasses = Array.from(new Set(list.map(i => i.class_name).filter(Boolean))) as string[];
                    setClasses(uniqueClasses);
                    if (uniqueClasses.length > 0) setSelectedClass(uniqueClasses[0]);
                }

            } else if (userRole === 'teacher') {
                // Teacher: Fetch assigned classes
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
                // Parent: Fetch linked students
                // Using view or direct query on student.parent_id
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

    // Teacher: Fetch Students when class changes
    useEffect(() => {
        if (role === 'parent') return;
        if (!selectedClass) return;
        fetchStudentsInClass(selectedClass);
    }, [selectedClass, role]);

    async function fetchStudentsInClass(className: string) {
        const { data: list } = await supabase
            .from('students')
            .select('*')
            .eq('class_name', className)
            .order('name'); // Assuming logic for seat number or name

        if (list) {
            setStudents(list);
            // Check today's status for these students
            const today = new Date().toISOString().split('T')[0];
            const { data: todaysLogs } = await supabase
                .from('contact_books')
                .select('student_id')
                .in('student_id', list.map(s => s.id))
                .eq('date', today);

            const statusMap: Record<string, boolean> = {};
            todaysLogs?.forEach((log: any) => {
                statusMap[log.student_id] = true;
            });
            setTodayStatus(statusMap);
        }
    }

    // Parent: Fetch Logs when child changes
    async function fetchChildLogs(studentId: string) {
        setLogs([]);
        const { data } = await supabase
            .from('contact_books')
            .select('*')
            .eq('student_id', studentId)
            .order('date', { ascending: false });
        if (data) setLogs(data);
    }

    // Modal Actions
    function openModal(student: any) {
        setCurrentStudent(student);
        // Pre-fill or Reset
        // If editing existing for today? simplified: always create new/overwrite logic?
        // Let's assume we are creating new or updating today's. 
        // For simplicity, just reset form for now, but pre-fill homework if 'Standard' is set
        setFormData({
            mood: 3,
            focus: 3,
            appetite: 3,
            homework: standardHomework || '',
            comment: '',
            photo_url: ''
        });
        setIsModalOpen(true);
    }

    async function handleSave() {
        if (!currentStudent) return;

        try {
            const today = new Date().toISOString().split('T')[0];
            // Check if exists today to Update vs Insert? 
            // Or just Insert. Schema doesn't enforce unique date per student yet, but usually 1 per day.
            // Let's try upsert logic manually or just insert.
            // Simplified: Insert.

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

            const { error } = await supabase.from('contact_books').insert(payload);
            if (error) throw error;

            // Success
            setTodayStatus(prev => ({ ...prev, [currentStudent.id]: true }));
            setIsModalOpen(false);
            alert('儲存成功！');

        } catch (e: any) {
            alert('儲存失敗: ' + e.message);
        }
    }

    function applyStandardHomework() {
        setFormData(prev => ({ ...prev, homework: standardHomework }));
    }

    // Helpers
    const renderStars = (count: number, type: string) => {
        let icon = '⭐'; // Default
        if (type === 'mood') icon = count === 1 ? '😢' : count === 2 ? '😐' : '😊';
        if (type === 'focus') icon = count === 1 ? '☁️' : count === 2 ? '⚡' : '🔥';
        if (type === 'appetite') icon = count === 1 ? '🥣' : count === 2 ? '🍱' : '🍗';

        return <span className="text-xl">{icon}</span>; // Simplify to single emoji rep or repetition
    };

    if (loading) return <div className="p-10 text-center animate-pulse">載入聯絡簿資料中...</div>;

    // --- PARENT VIEW ---
    if (role === 'parent') {
        return (
            <div className="min-h-screen bg-gray-50 p-4">
                <div className="max-w-md mx-auto">
                    <h1 className="text-2xl font-black mb-6 text-gray-800">📖 寶寶聯絡簿</h1>

                    {/* Child Tabs */}
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

                    {/* Logs List */}
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
                            placeholder="設定今日全班預設作業內容..."
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
                                    <div className="text-xs text-gray-400 truncate">{s.school_grade || selectedClass}</div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Writing Modal */}
                {isModalOpen && currentStudent && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl animate-fade-in-up">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h2 className="text-2xl font-black text-gray-800">{currentStudent.chinese_name}</h2>
                                    <p className="text-gray-400 text-xs">填寫今日聯絡簿</p>
                                </div>
                                <button onClick={() => setIsModalOpen(false)} className="bg-gray-100 p-2 rounded-full">✕</button>
                            </div>

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

                            <div className="mt-8">
                                <button
                                    onClick={handleSave}
                                    className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-lg hover:bg-indigo-700 transform hover:scale-[1.02] transition"
                                >
                                    ✅ 完成並儲存
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}