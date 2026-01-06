'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function ContactBookPage() {
    const [role, setRole] = useState<string | null>(null);
    const [students, setStudents] = useState<any[]>([]); // 老師用：學生名單
    const [myBooks, setMyBooks] = useState<any[]>([]);   // 家長用：聯絡簿列表
    const [selectedStudent, setSelectedStudent] = useState<string>('');
    const [form, setForm] = useState({ content: '', homework: '' });
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        init();
    }, []);

    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        const userRole = profile?.role || 'pending';
        setRole(userRole);

        if (userRole === 'parent') {
            // 家長：抓自己小孩的聯絡簿
            fetchMyBooks(session.user.id);
        } else {
            // 老師：抓所有學生
            const { data } = await supabase.from('students').select('*').order('grade');
            setStudents(data || []);
            if (data && data.length > 0) setSelectedStudent(data[0].id);
        }
        setLoading(false);
    }

    async function fetchMyBooks(userId: string) {
        const { data } = await supabase.from('contact_book_view').select('*');
        setMyBooks(data || []);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!selectedStudent) return;

        const { data: { session } } = await supabase.auth.getSession();
        const { error } = await supabase.from('contact_books').insert({
            student_id: selectedStudent,
            teacher_id: session?.user.id,
            content: form.content,
            homework: form.homework
        });

        if (error) alert('發送失敗: ' + error.message);
        else {
            alert('聯絡簿已發送！📝');
            setForm({ content: '', homework: '' });
        }
    }

    if (loading) return <div className="p-8 text-center">載入中...</div>;

    return (
        <div className="min-h-screen bg-orange-50 p-4">
            <div className="max-w-2xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-orange-900">📝 電子聯絡簿</h1>
                    <button onClick={() => router.push('/')} className="px-3 py-1 bg-gray-400 text-white rounded text-sm">回首頁</button>
                </div>

                {/* ============ 老師介面：寫聯絡簿 ============ */}
                {role !== 'parent' && (
                    <div className="bg-white p-6 rounded-xl shadow-lg border-t-4 border-orange-500">
                        <h2 className="text-lg font-bold mb-4">✍️ 撰寫今日聯絡事項</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">選擇學生</label>
                                <select
                                    className="w-full p-2 border rounded bg-gray-50"
                                    value={selectedStudent}
                                    onChange={e => setSelectedStudent(e.target.value)}
                                >
                                    {students.map(s => (
                                        <option key={s.id} value={s.id}>{s.grade} - {s.chinese_name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">今日作業</label>
                                <input
                                    type="text"
                                    placeholder="例如: 英文課本 P.10 ~ P.12"
                                    className="w-full p-2 border rounded"
                                    value={form.homework}
                                    onChange={e => setForm({ ...form, homework: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">聯絡事項 / 老師評語</label>
                                <textarea
                                    rows={4}
                                    placeholder="例如: 今天上課很專心，單字考試滿分！"
                                    className="w-full p-2 border rounded"
                                    value={form.content}
                                    onChange={e => setForm({ ...form, content: e.target.value })}
                                />
                            </div>

                            <button type="submit" className="w-full bg-orange-600 text-white py-3 rounded-lg font-bold hover:bg-orange-700 transition">
                                發送給家長 📤
                            </button>
                        </form>
                    </div>
                )}

                {/* ============ 家長介面：讀聯絡簿 ============ */}
                {role === 'parent' && (
                    <div className="space-y-4">
                        {myBooks.length === 0 ? (
                            <div className="text-center py-10 text-gray-500 bg-white rounded-xl">
                                📭 目前還沒有聯絡簿紀錄喔
                            </div>
                        ) : (
                            myBooks.map(book => (
                                <div key={book.id} className="bg-white p-6 rounded-xl shadow-sm border border-orange-100">
                                    <div className="flex justify-between items-start mb-4 border-b pb-2">
                                        <div>
                                            <span className="text-sm text-gray-400">{new Date(book.created_at).toLocaleDateString()}</span>
                                            <h3 className="text-xl font-bold text-gray-800">{book.student_name}</h3>
                                        </div>
                                        <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs">
                                            老師: {book.teacher_name || '導師'}
                                        </span>
                                    </div>

                                    <div className="space-y-3">
                                        {book.homework && (
                                            <div className="bg-yellow-50 p-3 rounded text-sm">
                                                <span className="font-bold text-yellow-800">📚 今日作業：</span>
                                                <div className="text-gray-700 mt-1">{book.homework}</div>
                                            </div>
                                        )}
                                        {book.content && (
                                            <div className="text-gray-600">
                                                <span className="font-bold text-gray-800">💬 老師說：</span>
                                                <div className="mt-1 whitespace-pre-wrap">{book.content}</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}