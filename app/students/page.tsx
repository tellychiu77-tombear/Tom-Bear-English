'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

// 🎓 1. 英文班級選項 (含 "無")
const ENGLISH_CLASS_OPTIONS = [
    { value: 'NONE', label: '❌ 無英文主修 (純安親/課輔)' },
    ...Array.from({ length: 26 }, (_, i) => ({
        value: `CEI-${String.fromCharCode(65 + i)}`,
        label: `CEI-${String.fromCharCode(65 + i)}`
    }))
];

// 🏫 2. 學校年級選項
const SCHOOL_GRADE_OPTIONS = [
    '國小 一年級', '國小 二年級', '國小 三年級', '國小 四年級', '國小 五年級', '國小 六年級',
    '國中 七年級', '國中 八年級', '國中 九年級'
];

export default function StudentsPage() {
    const router = useRouter();
    const [students, setStudents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterClass, setFilterClass] = useState(''); // 篩選用

    // Modal 狀態
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
    const [currentId, setCurrentId] = useState<string | null>(null);

    // --- 📝 完整表單資料 ---
    const [formData, setFormData] = useState({
        chinese_name: '',
        english_name: '',
        birthday: '',
        school_grade: '國小 一年級',
        english_class: 'CEI-A',
        is_after_school: false,
        parent_email: '',
        parent_relationship: '',
        parent_phone: '',
        parent_2_email: '',
        parent_2_relationship: '',
        parent_2_phone: '',
        pickup_method: '家長接送',
        allergies: '',
        special_needs: '',
        internal_note: '',
        photo_url: ''
    });

    // 照片上傳 Ref
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        checkPermissionAndFetch();
    }, []);

    async function checkPermissionAndFetch() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        // 🔥 更新 1：權限檢查加入主任與老師
        const { data: userData } = await supabase.from('users').select('role').eq('id', session.user.id).single();
        if (!userData || !['director', 'english_director', 'care_director', 'admin', 'teacher'].includes(userData.role)) {
            alert('⛔ 您沒有權限進入此頁面');
            router.push('/');
            return;
        }

        fetchStudents();
    }

    async function fetchStudents() {
        setLoading(true);
        // 保留您原本強大的關聯查詢 (Join)
        const { data, error } = await supabase
            .from('students')
            .select(`
                *,
                parent:users!parent_id(email),
                parent2:users!parent_id_2(email)
            `)
            .order('grade')
            .order('chinese_name');

        if (error) console.error(error);
        else setStudents(data || []);
        setLoading(false);
    }

    // --- 邏輯核心：解析與組合班級字串 ---
    function parseGradeToForm(fullGrade: string) {
        if (!fullGrade) return { eng: 'CEI-A', after: false };
        const hasAfterSchool = fullGrade.includes('課後輔導');
        let engClass = fullGrade.replace(', 課後輔導', '').replace('課後輔導', '').trim();
        if (engClass.endsWith(',') || engClass.endsWith('，')) engClass = engClass.slice(0, -1).trim();
        if (!engClass || engClass === '未分類') engClass = 'NONE';
        return { eng: engClass || 'CEI-A', after: hasAfterSchool };
    }

    function combineFormToGrade(eng: string, after: boolean) {
        if (eng === 'NONE' && after) return '課後輔導';
        if (eng === 'NONE' && !after) return '未分類';
        if (after) return `${eng}, 課後輔導`;
        return eng;
    }

    // --- Modal 操作 ---
    function openAddModal() {
        setModalMode('add');
        setCurrentId(null);
        setFormData({
            chinese_name: '', english_name: '', birthday: '', school_grade: '國小 一年級',
            english_class: 'CEI-A', is_after_school: false,
            parent_email: '', parent_relationship: '', parent_phone: '',
            parent_2_email: '', parent_2_relationship: '', parent_2_phone: '',
            pickup_method: '家長接送', allergies: '', special_needs: '', internal_note: '', photo_url: ''
        });
        setIsModalOpen(true);
    }

    function openEditModal(s: any) {
        setModalMode('edit');
        setCurrentId(s.id);
        const { eng, after } = parseGradeToForm(s.grade);

        setFormData({
            chinese_name: s.chinese_name,
            english_name: s.english_name || '',
            birthday: s.birthday || '',
            school_grade: s.school_grade || '國小 一年級',
            english_class: eng,
            is_after_school: after,
            parent_email: s.parent?.email || '',
            parent_relationship: s.parent_relationship || '',
            parent_phone: s.parent_phone || '',
            parent_2_email: s.parent2?.email || '',
            parent_2_relationship: s.parent_2_relationship || '',
            parent_2_phone: s.parent_2_phone || '',
            pickup_method: s.pickup_method || '家長接送',
            allergies: s.allergies || '',
            special_needs: s.special_needs || '',
            internal_note: s.internal_note || '',
            photo_url: s.photo_url || ''
        });
        setIsModalOpen(true);
    }

    // --- 照片上傳 ---
    async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const fileName = `avatars/${Date.now()}_${file.name}`;
            const { error } = await supabase.storage.from('contact_photos').upload(fileName, file);
            if (error) throw error;
            const { data } = supabase.storage.from('contact_photos').getPublicUrl(fileName);
            setFormData({ ...formData, photo_url: data.publicUrl });
        } catch (err: any) {
            alert('上傳失敗: ' + err.message);
        } finally {
            setUploading(false);
        }
    }

    // --- 儲存資料 ---
    async function handleSubmit() {
        if (!formData.chinese_name) return alert('請輸入中文姓名');

        try {
            // 尋找家長 ID
            let p1_id = null;
            if (formData.parent_email) {
                const { data } = await supabase.from('users').select('id').eq('email', formData.parent_email).single();
                if (data) p1_id = data.id;
            }

            let p2_id = null;
            if (formData.parent_2_email) {
                const { data } = await supabase.from('users').select('id').eq('email', formData.parent_2_email).single();
                if (data) p2_id = data.id;
            }

            const finalGrade = combineFormToGrade(formData.english_class, formData.is_after_school);

            const payload = {
                chinese_name: formData.chinese_name,
                english_name: formData.english_name,
                grade: finalGrade,
                school_grade: formData.school_grade,
                birthday: formData.birthday || null,
                pickup_method: formData.pickup_method,
                allergies: formData.allergies,
                special_needs: formData.special_needs,
                internal_note: formData.internal_note,
                photo_url: formData.photo_url,
                parent_id: p1_id,
                parent_relationship: formData.parent_relationship,
                parent_phone: formData.parent_phone,
                parent_id_2: p2_id,
                parent_2_relationship: formData.parent_2_relationship,
                parent_2_phone: formData.parent_2_phone
            };

            if (modalMode === 'add') {
                const { error } = await supabase.from('students').insert(payload);
                if (error) throw error;
                alert('✅ 學生新增成功！');
            } else {
                const { error } = await supabase.from('students').update(payload).eq('id', currentId);
                if (error) throw error;
                alert('✅ 資料更新成功！');
            }

            setIsModalOpen(false);
            fetchStudents();
        } catch (e: any) {
            alert('❌ 失敗: ' + e.message);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('⚠️ 確定要刪除嗎？')) return;
        await supabase.from('students').delete().eq('id', id);
        fetchStudents();
    }

    const filteredStudents = filterClass
        ? students.filter(s => s.grade?.includes(filterClass))
        : students;

    const uniqueClasses = Array.from(new Set(students.map(s => s.grade))).filter(Boolean).sort();

    if (loading) return <div className="p-10 text-center font-bold text-gray-400">載入中...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6 font-sans">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                    <h1 className="text-3xl font-black text-gray-800">📂 學生資料庫</h1>
                    <div className="flex gap-3">
                        {/* 🔥 更新 2：回首頁按鈕 */}
                        <button onClick={() => router.push('/')} className="bg-white border px-4 py-2 rounded-lg font-bold text-gray-600 hover:bg-gray-50 transition shadow-sm">
                            🏠 回首頁
                        </button>

                        <select
                            value={filterClass}
                            onChange={e => setFilterClass(e.target.value)}
                            className="p-2 border border-gray-300 rounded-lg font-bold text-gray-700 outline-none"
                        >
                            <option value="">🏫 顯示全部</option>
                            {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <button onClick={openAddModal} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold shadow-lg hover:bg-indigo-700 transition">
                            + 新增學生
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="w-full text-left whitespace-nowrap">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="p-4 text-xs font-black text-gray-400">學生</th>
                                <th className="p-4 text-xs font-black text-gray-400">補習班級 / 學校年級</th>
                                <th className="p-4 text-xs font-black text-gray-400">家長綁定狀態</th>
                                <th className="p-4 text-right text-xs font-black text-gray-400">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredStudents.map(s => (
                                <tr key={s.id} className="hover:bg-gray-50 transition group">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            {s.photo_url ? (
                                                <img src={s.photo_url} className="w-10 h-10 rounded-full object-cover border border-gray-200" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black">
                                                    {s.chinese_name[0]}
                                                </div>
                                            )}
                                            <div>
                                                <div className="font-bold text-gray-800">{s.chinese_name}</div>
                                                <div className="text-xs text-gray-400 font-bold">{s.english_name}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex flex-col gap-1 items-start">
                                            {/* 🔥 更新 3：漂亮的彩色班級標籤 */}
                                            {s.grade && s.grade.split(',').map((g: string, i: number) => (
                                                <span key={i} className={`px-2 py-0.5 rounded text-[10px] font-black border inline-block ${g.includes('課後輔導') ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                                        g.includes('CEI') ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                                                            'bg-gray-100 text-gray-600 border-gray-200'
                                                    }`}>
                                                    {g.trim()}
                                                </span>
                                            ))}
                                            <span className="text-xs text-gray-400 font-bold ml-1">
                                                🏫 {s.school_grade || '未設定'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex flex-col gap-1">
                                            {s.parent ? (
                                                <span className="text-green-600 text-xs font-bold flex items-center gap-1">
                                                    ✅ 父/母 ({s.parent.email})
                                                </span>
                                            ) : <span className="text-gray-300 text-xs">❌ 父/母未綁定</span>}
                                            {s.parent2 && (
                                                <span className="text-blue-600 text-xs font-bold flex items-center gap-1">
                                                    ✅ 家長2 ({s.parent2.email})
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 text-right">
                                        <button onClick={() => openEditModal(s)} className="text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded font-bold text-xs transition mr-2">編輯</button>
                                        <button onClick={() => handleDelete(s.id)} className="text-red-400 hover:bg-red-50 px-3 py-1.5 rounded font-bold text-xs transition">刪除</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ✏️ 全功能編輯視窗 (完全保留您原本的設計) */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-fade-in p-8">
                        <div className="flex justify-between items-center mb-6 border-b pb-4">
                            <h2 className="text-2xl font-black text-gray-800">
                                {modalMode === 'add' ? '➕ 新增學生資料' : '✏️ 編輯學生資料'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold">✕</button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            {/* 左側：基本資料 & 照片 */}
                            <div className="space-y-6">
                                <div className="flex flex-col items-center">
                                    <div className="w-32 h-32 rounded-full bg-gray-100 border-4 border-white shadow-lg overflow-hidden relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                        {formData.photo_url ? (
                                            <img src={formData.photo_url} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                                                <span className="text-2xl">📷</span>
                                                <span className="text-xs font-bold mt-1">上傳照片</span>
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition">更換</div>
                                    </div>
                                    <input type="file" ref={fileInputRef} className="hidden" onChange={handlePhotoUpload} accept="image/*" />
                                    {uploading && <span className="text-xs text-indigo-500 mt-2 font-bold">上傳中...</span>}
                                </div>

                                <div className="space-y-3">
                                    <div>
                                        <label className="text-xs font-bold text-gray-400 ml-1">中文姓名 *</label>
                                        <input type="text" value={formData.chinese_name} onChange={e => setFormData({ ...formData, chinese_name: e.target.value })} className="w-full p-3 border rounded-xl font-bold bg-gray-50 focus:bg-white outline-none focus:ring-2 focus:ring-indigo-100" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-400 ml-1">英文姓名</label>
                                        <input type="text" value={formData.english_name} onChange={e => setFormData({ ...formData, english_name: e.target.value })} className="w-full p-3 border rounded-xl font-bold bg-gray-50 focus:bg-white outline-none focus:ring-2 focus:ring-indigo-100" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-400 ml-1">生日</label>
                                        <input type="date" value={formData.birthday} onChange={e => setFormData({ ...formData, birthday: e.target.value })} className="w-full p-3 border rounded-xl font-bold bg-gray-50 focus:bg-white outline-none focus:ring-2 focus:ring-indigo-100" />
                                    </div>
                                </div>
                            </div>

                            {/* 中間：班級設定 & 家長資料 */}
                            <div className="space-y-6">
                                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                                    <h3 className="text-sm font-black text-indigo-800 mb-3">🎓 班級與年級設定</h3>
                                    <div className="mb-3">
                                        <label className="text-xs font-bold text-indigo-400 ml-1">學校年級 (School Grade)</label>
                                        <select value={formData.school_grade} onChange={e => setFormData({ ...formData, school_grade: e.target.value })} className="w-full p-2 border rounded-lg font-bold text-sm">
                                            {SCHOOL_GRADE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                    </div>
                                    <div className="mb-3">
                                        <label className="text-xs font-bold text-indigo-400 ml-1">英文主修班級</label>
                                        <select value={formData.english_class} onChange={e => setFormData({ ...formData, english_class: e.target.value })} className="w-full p-2 border rounded-lg font-bold text-sm">
                                            {ENGLISH_CLASS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-indigo-100">
                                        <input type="checkbox" checked={formData.is_after_school} onChange={e => setFormData({ ...formData, is_after_school: e.target.checked })} className="w-5 h-5 accent-indigo-600" />
                                        <span className="text-sm font-bold text-gray-700">✅ 參加課後輔導</span>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-xs font-black text-gray-400 mb-2 uppercase">📞 家長聯繫資料</h3>
                                    <div className="space-y-3">
                                        <div className="p-3 border rounded-xl bg-gray-50">
                                            <p className="text-xs font-bold text-gray-500 mb-1">主要照顧者 (Email 綁定)</p>
                                            <input type="email" placeholder="家長 Email" value={formData.parent_email} onChange={e => setFormData({ ...formData, parent_email: e.target.value })} className="w-full p-2 border rounded-lg text-sm font-bold mb-2" />
                                            <div className="flex gap-2">
                                                <input type="text" placeholder="稱謂" value={formData.parent_relationship} onChange={e => setFormData({ ...formData, parent_relationship: e.target.value })} className="w-1/3 p-2 border rounded-lg text-sm" />
                                                <input type="text" placeholder="電話" value={formData.parent_phone} onChange={e => setFormData({ ...formData, parent_phone: e.target.value })} className="w-2/3 p-2 border rounded-lg text-sm" />
                                            </div>
                                        </div>
                                        <div className="p-3 border rounded-xl bg-gray-50 border-dashed">
                                            <p className="text-xs font-bold text-gray-400 mb-1">第二位家長 (選填)</p>
                                            <input type="email" placeholder="Email" value={formData.parent_2_email} onChange={e => setFormData({ ...formData, parent_2_email: e.target.value })} className="w-full p-2 border rounded-lg text-sm font-bold mb-2" />
                                            <div className="flex gap-2">
                                                <input type="text" placeholder="稱謂" value={formData.parent_2_relationship} onChange={e => setFormData({ ...formData, parent_2_relationship: e.target.value })} className="w-1/3 p-2 border rounded-lg text-sm" />
                                                <input type="text" placeholder="電話" value={formData.parent_2_phone} onChange={e => setFormData({ ...formData, parent_2_phone: e.target.value })} className="w-2/3 p-2 border rounded-lg text-sm" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 右側：詳細備註 */}
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-400 ml-1">❤️ 健康與過敏備註</label>
                                    <textarea rows={3} placeholder="例如: 花生過敏、蠶豆症..." value={formData.allergies} onChange={e => setFormData({ ...formData, allergies: e.target.value })} className="w-full p-3 border rounded-xl bg-red-50 focus:bg-white outline-none text-sm font-bold resize-none" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-400 ml-1">特殊照護需求</label>
                                    <textarea rows={3} placeholder="例如: 需協助餵藥..." value={formData.special_needs} onChange={e => setFormData({ ...formData, special_needs: e.target.value })} className="w-full p-3 border rounded-xl bg-gray-50 focus:bg-white outline-none text-sm font-bold resize-none" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-400 ml-1">放學接送方式</label>
                                    <select value={formData.pickup_method} onChange={e => setFormData({ ...formData, pickup_method: e.target.value })} className="w-full p-3 border rounded-xl bg-gray-50 font-bold text-sm">
                                        <option value="家長接送">🚗 家長接送</option>
                                        <option value="自行回家">🚶 自行回家</option>
                                        <option value="安親班接送">🚌 安親班接送</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-400 ml-1">🔒 老師內部備註 (家長不可見)</label>
                                    <textarea rows={4} placeholder="例如: 性格活潑、注意與同學互動..." value={formData.internal_note} onChange={e => setFormData({ ...formData, internal_note: e.target.value })} className="w-full p-3 border rounded-xl bg-yellow-50 focus:bg-white outline-none text-sm font-bold resize-none" />
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4 mt-8 pt-4 border-t">
                            <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 rounded-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition">取消</button>
                            <button onClick={handleSubmit} className="flex-1 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition">
                                {modalMode === 'add' ? '確認新增學生' : '儲存修改'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}