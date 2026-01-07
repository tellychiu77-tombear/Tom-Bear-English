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

    // 表單資料 (新增 school 和 notes)
    const [form, setForm] = useState({
        chinese_name: '',
        english_name: '',
        grade: '',
        school: '',      // 🏫 就讀國小
        notes: '',       // 📝 學生狀況備註
        parent_email: ''
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
            alert('家長無權訪問此頁面'); // 再次阻擋家長
            router.push('/');
        } else {
            fetchStudents();
        }
    }

    // 抓取所有學生
    async function fetchStudents() {
        setLoading(true);
        const { data, error } = await supabase
            .from('students')
            .select(`*, parent:profiles(email)`)
            .order('grade', { ascending: true })
            .order('chinese_name', { ascending: true });

        if (data) setStudents(data);
        setLoading(false);
    }

    // 準備新增
    function handleAddNew() {
        setForm({ chinese_name: '', english_name: '', grade: '', school: '', notes: '', parent_email: '' });
        setIsEditing(true);
        setCurrentId(null);
    }

    // 準備編輯 (將資料填入表單)
    function handleEdit(student: any) {
        setForm({
            chinese_name: student.chinese_name,
            english_name: student.english_name || '',
            grade: student.grade || '',
            school: student.school || '', // 載入國小
            notes: student.notes || '',   // 載入備註
            parent_email: student.parent?.email || ''
        });
        setIsEditing(true);
        setCurrentId(student.id);
    }

    async function handleDelete(id: string, name: string) {
        if (!confirm(`確定要刪除學生「${name}」嗎？此操作無法復原！`)) return;

        const { error } = await supabase.from('students').delete().eq('id', id);
        if (error) alert('刪除失敗: ' + error.message);
        else fetchStudents();
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();

        // 處理家長 Email 轉換
        let parentId = null;
        if (form.parent_email) {
            // 嘗試用 email 找 ID (如果只是修改資料且沒動 email，這裡邏輯可以簡化，但為了保險先重抓)
            // 注意：這裡假設後端已有 get_profile_id_by_email 函數，若無則需用 select 查詢
            // 簡單起見，我們直接在前端做查詢
            const { data: parentData } = await supabase.from('profiles').select('id').eq('email', form.parent_email).single();

            if (parentData) {
                parentId = parentData.id;
            } else {
                alert('找不到此 Email 的家長帳號，請確認家長已註冊。資料將先存檔，家長欄位留空。');
            }
        }

        const payload = {
            chinese_name: form.chinese_name,
            english_name: form.english_name,
            grade: form.grade,
            school: form.school, // 寫入國小
            notes: form.notes,   // 寫入備註
            // 如果有找到家長 ID 才更新，不然如果是空字串就設為 null (或是原本的 null)
            ...(parentId && { parent_id: parentId })
        };

        if (currentId) {
            const { error } = await supabase.from('students').update(payload).eq('id', currentId);
            if (error) alert('修改失敗: ' + error.message);
        } else {
            const { error } = await supabase.from('students').insert(payload);
            if (error) alert('新增失敗: ' + error.message);
        }

        setIsEditing(false);
        fetchStudents();
    }

    if (loading) return <div className="p-8 text-center">載入學生資料中...</div>;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <div className="bg-white p-4 shadow flex justify-between items-center z-10">
                <h1 className="text-xl font-bold text-gray-800">📂 學生兵籍資料管理</h1>
                <button onClick={() => router.push('/')} className="px-3 py-1 bg-gray-400 text-white rounded text-sm">回首頁</button>
            </div>

            <div className="flex flex-1 p-4 gap-6 max-w-7xl mx-auto w-full overflow-hidden relative">

                {/* 左側列表 (變寬一點以顯示更多資訊) */}
                <div className={`transition-all duration-300 bg-white rounded-xl shadow overflow-hidden flex flex-col ${isEditing ? 'w-1/2' : 'w-full'}`}>
                    <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                        <span className="font-bold text-gray-600">全校學生 ({students.length})</span>
                        <button onClick={handleAddNew} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition">
                            + 新增學生
                        </button>
                    </div>

                    <div className="overflow-y-auto flex-1 p-2">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="text-xs font-bold text-gray-500 border-b bg-gray-50">
                                    <th className="p-3">班級/國小</th>
                                    <th className="p-3">姓名</th>
                                    <th className="p-3 hidden md:table-cell">狀況備註</th>
                                    <th className="p-3 text-right">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {students.map(s => (
                                    <tr key={s.id} className="border-b hover:bg-blue-50 transition group cursor-pointer" onClick={() => handleEdit(s)}>
                                        <td className="p-3">
                                            <div className="flex flex-col gap-1">
                                                <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-bold w-fit">{s.grade}</span>
                                                <span className="text-xs text-gray-500">{s.school || '-'}</span>
                                            </div>
                                        </td>
                                        <td className="p-3">
                                            <div className="font-bold text-gray-800">{s.chinese_name}</div>
                                            <div className="text-xs text-gray-400">{s.english_name}</div>
                                        </td>
                                        <td className="p-3 hidden md:table-cell max-w-[150px]">
                                            <div className="truncate text-xs text-gray-500" title={s.notes}>{s.notes}</div>
                                        </td>
                                        <td className="p-3 text-right">
                                            <button onClick={(e) => { e.stopPropagation(); handleEdit(s); }} className="text-blue-500 hover:text-blue-700 mr-3 font-bold text-sm">編輯</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 右側：詳細資料編輯卡 (像病歷表一樣) */}
                {isEditing && (
                    <div className="w-1/2 bg-white rounded-xl shadow-2xl border-t-4 border-blue-500 h-fit p-6 animate-fade-in absolute right-4 top-4 bottom-4 overflow-y-auto z-20">
                        <div className="flex justify-between items-center border-b pb-4 mb-4">
                            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                {currentId ? '✏️ 編輯學生檔案' : '👶 新增學生'}
                            </h2>
                            <button onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                        </div>

                        <form onSubmit={handleSave} className="space-y-5">

                            {/* 基本資料區 */}
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                                <h3 className="text-sm font-bold text-gray-500 mb-3">👤 基本資料</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1">中文姓名</label>
                                        <input type="text" className="w-full p-2 border rounded focus:border-blue-500 outline-none" required
                                            value={form.chinese_name} onChange={e => setForm({ ...form, chinese_name: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1">英文姓名</label>
                                        <input type="text" className="w-full p-2 border rounded focus:border-blue-500 outline-none"
                                            value={form.english_name} onChange={e => setForm({ ...form, english_name: e.target.value })} />
                                    </div>
                                </div>
                            </div>

                            {/* 學籍資料區 */}
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                                <h3 className="text-sm font-bold text-gray-500 mb-3">🏫 學籍資料</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1">補習班班級</label>
                                        <input type="text" className="w-full p-2 border rounded focus:border-blue-500 outline-none" placeholder="例: cei-z" required
                                            value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1">就讀國小</label>
                                        <input type="text" className="w-full p-2 border rounded focus:border-blue-500 outline-none" placeholder="例: 東門國小"
                                            value={form.school} onChange={e => setForm({ ...form, school: e.target.value })} />
                                    </div>
                                </div>
                            </div>

                            {/* 綁定區 */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">綁定家長帳號 (Email)</label>
                                <div className="flex gap-2">
                                    <input type="email" className="flex-1 p-2 border rounded focus:border-blue-500 outline-none" placeholder="輸入家長註冊的 Email"
                                        value={form.parent_email} onChange={e => setForm({ ...form, parent_email: e.target.value })} />
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">* 系統會自動連結對應的家長帳號</p>
                            </div>

                            {/* 狀況備註區 (重點功能) */}
                            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                                <h3 className="text-sm font-bold text-yellow-800 mb-2">📋 學生狀況紀錄 (僅老師可見)</h3>
                                <textarea
                                    className="w-full p-3 border border-yellow-300 rounded focus:border-yellow-500 outline-none h-32 text-sm bg-white"
                                    placeholder="請輸入詳細紀錄... 例如：&#10;- 對花生過敏&#10;- 數學理解力強，但需要鼓勵&#10;- 週五由阿嬤接送"
                                    value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                                ></textarea>
                            </div>

                            {/* 按鈕區 */}
                            <div className="flex gap-3 pt-2 border-t mt-4">
                                {currentId && (
                                    <button type="button" onClick={() => handleDelete(currentId, form.chinese_name)} className="px-4 py-2 bg-red-100 text-red-600 rounded font-bold hover:bg-red-200 text-sm">
                                        刪除學生
                                    </button>
                                )}
                                <div className="flex-1"></div>
                                <button type="button" onClick={() => setIsEditing(false)} className="px-6 py-2 bg-gray-200 rounded text-gray-600 font-bold hover:bg-gray-300">取消</button>
                                <button type="submit" className="px-6 py-2 bg-blue-600 rounded text-white font-bold hover:bg-blue-700 shadow-lg">儲存檔案 💾</button>
                            </div>
                        </form>
                    </div>
                )}

            </div>
        </div>
    );
}