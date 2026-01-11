'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function StudentManagementPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

    // Data
    const [students, setStudents] = useState<any[]>([]);
    const [classes, setClasses] = useState<any[]>([]);

    // Filters (這裡改存 class 物件，包含 id 和 name，確保資料正確)
    const [selectedClass, setSelectedClass] = useState<any>(null);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingStudent, setEditingStudent] = useState<any>(null);

    // Form Data
    const [formData, setFormData] = useState({
        chinese_name: '',
        english_name: '',
        student_id_display: '',
        birthday: '',
        grade: '',        // 顯示用的班級名稱
        class_id: '',     // 🔥 關鍵：系統用的班級 ID (保留舊功能核心)
        photo_url: '',
        parent_name_1: '',
        parent_phone_1: '',
        parent_name_2: '',
        parent_phone_2: '',
        pickup_method: '家長接送',
        allergies: '',
        health_notes: '',
        teacher_note: ''
    });

    useEffect(() => {
        checkPermission();
        fetchClasses();
    }, []);

    useEffect(() => {
        if (selectedClass) {
            fetchStudents();
        }
    }, [selectedClass]);

    async function checkPermission() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        // 簡單權限檢查
        const { data: user } = await supabase.from('users').select('role').eq('id', session.user.id).single();
        if (user?.role === 'parent') {
            alert('權限不足');
            router.push('/');
        }
        setLoading(false);
    }

    async function fetchClasses() {
        // 🔥 抓取 id 和 name，確保我們有完整的班級資料
        const { data } = await supabase.from('classes').select('id, name').order('name');
        if (data) {
            setClasses(data);
            if (data.length > 0) setSelectedClass(data[0]); // 預設選第一個班
        }
    }

    async function fetchStudents() {
        if (!selectedClass) return;

        // 🔥 優先使用 class_id 查詢 (最準確)，如果沒有則 fallback 到 grade 文字
        let query = supabase.from('students').select('*').order('chinese_name');

        if (selectedClass.id) {
            query = query.eq('class_id', selectedClass.id);
        } else {
            query = query.eq('grade', selectedClass.name);
        }

        const { data } = await query;
        if (data) setStudents(data);
    }

    function openModal(student: any = null) {
        setEditingStudent(student);
        if (student) {
            // 編輯模式：載入舊資料
            setFormData({
                chinese_name: student.chinese_name || '',
                english_name: student.english_name || '',
                student_id_display: student.student_id_display || '',
                birthday: student.birthday || '',
                grade: student.grade || selectedClass?.name || '',
                class_id: student.class_id || selectedClass?.id || '',
                photo_url: student.photo_url || '',
                parent_name_1: student.parent_name_1 || '',
                parent_phone_1: student.parent_phone_1 || '',
                parent_name_2: student.parent_name_2 || '',
                parent_phone_2: student.parent_phone_2 || '',
                pickup_method: student.pickup_method || '家長接送',
                allergies: student.allergies || '',
                health_notes: student.health_notes || '',
                teacher_note: student.teacher_note || ''
            });
        } else {
            // 新增模式：預帶當前班級
            setFormData({
                chinese_name: '',
                english_name: '',
                student_id_display: '',
                birthday: '',
                grade: selectedClass?.name || '', // 自動填入當前班級名稱
                class_id: selectedClass?.id || '', // 自動填入當前班級 ID
                photo_url: '',
                parent_name_1: '',
                parent_phone_1: '',
                parent_name_2: '',
                parent_phone_2: '',
                pickup_method: '家長接送',
                allergies: '',
                health_notes: '',
                teacher_note: ''
            });
        }
        setIsModalOpen(true);
    }

    async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
        try {
            if (!event.target.files || event.target.files.length === 0) return;
            setUploading(true);
            const file = event.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `avatar-${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('contact-book-photos')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('contact-book-photos')
                .getPublicUrl(fileName);

            setFormData(prev => ({ ...prev, photo_url: publicUrl }));

        } catch (error: any) {
            alert('上傳失敗: ' + error.message);
        } finally {
            setUploading(false);
        }
    }

    // 🔥 處理班級變更 (連動 ID 和 Name)
    function handleGradeChange(e: React.ChangeEvent<HTMLSelectElement>) {
        const newClassName = e.target.value;
        const targetClass = classes.find(c => c.name === newClassName);
        setFormData(prev => ({
            ...prev,
            grade: newClassName,
            class_id: targetClass ? targetClass.id : '' // 自動更新 ID
        }));
    }

    async function handleSave() {
        if (!formData.chinese_name) {
            alert('請輸入中文姓名');
            return;
        }

        try {
            if (editingStudent) {
                const { error } = await supabase
                    .from('students')
                    .update(formData)
                    .eq('id', editingStudent.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('students')
                    .insert(formData);
                if (error) throw error;
            }

            alert('儲存成功！');
            setIsModalOpen(false);
            fetchStudents();

        } catch (e: any) {
            alert('儲存失敗: ' + e.message);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('確定要刪除這位學生嗎？此動作無法復原。')) return;
        const { error } = await supabase.from('students').delete().eq('id', id);
        if (!error) {
            alert('已刪除');
            fetchStudents();
        } else {
            alert('刪除失敗: ' + error.message);
        }
    }

    if (loading) return <div className="p-10 text-center">載入中...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                    <h1 className="text-2xl font-black text-gray-800">🎓 學生資料管理</h1>
                    <div className="flex gap-2">
                        {/* 班級選擇器 */}
                        <select
                            value={selectedClass?.name || ''}
                            onChange={e => {
                                const cls = classes.find(c => c.name === e.target.value);
                                setSelectedClass(cls);
                            }}
                            className="p-2 border rounded-lg font-bold text-gray-700"
                        >
                            <option value="" disabled>選擇班級</option>
                            {classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                        <button
                            onClick={() => openModal(null)}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-indigo-700 transition"
                        >
                            + 新增學生
                        </button>
                        <button onClick={() => router.push('/')} className="bg-white text-gray-500 px-4 py-2 rounded-lg border hover:bg-gray-50 transition">離開</button>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="p-4 w-16">照片</th>
                                <th className="p-4">姓名</th>
                                <th className="p-4">英文名</th>
                                <th className="p-4">家長</th>
                                <th className="p-4">電話</th>
                                <th className="p-4 text-center">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {students.map(student => (
                                <tr key={student.id} className="hover:bg-gray-50 transition">
                                    <td className="p-4">
                                        <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden border border-gray-100">
                                            {student.photo_url ? (
                                                <img src={student.photo_url} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No Pic</div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 font-bold text-gray-800">{student.chinese_name}</td>
                                    <td className="p-4 text-indigo-600 font-medium">{student.english_name || '-'}</td>
                                    <td className="p-4 text-gray-600">{student.parent_name_1 || '-'}</td>
                                    <td className="p-4 font-mono text-gray-500">{student.parent_phone_1 || '-'}</td>
                                    <td className="p-4 text-center">
                                        <button onClick={() => openModal(student)} className="text-indigo-600 hover:text-indigo-800 font-bold mr-3">編輯</button>
                                        <button onClick={() => handleDelete(student.id)} className="text-red-400 hover:text-red-600">刪除</button>
                                    </td>
                                </tr>
                            ))}
                            {students.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-10 text-center text-gray-400">此班級尚無學生資料</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Modal */}
                {isModalOpen && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 animate-fade-in-up">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-2xl font-black text-gray-800">
                                    {editingStudent ? '✏️ 編輯學生資料' : '👶 新增學生'}
                                </h2>
                                <button onClick={() => setIsModalOpen(false)} className="bg-gray-100 p-2 rounded-full hover:bg-gray-200">✕</button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Column 1: Basic Info */}
                                <div className="space-y-4">
                                    <div className="text-center">
                                        <label className="block relative w-32 h-32 mx-auto rounded-full bg-gray-100 border-2 border-dashed border-gray-300 hover:border-indigo-500 cursor-pointer overflow-hidden group transition">
                                            {formData.photo_url ? (
                                                <img src={formData.photo_url} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                                                    <span className="text-2xl">📷</span>
                                                    <span className="text-xs">上傳照片</span>
                                                </div>
                                            )}
                                            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
                                            {uploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xs">上傳中...</div>}
                                        </label>
                                        <p className="text-xs text-gray-400 mt-2">點擊更換大頭照</p>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500">中文姓名 *</label>
                                        <input type="text" value={formData.chinese_name} onChange={e => setFormData({ ...formData, chinese_name: e.target.value })} className="w-full p-2 border rounded-lg font-bold" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500">英文姓名</label>
                                        <input type="text" value={formData.english_name} onChange={e => setFormData({ ...formData, english_name: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="e.g. Tom Bear" />
                                    </div>

                                    {/* 🔥 班級選擇 (確保連動 class_id) */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500">所屬班級</label>
                                        <select value={formData.grade} onChange={handleGradeChange} className="w-full p-2 border rounded-lg">
                                            {classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                        </select>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500">顯示學號</label>
                                        <input type="text" value={formData.student_id_display} onChange={e => setFormData({ ...formData, student_id_display: e.target.value })} className="w-full p-2 border rounded-lg font-mono" placeholder="S2026001" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500">生日</label>
                                        <input type="date" value={formData.birthday} onChange={e => setFormData({ ...formData, birthday: e.target.value })} className="w-full p-2 border rounded-lg" />
                                    </div>
                                </div>

                                {/* Column 2: Contact Info */}
                                <div className="space-y-4">
                                    <h3 className="font-bold text-indigo-900 border-b pb-2">📞 聯絡資訊</h3>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-gray-500">第一聯絡人</label>
                                            <input type="text" value={formData.parent_name_1} onChange={e => setFormData({ ...formData, parent_name_1: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="父親/母親" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-gray-500">電話</label>
                                            <input type="text" value={formData.parent_phone_1} onChange={e => setFormData({ ...formData, parent_phone_1: e.target.value })} className="w-full p-2 border rounded-lg" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-gray-500">第二聯絡人</label>
                                            <input type="text" value={formData.parent_name_2} onChange={e => setFormData({ ...formData, parent_name_2: e.target.value })} className="w-full p-2 border rounded-lg" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-gray-500">電話</label>
                                            <input type="text" value={formData.parent_phone_2} onChange={e => setFormData({ ...formData, parent_phone_2: e.target.value })} className="w-full p-2 border rounded-lg" />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500">放學接送方式</label>
                                        <select value={formData.pickup_method} onChange={e => setFormData({ ...formData, pickup_method: e.target.value })} className="w-full p-2 border rounded-lg">
                                            <option value="家長接送">家長接送</option>
                                            <option value="自行回家">自行回家</option>
                                            <option value="安親班接送">安親班接送</option>
                                            <option value="校車">校車</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Column 3: Health & Notes */}
                                <div className="space-y-4">
                                    <h3 className="font-bold text-red-900 border-b pb-2">❤️ 健康與備註</h3>

                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500">過敏原註記 (家長可見)</label>
                                        <textarea value={formData.allergies} onChange={e => setFormData({ ...formData, allergies: e.target.value })} className="w-full p-2 border rounded-lg h-20 resize-none border-red-100 bg-red-50 focus:bg-white" placeholder="例如：花生過敏..." />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500">特殊照護需求 (家長可見)</label>
                                        <textarea value={formData.health_notes} onChange={e => setFormData({ ...formData, health_notes: e.target.value })} className="w-full p-2 border rounded-lg h-20 resize-none" placeholder="例如：需協助餵藥..." />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-indigo-600">🔒 老師內部備註 (家長不可見)</label>
                                        <textarea value={formData.teacher_note} onChange={e => setFormData({ ...formData, teacher_note: e.target.value })} className="w-full p-2 border rounded-lg h-24 resize-none bg-yellow-50 border-yellow-200" placeholder="例如：性格活潑，上課容易分心..." />
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 pt-4 border-t flex justify-end gap-3">
                                <button onClick={() => setIsModalOpen(false)} className="px-6 py-2 rounded-lg text-gray-500 font-bold hover:bg-gray-100">取消</button>
                                <button onClick={handleSave} className="px-6 py-2 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-lg">
                                    {editingStudent ? '💾 儲存修改' : '✅ 建立學生'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}