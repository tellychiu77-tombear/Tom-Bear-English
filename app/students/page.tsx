'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function StudentManagement() {
    const [role, setRole] = useState<string | null>(null);
    const [students, setStudents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // 編輯模式狀態
    const [isEditing, setIsEditing] = useState(false);
    const [currentId, setCurrentId] = useState<string | null>(null);

    // 表單資料
    const [form, setForm] = useState({
        chinese_name: '',
        english_name: '',
        grade: '',
        parent_email: '' // 這裡讓老師輸入 Email，我們後台自動去抓 ID
    });

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
            alert('家長無權訪問此頁面');
            router.push('/');
        } else {
            fetchStudents();
        }
    }

    // 抓取所有學生 (包含家長的 Email)
    async function fetchStudents() {
        setLoading(true);
        // 這裡我們做一個 join 查詢，把家長的 email 也抓出來顯示
        const { data, error } = await supabase
            .from('students')
            .select(`*, parent:profiles(email)`) // 關聯查詢
            .order('grade', { ascending: true })
            .order('chinese_name', { ascending: true });

        if (data) setStudents(data);
        setLoading(false);
    }

    // 準備新增
    function handleAddNew() {
        setForm({ chinese_name: '', english_name: '', grade: '', parent_email: '' });
        setIsEditing(true);
        setCurrentId(null);
    }

    // 準備編輯
    function handleEdit(student: any) {
        setForm({
            chinese_name: student.chinese_name,
            english_name: student.english_name || '',
            grade: student.grade || '',
            parent_email: student.parent?.email || ''
        });
        setIsEditing(true);
        setCurrentId(student.id);
    }

    // 執行刪除
    async function handleDelete(id: string, name: string) {
        if (!confirm(`確定要刪除學生「${name}」嗎？此操作無法復原！`)) return;

        const { error } = await supabase.from('students').delete().eq('id', id);
        if (error) alert('刪除失敗: ' + error.message);
        else fetchStudents();
    }

    // 執行儲存 (新增或修改)
    async function handleSave(e: React.FormEvent) {
        e.preventDefault();

        // 1. 先處理家長 Email -> ID 的轉換
        let parentId = null;
        if (form.parent_email) {
            const { data: parentData, error: parentError } = await supabase
                .rpc('get_profile_id_by_email', { user_email: form.parent_email }); // 呼叫我們剛剛寫的 SQL 函數

            if (parentData) {
                parentId = parentData;
            } else {
                alert('找不到此 Email 的家長帳號，請確認家長已註冊。系統將暫時儲存為「無家長」狀態。');
            }
        }

        const payload = {
            chinese_name: form.chinese_name,
            english_name: form.english_name,
            grade: form.grade,
            parent_id: parentId // 更新家長連結
        };

        if (currentId) {
            // 修改模式
            const { error } = await supabase.from('students').update(payload).eq('id', currentId);
            if (error) alert('修改失敗: ' + error.message);
        } else {
            // 新增模式
            const { error } = await supabase.from('students').insert(payload);
            if (error) alert('新增失敗: ' + error.message);
        }

        setIsEditing(false);
        fetchStudents();
    }

    if (loading) return <div className="p-8 text-center">載入學生資料中...</div>;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* 頂部導航 */}
            <div className="bg-white p-4 shadow flex justify-between items-center">
                <h1 className="text-xl font-bold text-gray-800">📂 學生檔案管理</h1>
                <button onClick={() => router.push('/')} className="px-3 py-1 bg-gray-400 text-white rounded text-sm">回首頁</button>
            </div>

            <div className="flex flex-1 p-4 gap-6 max-w-6xl mx-auto w-full overflow-hidden">

                {/* 左側：學生列表 */}
                <div className="flex-1 bg-white rounded-xl shadow overflow-hidden flex flex-col">
                    <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                        <span className="font-bold text-gray-600">全校學生 ({students.length})</span>
                        <button onClick={handleAddNew} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition">
                            + 新增學生
                        </button>
                    </div>

                    <div className="overflow-y-auto flex-1 p-2">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="text-sm text-gray-500 border-b">
                                    <th className="p-3">班級</th>
                                    <th className="p-3">姓名</th>
                                    <th className="p-3">家長 Email</th>
                                    <th className="p-3 text-right">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {students.map(s => (
                                    <tr key={s.id} className="border-b hover:bg-blue-50 transition group">
                                        <td className="p-3">
                                            <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-bold">{s.grade}</span>
                                        </td>
                                        <td className="p-3">
                                            <div className="font-bold text-gray-800">{s.chinese_name}</div>
                                            <div className="text-xs text-gray-400">{s.english_name}</div>
                                        </td>
                                        <td className="p-3 text-sm text-gray-500">
                                            {s.parent?.email || <span className="text-red-300 italic">未綁定</span>}
                                        </td>
                                        <td className="p-3 text-right">
                                            <button onClick={() => handleEdit(s)} className="text-blue-500 hover:text-blue-700 mr-3 font-bold text-sm">編輯</button>
                                            <button onClick={() => handleDelete(s.id, s.chinese_name)} className="text-red-400 hover:text-red-600 text-sm">刪除</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 右側：編輯/新增面板 (浮動式或固定式) */}
                {isEditing && (
                    <div className="w-1/3 bg-white rounded-xl shadow-xl border-t-4 border-blue-500 h-fit p-6 animate-fade-in">
                        <h2 className="text-lg font-bold mb-6 text-gray-800 border-b pb-2">
                            {currentId ? '✏️ 編輯學生資料' : '👶 新增學生'}
                        </h2>

                        <form onSubmit={handleSave} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">中文姓名</label>
                                <input type="text" className="w-full p-2 border rounded focus:border-blue-500 outline-none" required
                                    value={form.chinese_name} onChange={e => setForm({ ...form, chinese_name: e.target.value })} />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">英文姓名</label>
                                    <input type="text" className="w-full p-2 border rounded focus:border-blue-500 outline-none"
                                        value={form.english_name} onChange={e => setForm({ ...form, english_name: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">班級</label>
                                    <input type="text" className="w-full p-2 border rounded focus:border-blue-500 outline-none" placeholder="例: cei-z" required
                                        value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })} />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">家長帳號 (Email)</label>
                                <input type="email" className="w-full p-2 border rounded focus:border-blue-500 outline-none" placeholder="輸入家長註冊的 Email"
                                    value={form.parent_email} onChange={e => setForm({ ...form, parent_email: e.target.value })} />
                                <p className="text-xs text-gray-400 mt-1">* 若家長尚未註冊，可留空，日後再補。</p>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setIsEditing(false)} className="flex-1 py-2 bg-gray-200 rounded text-gray-600 font-bold hover:bg-gray-300">取消</button>
                                <button type="submit" className="flex-1 py-2 bg-blue-600 rounded text-white font-bold hover:bg-blue-700 shadow">儲存</button>
                            </div>
                        </form>
                    </div>
                )}

            </div>
        </div>
    );
}