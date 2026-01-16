'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function ContactBookPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [role, setRole] = useState<string>('parent');
    const [userEmail, setUserEmail] = useState('');
    const [debugInfo, setDebugInfo] = useState('');

    // Data
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

    useEffect(() => {
        if (selectedStudentId) {
            fetchTodayLog(selectedStudentId);
        }
    }, [selectedStudentId]);

    async function initPage() {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.push('/'); return; }

            // 🔥 關鍵修正：使用 limit(1) 取代 single()，防止因為重複帳號而報錯
            const { data: users, error } = await supabase
                .from('users')
                .select('role, email')
                .eq('id', session.user.id)
                .limit(1); // 強制只抓一筆，不管資料庫有幾筆重複的

            if (error) {
                console.error("抓取使用者錯誤:", error);
                setDebugInfo(`讀取 User 失敗: ${error.message}`);
                return;
            }

            // 確保有抓到資料
            const user = users && users.length > 0 ? users[0] : null;
            const currentRole = user?.role || 'parent';

            setRole(currentRole);
            setUserEmail(user?.email || '');
            setDebugInfo(`目前登入: ${user?.email || session.user.email} | 系統判定角色: ${currentRole}`);

            // 2. 根據身份抓學生
            let studentsData = [];

            if (currentRole === 'teacher' || currentRole === 'director') {
                const { data: students, error: studentError } = await supabase
                    .from('students')
                    .select('id, chinese_name, grade')
                    .order('grade')
                    .order('chinese_name');

                if (studentError) console.error("老師抓學生錯誤:", studentError);
                studentsData = students || [];
            } else {
                const { data: children } = await supabase
                    .from('students')
                    .select('id, chinese_name')
                    .or(`parent_id.eq.${session.user.id},parent_id_2.eq.${session.user.id}`);
                studentsData = children || [];
            }

            if (studentsData.length > 0) {
                setMyStudents(studentsData);
                setSelectedStudentId(studentsData[0].id);
            }
        } catch (e: any) {
            setDebugInfo("發生未預期錯誤: " + e.message);
        } finally {
            setLoading(false);
        }
    }

    async function fetchTodayLog(studentId: string) {
        const today = new Date().toISOString().split('T')[0];
        // 這裡也要防呆，如果有兩筆聯絡簿，只抓最新的
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
            <div className="max-w-2xl mx-auto">
                {/* 🔴 診斷訊息 (開發用) */}
                <div className="bg-black text-green-400 p-2 text-xs font-mono mb-4 rounded overflow-x-auto">
                    DEBUG: {debugInfo}
                </div>

                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-black text-gray-800">📖 寶寶聯絡簿</h1>
                        <p className="text-xs text-gray-500 font-bold mt-1">
                            {(role === 'teacher' || role === 'director') ? '👨‍🏫 老師模式' : '🏠 家長模式'}
                        </p>
                    </div>
                    <button onClick={() => router.push('/')} className="bg-white px-4 py-2 rounded-xl text-gray-500 font-bold shadow-sm hover:bg-gray-100 text-sm">⬅️ 回首頁</button>
                </div>

                {myStudents.length > 0 ? (
                    <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
                        {myStudents.map(student => (
                            <button
                                key={student.id}
                                onClick={() => setSelectedStudentId(student.id)}
                                className={`px-4 py-2 rounded-full whitespace-nowrap font-bold transition shadow-sm border
                                    ${selectedStudentId === student.id
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-200'
                                        : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}
                                `}
                            >
                                {(role === 'teacher' || role === 'director') && student.grade ? `${student.grade} - ` : ''}
                                {student.chinese_name}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="bg-white p-6 rounded-2xl shadow-sm text-center mb-6">
                        <p className="text-gray-400 font-bold">
                            {(role === 'teacher' || role === 'director') ? '⚠️ 您目前沒有負責的班級 (請確認人事指派)' : '尚未連結學生資料'}
                        </p>
                    </div>
                )}

                {(role === 'teacher' || role === 'director') && selectedStudentId && (
                    <div className="bg-white rounded-3xl p-6 shadow-lg border border-indigo-100 mb-8 animate-fade-in-up">
                        <h2 className="text-lg font-black text-indigo-900 mb-4 flex items-center gap-2">
                            ✏️ 撰寫今日紀錄
                        </h2>
                        <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="text-center bg-gray-50 p-3 rounded-xl">
                                    <div className="text-xs text-gray-400 font-bold mb-2">心情</div>
                                    <select value={formData.mood} onChange={e => setFormData({ ...formData, mood: Number(e.target.value) })} className="w-full text-center bg-white border rounded-lg p-1">
                                        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} ⭐</option>)}
                                    </select>
                                </div>
                                <div className="text-center bg-gray-50 p-3 rounded-xl">
                                    <div className="text-xs text-gray-400 font-bold mb-2">專注</div>
                                    <select value={formData.focus} onChange={e => setFormData({ ...formData, focus: Number(e.target.value) })} className="w-full text-center bg-white border rounded-lg p-1">
                                        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} ⭐</option>)}
                                    </select>
                                </div>
                                <div className="text-center bg-gray-50 p-3 rounded-xl">
                                    <div className="text-xs text-gray-400 font-bold mb-2">食慾</div>
                                    <select value={formData.appetite} onChange={e => setFormData({ ...formData, appetite: Number(e.target.value) })} className="w-full text-center bg-white border rounded-lg p-1">
                                        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} ⭐</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 ml-1">今日作業</label>
                                <input type="text" value={formData.homework} onChange={e => setFormData({ ...formData, homework: e.target.value })} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-700" placeholder="作業..." />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 ml-1">老師的話</label>
                                <textarea value={formData.message} onChange={e => setFormData({ ...formData, message: e.target.value })} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 h-24 resize-none" placeholder="備註..." />
                            </div>
                            <button onClick={handleSubmit} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition">
                                {todayLog ? '🔄 更新紀錄' : '🚀 發布紀錄'}
                            </button>
                        </div>
                    </div>
                )}

                {todayLog ? (
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                        <h2 className="text-xl font-black text-gray-800 mb-4">今日紀錄 ({todayLog.date})</h2>
                        <div className="space-y-4">
                            <div className="p-4 bg-orange-50 rounded-2xl"><h3 className="text-xs font-bold text-orange-400">Homework</h3><p>{todayLog.homework}</p></div>
                            <div className="p-4 bg-blue-50 rounded-2xl"><h3 className="text-xs font-bold text-blue-400">Note</h3><p>{todayLog.message}</p></div>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white rounded-3xl p-10 shadow-sm border border-dashed border-gray-200 text-center">
                        <div className="text-6xl mb-4 animate-bounce">😴</div>
                        <h3 className="text-lg font-black text-gray-400">今日尚未發布聯絡簿</h3>
                    </div>
                )}
            </div>
        </div>
    );
}