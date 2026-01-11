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
    const [selectedClass, setSelectedClass] = useState<any>(null);

    // Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingStudent, setEditingStudent] = useState<any>(null);

    // Form Data
    const [formData, setFormData] = useState({
        chinese_name: '',
        english_name: '',
        student_id_display: '',
        birthday: '',
        grade: '',
        class_id: '',
        photo_url: '',

        // 👨‍👩‍👧‍👦 雙家長設定
        parent_email: '',    // 家長 1 Email
        parent_id: '',       // 家長 1 ID (隱藏)

        parent_email_2: '',  // 家長 2 Email
        parent_id_2: '',     // 家長 2 ID (隱藏)

        parent_name_1: '',   // 家長 1 稱謂/姓名
        parent_phone_1: '',
        parent_name_2: '',   // 家長 2 稱謂/姓名
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
        const { data: user } = await supabase.from('users').select('role').eq('id', session.user.id).single();
        if (user?.role === 'parent') {
            alert('權限不足');
            router.push('/');
        }
        setLoading(false);
    }

    async function fetchClasses() {
        const { data } = await supabase.from('classes').select('id, name').order('name');
        if (data) {
            setClasses(data);
            if (data.length > 0) setSelectedClass(data[0]);
        }
    }

    async function fetchStudents() {
        if (!selectedClass) return;
        let query = supabase.from('students').select('*').order('chinese_name');
        if (selectedClass.id) {
            query = query.eq('class_id', selectedClass.id);
        } else {
            query = query.eq('grade', selectedClass.name);
        }
        const { data } = await query;
        if (data) setStudents(data);
    }

    // 🔥 核心：打開視窗時，自動補全 Email 資料
    async function openModal(student: any = null) {
        setEditingStudent(student);

        if (student) {
            // 1. 先填入學生表裡有的資料
            let email1 = student.parent_email || '';
            let email2 = student.parent_email_2 || '';

            // 2. 🔥 自動修復：如果已綁定但 Email 是空的，去 User 表抓回來顯示！
            if (!email1 && student.parent_id) {
                const { data: user1 } = await supabase.from('users').select('email').eq('id', student.parent_id).single();
                if (user1) email1 = user1.email;
            }
            if (!email2 && student.parent_id_2) {
                const { data: user2 } = await supabase.from('users').select('email').eq('id', student.parent_id_2).single();
                if (user2) email2 = user2.email;
            }

            setFormData({
                chinese_name: student.chinese_name || '',
                english_name: student.english_name || '',
                student_id_display: student.student_id_display || '',
                birthday: student.birthday || '',
                grade: student.grade || selectedClass?.name || '',
                class_id: student.class_id || selectedClass?.id || '',
                photo_url: student.photo_url || '',

                parent_email: email1,
                parent_id: student.parent_id || '',

                parent_email_2: email2,
                parent_id_2: student.parent_id_2 || '',

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
            // 新增模式
            setFormData({
                chinese_name: '',
                english_name: '',
                student_id_display: '',
                birthday: '',
                grade: selectedClass?.name || '',
                class_id: selectedClass?.id || '',
                photo_url: '',

                parent_email: '',
                parent_id: '',
                parent_email_2: '',
                parent_id_2: '',

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
            const { error: uploadError } = await supabase.storage.from('contact-book-photos').upload(fileName, file);
            if (uploadError) throw uploadError;
            const { data: { publicUrl } } = supabase.storage.from('contact-book-photos').getPublicUrl(fileName);
            setFormData(prev => ({ ...prev, photo_url: publicUrl }));
        } catch (error: any) { alert('上傳失敗: ' + error.message); } finally { setUploading(false); }
    }

    function handleGradeChange(e: React.ChangeEvent<HTMLSelectElement>) {
        const newClassName = e.target.value;
        const targetClass = classes.find(c => c.name === newClassName);
        setFormData(prev => ({
            ...prev,
            grade: newClassName,
            class_id: targetClass ? targetClass.id : ''
        }));
    }

    // 🔥 智慧綁定：同時檢查兩個 Email
    async function handleSave() {
        if (!formData.chinese_name) { alert('請輸入中文姓名'); return; }

        try {
            let pid1 = formData.parent_id;
            let pid2 = formData.parent_id_2;

            // 檢查家長 1 Email
            if (formData.parent_email && !pid1) {
                const { data: u1 } = await supabase.from('users').select('id').eq('email', formData.parent_email.trim()).single();
                if (u1) pid1 = u1.id;
            }
            // 檢查家長 2 Email
            if (formData.parent_email_2 && !pid2) {
                const { data: u2 } = await supabase.from('users').select('id').eq('email', formData.parent_email_2.trim()).single();
                if (u2) pid2 = u2.id;
            }

            const payload = {
                ...formData,
                parent_id: pid1 || null,
                parent_id_2: pid2 || null,
                // 確保 email 欄位也被更新 (作為顯示用)
                parent_email: formData.parent_email,
                parent_email_2: formData.parent_email_2
            };

            if (editingStudent) {
                const { error } = await supabase.from('students').update(payload).eq('id', editingStudent.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('students').insert(payload);
                if (error) throw error;
            }

            let msg = '儲存成功！';
            if (pid1 && pid2) msg += ' (兩位家長皆已連結)';
            else if (pid1 || pid2) msg += ' (已連結一位家長)';
            else if (formData.parent_email || formData.parent_email_2) msg += ' (等待家長註冊中)';

            alert(msg);
            setIsModalOpen(false);
            fetchStudents();

        } catch (e: any) {
            alert('儲存失敗: ' + e.message);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('確定要刪除這位學生嗎？此動作無法復原。')) return;
        const { error } = await supabase.from('students').delete().eq('id', id);
        if (!error) { alert('已刪除'); fetchStudents(); }
    }

    // 解除綁定 (指定解除哪一個)
    async function handleUnbind(studentId: string, slot: 1 | 2) {
        if (!confirm(`確定要解除「家長 ${slot}」的綁定嗎？`)) return;

        const updateData = slot === 1
            ? { parent_id: null, parent_email: null }
            : { parent_id_2: null, parent_email_2: null };

        const { error } = await supabase.from('students').update(updateData).eq('id', studentId);
        if (!error) { alert('已解除綁定'); fetchStudents(); }
    }

    if (loading) return <div className="p-10 text-center">載入中...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                    <h1 className="text-2xl font-black text-gray-800">🎓 學生資料管理</h1>
                    <div className="flex gap-2">
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
                        <button onClick={() => openModal(null)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-indigo-700 transition">+ 新增學生</button>
                        <button onClick={() => router.push('/')} className="bg-white text-gray-500 px-4 py-2 rounded-lg border hover:bg-gray-50 transition">離開</button>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="p-4 w-16">照片</th>
                                <th className="p-4">姓名</th>
                                <th className="p-4 w-64">家長帳號綁定狀態</th>
                                <th className="p-4">緊急聯絡人</th>
                                <th className="p-4 text-center">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {students.map(student => (
                                <tr key={student.id} className="hover:bg-gray-50 transition">
                                    <td className="p-4">
                                        <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden border border-gray-100">
                                            {student.photo_url ? <img src={student.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No Pic</div>}
                                        </div>
                                    </td>
                                    <td className="p-4 font-bold text-gray-800">
                                        <div>{student.chinese_name}</div>
                                        <div className="text-xs text-indigo-500 font-normal">{student.english_name}</div>
                                    </td>

                                    {/* 🔥 雙家長狀態顯示 */}
                                    <td className="p-4">
                                        <div className="flex flex-col gap-2">
                                            {/* 家長 1 */}
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-gray-400 w-4">1</span>
                                                {student.parent_id ? (
                                                    <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">✅ {student.parent_email || '已綁定'}</span>
                                                ) : student.parent_email ? (
                                                    <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-bold">⏳ 等待 {student.parent_email}</span>
                                                ) : <span className="text-[10px] text-gray-300">-</span>}
                                            </div>
                                            {/* 家長 2 */}
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-gray-400 w-4">2</span>
                                                {student.parent_id_2 ? (
                                                    <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">✅ {student.parent_email_2 || '已綁定'}</span>
                                                ) : student.parent_email_2 ? (
                                                    <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-bold">⏳ 等待 {student.parent_email_2}</span>
                                                ) : <span className="text-[10px] text-gray-300">-</span>}
                                            </div>
                                        </div>
                                    </td>

                                    <td className="p-4">
                                        <div className="text-sm text-gray-600">{student.parent_name_1} <span className="text-gray-400 text-xs">{student.parent_phone_1}</span></div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <button onClick={() => openModal(student)} className="text-indigo-600 hover:text-indigo-800 font-bold mr-3">編輯</button>
                                        <button onClick={() => handleDelete(student.id)} className="text-red-400 hover:text-red-600">刪除</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Modal */}
                {isModalOpen && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 animate-fade-in-up">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-2xl font-black text-gray-800">{editingStudent ? '✏️ 編輯學生資料' : '👶 新增學生'}</h2>
                                <button onClick={() => setIsModalOpen(false)} className="bg-gray-100 p-2 rounded-full hover:bg-gray-200">✕</button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Basic Info */}
                                <div className="space-y-4">
                                    <div className="text-center">
                                        <label className="block relative w-32 h-32 mx-auto rounded-full bg-gray-100 border-2 border-dashed border-gray-300 hover:border-indigo-500 cursor-pointer overflow-hidden group transition">
                                            {formData.photo_url ? <img src={formData.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex flex-col items-center justify-center text-gray-400"><span className="text-2xl">📷</span><span className="text-xs">上傳照片</span></div>}
                                            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
                                        </label>
                                    </div>
                                    <div className="space-y-2"><label className="text-xs font-bold text-gray-500">中文姓名 *</label><input type="text" value={formData.chinese_name} onChange={e => setFormData({ ...formData, chinese_name: e.target.value })} className="w-full p-2 border rounded-lg font-bold" /></div>
                                    <div className="space-y-2"><label className="text-xs font-bold text-gray-500">英文姓名</label><input type="text" value={formData.english_name} onChange={e => setFormData({ ...formData, english_name: e.target.value })} className="w-full p-2 border rounded-lg" /></div>
                                    <div className="space-y-2"><label className="text-xs font-bold text-gray-500">所屬班級</label><select value={formData.grade} onChange={handleGradeChange} className="w-full p-2 border rounded-lg">{classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div>
                                    <div className="space-y-2"><label className="text-xs font-bold text-gray-500">生日</label><input type="date" value={formData.birthday} onChange={e => setFormData({ ...formData, birthday: e.target.value })} className="w-full p-2 border rounded-lg" /></div>
                                </div>

                                {/* Contact & Binding */}
                                <div className="space-y-4">
                                    <h3 className="font-bold text-indigo-900 border-b pb-2">📞 帳號綁定與聯絡</h3>

                                    {/* 🔥 家長 1 綁定區 */}
                                    <div className="bg-green-50 p-3 rounded-xl border border-green-100">
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-xs font-bold text-green-800">主要照顧者 (家長 1)</label>
                                            {formData.parent_id && <button onClick={() => handleUnbind(editingStudent.id, 1)} className="text-[10px] text-red-400 underline">解除綁定</button>}
                                        </div>
                                        <input type="email" value={formData.parent_email} onChange={e => setFormData({ ...formData, parent_email: e.target.value })} className="w-full p-2 border rounded-lg text-sm mb-2" placeholder="輸入 Email 自動連結..." />
                                        <div className="grid grid-cols-2 gap-2">
                                            <input type="text" value={formData.parent_name_1} onChange={e => setFormData({ ...formData, parent_name_1: e.target.value })} className="p-2 border rounded-lg text-xs" placeholder="稱謂 (父/母)" />
                                            <input type="text" value={formData.parent_phone_1} onChange={e => setFormData({ ...formData, parent_phone_1: e.target.value })} className="p-2 border rounded-lg text-xs" placeholder="電話" />
                                        </div>
                                    </div>

                                    {/* 🔥 家長 2 綁定區 */}
                                    <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-xs font-bold text-blue-800">共同照顧者 (家長 2)</label>
                                            {formData.parent_id_2 && <button onClick={() => handleUnbind(editingStudent.id, 2)} className="text-[10px] text-red-400 underline">解除綁定</button>}
                                        </div>
                                        <input type="email" value={formData.parent_email_2} onChange={e => setFormData({ ...formData, parent_email_2: e.target.value })} className="w-full p-2 border rounded-lg text-sm mb-2" placeholder="輸入第二位家長 Email..." />
                                        <div className="grid grid-cols-2 gap-2">
                                            <input type="text" value={formData.parent_name_2} onChange={e => setFormData({ ...formData, parent_name_2: e.target.value })} className="p-2 border rounded-lg text-xs" placeholder="稱謂 (父/母)" />
                                            <input type="text" value={formData.parent_phone_2} onChange={e => setFormData({ ...formData, parent_phone_2: e.target.value })} className="p-2 border rounded-lg text-xs" placeholder="電話" />
                                        </div>
                                    </div>

                                    <div className="space-y-1 mt-2">
                                        <label className="text-xs font-bold text-gray-500">放學接送方式</label>
                                        <select value={formData.pickup_method} onChange={e => setFormData({ ...formData, pickup_method: e.target.value })} className="w-full p-2 border rounded-lg"><option value="家長接送">家長接送</option><option value="自行回家">自行回家</option><option value="安親班接送">安親班接送</option><option value="校車">校車</option></select>
                                    </div>
                                </div>

                                {/* Health */}
                                <div className="space-y-4">
                                    <h3 className="font-bold text-red-900 border-b pb-2">❤️ 健康與備註</h3>
                                    <div className="space-y-2"><label className="text-xs font-bold text-gray-500">過敏原註記</label><textarea value={formData.allergies} onChange={e => setFormData({ ...formData, allergies: e.target.value })} className="w-full p-2 border rounded-lg h-20 resize-none border-red-100 bg-red-50 focus:bg-white" placeholder="例如：花生過敏..." /></div>
                                    <div className="space-y-2"><label className="text-xs font-bold text-gray-500">特殊照護需求</label><textarea value={formData.health_notes} onChange={e => setFormData({ ...formData, health_notes: e.target.value })} className="w-full p-2 border rounded-lg h-20 resize-none" placeholder="例如：需協助餵藥..." /></div>
                                    <div className="space-y-2"><label className="text-xs font-bold text-indigo-600">🔒 老師內部備註</label><textarea value={formData.teacher_note} onChange={e => setFormData({ ...formData, teacher_note: e.target.value })} className="w-full p-2 border rounded-lg h-24 resize-none bg-yellow-50 border-yellow-200" placeholder="例如：性格活潑..." /></div>
                                </div>
                            </div>

                            <div className="mt-8 pt-4 border-t flex justify-end gap-3">
                                <button onClick={() => setIsModalOpen(false)} className="px-6 py-2 rounded-lg text-gray-500 font-bold hover:bg-gray-100">取消</button>
                                <button onClick={handleSave} className="px-6 py-2 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-lg">{editingStudent ? '💾 儲存修改' : '✅ 建立學生'}</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}