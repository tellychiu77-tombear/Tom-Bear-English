'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function PickupPage() {
    const [role, setRole] = useState<string | null>(null);
    const [myKids, setMyKids] = useState<any[]>([]);
    const [queue, setQueue] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        init();
        const channel = supabase
            .channel('pickup_updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'pickups' }, () => fetchQueue())
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, []);

    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        const userRole = profile?.role || 'pending';
        setRole(userRole);

        if (userRole === 'parent') {
            const { data } = await supabase.from('students').select('*').eq('parent_id', session.user.id);
            setMyKids(data || []);
            fetchQueue();
        } else {
            fetchQueue();
        }
        setLoading(false);
    }

    async function fetchQueue() {
        const { data } = await supabase.from('pickup_queue').select('*').eq('status', 'waiting').order('created_at', { ascending: true });
        setQueue(data || []);
    }

    async function handlePickup(studentId: number) { // 注意：這裡改成 number
        const { error } = await supabase.from('pickups').insert([{ student_id: studentId }]);
        if (error) alert('操作失敗或已在排隊中');
        else alert('已通知老師！🏫');
        fetchQueue();
    }

    async function handleDismiss(pickupId: string) {
        const { error } = await supabase.from('pickups').update({ status: 'completed' }).eq('id', pickupId);
        if (!error) fetchQueue();
    }

    if (loading) return <div className="p-8 text-center">載入中...</div>;

    return (
        <div className="min-h-screen bg-gray-100 p-4">
            <div className="max-w-md mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-800">{role === 'parent' ? '🚌 我要接小孩' : '📋 接送排隊清單'}</h1>
                    <button onClick={() => router.push('/')} className="px-3 py-1 bg-gray-400 text-white rounded text-sm">回首頁</button>
                </div>

                {role === 'parent' && (
                    <div className="space-y-4">
                        {myKids.length === 0 ? <div className="bg-white p-6 rounded-xl text-center text-gray-500">無小孩資料</div> :
                            myKids.map(kid => {
                                const isQueued = queue.some(q => q.student_name === kid.chinese_name);
                                return (
                                    <div key={kid.id} className="bg-white p-6 rounded-xl shadow-lg flex justify-between items-center border-l-8 border-blue-500">
                                        <div><h2 className="text-xl font-bold">{kid.chinese_name}</h2><p className="text-gray-500">{kid.grade}</p></div>
                                        {isQueued ? <button disabled className="bg-gray-300 text-white px-6 py-3 rounded-lg font-bold">已在隊伍中</button> :
                                            <button onClick={() => handlePickup(kid.id)} className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700 animate-pulse">我到了！✋</button>}
                                    </div>
                                );
                            })
                        }
                    </div>
                )}

                {(role === 'director' || role === 'manager' || role === 'teacher') && (
                    <div className="space-y-4">
                        {queue.length === 0 ? <div className="text-center py-10 text-gray-400 bg-white rounded-xl">☕ 目前無人等待</div> :
                            queue.map((item, index) => (
                                <div key={item.pickup_id} className="bg-white p-5 rounded-xl shadow border-l-8 border-green-500 flex justify-between items-center">
                                    <div className="flex items-center gap-4"><div className="text-3xl font-bold text-gray-300">#{index + 1}</div>
                                        <div><h2 className="text-xl font-bold text-gray-800">{item.student_name}</h2><p className="text-sm text-green-600 font-bold">家長已到校</p></div></div>
                                    <button onClick={() => handleDismiss(item.pickup_id)} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">已接走 ✅</button>
                                </div>
                            ))
                        }
                    </div>
                )}
            </div>
        </div>
    );
}