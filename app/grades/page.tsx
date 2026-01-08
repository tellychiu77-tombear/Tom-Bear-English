'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

// 1. 定義英文班級 + 課輔班 (給老師篩選用)
const ENGLISH_CLASSES = Array.from({ length: 26 }, (_, i) => `CEI-${String.fromCharCode(65 + i)}`);
const ALL_CLASSES = ['課後輔導班', ...ENGLISH_CLASSES];

export default function GradesPage() {
    const [role, setRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState('');

    // 家長狀態
    const [myChildren, setMyChildren] = useState<any[]>([]);
    const [selectedChildId, setSelectedChildId] = useState<string>('');
    const [childGrades, setChildGrades] = useState<any[]>([]);

    // 老師狀態
    const [selectedClass, setSelectedClass] = useState('');
    const [classStudents, setClassStudents] = useState<any[]>([]);
    // 輸入表單狀態
    const [examName, setExamName] = useState('');
    const [examDate, setExamDate] = useState(new Date().toISOString().split('T')[0]);
    const [scores, setScores] = useState<Record<string, string>>({}); // 暫存分數 { studentId: "95" }

    const router = useRouter();

    useEffect(() => {
        init();
    }, []);

    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }
        setUserId(session.user.id);

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        const userRole = profile?.role || 'parent';
        setRole(userRole);

        if (userRole === 'parent') {
            fetchMyChildren(session.user.id);
        }
        setLoading(false);
    }

    // --- 家長功能：查看成績 ---

    async function fetchMyChildren(parentId: string) {
        const { data: kids } = await supabase.from('students').select('*').eq('parent_id', parentId);
        if (kids && kids.length > 0) {
            setMyChildren(kids);
            setSelectedChildId(kids[0].id); // 預設選第一個
            fetchGrades(kids[0].id);
        }
    }

    async function fetchGrades(studentId: string) {
        const { data } = await supabase
            .from('exam_results')
            .select('*')
            .eq('student_id', studentId)
            .order('exam_date', { ascending: true }); // 日期由舊到新，方便畫圖

        if (data) setChildGrades(data);
    }

    // 切換小孩時
    function handleChildChange(childId: string) {
        setSelectedChildId(childId);
        fetchGrades(childId);
    }

    // --- 老師功能：輸入成績 ---

    // 當老師選了班級，抓取該班學生
    useEffect(() => {
        if (role !== 'parent' && selectedClass) {
            fetchClassStudents();
        }
    }, [selectedClass]);

    async function fetchClassStudents() {
        // 模糊搜尋班級 (例如選 CEI-A，要抓出 grade 包含 "CEI-A" 的人)
        const { data } = await supabase
            .from('students')
            .select('*')
            .ilike('grade', `%${selectedClass}%`)
            .order('chinese_name');

        if (data) {
            setClassStudents(data);
            setScores({}); // 清空之前的分數輸入
        }
    }

    // 更新暫存分數
    function handleScoreChange(studentId: string, val: string) {
        setScores(prev => ({ ...prev, [studentId]: val }));
    }

    // 儲存全班成績
    async function saveAllGrades() {
        if (!examName) return alert('請輸入考試名稱');

        // 過濾出有填寫分數的學生
        const entries = Object.entries(scores).filter(([_, score]) => score.trim() !== '');
        if (entries.length === 0) return alert('請至少輸入一位學生的分數');

        if (!confirm(`確定要儲存 ${entries.length} 位學生的成績嗎？`)) return;

        const payload = entries.map(([studentId, score]) => ({
            student_id: studentId,
            exam_name: examName,
            exam_date: examDate,
            score: parseInt(score),
            full_score: 100
        }));

        const { error } = await supabase.from('exam_results').insert(payload);

        if (error) {
            alert('儲存失敗: ' + error.message);
        } else {
            alert('✅ 成績登錄成功！');
            // 清空表單
            setScores({});
            setExamName('');
        }
    }

    // --- 自製 SVG 折線圖元件 (無需套件) ---
    const LineChart = ({ data }: { data: any[] }) => {
        if (!data || data.length === 0) return <div className="h-40 flex items-center justify-center text-gray-300">尚無數據</div>;
        if (data.length === 1) return <div className="h-40 flex items-center justify-center text-gray-600 font-bold text-xl">{data[0].score} 分 <span className="text-xs font-normal ml-2">(僅一次考試)</span></div>;

        const height = 150;
        const width = 100; // percent
        const maxScore = 100;

        // 計算點的座標
        const points = data.map((d, index) => {
            const x = (index / (data.length - 1)) * 100; // X軸百分比
            const y = height - (d.score / maxScore) * height; // Y軸像素 (反轉，因為 SVG 0 在上面)
            return `${x},${y}`;
        }).join(' ');

        return (
            <div className="relative h-[200px] w-full mt-4">
                {/* SVG 畫布 */}
                <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
                    {/* 背景輔助線 (60分及格線) */}
                    <line x1="0" y1={height - (60 / 100) * height} x2="100" y2={height - (60 / 100) * height} stroke="#fee2e2" strokeWidth="0.5" strokeDasharray="2" />

                    {/* 折線 */}
                    <polyline fill="none" stroke="#3b82f6" strokeWidth="2" points={points} vectorEffect="non-scaling-stroke" />

                    {/* 資料點圓圈 */}
                    {data.map((d, index) => {
                        const x = (index / (data.length - 1)) * 100;
                        const y = height - (d.score / maxScore) * height;
                        return (
                            <g key={index}>
                                <circle cx={x} cy={y} r="3" fill="white" stroke="#3b82f6" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                                {/* 分數文字 */}
                                <text x={x} y={y - 8} textAnchor="middle" fontSize="8" fill="#1e3a8a" fontWeight="bold">{d.score}</text>
                                {/* 日期文字 (底部) */}
                                <text x={x} y={height + 15} textAnchor="middle" fontSize="6" fill="#9ca3af">{d.exam_date.slice(5)}</text>
                            </g>
                        );
                    })}
                </svg>
            </div>
        );
    };

    if (loading) return <div className="p-8 text-center">載入中...</div>;

    return (
        <div className="min-h-screen bg-purple-50 p-4">
            <div className="max-w-4xl mx-auto">

                {/* 標題 */}
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-purple-900 flex items-center gap-2">
                        📊 成績管理
                        {role === 'parent' && <span className="text-sm bg-purple-200 text-purple-800 px-2 py-1 rounded">家長版</span>}
                    </h1>
                    <button onClick={() => router.push('/')} className="px-3 py-1 bg-gray-400 text-white rounded text-sm">回首頁</button>
                </div>

                {/* ============ 🏠 家長介面：看圖表 ============ */}
                {role === 'parent' && (
                    <div className="space-y-6">

                        {/* 選擇小孩 */}
                        {myChildren.length > 0 ? (
                            <div className="flex gap-2 overflow-x-auto pb-2">
                                {myChildren.map(child => (
                                    <button
                                        key={child.id}
                                        onClick={() => handleChildChange(child.id)}
                                        className={`px-4 py-2 rounded-full font-bold whitespace-nowrap transition ${selectedChildId === child.id ? 'bg-purple-600 text-white shadow-lg' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
                                    >
                                        {child.chinese_name}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center text-gray-400">尚未綁定學生</div>
                        )}

                        {selectedChildId && (
                            <>
                                {/* 1. 折線圖卡片 */}
                                <div className="bg-white p-6 rounded-xl shadow-lg border-t-4 border-purple-500 animate-fade-in">
                                    <h2 className="font-bold text-gray-700 mb-2">📈 成績趨勢圖</h2>
                                    <div className="px-2">
                                        <LineChart data={childGrades} />
                                    </div>
                                </div>

                                {/* 2. 詳細列表 */}
                                <div className="bg-white rounded-xl shadow overflow-hidden">
                                    <table className="w-full">
                                        <thead className="bg-gray-100 border-b">
                                            <tr>
                                                <th className="p-3 text-left text-sm text-gray-600">考試名稱</th>
                                                <th className="p-3 text-center text-sm text-gray-600">日期</th>
                                                <th className="p-3 text-right text-sm text-gray-600">分數</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {childGrades.slice().reverse().map((g) => ( // 反轉顯示，最新的在上面
                                                <tr key={g.id}>
                                                    <td className="p-3 font-bold text-gray-800">{g.exam_name}</td>
                                                    <td className="p-3 text-center text-sm text-gray-500">{g.exam_date}</td>
                                                    <td className="p-3 text-right">
                                                        <span className={`font-black text-lg ${g.score >= 90 ? 'text-green-600' : g.score < 60 ? 'text-red-500' : 'text-blue-600'}`}>
                                                            {g.score}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                            {childGrades.length === 0 && (
                                                <tr><td colSpan={3} className="p-6 text-center text-gray-400">目前沒有成績紀錄</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ============ 🧑‍🏫 老師介面：批次輸入 ============ */}
                {role !== 'parent' && (
                    <div className="space-y-6">

                        {/* 1. 控制台 */}
                        <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500">
                            <h2 className="font-bold text-lg mb-4 text-gray-800">📝 成績登錄</h2>
                            <div className="grid md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">選擇班級</label>
                                    <select
                                        className="w-full p-2 border rounded bg-gray-50 font-bold text-gray-700 outline-none focus:ring-2 focus:ring-purple-300"
                                        value={selectedClass}
                                        onChange={e => setSelectedClass(e.target.value)}
                                    >
                                        <option value="">-- 請選擇 --</option>
                                        {ALL_CLASSES.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">考試名稱</label>
                                    <input
                                        type="text"
                                        placeholder="例: 期中考 / 單字小考"
                                        className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-purple-300"
                                        value={examName}
                                        onChange={e => setExamName(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">日期</label>
                                    <input
                                        type="date"
                                        className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-purple-300"
                                        value={examDate}
                                        onChange={e => setExamDate(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 2. 學生列表 (Excel 模式) */}
                        {selectedClass && (
                            <div className="bg-white rounded-xl shadow-lg overflow-hidden animate-slide-up">
                                <div className="p-4 bg-purple-100 border-b border-purple-200 flex justify-between items-center">
                                    <span className="font-bold text-purple-900">
                                        {selectedClass} 學生名單 ({classStudents.length} 人)
                                    </span>
                                    <div className="text-xs text-purple-600">
                                        💡 Tip: 使用 Tab 鍵可快速切換下一位
                                    </div>
                                </div>

                                <div className="max-h-[500px] overflow-y-auto">
                                    <table className="w-full">
                                        <thead className="bg-gray-50 sticky top-0 z-10">
                                            <tr>
                                                <th className="p-3 text-left text-sm text-gray-600">座號/姓名</th>
                                                <th className="p-3 text-left text-sm text-gray-600">分數輸入</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {classStudents.map((s, index) => (
                                                <tr key={s.id} className="hover:bg-gray-50">
                                                    <td className="p-3">
                                                        <span className="text-gray-400 text-xs mr-2">{index + 1}.</span>
                                                        <span className="font-bold text-gray-800 text-lg">{s.chinese_name}</span>
                                                    </td>
                                                    <td className="p-3">
                                                        <input
                                                            type="number"
                                                            placeholder="0-100"
                                                            className="w-24 p-2 border-2 border-gray-200 rounded-lg text-center font-bold text-lg focus:border-purple-500 focus:bg-purple-50 outline-none transition"
                                                            value={scores[s.id] || ''}
                                                            onChange={e => handleScoreChange(s.id, e.target.value)}
                                                            onWheel={(e) => e.currentTarget.blur()} // 防止滑鼠滾輪誤觸改數字
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                            {classStudents.length === 0 && (
                                                <tr><td colSpan={2} className="p-8 text-center text-gray-400">此班級尚無學生資料</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {classStudents.length > 0 && (
                                    <div className="p-4 bg-gray-50 border-t flex justify-end">
                                        <button
                                            onClick={saveAllGrades}
                                            className="px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transform active:scale-95 transition"
                                        >
                                            💾 儲存全班成績
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                )}

            </div>
        </div>
    );
}