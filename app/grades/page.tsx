'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function Grades() {
    const router = useRouter();
    const [grades, setGrades] = useState<any[]>([]);
    const [studentName, setStudentName] = useState('');
    const [examName, setExamName] = useState('');
    const [subject, setSubject] = useState('');
    const [score, setScore] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchGrades();
    }, []);

    const fetchGrades = async () => {
        const { data, error } = await supabase
            .from('exam_results')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) console.error('Error fetching grades:', error);
        else setGrades(data || []);
    };

    const handleAddGrade = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const scoreNum = parseFloat(score);
        if (isNaN(scoreNum)) {
            alert('Score must be a number');
            setLoading(false);
            return;
        }

        const { error } = await (supabase.from('exam_results') as any).insert([
            {
                student_name: studentName,
                exam_name: examName,
                subject: subject,
                score: scoreNum
            }
        ]);

        if (error) {
            alert('Error adding grade: ' + error.message);
        } else {
            setStudentName('');
            setScore('');
            fetchGrades(); // Refresh list
        }
        setLoading(false);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this record?')) return;
        const { error } = await supabase.from('exam_results').delete().eq('id', id);
        if (error) alert('Error deleting: ' + error.message);
        else fetchGrades();
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-bold text-gray-800">📊 成績管理</h1>
                    <button
                        onClick={() => router.push('/')}
                        className="text-gray-500 hover:text-gray-700 font-medium"
                    >
                        ← 回首頁
                    </button>
                </div>

                {/* Input Form */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
                    <h2 className="text-lg font-semibold text-gray-700 mb-4">登記成績</h2>
                    <form onSubmit={handleAddGrade} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                        <div className="md:col-span-1">
                            <label className="block text-sm text-gray-500 mb-1">學生姓名</label>
                            <input
                                type="text"
                                value={studentName}
                                onChange={(e) => setStudentName(e.target.value)}
                                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                                required
                            />
                        </div>
                        <div className="md:col-span-1">
                            <label className="block text-sm text-gray-500 mb-1">考試名稱</label>
                            <input
                                type="text"
                                placeholder="例如: 期中考"
                                value={examName}
                                onChange={(e) => setExamName(e.target.value)}
                                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                                required
                            />
                        </div>
                        <div className="md:col-span-1">
                            <label className="block text-sm text-gray-500 mb-1">科目</label>
                            <input
                                type="text"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                                required
                            />
                        </div>
                        <div className="md:col-span-1">
                            <label className="block text-sm text-gray-500 mb-1">分數</label>
                            <input
                                type="number"
                                value={score}
                                onChange={(e) => setScore(e.target.value)}
                                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                                required
                            />
                        </div>
                        <div className="md:col-span-1">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-lg transition-colors"
                            >
                                {loading ? '...' : '新增'}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Grades Table */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 text-gray-500 text-sm">
                                <th className="p-4 font-medium">學生</th>
                                <th className="p-4 font-medium">考試</th>
                                <th className="p-4 font-medium">科目</th>
                                <th className="p-4 font-medium">分數</th>
                                <th className="p-4 font-medium text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {grades.map((grade) => (
                                <tr key={grade.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="p-4 font-medium text-gray-800">{grade.student_name}</td>
                                    <td className="p-4 text-gray-600">{grade.exam_name}</td>
                                    <td className="p-4 text-gray-600">
                                        <span className="px-2 py-1 bg-gray-100 rounded-md text-xs font-medium">
                                            {grade.subject}
                                        </span>
                                    </td>
                                    <td className={`p-4 font-bold ${grade.score < 60 ? 'text-red-500' : 'text-blue-600'}`}>
                                        {grade.score}
                                    </td>
                                    <td className="p-4 text-right">
                                        <button
                                            onClick={() => handleDelete(grade.id)}
                                            className="text-gray-300 hover:text-red-500 transition-colors"
                                        >
                                            ✕
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {grades.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-gray-400">
                                        尚無成績記錄
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
