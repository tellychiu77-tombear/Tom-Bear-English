'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

// 預設表單格式
const DEFAULT_FORM = {
    mood: 3,
    focus: 3,
    appetite: 3,
    homework: '',
    note: '',
    photos: [] as string[], // 照片 URL 陣列
    is_absent: false,       // 請假狀態
    signature: null as string | null // 家長簽名時間
};

export default function ContactBookPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null); // 存目前使用者資訊
    const [userRole, setUserRole] = useState<string>('');      // 存角色 (teacher/parent...)

    // 資料狀態
    const [students, setStudents] = useState<any[]>([]);
    const [forms, setForms] = useState<Record<string, typeof DEFAULT_FORM>>({});

    // UI 狀態
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedClass, setSelectedClass] = useState<string>('');
    const [uniqueClasses, setUniqueClasses] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null); // 隱藏的檔案輸入框
    const [uploadingStudentId, setUploadingStudentId] = useState<string | null>(null); // 正在幫誰上傳

    // Lightbox (照片放大) 狀態
    const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

    // 群發狀態
    const [bulkHomework, setBulkHomework] = useState('');
    const [bulkNote, setBulkNote] = useState('');

    // 1. 初始化
    const fetchData = useCallback(async () => {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        setCurrentUser(session.user);

        // 查角色
        const { data: userData } = await supabase.from('users').select('role').eq('id', session.user.id).single();
        const role = userData?.role || 'parent';
        setUserRole(role);

        // 查學生
        let query = supabase.from('students').select('*').order('grade').order('chinese_name');
        if (role === 'parent') {
            query = query.or(`parent_id.eq.${session.user.id},parent_id_2.eq.${session.user.id}`);
        }

        const { data } = await query;
        const studentList = data || [];
        setStudents(studentList);

        const classes = Array.from(new Set(studentList.map(s => s.grade || '未分類')));
        setUniqueClasses(classes);

        if (classes.length > 0 && !selectedClass) {
            setSelectedClass(classes[0]);
        }
        setLoading(false);
    }, [router, selectedClass]);

    // 2. 抓取歷史紀錄 (含照片、簽名、請假)
    const fetchHistory = useCallback(async () => {
        if (!selectedClass && userRole !== 'parent') return;

        // 找出需查詢的學生 ID
        const targetStudents = userRole === 'parent'
            ? students
            : students.filter(s => (s.grade || '未分類') === selectedClass);

        const ids = targetStudents.map(s => s.id);
        if (ids.length === 0) return;

        const { data: historyLogs } = await supabase
            .from('contact_books')
            .select('*')
            .in('student_id', ids)
            .eq('date', selectedDate);

        const newForms: Record<string, typeof DEFAULT_FORM> = {};

        // 預設填空
        ids.forEach(id => {
            newForms[id] = { ...DEFAULT_FORM };
        });

        // 填入歷史資料
        if (historyLogs && historyLogs.length > 0) {
            historyLogs.forEach(log => {
                newForms[log.student_id] = {
                    mood: log.mood,
                    focus: log.focus,
                    appetite: log.appetite,
                    homework: log.homework || '',
                    note: log.teacher_note || '',
                    photos: log.photos || [],
                    is_absent: log.is_absent || false,
                    signature: log.parent_signature
                };
            });
        }
        setForms(prev => ({ ...prev, ...newForms }));
    }, [selectedClass, selectedDate, students, userRole]);

    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => { if (students.length > 0) fetchHistory(); }, [fetchHistory, students.length]);

    // --- 功能邏輯 ---

    // 處理表單變更
    const handleFormChange = (studentId: string, field: string, value: any) => {
        setForms(prev => ({
            ...prev,
            [studentId]: { ...(prev[studentId] || DEFAULT_FORM), [field]: value }
        }));
    };

    // 📸 照片上傳邏輯
    const handleUploadClick = (studentId: string) => {
        setUploadingStudentId(studentId);
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0 || !uploadingStudentId) return;

        const uploadedUrls: string[] = [];
        const studentName = students.find(s => s.id === uploadingStudentId)?.chinese_name || 'unknown';

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                // 檔名: date/student_timestamp.ext
                const filePath = `${selectedDate}/${studentName}_${Date.now()}_${i}.${file.name.split('.').pop()}`;

                const { error: uploadError } = await supabase.storage
                    .from('contact_photos')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                // 取得公開連結
                const { data: { publicUrl } } = supabase.storage
                    .from('contact_photos')
                    .getPublicUrl(filePath);

                uploadedUrls.push(publicUrl);
            }

            // 更新到表單狀態
            setForms(prev => ({
                ...prev,
                [uploadingStudentId]: {
                    ...prev[uploadingStudentId],
                    photos: [...(prev[uploadingStudentId]?.photos || []), ...uploadedUrls]
                }
            }));

            alert(`✅ 成功上傳 ${uploadedUrls.length} 張照片`);
        } catch (err: any) {
            alert('❌ 上傳失敗 (請確認已建立 contact_photos bucket): ' + err.message);
        } finally {
            // 清空 input 避免不能重複選同檔
            if (fileInputRef.current) fileInputRef.current.value = '';
            setUploadingStudentId(null);
        }
    };

    // ✍️ 家長簽名邏輯
    const handleSign = async (student: any) => {
        if (!confirm('確定要簽名嗎？這代表您已閱讀今日聯絡簿。')) return;
        try {
            const now = new Date().toISOString();

            // 直接更新資料庫
            const { error } = await supabase
                .from('contact_books')
                .update({ parent_signature: now })
                .eq('student_id', student.id)
                .eq('date', selectedDate);

            if (error) throw error;

            // 更新畫面
            handleFormChange(student.id, 'signature', now);
            alert('✅ 簽名成功！');
        } catch (e: any) {
            alert('❌ 簽名失敗: ' + e.message);
        }
    };

    // 📢 群發功能
    const handleBulkApply = () => {
        if (!bulkHomework && !bulkNote) return alert('請輸入內容');
        if (!confirm(`確定要套用給 ${selectedClass} 全班嗎？`)) return;

        setForms(prev => {
            const next = { ...prev };
            const targets = students.filter(s => (s.grade || '未分類') === selectedClass);
            targets.forEach(student => {
                next[student.id] = {
                    ...next[student.id],
                    homework: bulkHomework || next[student.id].homework,
                    note: bulkNote || next[student.id].note
                };
            });
            return next;
        });
        alert('✅ 已填入全班表格，請檢查後個別發送或手動儲存');
    };

    // 💾 儲存 (含日誌監控)
    const handleSave = async (student: any) => {
        const formData = forms[student.id] || DEFAULT_FORM;

        try {
            // 1. 檢查是否已存在 (Upsert 邏輯)
            const { data: existing } = await supabase
                .from('contact_books')
                .select('id, homework, teacher_note')
                .eq('student_id', student.id)
                .eq('date', selectedDate)
                .single();

            let actionType = 'CREATE_CONTACT_BOOK';

            // 2. 執行寫入
            const payload = {
                student_id: student.id,
                date: selectedDate,
                mood: formData.mood,
                focus: formData.focus,
                appetite: formData.appetite,
                homework: formData.homework,
                teacher_note: formData.note,
                photos: formData.photos,
                is_absent: formData.is_absent
            };

            let error;
            if (existing) {
                actionType = 'UPDATE_CONTACT_BOOK';
                const { error: updateError } = await supabase
                    .from('contact_books')
                    .update(payload)
                    .eq('id', existing.id);
                error = updateError;
            } else {
                const { error: insertError } = await supabase
                    .from('contact_books')
                    .insert(payload);
                error = insertError;
            }

            if (error) throw error;

            // 3. 📝 寫入監控日誌 (如果是修改)
            if (actionType === 'UPDATE_CONTACT_BOOK') {
                await supabase.from('system_logs').insert({
                    operator_email: currentUser?.email,
                    action: 'UPDATE_CONTACT_BOOK',
                    details: `修改了學生 ${student.chinese_name} 在 ${selectedDate} 的聯絡簿內容`
                });
            }

            alert(`✅ ${student.chinese_name} 儲存成功！`);

        } catch (e: any) {
            alert('❌ 儲存失敗: ' + e.message);
        }
    };

    const StarRating = ({ value, onChange, label }: any) => (
        <div className="flex flex-col items-center gap-1">
            <span className="text-xs font-bold text-gray-400">{label}</span>
            <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        disabled={userRole === 'parent'} // 家長不能改星星
                        onClick={() => onChange(star)}
                        className={`text-xl transition ${star <= value ? 'text-yellow-400' : 'text-gray-200'} ${userRole !== 'parent' && 'hover:scale-110'}`}
                    >
                        ★
                    </button>
                ))}
            </div>
        </div>
    );

    if (loading) return <div className="min-h-screen flex justify-center items-center font-bold text-gray-400">載入中...</div>;

    const filteredStudents = userRole === 'parent' ? students : students.filter(s => (s.grade || '未分類') === selectedClass);

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* 隱藏的檔案輸入框 */}
            <input
                type="file"
                multiple
                accept="image/*"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileChange}
            />

            {/* Lightbox 照片放大 */}
            {lightboxPhoto && (
                <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setLightboxPhoto(null)}>
                    <img src={lightboxPhoto} alt="Full size" className="max-w-full max-h-full rounded-lg shadow-2xl" />
                    <button className="absolute top-4 right-4 text-white text-4xl font-bold">×</button>
                </div>
            )}

            {/* 頂部導覽 */}
            <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
                <div className="px-4 py-3 max-w-4xl mx-auto">
                    <div className="flex justify-between items-center mb-3">
                        <h1 className="text-xl font-black text-gray-800 flex items-center gap-2">📖 寶寶聯絡簿</h1>
                        <div className="flex gap-2">
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className={`border-0 rounded-lg px-3 py-2 font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-200 ${selectedDate === new Date().toISOString().split('T')[0] ? 'bg-indigo-50 text-indigo-700' : 'bg-orange-100 text-orange-700 animate-pulse'
                                    }`}
                            />
                            <button onClick={() => router.push('/')} className="bg-gray-100 px-3 py-2 rounded-lg font-bold text-sm text-gray-500">回首頁</button>
                        </div>
                    </div>

                    {/* 老師才看得到班級 Tabs */}
                    {userRole !== 'parent' && (
                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            {uniqueClasses.map(cls => (
                                <button
                                    key={cls}
                                    onClick={() => setSelectedClass(cls)}
                                    className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition border ${selectedClass === cls ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                                >
                                    {cls}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* 群發控制台 (老師限定) */}
                {selectedClass && userRole !== 'parent' && (
                    <div className="bg-indigo-50 border-b border-indigo-100 px-4 py-3">
                        <div className="max-w-4xl mx-auto">
                            <details className="group">
                                <summary className="flex items-center gap-2 font-bold text-indigo-800 cursor-pointer list-none">
                                    <span className="bg-indigo-200 text-indigo-700 px-2 py-0.5 rounded text-xs">NEW</span>
                                    📢 班級作業群發 (Bulk Actions)
                                    <span className="text-xs text-indigo-400 font-normal ml-auto group-open:rotate-180 transition">▼</span>
                                </summary>
                                <div className="mt-3 grid gap-3 animate-fade-in">
                                    <div className="flex gap-2">
                                        <input type="text" placeholder="全班統一作業..." value={bulkHomework} onChange={e => setBulkHomework(e.target.value)} className="flex-1 p-2 border border-indigo-200 rounded-lg text-sm" />
                                        <input type="text" placeholder="全班統一評語..." value={bulkNote} onChange={e => setBulkNote(e.target.value)} className="flex-1 p-2 border border-indigo-200 rounded-lg text-sm" />
                                    </div>
                                    <button onClick={handleBulkApply} className="w-full bg-indigo-600 text-white py-2 rounded-lg font-bold text-sm hover:bg-indigo-700 shadow-sm">⚡ 一鍵套用</button>
                                </div>
                            </details>
                        </div>
                    </div>
                )}
            </div>

            {/* 學生卡片列表 */}
            <div className="max-w-4xl mx-auto p-4 space-y-6">
                {filteredStudents.length === 0 ? (
                    <div className="text-center py-20 text-gray-400 font-bold">目前沒有學生資料</div>
                ) : (
                    filteredStudents.map(student => {
                        const form = forms[student.id] || DEFAULT_FORM;
                        const isTeacher = userRole !== 'parent';

                        return (
                            <div key={student.id} className={`bg-white rounded-2xl shadow-sm border overflow-hidden transition ${form.is_absent ? 'border-gray-200 bg-gray-50 opacity-90' : 'border-gray-100'}`}>
                                {/* 卡片標頭 */}
                                <div className={`px-4 py-3 flex justify-between items-center border-b ${form.is_absent ? 'bg-gray-100' : 'bg-white'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-lg ${form.is_absent ? 'bg-gray-200 text-gray-500' : 'bg-indigo-100 text-indigo-700'}`}>
                                            {student.chinese_name.charAt(0)}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                                                {student.chinese_name}
                                                {form.is_absent && <span className="bg-gray-600 text-white text-[10px] px-2 py-0.5 rounded-full">請假中</span>}
                                            </h3>
                                            <p className="text-xs text-gray-400 font-bold">{student.grade}</p>
                                        </div>
                                    </div>

                                    {/* 老師可切換請假狀態 */}
                                    {isTeacher && (
                                        <div className="flex items-center gap-2">
                                            <label className="text-xs font-bold text-gray-400 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={form.is_absent}
                                                    onChange={(e) => handleFormChange(student.id, 'is_absent', e.target.checked)}
                                                    className="mr-1 accent-gray-600"
                                                />
                                                今日請假
                                            </label>
                                        </div>
                                    )}

                                    {/* 簽名狀態顯示 */}
                                    {form.signature ? (
                                        <div className="text-right">
                                            <div className="text-green-600 font-black text-xs">✅ 已簽名</div>
                                            <div className="text-[10px] text-gray-400 font-mono">{new Date(form.signature).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                        </div>
                                    ) : (
                                        <div className="text-xs text-red-300 font-bold border border-red-100 px-2 py-1 rounded bg-red-50">尚未簽名</div>
                                    )}
                                </div>

                                <div className="p-5">
                                    {/* 評分區 */}
                                    <div className="grid grid-cols-3 gap-4 mb-6 bg-gray-50 p-4 rounded-xl">
                                        <StarRating label="心情 Mood" value={form.mood} onChange={(v: any) => handleFormChange(student.id, 'mood', v)} />
                                        <StarRating label="專注 Focus" value={form.focus} onChange={(v: any) => handleFormChange(student.id, 'focus', v)} />
                                        <StarRating label="食慾 Appetite" value={form.appetite} onChange={(v: any) => handleFormChange(student.id, 'appetite', v)} />
                                    </div>

                                    {/* 文字輸入區 (家長唯讀) */}
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 ml-1">今日作業 Homework</label>
                                            {isTeacher ? (
                                                <input type="text" value={form.homework} onChange={(e) => handleFormChange(student.id, 'homework', e.target.value)} className="w-full p-3 bg-gray-50 border-0 rounded-xl font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-100" />
                                            ) : (
                                                <div className="p-3 bg-gray-50 rounded-xl font-bold text-gray-700 min-h-[46px]">{form.homework || '無作業'}</div>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 ml-1">老師的話 Teacher's Note</label>
                                            {isTeacher ? (
                                                <textarea rows={2} value={form.note} onChange={(e) => handleFormChange(student.id, 'note', e.target.value)} className="w-full p-3 bg-gray-50 border-0 rounded-xl font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-100 resize-none" />
                                            ) : (
                                                <div className="p-3 bg-gray-50 rounded-xl font-bold text-gray-700 min-h-[46px] whitespace-pre-wrap">{form.note || '無'}</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* 📸 照片區 */}
                                    <div className="mt-4">
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-xs font-bold text-gray-400 ml-1">活動照片 Photos</label>
                                            {isTeacher && (
                                                <button onClick={() => handleUploadClick(student.id)} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded font-bold hover:bg-indigo-100">
                                                    ➕ 上傳照片
                                                </button>
                                            )}
                                        </div>
                                        {form.photos && form.photos.length > 0 ? (
                                            <div className="flex gap-2 overflow-x-auto py-2">
                                                {form.photos.map((url: string, idx: number) => (
                                                    <img
                                                        key={idx}
                                                        src={url}
                                                        alt="activity"
                                                        onClick={() => setLightboxPhoto(url)}
                                                        className="w-20 h-20 object-cover rounded-lg border border-gray-200 cursor-zoom-in hover:opacity-90 transition"
                                                    />
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-xs text-gray-300 italic p-2">無照片</div>
                                        )}
                                    </div>

                                    {/* 底部操作區 */}
                                    <div className="mt-6 border-t border-gray-100 pt-4 flex justify-end">
                                        {isTeacher ? (
                                            <button
                                                onClick={() => handleSave(student)}
                                                className={`px-6 py-2.5 rounded-xl font-bold shadow-lg transition flex items-center gap-2 text-white ${selectedDate !== new Date().toISOString().split('T')[0] ? 'bg-orange-500 hover:bg-orange-600' : 'bg-indigo-600 hover:bg-indigo-700'
                                                    }`}
                                            >
                                                {selectedDate !== new Date().toISOString().split('T')[0] ? '💾 修改歷史紀錄' : '📤 發送 / 儲存'}
                                            </button>
                                        ) : (
                                            !form.signature && (
                                                <button
                                                    onClick={() => handleSign(student)}
                                                    className="w-full bg-green-500 text-white py-3 rounded-xl font-black text-lg shadow-lg shadow-green-200 hover:bg-green-600 animate-pulse"
                                                >
                                                    ✍️ 我已閱讀並簽名
                                                </button>
                                            )
                                        )}
                                        {userRole === 'parent' && form.signature && (
                                            <div className="w-full text-center text-gray-400 font-bold text-sm py-2 bg-gray-50 rounded-xl">
                                                已於 {new Date(form.signature).toLocaleString()} 完成簽名
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}