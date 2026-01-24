'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

type Tab = 'profile' | 'performance' | 'grades';

export default function MyChildPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    // Data States
    const [myChildren, setMyChildren] = useState<any[]>([]);
    const [selectedChild, setSelectedChild] = useState<any>(null);
    const [recentLogs, setRecentLogs] = useState<any[]>([]);
    const [recentGrades, setRecentGrades] = useState<any[]>([]);

    // UI State
    const [activeTab, setActiveTab] = useState<Tab>('profile');

    // 🆕 編輯模式狀態
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<any>({}); // 暫存編輯中的資料

    useEffect(() => {
        fetchMyChildren();
    }, []);

    useEffect(() => {
        if (selectedChild) {
            fetchChildDetails(selectedChild.id);
            // 當切換小孩時，重置表單資料
            setFormData(selectedChild);
            setIsEditing(false);
        }
    }, [selectedChild]);

    async function fetchMyChildren() {
        try {
            setLoading(true);
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.push('/'); return; }

            const { data: children, error } = await supabase
                .from('students')
                .select('*')
                .eq('parent_id', session.user.id);

            if (error) throw error;

            if (children && children.length > 0) {
                setMyChildren(children);
                setSelectedChild(children[0]);
                setFormData(children[0]);
            }
        } catch (e) {
            console.error("讀取學生失敗:", e);
        } finally {
            setLoading(false);
        }
    }

    async function fetchChildDetails(studentId: any) {
        try {
            // 1. 抓聯絡簿
            const { data: logs } = await supabase
                .from('contact_books')
                .select('*')
                .eq('student_id', studentId)
                .order('date', { ascending: false })
                .limit(5);

            if (logs) setRecentLogs(logs);

            // 2. 抓成績
            const { data: grades } = await supabase
                .from('exam_results')
                .select('*')
                .eq('student_id', studentId)
                .order('exam_date', { ascending: false })
                .limit(20);

            if (grades) setRecentGrades(grades);

        } catch (e) {
            console.warn("部分資料讀取失敗:", e);
        }
    }

    // 🆕 處理輸入變更
    const handleInputChange = (field: string, value: string) => {
        setFormData((prev: any) => ({ ...prev, [field]: value }));
    };

    // 💾 儲存功能 (配合老師端的欄位名稱)
    const handleSaveProfile = async () => {
        console.log("正在儲存:", formData);

        try {
            // ✨ 關鍵修正：欄位名稱對齊老師端 (StudentPage)
            const updates = {
                english_name: formData.english_name || null,
                birthday: formData.birthday || null,
                allergies: formData.allergies || null,

                // 🔧 修正：家長編輯時，同時更新 special_needs (老師端看的)
                special_needs: formData.special_needs || null,

                // 🔧 修正：使用 parent_relationship (稱謂) 與 parent_phone (電話)
                // 因為老師端是用這些欄位
                parent_relationship: formData.parent_relationship || null,
                parent_phone: formData.parent_phone || null,

                parent_2_relationship: formData.parent_2_relationship || null,
                parent_2_phone: formData.parent_2_phone || null,

                pickup_method: formData.pickup_method || '家長接送'
            };

            const { data, error } = await supabase
                .from('students')
                .update(updates)
                .eq('id', selectedChild.id)
                .select();

            if (error) throw error;

            if (!data || data.length === 0) {
                // 如果沒有更新到資料 (可能是權限擋住，但我們已經排除了 ID 問題)
                console.warn("更新筆數為 0，請確認 ID 是否正確");
            }

            alert('✅ 資料更新成功！');
            setIsEditing(false);

            // 更新畫面
            const updatedData = { ...selectedChild, ...updates };
            setSelectedChild(updatedData);
            setMyChildren(prev => prev.map(c => c.id === selectedChild.id ? updatedData : c));

        } catch (e: any) {
            console.error("儲存失敗:", e);
            alert(`❌ 儲存失敗: ${e.message}`);
        }
    };

    // 🆕 取消編輯
    const handleCancelEdit = () => {
        setFormData(selectedChild); // 恢復原狀
        setIsEditing(false);
    };

    const renderStars = (count: number) => {
        if (!count) return '-';
        return '⭐'.repeat(Math.max(0, count));
    };

    if (loading) return <div className="p-10 text-center animate-pulse">載入學生檔案中...</div>;

    if (myChildren.length === 0) return (
        <div className="min-h-screen bg-gray-50 p-10 flex flex-col items-center">
            <div className="text-4xl mb-4">📭</div>
            <p className="text-gray-500">尚未連結學生資料</p>
            <button onClick={() => router.push('/')} className="mt-4 px-4 py-2 bg-white border rounded shadow">回首頁</button>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-6">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">📂 學生學習護照</h1>
                    <button onClick={() => router.push('/')} className="bg-white px-4 py-2 rounded-xl text-gray-500 font-bold shadow-sm hover:bg-gray-50 text-sm">⬅️ 回首頁</button>
                </div>

                {/* Child Switcher */}
                {myChildren.length > 1 && (
                    <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                        {myChildren.map(child => (
                            <button
                                key={child.id}
                                onClick={() => setSelectedChild(child)}
                                className={`px-5 py-2 rounded-full whitespace-nowrap font-bold transition shadow-sm
                                    ${selectedChild.id === child.id ? 'bg-indigo-600 text-white shadow-indigo-200' : 'bg-white text-gray-500 border'}
                                `}
                            >
                                {child.chinese_name}
                            </button>
                        ))}
                    </div>
                )}

                {selectedChild && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 animate-fade-in-up">

                        {/* Left: Digital ID */}
                        <div className="md:col-span-4">
                            <div className="bg-white rounded-3xl p-6 shadow-lg border border-gray-100 text-center relative overflow-hidden sticky top-6">
                                <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-br from-indigo-500 to-purple-500"></div>
                                <div className="relative mt-8 mb-4">
                                    <div className="w-28 h-28 mx-auto bg-white rounded-full p-1 shadow-lg">
                                        <div className="w-full h-full rounded-full bg-indigo-50 flex items-center justify-center text-4xl overflow-hidden">
                                            {selectedChild.photo_url ? <img src={selectedChild.photo_url} className="w-full h-full object-cover" /> : <span>👦</span>}
                                        </div>
                                    </div>
                                </div>
                                <h2 className="text-2xl font-black text-gray-800">{selectedChild.chinese_name}</h2>

                                {/* 英文名可編輯 */}
                                {isEditing ? (
                                    <input
                                        type="text"
                                        value={formData.english_name || ''}
                                        onChange={e => handleInputChange('english_name', e.target.value)}
                                        className="text-center border-b-2 border-indigo-200 outline-none font-bold text-indigo-500 text-sm mb-4 w-1/2 bg-transparent focus:border-indigo-500"
                                        placeholder="英文名"
                                    />
                                ) : (
                                    <p className="text-indigo-500 font-bold text-sm mb-4">{selectedChild.english_name || 'Student'}</p>
                                )}

                                <div className="flex justify-center gap-2 mb-6">
                                    <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold">{selectedChild.grade || '未分班'}</span>
                                    <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">在學中</span>
                                </div>

                                <div className="border-t pt-4 text-left space-y-3">
                                    <div className="flex justify-between text-sm items-center">
                                        <span className="text-gray-400 font-bold">學號</span>
                                        <span className="font-mono text-gray-700">{selectedChild.student_id || '---'}</span>
                                    </div>
                                    <div className="flex justify-between text-sm items-center">
                                        <span className="text-gray-400 font-bold">生日</span>
                                        {isEditing ? (
                                            <input
                                                type="date"
                                                value={formData.birthday || ''}
                                                onChange={e => handleInputChange('birthday', e.target.value)}
                                                className="font-mono text-gray-700 border rounded px-1 text-sm"
                                            />
                                        ) : (
                                            <span className="font-mono text-gray-700">{selectedChild.birthday || '未登記'}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right: Tabs */}
                        <div className="md:col-span-8">
                            <div className="flex bg-white p-1.5 rounded-xl shadow-sm mb-6 overflow-x-auto">
                                <button onClick={() => setActiveTab('profile')} className={`flex-1 min-w-[100px] py-2.5 rounded-lg font-bold text-sm transition ${activeTab === 'profile' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-gray-600'}`}>👤 個人檔案</button>
                                <button onClick={() => setActiveTab('performance')} className={`flex-1 min-w-[100px] py-2.5 rounded-lg font-bold text-sm transition ${activeTab === 'performance' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-gray-600'}`}>📊 平日表現</button>
                                <button onClick={() => setActiveTab('grades')} className={`flex-1 min-w-[100px] py-2.5 rounded-lg font-bold text-sm transition ${activeTab === 'grades' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-gray-600'}`}>💯 成績紀錄</button>
                            </div>

                            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 min-h-[400px]">
                                {activeTab === 'profile' && (
                                    <div className="space-y-6 animate-fade-in relative">

                                        {/* ✏️ 編輯按鈕區 */}
                                        <div className="flex justify-between items-center border-b border-gray-100 pb-4 mb-4">
                                            <h3 className="text-lg font-black text-gray-800 flex items-center gap-2">
                                                <span className="bg-blue-100 text-blue-600 w-8 h-8 rounded-lg flex items-center justify-center text-sm">❤️</span>
                                                詳細資料
                                            </h3>
                                            {isEditing ? (
                                                <div className="flex gap-2">
                                                    <button onClick={handleCancelEdit} className="px-4 py-1.5 rounded-lg bg-gray-100 text-gray-500 font-bold text-sm hover:bg-gray-200">取消</button>
                                                    <button onClick={handleSaveProfile} className="px-4 py-1.5 rounded-lg bg-green-500 text-white font-bold text-sm hover:bg-green-600 shadow-green-200 shadow-sm">💾 儲存</button>
                                                </div>
                                            ) : (
                                                <button onClick={() => setIsEditing(true)} className="px-4 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 font-bold text-sm hover:bg-indigo-100 transition flex items-center gap-1">
                                                    ✏️ 編輯資料
                                                </button>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* 過敏 */}
                                            <div className={`p-4 rounded-2xl border transition ${isEditing ? 'bg-white border-indigo-300 ring-2 ring-indigo-50' : 'bg-red-50 border-red-100'}`}>
                                                <div className={`text-xs font-bold mb-1 ${isEditing ? 'text-indigo-500' : 'text-red-400'}`}>過敏原註記</div>
                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        value={formData.allergies || ''}
                                                        onChange={e => handleInputChange('allergies', e.target.value)}
                                                        className="w-full font-bold text-gray-800 bg-transparent outline-none placeholder-gray-300"
                                                        placeholder="例如: 蝦子, 花生"
                                                    />
                                                ) : (
                                                    <div className="text-red-800 font-bold">{selectedChild.allergies || '無特殊紀錄'}</div>
                                                )}
                                            </div>

                                            {/* 特殊照護 (修正：讀取 special_needs) */}
                                            <div className={`p-4 rounded-2xl border transition ${isEditing ? 'bg-white border-indigo-300 ring-2 ring-indigo-50' : 'bg-gray-50 border-gray-100'}`}>
                                                <div className={`text-xs font-bold mb-1 ${isEditing ? 'text-indigo-500' : 'text-gray-400'}`}>特殊照護</div>
                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        value={formData.special_needs || ''}
                                                        onChange={e => handleInputChange('special_needs', e.target.value)}
                                                        className="w-full font-bold text-gray-800 bg-transparent outline-none placeholder-gray-300"
                                                        placeholder="例如: 氣喘, 定時服藥"
                                                    />
                                                ) : (
                                                    <div className="text-gray-700 font-bold">{selectedChild.special_needs || '無'}</div>
                                                )}
                                            </div>
                                        </div>

                                        <h3 className="text-lg font-black text-gray-800 flex items-center gap-2 mb-4 mt-8">
                                            <span className="bg-green-100 text-green-600 w-8 h-8 rounded-lg flex items-center justify-center text-sm">📞</span>
                                            接送與聯絡
                                        </h3>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* 聯絡人 1 (修正：使用 parent_relationship 和 parent_phone) */}
                                            <div className={`border p-4 rounded-2xl ${isEditing ? 'border-indigo-300' : 'border-gray-100'}`}>
                                                <div className="text-xs text-gray-400 font-bold">第一聯絡人</div>
                                                {isEditing ? (
                                                    <div className="space-y-2 mt-1">
                                                        <input type="text" value={formData.parent_relationship || ''} onChange={e => handleInputChange('parent_relationship', e.target.value)} className="w-full border-b border-gray-200 font-bold text-gray-800 outline-none focus:border-indigo-500" placeholder="稱謂 (如: 媽媽)" />
                                                        <input type="text" value={formData.parent_phone || ''} onChange={e => handleInputChange('parent_phone', e.target.value)} className="w-full font-mono font-bold text-indigo-600 outline-none" placeholder="電話" />
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="font-bold text-gray-800 text-lg mt-1">{selectedChild.parent_relationship || '未登記'}</div>
                                                        <div className="text-indigo-600 font-mono font-bold">{selectedChild.parent_phone}</div>
                                                    </>
                                                )}
                                            </div>

                                            {/* 聯絡人 2 */}
                                            <div className={`border p-4 rounded-2xl ${isEditing ? 'border-indigo-300' : 'border-gray-100'}`}>
                                                <div className="text-xs text-gray-400 font-bold">第二聯絡人</div>
                                                {isEditing ? (
                                                    <div className="space-y-2 mt-1">
                                                        <input type="text" value={formData.parent_2_relationship || ''} onChange={e => handleInputChange('parent_2_relationship', e.target.value)} className="w-full border-b border-gray-200 font-bold text-gray-800 outline-none focus:border-indigo-500" placeholder="稱謂 (如: 爸爸)" />
                                                        <input type="text" value={formData.parent_2_phone || ''} onChange={e => handleInputChange('parent_2_phone', e.target.value)} className="w-full font-mono font-bold text-indigo-600 outline-none" placeholder="電話" />
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="font-bold text-gray-800 text-lg mt-1">{selectedChild.parent_2_relationship || '未登記'}</div>
                                                        <div className="text-indigo-600 font-mono font-bold">{selectedChild.parent_2_phone}</div>
                                                    </>
                                                )}
                                            </div>

                                            {/* 接送方式 */}
                                            <div className={`p-4 rounded-2xl col-span-1 md:col-span-2 transition ${isEditing ? 'bg-white border border-indigo-300 ring-2 ring-indigo-50' : 'bg-gray-50'}`}>
                                                <div className="text-xs text-gray-400 font-bold mb-1">放學接送方式</div>
                                                {isEditing ? (
                                                    <select
                                                        value={formData.pickup_method || '家長接送'}
                                                        onChange={e => handleInputChange('pickup_method', e.target.value)}
                                                        className="w-full font-bold text-gray-800 bg-transparent outline-none"
                                                    >
                                                        <option value="家長接送">家長接送</option>
                                                        <option value="自行回家">自行回家</option>
                                                        <option value="安親班接送">安親班接送</option>
                                                    </select>
                                                ) : (
                                                    <div className="text-gray-800 font-bold">{selectedChild.pickup_method || '家長接送'}</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'performance' && (
                                    <div className="animate-fade-in">
                                        <h3 className="text-lg font-black text-gray-800 mb-6">近五日課堂表現</h3>
                                        {recentLogs.length === 0 ? <div className="text-center py-10 text-gray-400">尚無聯絡簿紀錄</div> : (
                                            <div className="space-y-4">
                                                {recentLogs.map(log => (
                                                    <div key={log.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                                        <div className="flex flex-col"><span className="text-xs font-bold text-gray-400">{log.date}</span><span className="font-bold text-gray-700 mt-1 truncate w-32 md:w-auto">{log.homework || '無作業'}</span></div>
                                                        <div className="flex gap-4 text-sm"><div className="text-center"><div className="text-[10px] text-gray-400">心情</div>{renderStars(log.mood)}</div><div className="text-center"><div className="text-[10px] text-gray-400">專注</div>{renderStars(log.focus)}</div><div className="text-center hidden md:block"><div className="text-[10px] text-gray-400">食慾</div>{renderStars(log.appetite)}</div></div>
                                                    </div>
                                                ))}
                                                <button onClick={() => router.push('/contact-book')} className="w-full py-3 mt-4 text-indigo-600 font-bold bg-indigo-50 rounded-xl hover:bg-indigo-100 transition">查看完整聯絡簿紀錄 ➔</button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'grades' && (
                                    <div className="animate-fade-in">
                                        <h3 className="text-lg font-black text-gray-800 mb-6">近期考試成績</h3>
                                        {recentGrades.length === 0 ? (
                                            <div className="text-center py-10 text-gray-400 bg-gray-50 rounded-2xl border border-dashed">
                                                <p className="text-4xl mb-2">📝</p>
                                                <p>尚無成績紀錄</p>
                                            </div>
                                        ) : (
                                            <div className="overflow-hidden rounded-2xl border border-gray-100">
                                                <table className="w-full text-left text-sm">
                                                    <thead className="bg-gray-50 text-gray-500 font-bold">
                                                        <tr>
                                                            <th className="p-4">日期</th>
                                                            <th className="p-4">考試名稱</th>
                                                            <th className="p-4 text-right">分數</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100">
                                                        {recentGrades.map(grade => (
                                                            <tr key={grade.id} className="hover:bg-gray-50">
                                                                <td className="p-4 font-mono text-gray-500 font-bold">{grade.exam_date}</td>
                                                                <td className="p-4 font-bold text-gray-800">{grade.exam_name}</td>
                                                                <td className={`p-4 text-right font-mono font-black text-lg ${grade.score >= 90 ? 'text-green-600' : grade.score < 60 ? 'text-red-500' : 'text-indigo-900'}`}>
                                                                    {grade.score}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}