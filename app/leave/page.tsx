'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { logAction } from '@/lib/logService';

export default function LeavePage() {
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

    // Data
    const [leaves, setLeaves] = useState<any[]>([]);
    const [myChildren, setMyChildren] = useState<any[]>([]);

    // UI States
    const [searchTerm, setSearchTerm] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);
    const showToast = (msg: string, type: 'success'|'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };
    const [formData, setFormData] = useState({
        studentId: '',
        type: 'çå',
        reason: '',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
    });

    const router = useRouter();

    useEffect(() => {
        init();
    }, []);

    const init = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        // Get Profile
        const { data: profile } = await supabase.from('users').select('*').eq('id', session.user.id).single();
        setCurrentUser(profile);

        if (profile.role === 'parent') {
            await fetchParentData(session.user.id);
        } else {
            await fetchStaffData();
        }
        setLoading(false);
    };

    const fetchParentData = async (parentId: string) => {
        // 1. Get Children
        const { data: kids } = await supabase.from('students').select('*').eq('parent_id', parentId);
        if (kids) {
            setMyChildren(kids);
            if (kids.length > 0) setFormData(prev => ({ ...prev, studentId: kids[0].id }));

            // 2. Get Leaves
            const kidIds = kids.map(k => k.id);
            if (kidIds.length > 0) {
                const { data: records } = await supabase
                    .from('leave_requests')
                    .select(`*, student:students(chinese_name, grade)`)
                    .in('student_id', kidIds)
                    .order('created_at', { ascending: false });
                if (records) setLeaves(records);
            }
        }
    };

    const fetchStaffData = async () => {
        const { data: records } = await supabase
            .from('leave_requests')
            .select(`*, student:students(chinese_name, grade)`)
            .order('created_at', { ascending: false });
        if (records) setLeaves(records);
    };

    const submitLeave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.reason) return showToast('è«å¡«å¯«è«åäºç±', 'error');

        const { error } = await supabase.from('leave_requests').insert({
            student_id: formData.studentId,
            type: formData.type,
            reason: formData.reason,
            start_date: formData.startDate,
            end_date: formData.endDate,
            status: 'pending'
        });

        if (error) {
            showToast('éåºå¤±æ: ' + error.message, 'error');
        } else {
            showToast('åå®å·²éåºï¼â');
            setShowForm(false);
            setFormData(prev => ({ ...prev, reason: '' }));
            if (currentUser.role === 'parent') fetchParentData(currentUser.id);
            // Switch to pending tab
            setActiveTab('pending');
        }
    };

    // (Import removed)

    // ... (previous)

    const updateStatus = async (id: string, newStatus: string) => {
        const confirmed = confirm(`ç¢ºå®è¦å°æ­¤ç³è«æ¨è¨çºã${newStatus === 'approved' ? 'æ ¸å' : 'é§å'}ãåï¼`);
        if (!confirmed) return;

        const { error } = await supabase
            .from('leave_requests')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) {
            showToast('æ´æ°å¤±æ', 'error');
        } else {
            // ð¢ Audit Log
            const target = leaves.find(l => l.id === id);
            if (target) {
                const action = newStatus === 'approved' ? 'æ ¸åè«å' : 'é§åè«å';
                const msg = `${action === 'æ ¸åè«å' ? 'æ ¸å' : 'é§å'}äºå­¸ç [${target.student?.chinese_name}] å¨ [${target.start_date}] ç [${target.type}] ç³è«`;
                await logAction(action, msg);
            }

            // Optimistic update
            setLeaves(prev => prev.map(l => l.id === id ? { ...l, status: newStatus } : l));
        }
    };

    // Derived State
    const pendingLeaves = leaves.filter(l => l.status === 'pending');
    const historyLeaves = leaves.filter(l => l.status !== 'pending');

    // Filtering History
    const filteredHistory = historyLeaves.filter(l => {
        if (!searchTerm) return true;
        return l.student?.chinese_name?.includes(searchTerm) || l.reason?.includes(searchTerm);
    });

    if (loading) return <div className="p-10 text-center text-gray-500 animate-pulse">è¼å¥è³æä¸­...</div>;

    const isStaff = currentUser?.role !== 'parent';
    const adminRoles = ['admin', 'director', 'english_director', 'care_director', 'manager'];
    const isAdmin = adminRoles.includes(currentUser?.role || '');

    // Badge label based on role
    const staffBadgeLabel = isAdmin ? 'ADMIN' : 'èå¸«';
    const staffBadgeColor = isAdmin ? 'bg-blue-600 shadow-blue-200' : 'bg-indigo-500 shadow-indigo-200';

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
            <div className="max-w-5xl mx-auto space-y-8">

                {/* 1. Header & Stats */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-gray-800 tracking-tight flex items-center gap-3">
                            ð è«åç®¡çä¸­å¿
                            {isStaff ? (
                                <span className={`${staffBadgeColor} text-white text-xs px-2 py-1 rounded-full tracking-wider font-bold shadow-lg`}>{staffBadgeLabel}</span>
                            ) : (
                                <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full tracking-wider font-bold shadow-green-200 shadow-lg">PARENT</span>
                            )}
                        </h1>
                        <p className="text-gray-500 mt-2 font-medium">
                            {isStaff ? 'å¯©æ ¸èç®¡çå­¸çè«åçæ³' : 'çºæ¨çå­©å­ç³è«è«å'}
                        </p>
                    </div>

                    <div className="flex gap-4">
                        <StatCard label="æ¬æç´¯ç©äººæ¬¡" value={leaves.length} color="bg-blue-50" textColor="text-blue-600" />
                        <StatCard label="å¾å¯©æ ¸æ¡ä»¶" value={pendingLeaves.length} color="bg-orange-50" textColor="text-orange-600" highlight={pendingLeaves.length > 0} />
                    </div>

                    <button onClick={() => router.push('/')} className="px-4 py-2 bg-white text-gray-600 font-bold rounded-xl border border-gray-200 hover:bg-gray-50 transition shadow-sm">
                        åé¦é 
                    </button>
                </div>

                {/* 2. Controls & Tabs */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    {/* Tabs */}
                    <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-100 w-full md:w-auto">
                        <button
                            onClick={() => setActiveTab('pending')}
                            className={`flex-1 md:flex-none px-6 py-2 rounded-lg font-bold text-sm transition-all duration-200 ${activeTab === 'pending'
                                ? 'bg-orange-100 text-orange-700 shadow-sm'
                                : 'text-gray-400 hover:text-gray-600'
                                }`}
                        >
                            ð´ å¾å¯©æ ¸ ({pendingLeaves.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`flex-1 md:flex-none px-6 py-2 rounded-lg font-bold text-sm transition-all duration-200 ${activeTab === 'history'
                                ? 'bg-gray-800 text-white shadow-md'
                                : 'text-gray-400 hover:text-gray-600'
                                }`}
                        >
                            ð æ­·å²ç´é
                        </button>
                    </div>

                    {/* Make Request Button (Parent Only) */}
                    {!isStaff && (
                        <button
                            onClick={() => setShowForm(true)}
                            className="w-full md:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 transition flex items-center justify-center gap-2"
                        >
                            <span>â</span> æè¦è«å
                        </button>
                    )}
                </div>

                {/* 3. Main Content Area */}
                <div className="animate-fade-in space-y-6">

                    {/* === Tab: Pending === */}
                    {activeTab === 'pending' && (
                        <div className="space-y-4">
                            {pendingLeaves.length === 0 ? (
                                <EmptyState title="ç®åæ²æå¾å¯©æ ¸çè«åç³è«" sub="å¤ªæ£äºï¼å¤§å®¶é½æºæä¸å­¸ ð" />
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {pendingLeaves.map(leave => (
                                        <div key={leave.id} className="bg-white p-6 rounded-2xl shadow-md border-l-4 border-orange-400 flex flex-col justify-between hover:shadow-lg transition">
                                            <div>
                                                <div className="flex justify-between items-start mb-4">
                                                    <div>
                                                        <h3 className="text-xl font-black text-gray-800 flex items-center gap-2">
                                                            {leave.student?.chinese_name}
                                                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded font-normal">{leave.student?.grade}</span>
                                                        </h3>
                                                        <div className="mt-1">
                                                            <LeaveTypeBadge type={leave.type} />
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-sm font-bold text-gray-600 bg-gray-50 px-3 py-1 rounded-lg">
                                                            {leave.start_date === leave.end_date ? leave.start_date : `${leave.start_date} ~ ${leave.end_date}`}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="bg-orange-50/50 p-4 rounded-xl text-gray-700 text-sm mb-6 leading-relaxed">
                                                    <span className="font-bold text-orange-800 block mb-1">ð è«åäºç±ï¼</span>
                                                    {leave.reason}
                                                </div>
                                            </div>

                                            {isStaff ? (
                                                <div className="flex gap-3">
                                                    <button
                                                        onClick={() => updateStatus(leave.id, 'approved')}
                                                        className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold shadow-emerald-200 shadow transition flex items-center justify-center gap-2"
                                                    >
                                                        â æ ¸å
                                                    </button>
                                                    <button
                                                        onClick={() => updateStatus(leave.id, 'rejected')}
                                                        className="flex-1 py-3 bg-white text-red-500 border-2 border-red-100 hover:bg-red-50 rounded-xl font-bold transition flex items-center justify-center gap-2"
                                                    >
                                                        â é§å
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="text-center text-orange-500 font-bold bg-orange-50 py-2 rounded-lg text-sm">
                                                    â³ èå¸«å¯©æ ¸ä¸­
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* === Tab: History === */}
                    {activeTab === 'history' && (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col md:flex-row">
                            {/* Left: Calendar Grid */}
                            <div className="p-4 md:w-2/3 border-b md:border-b-0 md:border-r border-gray-100">
                                <CalendarView
                                    historyLeaves={historyLeaves}
                                    onDateSelect={(date: string) => setSearchTerm(date)}
                                    selectedDate={searchTerm || new Date().toISOString().split('T')[0]}
                                />
                            </div>

                            {/* Right: Detailed List for Selected Date */}
                            <div className="p-4 md:w-1/3 bg-gray-50/50 flex flex-col">
                                <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                                    ð {searchTerm || new Date().toISOString().split('T')[0]} ({historyLeaves.filter(l => l.start_date <= (searchTerm || new Date().toISOString().split('T')[0]) && l.end_date >= (searchTerm || new Date().toISOString().split('T')[0])).length})
                                </h3>
                                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar" style={{ maxHeight: '400px' }}>
                                    {(() => {
                                        const targetDate = searchTerm || new Date().toISOString().split('T')[0];
                                        const daysLeaves = historyLeaves.filter(l => l.start_date <= targetDate && l.end_date >= targetDate);

                                        if (daysLeaves.length === 0) return (
                                            <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60">
                                                <span className="text-4xl mb-2">â</span>
                                                <span className="text-sm font-bold">æ¬æ¥å¨å¤</span>
                                                <span className="text-xs">ç¡äººè«å</span>
                                            </div>
                                        );

                                        return daysLeaves.map(leave => (
                                            <div key={leave.id} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                                                <div className="flex justify-between items-start">
                                                    <div className="font-bold text-gray-800">
                                                        {leave.student?.chinese_name}
                                                    </div>
                                                    <LeaveTypeBadge type={leave.type} size="sm" />
                                                </div>
                                                <div className="text-xs text-gray-500 mt-1">{leave.student?.grade}</div>
                                                <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                                                    {leave.reason}
                                                </div>
                                                <div className="mt-2 flex justify-end">
                                                    {leave.status === 'approved' ?
                                                        <span className="text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-bold">å·²æ ¸å</span> :
                                                        <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">å·²é§å</span>
                                                    }
                                                </div>
                                            </div>
                                        ));
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Toast Notification */}
            {toast && (
                <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-white font-bold transition-all ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
                    {toast.msg}
                </div>
            )}

            {/* Application Modal (Parent Only) */}
            {showForm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
                        <div className="bg-blue-600 p-6 text-white flex justify-between items-center">
                            <h2 className="text-xl font-black">âï¸ å¡«å¯«è«åå®</h2>
                            <button onClick={() => setShowForm(false)} className="bg-white/20 hover:bg-white/30 p-2 rounded-full transition">â</button>
                        </div>
                        <div className="p-6">
                            <form onSubmit={submitLeave} className="space-y-5">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">è«åå­¸ç</label>
                                    <div className="flex gap-2 bg-gray-50 p-1 rounded-xl">
                                        {myChildren.map(child => (
                                            <button
                                                key={child.id}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, studentId: child.id })}
                                                className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${formData.studentId === child.id ? 'bg-white text-blue-600 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-gray-600'
                                                    }`}
                                            >
                                                {child.chinese_name}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">éå§æ¥æ</label>
                                        <input
                                            type="date"
                                            required
                                            className="w-full p-3 bg-gray-50 border-gray-100 border rounded-xl font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            value={formData.startDate}
                                            onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">çµææ¥æ</label>
                                        <input
                                            type="date"
                                            required
                                            className="w-full p-3 bg-gray-50 border-gray-100 border rounded-xl font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            value={formData.endDate}
                                            onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">åå¥</label>
                                    <div className="flex gap-3 flex-wrap">
                                        {['çå', 'äºå', 'å¬å', 'å¶ä»'].map(type => (
                                            <label key={type} className={`cursor-pointer px-4 py-2 rounded-xl text-sm font-bold border transition ${formData.type === type ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                                }`}>
                                                <input
                                                    type="radio"
                                                    name="leaveType"
                                                    value={type}
                                                    changed={e => setFormData({ ...formData, type })}
                                                    checked={formData.type === type}
                                                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                                                    className="hidden"
                                                />
                                                {type}
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">è«ååæ½</label>
                                    <textarea
                                        required
                                        rows={3}
                                        className="w-full p-3 bg-gray-50 border-gray-100 border rounded-xl font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                        placeholder="è«ååæ½åæ¥ï¼ä¾ªå¤§å®¶é½é®é¢è®¢éã"
                                        value={formData.reason}
                                        onChange={e => setFormData({ ...formData, reason: e.target.value })}
                                        style={{ fontFamily: 'sans-serif' }}
                                    ></textarea>
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl font-bold transition">
                                        åæ¶
                                    </button>
                                    <button type="submit" className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 transition">
                                        ð æä¾ç¢å¡
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// === SUBCOMPONENTS ===

function StatCard({ label, value, color, textColor, highlight }: { label: string, value: number, color: string, textColor: string, highlight?: boolean }) {
    return (
        <div className={`${color} p-3 rounded-xl text-center min-w-[80px] ${highlight ? 'ring-2 ring-orange-300' : ''}`}>
;

    const renderDays = () => {
        const days = [];
        // Empty slots for previous month
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} className="p-2"></div>);
        }

        // Days
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isToday = dateStr === today;
            const isSelected = dateStr === selectedDate;

            // Check for leaves on this day
            const hasLeaves = historyLeaves.some((l: any) => l.start_date <= dateStr && l.end_date >= dateStr);
            const leavesCount = historyLeaves.filter((l: any) => l.start_date <= dateStr && l.end_date >= dateStr).length;

            days.push(
                <div key={d} className="p-1">
                    <button
                        onClick={() => onDateSelect(dateStr)}
                        className={`w-full aspect-square rounded-xl flex flex-col items-center justify-center relative transition
                            ${isSelected ? 'bg-blue-600 text-white shadow-md scale-105' : 'hover:bg-gray-100 text-gray-700'}
                            ${isToday && !isSelected ? 'border-2 border-blue-600 text-blue-700 font-bold' : ''}
                        `}
                    >
                        <span className={`text-sm ${isSelected ? 'font-bold' : ''}`}>{d}</span>

                        {/* Dot Indicators */}
                        {hasLeaves && (
                            <div className="absolute bottom-1.5 flex gap-0.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-orange-500'}`}></span>
                                {leavesCount > 1 && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/70' : 'bg-orange-300'}`}></span>}
                            </div>
                        )}
                    </button>
                </div>
            );
        }
        return days;
    };

    return (
        <div>
            {/* Calendar Header */}
            <div className="flex justify-between items-center mb-4 px-2">
                <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">â</button>
                <h2 className="text-lg font-black text-gray-800">
                    {currentDate.getFullYear()}òºt {currentDate.getMonth() + 1}æ
                </h2>
                <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">â¶</button>
            </div>

            {/* Week Days */}
            <div className="grid grid-cols-7 mb-2 text-center">
                {['æ¥', 'ä¸', 'äº', 'ä¸', 'å', 'äº', 'å­'].map((day, idx) => (
                    <div key={day} className={`text-xs font-bold ${idx === 0 || idx === 6 ? 'text-red-400' : 'text-gray-400'}`}>
                        {day}
                    </div>
                ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7">
                {renderDays()}
            </div>
        </div>
    );
}

// Components

function StatCard({ label, value, color, textColor, highlight }: any) {
    return (
        <div className={`px-5 py-3 rounded-2xl border border-gray-100 ${color} flex flex-col items-center justify-center min-w-[120px]`}>
            <div className={`text-2xl font-black ${textColor} ${highlight ? 'animate-pulse' : ''}`}>
                {value}
            </div>
            <div className={`text-xs font-bold opacity-70 ${textColor}`}>{label}</div>
        </div>
    );
}

function EmptyState({ title, sub }: any) {
    return (
        <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
            <div className="text-6xl mb-4 opacity-50">ðï¸</div>
            <h3 className="text-lg font-black text-gray-400">{title}</h3>
            <p className="text-sm text-gray-300 mt-2">{sub}</p>
        </div>
    );
}

function LeaveTypeBadge({ type, size = 'md' }: any) {
    let color = 'bg-gray-100 text-gray-600';
    if (type === 'çå') color = 'bg-red-100 text-red-600';
    if (type === 'äºå') color = 'bg-blue-100 text-blue-600';
    if (type === 'å¬å') color = 'bg-purple-100 text-purple-600';

    const sizeClass = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-3 py-1 text-xs';

    return (
        <span className={`${color} ${sizeClass} font-bold rounded`}>
            {type}
        </span>
    );
}
