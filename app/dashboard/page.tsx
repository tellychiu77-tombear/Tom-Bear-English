'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { useToast, TOAST_CLASSES } from '@/lib/useToast';

export default function Dashboard() {
    const [queue, setQueue] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [newStudentName, setNewStudentName] = useState(''); // 用來存輸入框的文字
    const [isAdding, setIsAdding] = useState(false); // 防止按鈕被連點
    const router = useRouter();
    const { toast, showToast } = useToast();

    // 1. 抓取資料
    const fetchQueue = async () => {
        try {
            const { data, error } = await supabase
                .from('pick_up_queue')
                .select(`
          id,
          status,
          created_at,
          students ( chinese_name )
        `)
                .order('created_at', { ascending: true });

            if (error) throw error;
            setQueue(data || []);
        } catch (error: any) {
            console.error('Error fetching queue:', error.message);
        } finally {
            setLoading(false);
        }
    };

    // 2. 初始化與即時監聽
    useEffect(() => {
        const checkUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.push('/'); return; }
            const { data: userData } = await supabase.from('users').select('role').eq('id', session.user.id).single();
            const allowed = ['teacher', 'admin', 'director', 'english_director', 'care_director'];
            if (!userData || !allowed.includes(userData.role)) {
                router.push('/'); return;
            }
        };
        checkUser();
        fetchQueue();

        const channel = supabase
            .channel('realtime_queue')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'pick_up_queue' }, () => {
                fetchQueue();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []); // 這裡保持空陣列，避免無限迴圈

    // 3. 更新狀態 (綠色/藍色按鈕)
    const updateStatus = async (id: number, newStatus: string) => {
        const { error } = await supabase
            .from('pick_up_queue')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) showToast(`更新失敗: ${error.message}`, 'error');
        else fetchQueue();
    };

    // 4. 【新功能】新增學生到排隊列表
    const handleAddStudent = async () => {
        if (!newStudentName.trim()) return; // 如果沒打字就不執行
        setIsAdding(true);

        try {
            // 第一步：先建立學生資料
            const { data: studentData, error: studentError } = await supabase
                .from('students')
                .insert([{ chinese_name: newStudentName }])
                .select()
                .single();

            if (studentError) throw studentError;

            // 第二步：把這位學生加入排隊
            const { error: queueError } = await supabase
                .from('pick_up_queue')
                .insert([{ student_id: studentData.id, status: 'pending' }]);

            if (queueError) throw queueError;

            // 成功後清空輸入框
            setNewStudentName('');
            fetchQueue(); // 這裡也可以不用呼叫，因為有 Realtime 監聽，但呼叫一下更保險
        } catch (error: any) {
            showToast('新增失敗: ' + error.message, 'error');
        } finally {
            setIsAdding(false);
        }
    };

    // 支援按 Enter 鍵送出
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleAddStudent();
    };

    // 5. 登出
    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/');
    };

    const pendingList = queue.filter((item) => item.status === 'pending');
    const arrivedList = queue.filter((item) => item.status === 'arrived');

    return (
        <div className="min-h-screen bg-gray-50 p-8 font-sans">
            {toast && (
                <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-white font-bold text-sm ${TOAST_CLASSES[toast.type]}`}>
                    {toast.msg}
                </div>
            )}
            {/* 頂部導航列 */}
            <div className="max-w-6xl mx-auto mb-8 flex items-center justify-between bg-white p-6 rounded-xl shadow-sm">
                <h1 className="text-3xl font-bold text-gray-800 tracking-tight">
                    接送管理儀表板
                </h1>
                <button
                    onClick={handleLogout}
                    className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg transition-colors"
                >
                    登出
                </button>
            </div>

            {/* 【新功能區塊】 新增學生輸入框 */}
            <div className="max-w-6xl mx-auto mb-8 bg-white p-6 rounded-xl shadow-sm border border-blue-100">
                <label className="block text-gray-700 text-lg font-bold mb-2">
                    📢 新增接送學生 (Add Student)
                </label>
                <div className="flex gap-4">
                    <input
                        type="text"
                        value={newStudentName}
                        onChange={(e) => setNewStudentName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="請輸入學生姓名 (例如: 陳小華)..."
                        className="flex-1 border-2 border-gray-300 rounded-lg px-4 py-3 text-xl focus:outline-none focus:border-blue-500 transition-colors"
                        disabled={isAdding}
                    />
                    <button
                        onClick={handleAddStudent}
                        disabled={isAdding || !newStudentName.trim()}
                        className={`font-bold py-3 px-8 rounded-lg text-white text-lg transition-all ${isAdding || !newStudentName.trim()
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 shadow-md active:scale-95'
                            }`}
                    >
                        {isAdding ? '處理中...' : '➕ 加入排隊'}
                    </button>
                </div>
            </div>

            {/* 列表區塊 */}
            <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">

                {/* 左邊：等待中 */}
                <div className="bg-white rounded-xl shadow-md overflow-hidden border-l-8 border-yellow-400">
                    <div className="p-6 bg-yellow-50 border-b border-yellow-100 flex justify-between items-center">
                        <h2 className="text-2xl font-bold text-yellow-700 flex items-center gap-2">
                            🕒 等待中 (Pending)
                        </h2>
                        <span className="bg-yellow-200 text-yellow-800 px-3 py-1 rounded-full font-bold">
                            {pendingList.length}
                        </span>
                    </div>
                    <div className="p-6 min-h-[300px]">
                        {pendingList.length === 0 ? (
                            <p className="text-gray-400 text-center mt-10">目前沒有等待接送的學生。</p>
                        ) : (
                            <div className="space-y-4">
                                {pendingList.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between bg-gray-50 p-4 rounded-lg border border-gray-100 hover:shadow-md transition-shadow">
                                        <div>
                                            <p className="text-xl font-bold text-gray-800">{item.students?.chinese_name || '未知學生'}</p>
                                            <p className="text-sm text-gray-500">等待家長中...</p>
                                        </div>
                                        <button
                                            onClick={() => updateStatus(item.id, 'arrived')}
                                            className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg shadow-sm transform active:scale-95 transition-all"
                                        >
                                            家長已到達
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* 右邊：家長已到達 */}
                <div className="bg-white rounded-xl shadow-md overflow-hidden border-l-8 border-green-500">
                    <div className="p-6 bg-green-50 border-b border-green-100 flex justify-between items-center">
                        <h2 className="text-2xl font-bold text-green-700 flex items-center gap-2">
                            🏫 家長已到達 (Arrived)
                        </h2>
                        <span className="bg-green-200 text-green-800 px-3 py-1 rounded-full font-bold">
                            {arrivedList.length}
                        </span>
                    </div>
                    <div className="p-6 min-h-[300px]">
                        {arrivedList.length === 0 ? (
                            <p className="text-gray-400 text-center mt-10">目前沒有已到達的家長。</p>
                        ) : (
                            <div className="space-y-4">
                                {arrivedList.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between bg-green-50 p-4 rounded-lg border border-green-100">
                                        <div>
                                            <p className="text-xl font-bold text-gray-800">{item.students?.chinese_name || '未知學生'}</p>
                                            <p className="text-sm text-green-600 font-medium">請廣播學生出來</p>
                                        </div>
                                        <button
                                            onClick={() => updateStatus(item.id, 'completed')}
                                            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg shadow-sm transform active:scale-95 transition-all"
                                        >
                                            接送完成
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}