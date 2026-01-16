'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function ContactBookPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [role, setRole] = useState<string>('parent');
    const [userEmail, setUserEmail] = useState('');

    // Data
    const [classes, setClasses] = useState<any[]>([]); // 主管用的班級列表
    const [selectedClassId, setSelectedClassId] = useState<string>(''); // 主管選中的班級

    const [myStudents, setMyStudents] = useState<any[]>([]);
    const [selectedStudentId, setSelectedStudentId] = useState<string>('');
    const [todayLog, setTodayLog] = useState<any>(null);

    // Form 
    const [formData, setFormData] = useState({
        mood: 3,
        focus: 3,
        appetite: 3,
        homework: '',
        message: '',
        photo_url: ''
    });

    useEffect(() => {
        initPage();
    }, []);

    // 當主管切換班級時，重抓該班學生
    useEffect(() => {
        if (role === 'director' && selectedClassId) {
            fetchStudentsForDirector(selectedClassId);
        }
    }, [selectedClassId]);

    // 當切換學生時，抓取今日紀錄
    useEffect(() => {
        if (selectedStudentId) {
            fetchTodayLog(selectedStudentId);
        }
    }, [selectedStudentId]);

    async function initPage() {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.push('/'); return; }

            // 1. 讀取用戶角色
            const { data: users } = await supabase
                .from('users')
                .select('role, email')
                .eq('id', session.user.id)
                .limit(1);

            const user = users && users.length > 0 ? users[0] : null;
            const currentRole = user?.role || 'parent';

            setRole(currentRole);
            setUserEmail(user?.email || '');

            // 2. 根據身份決定介面流程
            if (currentRole === 'director') {
                // 👑 主管模式：先抓「班級列表」，不要直接抓學生
                const { data: cls } = await supabase.from('classes').select('*').order('name');
                setClasses(cls || []);
                // 如果有班級，預設選第一個
                if (cls && cls.length > 0) {
                    setSelectedClassId(cls[0].id); // 這會觸發 useEffect 去抓學生
                }

            } else if (currentRole === 'teacher') {
                // 👨‍🏫 老師模式：直接抓自己班的學生
                const { data: students } = await supabase
                    .from('students')
                    .select('id, chinese_name, grade')
                    .order('grade')
                    .order('chinese_name');

                const list = students || [];
                setMyStudents(list);
                if (list.length > 0) setSelectedStudentId(list[0].id);

            } else {
                // 🏠 家長模式：抓自己的小孩
                const { data: children } = await supabase
                    .from('students')
                    .select('id, chinese_name')
                    .or(`parent_id.eq.${session.user.id},parent_id_2.eq.${session.user.id}`);

                const list = children || [];
                setMyStudents(list);
                if (list.length > 0) setSelectedStudentId(list[0].id);
            }

        } catch (e: any) {
            console.error("Error:", e);
        } finally {
            setLoading(false);
        }
    }

    // 主管專用：根據班級 ID 抓學生
    async function fetchStudentsForDirector(classId: string) {
        // 先找出班級名稱 (因為 students 表是用 grade 存班級名，或者 class_id)
        // 假設 students 表有 class_id 欄位最好，如果沒有，我們這裡用 class_id 篩選
        const { data: students } = await supabase
            .from('students')
            .select('id, chinese_name, grade')
            .eq('class_id', classId) // 確保學生表有 class_id
            .order('chinese_name');

        const list = students || [];
        setMyStudents(list);
        if (list.length > 0) {
            setSelectedStudentId(list[0].id);
        } else {
            setSelectedStudentId('');
            setTodayLog(null);
        }
    }

    async function fetchTodayLog(studentId: string) {
        const today = new Date().toISOString().split('T')[0];
        const { data: logs } = await supabase
            .from('contact_books')
            .select('*')
            .eq('student_id', studentId)
            .eq('date', today)
            .limit(1);

        const data = logs && logs.length > 0 ? logs[0] : null;
        setTodayLog(data);

        if (data) {
            setFormData({
                mood: data.mood,
                focus: data.focus,
                appetite: data.appetite,
                homework: data.homework || '',
                message: data.message || '',
                photo_url: data.photo_url || ''
            });
        } else {
            setFormData({ mood: 3, focus: 3, appetite: 3, homework: '', message: '', photo_url: '' });
        }
    }

    async function handleSubmit() {
        if (!selectedStudentId) return;
        try {
            const today = new Date().toISOString().split('T')[0];
            const payload = {
                student_id: selectedStudentId,
                date: today,
                ...formData
            };

            const { data: existingLogs } = await supabase
                .from('contact_books')
                .select('id')
                .eq('student_id', selectedStudentId)
                .eq('date', today)
                .limit(1);

            const existing = existingLogs && existingLogs.length > 0 ? existingLogs[0] : null;

            if (existing) {
                await supabase.from('contact_books').update(payload).eq('id', existing.id);
                alert('已更新今日紀錄！');
            } else {
                await supabase.from('contact_books').insert(payload);
                alert('發布成功！');
            }
            fetchTodayLog(selectedStudentId);

        } catch (e: any) {
            alert('發布失敗: ' + e.message);
        }
    }

    if (loading) return <div className="p-10 text-center">載入中...</div>;

    return (
        <div className="min-h-screen bg-indigo-50 p-4 md:p-6">
            <div className="max-w-3xl mx-auto">
                {/* 頂部標題區 */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-black text-gray-800 tracking-tight">📖 寶寶聯絡簿</h1>
                        <div className="flex items-center gap-2 mt-1">
                            {role === 'director' && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">👑 主管模式</span>}
                            {role === 'teacher' && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">👨‍🏫 老師模式</span>}
                            {role === 'parent' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">🏠 家長模式</span>}
                        </div>
                    </div>
                    <button onClick={() => router.push('/')} className="bg-white px-4 py-2 rounded-xl text-gray-500 font-bold shadow-sm hover:bg-gray-100 text-sm transition">⬅️ 回首頁</button>
                </div>

                {/* 👑 主管專屬：班級選擇器 (這就是解決畫面混亂的關鍵) */}
                {role === 'director' && (
                    <div className="mb-6 bg-white p-4 rounded-2xl shadow-sm border border-purple-100">
                        <label className="text-xs font-bold text-gray-400 block mb-2">請選擇要查看的班級：</label>
                        <select
                            value={selectedClassId}
                            onChange={e => setSelectedClassId(e.target.value)}
                            className="w-full p-2 border rounded-lg font-bold text-gray-700 outline-none focus:ring-2 focus:ring-purple-200"
                        >
                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                )}

                {/* 學生切換器 (適用於所有人) */}
                {myStudents.length > 0 ? (
                    <div className="mb-8">
                        {/* 這裡移除了不相容的 CSS，改用 Tailwind 原生 class */}
                        <div className="flex flex-nowrap md:flex-wrap gap-2 overflow-x-auto pb-2">
                            {myStudents.map(student => (
                                <button
                                    key={student.id}
                                    onClick={() => setSelectedStudentId(student.id)}
                                    className={`px-4 py-2 rounded-full whitespace-nowrap font-bold transition shadow-sm border text-sm flex-shrink-0
                                        ${selectedStudentId === student.id
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-200 transform scale-105'
                                            : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}
                                    `}
                                >
                                    {/* 只有在老師模式下才需要顯示班級名，主管模式已經選班級了所以不用 */}
                                    {role === 'teacher' && student.grade ? <span className="opacity-70 mr-1 text-xs">{student.grade}</span> : ''}
                                    {student.chinese_name}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="bg-white p-8 rounded-2xl shadow-sm text-center mb-6 border border-dashed border-gray-200">
                        <p className="text-gray-400 font-bold">
                            {role === 'director' ? '此班級尚無學生資料' : (role === 'teacher' ? '⚠️ 您目前沒有負責的班級' : '尚未連結學生資料')}
                        </p>
                    </div>
                )}

                {/* 輸入區 (主管 & 老師 可見) */}
                {(role === 'teacher' || role === 'director') && selectedStudentId && (
                    <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xl shadow-indigo-100 border border-white mb-8 animate-fade-in-up">
                        <div className="flex items-center gap-2 mb-6 border-b pb-4">
                            <span className="bg-indigo-100 p-2 rounded-lg text-xl">✏️</span>
                            <h2 className="text-lg font-black text-gray-800">撰寫今日紀錄</h2>
                        </div>

                        <div className="space-y-6">
                            {/* 星星 Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-center hover:border-indigo-200 transition">
                                    <label className="text-xs font-bold text-gray-400 block mb-2">心情 Mood</label>
                                    <select value={formData.mood} onChange={e => setFormData({ ...formData, mood: Number(e.target.value) })} className="w-full text-center bg-white border-none shadow-sm rounded-xl py-2 font-bold text-indigo-600 text-lg cursor-pointer focus:ring-2 focus:ring-indigo-200 outline-none">{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} ⭐</option>)}</select>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-center hover:border-indigo-200 transition">
                                    <label className="text-xs font-bold text-gray-400 block mb-2">專注 Focus</label>
                                    <select value={formData.focus} onChange={e => setFormData({ ...formData, focus: Number(e.target.value) })} className="w-full text-center bg-white border-none shadow-sm rounded-xl py-2 font-bold text-indigo-600 text-lg cursor-pointer focus:ring-2 focus:ring-indigo-200 outline-none">{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} ⭐</option>)}</select>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-center hover:border-indigo-200 transition">
                                    <label className="text-xs font-bold text-gray-400 block mb-2">食慾 Appetite</label>
                                    <select value={formData.appetite} onChange={e => setFormData({ ...formData, appetite: Number(e.target.value) })} className="w-full text-center bg-white border-none shadow-sm rounded-xl py-2 font-bold text-indigo-600 text-lg cursor-pointer focus:ring-2 focus:ring-indigo-200 outline-none">{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} ⭐</option>)}</select>
                                </div>
                            </div>

                            {/* 文字輸入 */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 ml-1 mb-1 block">今日作業 Homework</label>
                                <input type="text" value={formData.homework} onChange={e => setFormData({ ...formData, homework: e.target.value })} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-gray-700 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none transition" placeholder="例如：完成第 5 頁..." />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 ml-1 mb-1 block">老師的話 Teacher's Note</label>
                                <textarea value={formData.message} onChange={e => setFormData({ ...formData, message: e.target.value })} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-700 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none transition h-32 resize-none" placeholder="分享孩子今天的表現..." />
                            </div>

                            <button onClick={handleSubmit} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:shadow-xl hover:-translate-y-1 transition-all active:scale-95 flex justify-center items-center gap-2">
                                {todayLog ? '🔄 更新今日紀錄' : '🚀 發布今日聯絡簿'}
                            </button>
                        </div>
                    </div>
                )}

                {/* 結果顯示區 */}
                {todayLog ? (
                    <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 relative overflow-hidden animate-fade-in">
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-400 to-purple-400"></div>
                        <div className="flex justify-between items-start mb-8">
                            <div><h2 className="text-2xl font-black text-gray-800">今日紀錄</h2><p className="text-sm text-gray-400 font-bold mt-1">{todayLog.date}</p></div>
                            <div className="bg-green-50 text-green-700 px-4 py-1.5 rounded-full text-xs font-bold border border-green-100">✅ 已發布</div>
                        </div>
                        <div className="flex justify-around mb-8 bg-gray-50 p-6 rounded-3xl border border-gray-50">
                            <div className="text-center"><div className="text-3xl mb-2">🥰</div><div className="text-xs text-gray-400 font-bold uppercase">Mood</div><div className="font-black text-indigo-600 text-xl mt-1">{todayLog.mood}</div></div>
                            <div className="text-center"><div className="text-3xl mb-2">🧐</div><div className="text-xs text-gray-400 font-bold uppercase">Focus</div><div className="font-black text-indigo-600 text-xl mt-1">{todayLog.focus}</div></div>
                            <div className="text-center"><div className="text-3xl mb-2">🍱</div><div className="text-xs text-gray-400 font-bold uppercase">Appetite</div><div className="font-black text-indigo-600 text-xl mt-1">{todayLog.appetite}</div></div>
                        </div>
                        <div className="space-y-4">
                            <div className="p-5 bg-orange-50 rounded-2xl border border-orange-100"><h3 className="text-xs font-black text-orange-400 uppercase mb-2">Homework</h3><p className="text-gray-800 font-bold text-lg">{todayLog.homework || '今日無作業'}</p></div>
                            <div className="p-5 bg-blue-50 rounded-2xl border border-blue-100"><h3 className="text-xs font-black text-blue-400 uppercase mb-2">Note</h3><p className="text-gray-700 leading-relaxed">{todayLog.message || '無特殊備註'}</p></div>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white rounded-3xl p-12 shadow-sm border border-dashed border-gray-200 text-center">
                        <div className="text-6xl mb-4 animate-bounce-slow grayscale opacity-50">😴</div>
                        <h3 className="text-lg font-black text-gray-400">今日尚未發布聯絡簿</h3>
                        {(role === 'teacher' || role === 'director') && <p className="text-xs text-indigo-400 mt-2 font-bold animate-pulse">👆 請在上方的輸入框填寫並發布</p>}
                    </div>
                )}
            </div>
        </div>
    );
}