'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function ContactBookPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [role, setRole] = useState<string>('parent'); // 預設身份
    const [userEmail, setUserEmail] = useState('');

    // Data
    const [myStudents, setMyStudents] = useState<any[]>([]); // 學生列表
    const [selectedStudentId, setSelectedStudentId] = useState<string>('');
    const [todayLog, setTodayLog] = useState<any>(null); // 今日紀錄

    // Form (老師填寫用)
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

    // 當選擇不同學生時，重新抓取該學生的今日紀錄
    useEffect(() => {
        if (selectedStudentId) {
            fetchTodayLog(selectedStudentId);
        }
    }, [selectedStudentId]);

    async function initPage() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        // 1. 先確認「我是誰？」(讀取 users 表的 role)
        const { data: user } = await supabase.from('users').select('role, email').eq('id', session.user.id).single();
        const currentRole = user?.role || 'parent';
        setRole(currentRole);
        setUserEmail(user?.email || '');

        // 2. 根據身份，決定要抓哪些學生
        if (currentRole === 'teacher' || currentRole === 'director') {
            // 🅰️ 老師模式：
            // 這裡會自動觸發 RLS 規則：
            // - 如果是老師，資料庫只會回傳「被指派班級」的學生
            // - 如果是園長，資料庫會回傳「全校」學生
            const { data: students } = await supabase
                .from('students')
                .select('id, chinese_name, grade')
                .order('grade')
                .order('chinese_name');

            if (students && students.length > 0) {
                setMyStudents(students);
                setSelectedStudentId(students[0].id); // 預設選第一位
            }
        } else {
            // 🅱️ 家長模式：
            // 抓取 parent_id 或 parent_id_2 是自己的學生 (雙家長支援)
            const { data: children } = await supabase
                .from('students')
                .select('id, chinese_name')
                .or(`parent_id.eq.${session.user.id},parent_id_2.eq.${session.user.id}`);

            if (children && children.length > 0) {
                setMyStudents(children);
                setSelectedStudentId(children[0].id);
            }
        }
        setLoading(false);
    }

    async function fetchTodayLog(studentId: string) {
        // 抓今天的紀錄
        const today = new Date().toISOString().split('T')[0];
        const { data } = await supabase
            .from('contact_books')
            .select('*')
            .eq('student_id', studentId)
            .eq('date', today)
            .single();

        setTodayLog(data); // 有資料就顯示，沒資料就是 null

        // 如果是老師，把資料填回表單，方便修改
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
            // 如果今天還沒寫，重置表單
            setFormData({ mood: 3, focus: 3, appetite: 3, homework: '', message: '', photo_url: '' });
        }
    }

    // 🚀 發布功能 (只有老師能按)
    async function handleSubmit() {
        if (!selectedStudentId) return;
        try {
            const today = new Date().toISOString().split('T')[0];
            const payload = {
                student_id: selectedStudentId,
                date: today,
                ...formData
            };

            // 檢查今天是否已經寫過？(決定是用 insert 還是 update)
            const { data: existing } = await supabase
                .from('contact_books')
                .select('id')
                .eq('student_id', selectedStudentId)
                .eq('date', today)
                .single();

            if (existing) {
                // 如果寫過，就更新 (Update)
                await supabase.from('contact_books').update(payload).eq('id', existing.id);
                alert('今日紀錄已更新！');
            } else {
                // 如果沒寫過，就新增 (Insert)
                await supabase.from('contact_books').insert(payload);
                alert('聯絡簿發布成功！🚀');
            }

            fetchTodayLog(selectedStudentId); // 重新抓取資料顯示

        } catch (e: any) {
            alert('發布失敗: ' + e.message);
        }
    }

    if (loading) return <div className="p-10 text-center">載入中...</div>;

    // ==========================================
    // 🎨 畫面渲染區
    // ==========================================

    return (
        <div className="min-h-screen bg-indigo-50 p-4 md:p-6">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-black text-gray-800">📖 寶寶聯絡簿</h1>
                        <p className="text-xs text-gray-500 font-bold mt-1">
                            {role === 'teacher' || role === 'director' ? `👨‍🏫 老師模式 (${userEmail})` : '🏠 家長模式'}
                        </p>
                    </div>
                    <button onClick={() => router.push('/')} className="bg-white px-4 py-2 rounded-xl text-gray-500 font-bold shadow-sm hover:bg-gray-100 text-sm">⬅️ 回首頁</button>
                </div>

                {/* 學生切換器 (老師切換學生 / 家長切換小孩) */}
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
                                {/* 如果是老師，前面顯示班級名稱 */}
                                {(role === 'teacher' || role === 'director') && student.grade ? `${student.grade} - ` : ''}
                                {student.chinese_name}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="bg-white p-6 rounded-2xl shadow-sm text-center mb-6">
                        <p className="text-gray-400 font-bold">
                            {role === 'teacher' ? '目前沒有學生資料 (請確認是否已指派班級)' : '尚未連結學生資料'}
                        </p>
                    </div>
                )}

                {/* ==================== 老師輸入區 (只有老師/園長看得到) ==================== */}
                {(role === 'teacher' || role === 'director') && selectedStudentId && (
                    <div className="bg-white rounded-3xl p-6 shadow-lg border border-indigo-100 mb-8 animate-fade-in-up">
                        <h2 className="text-lg font-black text-indigo-900 mb-4 flex items-center gap-2">
                            ✏️ 撰寫今日紀錄 <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-1 rounded-full">{new Date().toLocaleDateString()}</span>
                        </h2>

                        <div className="space-y-4">
                            {/* 星星評分 */}
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
                                <input
                                    type="text"
                                    value={formData.homework}
                                    onChange={e => setFormData({ ...formData, homework: e.target.value })}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-700 focus:bg-white focus:border-indigo-500 outline-none transition"
                                    placeholder="例如：完成第 5 頁..."
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-500 ml-1">老師的話</label>
                                <textarea
                                    value={formData.message}
                                    onChange={e => setFormData({ ...formData, message: e.target.value })}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 focus:bg-white focus:border-indigo-500 outline-none transition h-24 resize-none"
                                    placeholder="分享孩子今天的表現..."
                                />
                            </div>

                            <button
                                onClick={handleSubmit}
                                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition transform active:scale-95"
                            >
                                {todayLog ? '🔄 更新今日聯絡簿' : '🚀 發布今日聯絡簿'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ==================== 顯示區 (家長看結果 / 老師看預覽) ==================== */}
                {todayLog ? (
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 relative overflow-hidden animate-fade-in">
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-400 to-purple-400"></div>

                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h2 className="text-xl font-black text-gray-800">今日紀錄</h2>
                                <p className="text-sm text-gray-400 font-bold">{todayLog.date}</p>
                            </div>
                            <div className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">已發布</div>
                        </div>

                        <div className="flex justify-around mb-8 bg-gray-50 p-4 rounded-2xl">
                            <div className="text-center"><div className="text-2xl mb-1">🥰</div><div className="text-xs text-gray-400 font-bold">心情</div><div className="font-black text-indigo-600 text-lg">{todayLog.mood}</div></div>
                            <div className="text-center"><div className="text-2xl mb-1">🧐</div><div className="text-xs text-gray-400 font-bold">專注</div><div className="font-black text-indigo-600 text-lg">{todayLog.focus}</div></div>
                            <div className="text-center"><div className="text-2xl mb-1">🍱</div><div className="text-xs text-gray-400 font-bold">食慾</div><div className="font-black text-indigo-600 text-lg">{todayLog.appetite}</div></div>
                        </div>

                        <div className="space-y-4">
                            <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100">
                                <h3 className="text-xs font-black text-orange-400 uppercase tracking-wider mb-2">Homework</h3>
                                <p className="text-gray-800 font-bold">{todayLog.homework || '今日無作業'}</p>
                            </div>
                            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                                <h3 className="text-xs font-black text-blue-400 uppercase tracking-wider mb-2">Teacher's Note</h3>
                                <p className="text-gray-700 leading-relaxed">{todayLog.message || '無特殊備註'}</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    // 沒資料時顯示睡覺圖
                    <div className="bg-white rounded-3xl p-10 shadow-sm border border-dashed border-gray-200 text-center">
                        <div className="text-6xl mb-4 animate-bounce-slow">😴</div>
                        <h3 className="text-lg font-black text-gray-400">今日尚未發布聯絡簿</h3>
                        {/* 只有老師看得到這行提示 */}
                        {(role === 'teacher' || role === 'director') && (
                            <p className="text-xs text-indigo-500 mt-2 font-bold animate-pulse">👆 老師請在上方的輸入框填寫並發布</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}