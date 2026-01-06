'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function GradesPage() {
    const [role, setRole] = useState<string | null>(null);

    // 資料庫資料
    const [allStudents, setAllStudents] = useState<any[]>([]); // 所有學生
    const [gradesList, setGradesList] = useState<any[]>([]);   // 成績列表

    // 篩選用狀態
    const [classes, setClasses] = useState<string[]>([]);      // 班級清單
    const [selectedClass, setSelectedClass] = useState<string>(''); // 目前選擇的班級
    const [filteredStudents, setFilteredStudents] = useState<any[]>([]); // 該班級的學生

    // 表單資料
    const [selectedStudent, setSelectedStudent] = useState<string>('');
    const [form, setForm] = useState({
        exam_name: '',
        subject: '',       // 新增科目
        score: '',
        full_score: '100',
        exam_date: new Date().toISOString().split('T')[0]
    });

    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        init();
    }, []);

    // 當「班級」改變時，自動更新「學生選單」
    useEffect(() => {
        if (selectedClass) {
            const studentsInClass = allStudents.filter(s => s.grade === selectedClass);
            setFilteredStudents(studentsInClass);
            // 預設選取該班第一位學生
            if (studentsInClass.length > 0) {
                setSelectedStudent(studentsInClass[0].id);
            } else {
                setSelectedStudent('');
            }
        }
    }, [selectedClass, allStudents]);

    // 當「學生」改變時，自動抓取該學生的歷史成績
    useEffect(() => {
        if (role !== 'parent' && selectedStudent) {
            fetchGrades(selectedStudent);
        }
    }, [selectedStudent, role]);

    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        const userRole = profile?.role || 'pending';
        setRole(userRole);

        if (userRole === 'parent') {
            fetchMyGrades();
        } else {
            // 老師：先抓所有學生，再整理出班級清單
            const { data } = await supabase.from('students').select('*').order('grade');
            if (data) {
                setAllStudents(data);
                // 抓出所有不重複的班級
                const uniqueClasses = Array.from(new Set(data.map((s: any) => s.grade || '未分類')));
                setClasses(uniqueClasses as string[]);

                // 預設選第一個班級
                if (uniqueClasses.length > 0) {
                    setSelectedClass(uniqueClasses[0] as string);
                }
            }
        }
        setLoading(false);
    }

    async function fetchMyGrades() {
        const { data } = await supabase.from('exam_results_view').select('*');
        setGradesList(data || []);
    }

    async function fetchGrades(studentId: string) {
        const { data } = await supabase
            .from('exam_results_view')
            .select('*')
            .eq('student_id', studentId)
            .order('exam_date', { ascending: false });
        setGradesList(data || []);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!selectedStudent) return;

        const { error } = await supabase.from('exam_results').insert({
            student_id: selectedStudent,
            exam_name: form.exam_name,
            subject: form.subject, // 寫入科目
            score: parseInt(form.score),
            full_score: parseInt(form.full_score),
            exam_date: form.exam_date
        });

        if (error) {
            alert('儲存失敗: ' + error.message);
        } else {
            setForm({ ...form, score: '' }); // 只清空分數，方便連續輸入同科目
            fetchGrades(selectedStudent);    // 刷新下方列表
        }
    }

    if (loading) return <div className="p-8 text-center">載入中...</div>;

    return (
        <div className="min-h-screen bg-purple-50 p-4">
            <div className="max-w-3xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-purple-900">📊 成績管理系統</h1>
                    <button onClick={() => router.push('/')} className="px-3 py-1 bg-gray-400 text-white rounded text-sm">回首頁</button>
                </div>

                {/* ============ 老師介面 ============ */}
                {role !== 'parent' && (
                    <>
                        <div className="bg-white p-6 rounded-xl shadow-lg border-t-4 border-purple-500 mb-8">
                            <h2 className="text-lg font-bold mb-4">✍️ 登記成績</h2>
                            <form onSubmit={handleSubmit} className="space-y-4">

                                {/* 第一排：班級 + 學生 (連動選單) */}
                                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Step 1. 選擇班級</label>
                                        <select
                                            className="w-full p-2 border rounded bg-white text-purple-900 font-bold"
                                            value={selectedClass}
                                            onChange={e => setSelectedClass(e.target.value)}
                                        >
                                            {classes.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Step 2. 選擇學生</label>
                                        <select
                                            className="w-full p-2 border rounded bg-white text-purple-900 font-bold"
                                            value={selectedStudent}
                                            onChange={e => setSelectedStudent(e.target.value)}
                                        >
                                            {filteredStudents.map(s => (
                                                <option key={s.id} value={s.id}>{s.chinese_name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* 第二排：考試資訊 */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">考試名稱</label>
                                        <input type="text" placeholder="例如: 期中考" className="w-full p-2 border rounded" required
                                            value={form.exam_name} onChange={e => setForm({ ...form, exam_name: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">科目</label>
                                        <input type="text" placeholder="例如: 英文 / 數學" className="w-full p-2 border rounded" required
                                            value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
                                    </div>
                                </div>

                                {/* 第三排：分數 */}
                                <div className="grid grid-cols-3 gap-4 items-end">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">考試日期</label>
                                        <input type="date" className="w-full p-2 border rounded" required
                                            value={form.exam_date} onChange={e => setForm({ ...form, exam_date: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">滿分</label>
                                        <input type="number" className="w-full p-2 border rounded" required
                                            value={form.full_score} onChange={e => setForm({ ...form, full_score: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-purple-700 mb-1">得分</label>
                                        <input type="number" placeholder="分數" className="w-full p-2 border-2 border-purple-500 rounded text-xl font-bold text-center" required
                                            value={form.score} onChange={e => setForm({ ...form, score: e.target.value })} />
                                    </div>
                                </div>

                                <button type="submit" className="w-full bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 transition shadow-md">
                                    新增成績 ➕
                                </button>
                            </form>
                        </div>

                        {/* 歷史成績標題 */}
                        <div className="flex items-center gap-2 mb-4 pl-2 border-l-4 border-purple-400">
                            <h3 className="text-xl font-bold text-gray-800">
                                📉 {filteredStudents.find(s => s.id === selectedStudent)?.chinese_name} 的成績紀錄
                            </h3>
                            <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                {selectedClass}
                            </span>
                        </div>
                    </>
                )}

                {/* ============ 共用列表：顯示成績單 ============ */}
                <div className="space-y-3">
                    {gradesList.length === 0 ? (
                        <div className="text-center py-10 text-gray-400 bg-white rounded-xl border border-dashed border-gray-300">
                            尚無成績紀錄
                        </div>
                    ) : (
                        gradesList.map(g => (
                            <div key={g.id} className="bg-white p-5 rounded-xl shadow-sm flex justify-between items-center hover:shadow-md transition border-l-4 border-purple-200">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                                            {g.subject || '綜合'}
                                        </span>
                                        <span className="text-xs text-gray-400">{g.exam_date}</span>
                                    </div>
                                    <h3 className="font-bold text-lg text-gray-800">{g.exam_name}</h3>
                                    {role === 'parent' && <div className="text-xs text-gray-500 mt-1">學生: {g.student_name}</div>}
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <div className={`text-3xl font-bold ${g.score >= 60 ? 'text-green-600' : 'text-red-500'}`}>
                                            {g.score}
                                        </div>
                                        <div className="text-xs text-gray-400">/ {g.full_score}</div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

            </div>
        </div>
    );
}