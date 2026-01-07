'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

// 自動產生 CEI-A 到 CEI-Z 的選項
const ENGLISH_CLASSES = Array.from({ length: 26 }, (_, i) => `CEI-${String.fromCharCode(65 + i)}`);

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
        english_grade: '', // 🟢 改成空字串，代表預設「無」
        is_after_school: false,
        school: '',
        notes: '',
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
            alert('家長無權訪問此頁面');
            router.push('/');
        } else {
            fetchStudents();
        }
    }

    async function fetchStudents() {
        setLoading(true);
        const { data } = await supabase
            .from('students')
            .select(`*, parent:profiles(email)`)
            .order('grade', { ascending: true })
            .order('chinese_name', { ascending: true });

        if (data) setStudents(data);
        setLoading(false);
    }

    function handleAddNew() {
        // 初始化：預設英文班為空 (無)，課輔班為空
        setForm({
            chinese_name: '',
            english_name: '',
            english_grade: '', // 預設不參加英文班
            is_after_school: false,
            school: '',
            notes: '',
            parent_email: ''
        });
        setIsEditing(true);
        setCurrentId(null);
    }

    function handleEdit(student: any) {
        // 🟢 解析班級字串
        const fullGrade = student.grade || '';
        const hasCare = fullGrade.includes('課後輔導班');

        // 把 "課後輔導班" 拿掉，剩下的就是英文班級
        let engClass = fullGrade.replace('課後輔導班', '').replace(',', '').trim();

        // 如果剩下的字串不在標準英文班級列表內 (例如是空的，或是其他怪怪的字)，就視為「無」
        if (!ENGLISH_CLASSES.includes(engClass)) {
            engClass = '';
        }

        setForm({
            chinese_name: student.chinese_name,
            english_name: student.english_name || '',
            english_grade: engClass,
            is_after_school: hasCare,
            school: student.school || '',
            notes: student.notes || '',
            parent_email: student.parent?.email || ''
        });
        setIsEditing(true);
        setCurrentId(student.id);
    }

    async function handleDelete(id: string, name: string) {
        if (!confirm(`確定要刪除學生「${name}」嗎？此操作無法復原！`)) return;

        const { error } = await supabase.from('students').delete().eq('id', id);
        if (error) alert('刪除失敗: ' + error.message);
        else {
            setIsEditing(false);
            fetchStudents();
        }
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();

        let parentId = null;
        if (form.parent_email) {
            const { data: parentData } = await supabase.from('profiles').select('id').eq('email', form.parent_email).single();
            if (parentData) {
                parentId = parentData.id;
            } else {
                alert('注意：找不到此 Email 的家長帳號。資料將先存檔，家長欄位將保持空白。');
            }
        }

        // 🟢 智慧組合班級字串
        const parts = [];
        if (form.english_grade) {
            parts.push(form.english_grade); // 加入英文班 (如果有的話)
        }
        if (form.is_after_school) {
            parts.push('課後輔導班'); // 加入課輔班 (如果有的話)
        }

        // 如果兩個都沒選，就會變成空字串 (或者您可以給個預設值 '未分班')
        const finalGrade = parts.join(', ') || '未分班';

        const payload = {
            chinese_name: form.chinese_name,
            english_name: form.english_name,
            grade: finalGrade,
            school: form.school,
            notes: form.notes,
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
            <div className="bg-white p-4 shadow flex justify-between items-center z-10 sticky top-0">
                <h1 className="text-xl font-bold text-gray-800">📂 學生兵籍資料管理</h1>
                <button onClick={() => router.push('/')} className="px-3 py-1 bg-gray-400 text-white rounded text-sm">回首頁</button>
            </div>

            <div className="flex flex-1 p-4 gap-6 max-w-7xl mx-auto w-full">

                {/* 左側列表 */}
                <div className="w-full bg-white rounded-xl shadow overflow-hidden flex flex-col">
                    <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                        <span className="font-bold text-gray-600">全校學生 ({students.length})</span>
                        <button onClick={handleAddNew} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition">
                            + 新增學生
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[600px]">
                            <thead>
                                <tr className="text-xs font-bold text-gray-500 border-b bg-gray-50">
                                    <th className="p-3 w-40">班級</th>
                                    <th className="p-3 w-32">姓名</th>
                                    <th className="p-3">狀況備註</th>
                                    <th className="p-3 text-right w-24">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {students.map(s => (
                                    <tr key={s.id} className="border-b hover:bg-blue-50 transition cursor-pointer" onClick={() => handleEdit(s)}>
                                        <td className="p-3">
                                            <div className="flex flex-col gap-1 items-start">
                                                {/* 顯示班級標籤：如果有課後輔導，顯示兩個標籤 */}
                                                {s.grade && s.grade.split(',').map((g: string, i: number) => {
                                                    const cleanG = g.trim();
                                                    if (!cleanG || cleanG === '未分班') return <span key={i} className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">未分班</span>;

                                                    return (
                                                        <span key={i} className={`px-2 py-0.5 rounded text-xs font-bold w-fit mb-1 ${cleanG === '課後輔導班'
                                                                ? 'bg-orange-100 text-orange-800'
                                                                : 'bg-blue-100 text-blue-800'
                                                            }`}>
                                                            {cleanG}
                                                        </span>
                                                    );
                                                })}
                                                <span className="text-xs text-gray-400 mt-1">{s.school || '-'}</span>
                                            </div>
                                        </td>
                                        <td className="p-3">
                                            <div className="font-bold text-gray-800">{s.chinese_name}</div>
                                            <div className="text-xs text-gray-400">{s.english_name}</div>
                                        </td>
                                        <td className="p-3 max-w-[200px]">
                                            <div className="truncate text-xs text-gray-500" title={s.notes}>{s.notes}</div>
                                        </td>
                                        <td className="p-3 text-right">
                                            <button onClick={(e) => { e.stopPropagation(); handleEdit(s); }} className="text-blue-500 hover:text-blue-700 font-bold text-sm">編輯</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ============ 右側：編輯抽屜 ============ */}
                {isEditing && (
                    <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setIsEditing(false)}></div>
                )}

                <div className={`fixed top-0 bottom-0 right-0 w-full md:w-[480px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${isEditing ? 'translate-x-0' : 'translate-x-full'}`}>

                    <div className="p-6 border-b flex justify-between items-center bg-gray-50 flex-shrink-0">
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            {currentId ? '✏️ 編輯學生檔案' : '👶 新增學生'}
                        </h2>
                        <button onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white">
                        {/* 基本資料 */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-blue-800 border-b border-blue-100 pb-2">👤 基本資料</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">中文姓名</label>
                                    <input type="text" className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50" required
                                        value={form.chinese_name} onChange={e => setForm({ ...form, chinese_name: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">英文姓名</label>
                                    <input type="text" className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50"
                                        value={form.english_name} onChange={e => setForm({ ...form, english_name: e.target.value })} />
                                </div>
                            </div>
                        </div>

                        {/* 🟢 學籍資料 (重點修改區) */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-blue-800 border-b border-blue-100 pb-2">🏫 班級設定</h3>

                            {/* 1. 英文主修班級 (下拉選單 - 增加「無」選項) */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">英文主修班級</label>
                                <select
                                    className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 font-bold text-gray-700"
                                    value={form.english_grade}
                                    onChange={e => setForm({ ...form, english_grade: e.target.value })}
                                >
                                    <option value="">(無) 僅參加安親 / 不參加英文</option>
                                    {ENGLISH_CLASSES.map(cls => (
                                        <option key={cls} value={cls}>{cls}</option>
                                    ))}
                                </select>
                            </div>

                            {/* 2. 課後輔導 (勾選框) */}
                            <div className="flex items-center gap-3 p-3 border rounded bg-orange-50 cursor-pointer hover:bg-orange-100 transition" onClick={() => setForm({ ...form, is_after_school: !form.is_after_school })}>
                                <div className={`w-5 h-5 border-2 rounded flex items-center justify-center transition ${form.is_after_school ? 'bg-orange-500 border-orange-500' : 'bg-white border-gray-300'}`}>
                                    {form.is_after_school && <span className="text-white text-xs">✓</span>}
                                </div>
                                <label className="text-sm font-bold text-gray-700 cursor-pointer select-none flex-1">
                                    參加「課後輔導班」 (安親班)
                                </label>
                            </div>
                            {form.english_grade === '' && form.is_after_school && (
                                <div className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
                                    💡 目前設定：該學生 **只參加課後輔導** (無英文班級)
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1 mt-2">就讀國小</label>
                                <input type="text" className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50" placeholder="例: 東門國小"
                                    value={form.school} onChange={e => setForm({ ...form, school: e.target.value })} />
                            </div>
                        </div>

                        {/* 家長綁定 */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-blue-800 border-b border-blue-100 pb-2">🔗 家長連結</h3>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">家長 Email</label>
                                <input type="email" className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50" placeholder="parent@demo.com"
                                    value={form.parent_email} onChange={e => setForm({ ...form, parent_email: e.target.value })} />
                                <p className="text-[10px] text-gray-400 mt-1">* 系統會自動搜尋並連結已註冊的家長帳號</p>
                            </div>
                        </div>

                        {/* 狀況備註 */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-yellow-800 border-b border-yellow-200 pb-2 bg-yellow-50 px-2 rounded-t">📋 學生狀況 (僅老師可見)</h3>
                            <textarea
                                className="w-full p-4 border-2 border-yellow-200 rounded-b focus:border-yellow-500 outline-none h-40 text-sm leading-relaxed"
                                placeholder="請詳細記錄學生的特殊狀況..."
                                value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                            ></textarea>
                        </div>

                        <div className="h-10"></div>
                    </div>

                    <div className="p-4 border-t bg-gray-50 flex gap-3 flex-shrink-0 z-50">
                        {currentId && (
                            <button type="button" onClick={() => handleDelete(currentId, form.chinese_name)} className="px-4 py-3 bg-red-100 text-red-600 rounded-lg font-bold hover:bg-red-200 text-sm">
                                刪除
                            </button>
                        )}
                        <button type="button" onClick={() => setIsEditing(false)} className="flex-1 py-3 bg-white border border-gray-300 rounded-lg text-gray-600 font-bold hover:bg-gray-50">
                            取消
                        </button>
                        <button onClick={handleSave} className="flex-1 py-3 bg-blue-600 rounded-lg text-white font-bold hover:bg-blue-700 shadow-lg">
                            儲存資料 💾
                        </button>
                    </div>

                </div>

            </div>
        </div>
    );
}