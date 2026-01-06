'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function StudentsPage() {
    const [students, setStudents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false); // 控制「新增學生」視窗
    const router = useRouter();

    // 新增學生的暫存資料
    const [formData, setFormData] = useState({
        chinese_name: '',
        english_name: '',
        grade: '',
        school: '',
        parent_phone: ''
    });

    useEffect(() => {
        fetchStudents();
    }, []);

    async function fetchStudents() {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('students')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setStudents(data || []);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleAddStudent(e: React.FormEvent) {
        e.preventDefault();
        const { error } = await supabase.from('students').insert([formData]);
        if (error) {
            alert('新增失敗: ' + error.message);
        } else {
            alert('學生新增成功！🎉');
            setShowModal(false); // 關閉視窗
            setFormData({ chinese_name: '', english_name: '', grade: '', school: '', parent_phone: '' }); // 清空
            fetchStudents(); // 重新整理列表
        }
    }

    return (
        <div className="min-h-screen bg-gray-100 p-4">
            <div className="max-w-2xl mx-auto">
                {/* 標題區 */}
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2">
                        <button onClick={() => router.push('/')} className="text-gray-500 hover:text-gray-700">
                            ⬅️
                        </button>
                        <h1 className="text-2xl font-bold text-gray-800">學生檔案管理</h1>
                    </div>
                    <button
                        onClick={() => setShowModal(true)}
                        className="bg-pink-600 text-white px-4 py-2 rounded-lg shadow hover:bg-pink-700 transition"
                    >
                        + 新增學生
                    </button>
                </div>

                {/* 學生列表區 */}
                {loading ? (
                    <div className="text-center text-gray-500 py-10">讀取資料中...</div>
                ) : students.length === 0 ? (
                    <div className="text-center text-gray-400 py-10 bg-white rounded-lg shadow">
                        目前還沒有學生資料，請按右上角新增。
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {students.map((student) => (
                            <div key={student.id} className="bg-white p-4 rounded-lg shadow-sm flex justify-between items-center border-l-4 border-pink-400">
                                <div>
                                    <div className="flex items-baseline gap-2">
                                        <h2 className="text-lg font-bold text-gray-900">{student.chinese_name}</h2>
                                        <span className="text-pink-600 font-medium">{student.english_name}</span>
                                    </div>
                                    <p className="text-sm text-gray-500">
                                        {student.school} | {student.grade} | 家長: {student.parent_phone}
                                    </p>
                                </div>
                                <div className="bg-gray-100 px-3 py-1 rounded text-sm text-gray-600">
                                    詳細
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* 新增學生彈跳視窗 (Modal) */}
                {showModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
                            <h2 className="text-xl font-bold mb-4">📝 新增學生</h2>
                            <form onSubmit={handleAddStudent} className="space-y-4">
                                <input
                                    type="text" placeholder="中文姓名 (例: 王小明)" required
                                    className="w-full p-2 border rounded"
                                    value={formData.chinese_name}
                                    onChange={e => setFormData({ ...formData, chinese_name: e.target.value })}
                                />
                                <input
                                    type="text" placeholder="英文名字 (例: Tom)" required
                                    className="w-full p-2 border rounded"
                                    value={formData.english_name}
                                    onChange={e => setFormData({ ...formData, english_name: e.target.value })}
                                />
                                <div className="grid grid-cols-2 gap-4">
                                    <input
                                        type="text" placeholder="學校 (例: 竹北國小)"
                                        className="w-full p-2 border rounded"
                                        value={formData.school}
                                        onChange={e => setFormData({ ...formData, school: e.target.value })}
                                    />
                                    <input
                                        type="text" placeholder="年級 (例: 3年級)"
                                        className="w-full p-2 border rounded"
                                        value={formData.grade}
                                        onChange={e => setFormData({ ...formData, grade: e.target.value })}
                                    />
                                </div>
                                <input
                                    type="text" placeholder="家長聯絡電話"
                                    className="w-full p-2 border rounded"
                                    value={formData.parent_phone}
                                    onChange={e => setFormData({ ...formData, parent_phone: e.target.value })}
                                />

                                <div className="flex justify-end gap-3 mt-6">
                                    <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-500">取消</button>
                                    <button type="submit" className="px-6 py-2 bg-pink-600 text-white rounded hover:bg-pink-700">確認新增</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}