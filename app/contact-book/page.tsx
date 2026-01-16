'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

// 預設評分項目
const DEFAULT_FORM = {
    mood: 3,
    focus: 3,
    appetite: 3,
    homework: '',
    note: ''
};

export default function ContactBookPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [students, setStudents] = useState<any[]>([]);

    // UI 狀態
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]); // 預設今天
    const [selectedClass, setSelectedClass] = useState<string>(''); // 目前選中的班級
    const [uniqueClasses, setUniqueClasses] = useState<string[]>([]); // 該老師所有的班級列表

    // 編輯狀態 (用 Map 來存每個學生的表單資料，key 是 student_id)
    // 這樣可以實現「同時編輯多人」
    const [forms, setForms] = useState<Record<string, typeof DEFAULT_FORM>>({});

    // 1. 初始化：抓取老師負責的學生
    const fetchData = useCallback(async () => {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        // 判斷身份
        const { data: userRole } = await supabase.from('users').select('role').eq('id', session.user.id).single();

        let query = supabase.from('students').select('*').order('grade').order('chinese_name');

        // 如果是家長，只抓自己的小孩 (這裡保留邏輯以免家長登入壞掉)
        if (userRole?.role === 'parent') {
            query = query.or(`parent_id.eq.${session.user.id},parent_id_2.eq.${session.user.id}`);
        }
        // 如果是老師/主任，抓全部 (或未來可擴充為只抓負責班級)
        // 目前邏輯：老師可以看到全校，但透過 UI 篩選班級

        const { data, error } = await query;
        if (error) console.error(error);

        const studentList = data || [];
        setStudents(studentList);

        // 2. 提取出所有不重複的班級 (用於頂部 Tabs)
        const classes = Array.from(new Set(studentList.map(s => s.grade || '未分類')));
        setUniqueClasses(classes);

        // 預設選取第一個班級
        if (classes.length > 0 && !selectedClass) {
            setSelectedClass(classes[0]);
        }

        setLoading(false);
    }, [router, selectedClass]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // 切換班級時的處理
    const filteredStudents = students.filter(s => (s.grade || '未分類') === selectedClass);

    // 處理表單變更 (只更新特定學生的資料)
    const handleFormChange = (studentId: string, field: string, value: any) => {
        setForms(prev => ({
            ...prev,
            [studentId]: {
                ...(prev[studentId] || DEFAULT_FORM), // 如果還沒動過，就用預設值
                [field]: value
            }
        }));
    };

    // 儲存單一學生的紀錄
    const handleSave = async (student: any) => {
        const formData = forms[student.id] || DEFAULT_FORM;

        // 簡單驗證
        if (!formData.homework && !formData.note) {
            if (!confirm(`確定要儲存 ${student.chinese_name} 的空白紀錄嗎？`)) return;
        }

        try {
            // 寫入資料庫
            const { error } = await supabase.from('contact_books').insert({
                student_id: student.id,
                date: selectedDate,
                mood: formData.mood,
                focus: formData.focus,
                appetite: formData.appetite,
                homework: formData.homework,
                teacher_note: formData.note,
                // created_by: 這裡可以自動抓，或後端處理
            });

            if (error) throw error;

            alert(`✅ ${student.chinese_name} 的聯絡簿已發送！`);

            // 清空該學生的表單 (或是保留讓老師知道已存？這裡選擇清空並標示)
            // 實務上建議保留畫面但變灰，這裡先簡單重置
            // setForms(prev => { ... }); 

        } catch (e: any) {
            alert('❌ 儲存失敗: ' + e.message);
        }
    };

    // 星星元件 (提取出來重用)
    const StarRating = ({ value, onChange, label }: { value: number, onChange: (v: number) => void, label: string }) => (
        <div className="flex flex-col items-center gap-1">
            <span className="text-xs font-bold text-gray-400">{label}</span>
            <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        onClick={() => onChange(star)}
                        className={`text-xl transition hover:scale-110 ${star <= value ? 'text-yellow-400' : 'text-gray-200'}`}
                    >
                        ★
                    </button>
                ))}
            </div>
        </div>
    );

    if (loading) return <div className="p-10 text-center font-bold text-gray-400">正在準備教室...</div>;

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* 1. 頂部控制列 (Sticky) */}
            <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm px-4 py-3">
                <div className="max-w-4xl mx-auto flex justify-between items-center mb-3">
                    <h1 className="text-xl font-black text-gray-800 flex items-center gap-2">
                        📖 寶寶聯絡簿
                    </h1>
                    <div className="flex gap-2">
                        {/* 日期選擇器 */}
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="bg-gray-100 border-0 rounded-lg px-3 py-2 font-bold text-gray-600 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                        <button onClick={() => router.push('/')} className="bg-gray-100 px-3 py-2 rounded-lg font-bold text-sm text-gray-500">
                            回首頁
                        </button>
                    </div>
                </div>

                {/* 班級選擇 Tabs (可橫向捲動) */}
                <div className="max-w-4xl mx-auto flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    {uniqueClasses.map(cls => (
                        <button
                            key={cls}
                            onClick={() => setSelectedClass(cls)}
                            className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition border ${selectedClass === cls
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md transform scale-105'
                                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                                }`}
                        >
                            {cls}
                        </button>
                    ))}
                    {uniqueClasses.length === 0 && <span className="text-sm text-gray-400">目前無班級資料</span>}
                </div>
            </div>

            {/* 2. 學生卡片列表區 */}
            <div className="max-w-4xl mx-auto p-4 space-y-6">

                {filteredStudents.length === 0 ? (
                    <div className="text-center py-20 text-gray-400">
                        <p className="text-6xl mb-4">😴</p>
                        <p className="font-bold">這個班級目前沒有學生喔</p>
                    </div>
                ) : (
                    filteredStudents.map(student => {
                        // 取得該學生目前的編輯狀態 (若無則使用預設)
                        const form = forms[student.id] || DEFAULT_FORM;

                        return (
                            <div key={student.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition hover:shadow-md">
                                {/* 卡片頭部：學生資訊 */}
                                <div className="bg-indigo-50/50 px-4 py-3 flex justify-between items-center border-b border-indigo-50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-indigo-200 flex items-center justify-center text-indigo-700 font-black text-lg">
                                            {student.chinese_name.charAt(0)}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-800 text-lg">{student.chinese_name}</h3>
                                            <p className="text-xs text-gray-400 font-bold">{student.grade}</p>
                                        </div>
                                    </div>
                                    {/* 這裡可以放一個「查看歷史紀錄」的按鈕 */}
                                </div>

                                {/* 卡片內容：編輯表單 */}
                                <div className="p-5">
                                    {/* 星星評分區 (Grid 排版) */}
                                    <div className="grid grid-cols-3 gap-4 mb-6 bg-gray-50 p-4 rounded-xl">
                                        <StarRating
                                            label="心情 Mood"
                                            value={form.mood}
                                            onChange={(v) => handleFormChange(student.id, 'mood', v)}
                                        />
                                        <StarRating
                                            label="專注 Focus"
                                            value={form.focus}
                                            onChange={(v) => handleFormChange(student.id, 'focus', v)}
                                        />
                                        <StarRating
                                            label="食慾 Appetite"
                                            value={form.appetite}
                                            onChange={(v) => handleFormChange(student.id, 'appetite', v)}
                                        />
                                    </div>

                                    {/* 文字輸入區 */}
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 ml-1">今日作業 Homework</label>
                                            <input
                                                type="text"
                                                placeholder="例如：完成第 5 頁..."
                                                value={form.homework}
                                                onChange={(e) => handleFormChange(student.id, 'homework', e.target.value)}
                                                className="w-full p-3 bg-gray-50 border-0 rounded-xl font-bold text-gray-700 placeholder-gray-300 focus:ring-2 focus:ring-indigo-100 outline-none transition"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 ml-1">老師的話 Teacher's Note</label>
                                            <textarea
                                                placeholder="分享孩子今天的表現..."
                                                rows={2}
                                                value={form.note}
                                                onChange={(e) => handleFormChange(student.id, 'note', e.target.value)}
                                                className="w-full p-3 bg-gray-50 border-0 rounded-xl font-bold text-gray-700 placeholder-gray-300 focus:ring-2 focus:ring-indigo-100 outline-none transition resize-none"
                                            />
                                        </div>
                                    </div>

                                    {/* 底部按鈕 */}
                                    <div className="mt-6 flex justify-end">
                                        <button
                                            onClick={() => handleSave(student)}
                                            className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition flex items-center gap-2"
                                        >
                                            <span>📤 發送紀錄</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}