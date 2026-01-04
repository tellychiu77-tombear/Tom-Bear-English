'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Trash2, PlusCircle } from 'lucide-react';

type GradeItem = {
    id: string;
    student_name: string;
    exam_name: string;
    subject: string;
    score: number;
    created_at: string;
};

export default function GradesPage() {
    const [grades, setGrades] = useState<GradeItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Form Inputs
    const [studentName, setStudentName] = useState('');
    const [examName, setExamName] = useState('');
    const [subject, setSubject] = useState('');
    const [score, setScore] = useState('');

    const router = useRouter();

    const fetchGrades = async () => {
        const { data, error } = await supabase
            .from('exam_results')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching grades:', error);
        } else {
            setGrades((data as any) || []);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchGrades();
    }, []);

    const handleAddGrade = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!studentName || !examName || !subject || !score) return;

        setSubmitting(true);
        const parsedScore = parseFloat(score);

        const { error } = await (supabase
            .from('exam_results') as any)
            .insert({
                student_name: studentName,
                exam_name: examName,
                subject: subject,
                score: parsedScore,
            });

        if (error) {
            console.error('Error adding grade:', error);
            alert('Failed to add grade.');
        } else {
            // Reset form
            setStudentName('');
            setExamName('');
            setSubject('');
            setScore('');
            fetchGrades();
        }
        setSubmitting(false);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this grade record?')) return;

        const { error } = await supabase
            .from('exam_results')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting:', error);
            alert('Failed to delete grade.');
        } else {
            fetchGrades();
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <header className="bg-white shadow px-6 py-4 flex items-center gap-4 sticky top-0 z-10">
                <button
                    onClick={() => router.push('/dashboard')}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <ArrowLeft className="text-gray-600" />
                </button>
                <h1 className="text-xl font-bold text-gray-800">成績管理系統 (Grade Management)</h1>
            </header>

            <main className="flex-1 max-w-6xl mx-auto w-full p-6 space-y-8">

                {/* Input Section */}
                <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
                        <PlusCircle size={20} />
                        Add New Grade
                    </h2>
                    <form onSubmit={handleAddGrade} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                        <div className="md:col-span-1">
                            <label className="block text-sm font-medium text-gray-500 mb-1">Student Name</label>
                            <input
                                type="text"
                                value={studentName}
                                onChange={(e) => setStudentName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                                placeholder="e.g. Alice"
                                required
                            />
                        </div>
                        <div className="md:col-span-1">
                            <label className="block text-sm font-medium text-gray-500 mb-1">Exam Name</label>
                            <input
                                type="text"
                                value={examName}
                                onChange={(e) => setExamName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                                placeholder="e.g. Midterm"
                                required
                            />
                        </div>
                        <div className="md:col-span-1">
                            <label className="block text-sm font-medium text-gray-500 mb-1">Subject</label>
                            <input
                                type="text"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                                placeholder="e.g. Math"
                                required
                            />
                        </div>
                        <div className="md:col-span-1">
                            <label className="block text-sm font-medium text-gray-500 mb-1">Score</label>
                            <input
                                type="number"
                                value={score}
                                onChange={(e) => setScore(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                                placeholder="0-100"
                                required
                            />
                        </div>
                        <div className="md:col-span-1">
                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors flex justify-center items-center gap-2"
                            >
                                {submitting ? 'Adding...' : 'Add Grade'}
                            </button>
                        </div>
                    </form>
                </section>

                {/* Grades Table */}
                <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="px-6 py-4 font-semibold text-gray-600">Date Recorded</th>
                                    <th className="px-6 py-4 font-semibold text-gray-600">Student</th>
                                    <th className="px-6 py-4 font-semibold text-gray-600">Exam</th>
                                    <th className="px-6 py-4 font-semibold text-gray-600">Subject</th>
                                    <th className="px-6 py-4 font-semibold text-gray-600">Score</th>
                                    <th className="px-6 py-4 font-semibold text-gray-600 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-gray-400">Loading...</td>
                                    </tr>
                                ) : grades.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-gray-400">No grades recorded yet.</td>
                                    </tr>
                                ) : (
                                    grades.map((grade) => (
                                        <tr key={grade.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 text-gray-500 text-sm">
                                                {new Date(grade.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4 font-medium text-gray-800">{grade.student_name}</td>
                                            <td className="px-6 py-4 text-gray-600">{grade.exam_name}</td>
                                            <td className="px-6 py-4 text-gray-600">{grade.subject}</td>
                                            <td className={`px-6 py-4 font-bold ${grade.score < 60 ? 'text-red-500' : 'text-blue-600'}`}>
                                                {grade.score}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => handleDelete(grade.id)}
                                                    className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded hover:bg-red-50"
                                                    title="Delete Record"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>
        </div>
    );
}
