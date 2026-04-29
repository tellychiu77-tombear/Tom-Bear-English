'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

const BRAND = '#E8695A';

const ADMIN_ROLES = ['director', 'manager', 'admin', 'english_director', 'care_director'];

const ITEM_OPTIONS = ['學費', '材料費', '活動費', '其他'];
const STATUS_OPTIONS = [
    { value: 'paid',    label: '已繳清',  badgeClass: 'bg-green-100 text-green-700' },
    { value: 'pending', label: '待繳',    badgeClass: 'bg-yellow-100 text-yellow-700' },
    { value: 'partial', label: '部分繳清', badgeClass: 'bg-orange-100 text-orange-700' },
];
const METHOD_OPTIONS = [
    { value: 'cash',     label: '現金' },
    { value: 'transfer', label: '銀行轉帳' },
    { value: 'other',    label: '其他' },
];

type PaymentRecord = {
    id: string;
    student_id: string;
    amount: number;
    item: string;
    paid_date: string;
    payment_method: string;
    status: string;
    note: string | null;
    recorded_by: string | null;
    created_at: string;
    student?: { chinese_name: string; grade: string };
};

type Student = {
    id: string;
    chinese_name: string;
    grade: string;
};

function formatAmount(amount: number) {
    return 'NT$' + amount.toLocaleString('zh-TW', { minimumFractionDigits: 0 });
}

function StatusBadge({ status }: { status: string }) {
    const opt = STATUS_OPTIONS.find(s => s.value === status);
    return (
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${opt?.badgeClass ?? 'bg-gray-100 text-gray-500'}`}>
            {opt?.label ?? status}
        </span>
    );
}

function EmptyState({ title, sub }: { title: string; sub: string }) {
    return (
        <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
            <div className="text-5xl mb-4 opacity-40">💰</div>
            <h3 className="text-base font-black text-gray-400">{title}</h3>
            <p className="text-sm text-gray-300 mt-1">{sub}</p>
        </div>
    );
}

function LoadingSpinner() {
    return (
        <div className="flex items-center justify-center py-12">
            <div
                className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-current animate-spin"
                style={{ borderTopColor: BRAND }}
            />
        </div>
    );
}

export default function PaymentPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);

    // Data
    const [records, setRecords] = useState<PaymentRecord[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [myChildren, setMyChildren] = useState<Student[]>([]);

    // Filters (admin)
    const [searchName, setSearchName] = useState('');
    const [filterItem, setFilterItem] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    // Form
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        student_id: '',
        item: '學費',
        item_custom: '',
        amount: '',
        paid_date: new Date().toISOString().split('T')[0],
        payment_method: 'cash',
        status: 'paid',
        note: '',
    });
    const [formLoading, setFormLoading] = useState(false);

    // Student search in form
    const [studentSearch, setStudentSearch] = useState('');
    const [showStudentDropdown, setShowStudentDropdown] = useState(false);

    // Batch add state
    const [showBatchForm, setShowBatchForm] = useState(false);
    const [batchClass, setBatchClass] = useState('');
    const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
    const [batchForm, setBatchForm] = useState({
        item: '學費', item_custom: '', amount: '',
        paid_date: new Date().toISOString().split('T')[0],
        payment_method: 'cash', status: 'paid', note: '',
    });
    const [batchLoading, setBatchLoading] = useState(false);

    // Toast
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => { init(); }, []);

    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }

        const { data: profile } = await supabase.from('users').select('*').eq('id', session.user.id).single();
        if (!profile) { router.push('/'); return; }
        setCurrentUser(profile);

        const role = profile.role as string;

        if (role === 'teacher') {
            router.push('/');
            return;
        }

        if (role === 'parent') {
            await fetchParentData(session.user.id);
        } else if (ADMIN_ROLES.includes(role)) {
            await fetchAdminData(session.user.id);
        } else {
            router.push('/');
            return;
        }

        setLoading(false);
    }

    async function fetchParentData(parentId: string) {
        const { data: kids } = await supabase
            .from('students')
            .select('id, chinese_name, grade')
            .eq('parent_id', parentId);
        if (kids) {
            setMyChildren(kids);
            const kidIds = kids.map(k => k.id);
            if (kidIds.length > 0) {
                const { data: recs } = await supabase
                    .from('payment_records')
                    .select('*, student:students(chinese_name, grade)')
                    .in('student_id', kidIds)
                    .order('paid_date', { ascending: false });
                setRecords((recs as any[]) ?? []);
            }
        }
    }

    async function fetchAdminData(userId: string) {
        const [{ data: studs }, { data: recs }] = await Promise.all([
            supabase.from('students').select('id, chinese_name, grade').order('grade').order('chinese_name'),
            supabase
                .from('payment_records')
                .select('*, student:students(chinese_name, grade)')
                .order('paid_date', { ascending: false }),
        ]);
        setStudents((studs as any[]) ?? []);
        setRecords((recs as any[]) ?? []);
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!formData.student_id) return showToast('請選擇學生', 'error');
        const amountNum = parseFloat(formData.amount);
        if (isNaN(amountNum) || amountNum <= 0) return showToast('請輸入有效金額', 'error');

        const itemFinal = formData.item === '其他' && formData.item_custom.trim()
            ? formData.item_custom.trim()
            : formData.item;

        setFormLoading(true);
        const payload = {
            student_id: formData.student_id,
            item: itemFinal,
            amount: amountNum,
            paid_date: formData.paid_date,
            payment_method: formData.payment_method,
            status: formData.status,
            note: formData.note.trim() || null,
            recorded_by: currentUser?.id ?? null,
        };

        let error;
        if (editingId) {
            ({ error } = await supabase.from('payment_records').update(payload).eq('id', editingId));
        } else {
            ({ error } = await supabase.from('payment_records').insert(payload));
        }

        if (error) {
            showToast('儲存失敗: ' + error.message, 'error');
        } else {
            showToast(editingId ? '已更新繳費紀錄' : '繳費紀錄已新增');
            setShowForm(false);
            setEditingId(null);
            resetForm();
            await fetchAdminData(currentUser?.id);
        }
        setFormLoading(false);
    }

    async function handleBatchSave() {
        if (batchSelected.size === 0) return showToast('請至少選擇一位學生', 'error');
        const amountNum = parseFloat(batchForm.amount);
        if (isNaN(amountNum) || amountNum <= 0) return showToast('請輸入有效金額', 'error');
        const itemFinal = batchForm.item === '其他' && batchForm.item_custom.trim()
            ? batchForm.item_custom.trim() : batchForm.item;
        setBatchLoading(true);
        const rows = Array.from(batchSelected).map(sid => ({
            student_id: sid,
            item: itemFinal,
            amount: amountNum,
            paid_date: batchForm.paid_date,
            payment_method: batchForm.payment_method,
            status: batchForm.status,
            note: batchForm.note.trim() || null,
            recorded_by: currentUser?.id ?? null,
        }));
        const { error } = await supabase.from('payment_records').insert(rows);
        if (error) {
            showToast('批次新增失敗: ' + error.message, 'error');
        } else {
            showToast(`已為 ${batchSelected.size} 位學生新增繳費紀錄 ✓`);
            setShowBatchForm(false);
            setBatchSelected(new Set());
            setBatchClass('');
            setBatchForm({ item: '學費', item_custom: '', amount: '', paid_date: new Date().toISOString().split('T')[0], payment_method: 'cash', status: 'paid', note: '' });
            await fetchAdminData(currentUser?.id);
        }
        setBatchLoading(false);
    }

    async function handleDelete(id: string) {
        if (!confirm('確定刪除此繳費紀錄？此操作無法復原。')) return;
        const { error } = await supabase.from('payment_records').delete().eq('id', id);
        if (error) showToast('刪除失敗', 'error');
        else {
            showToast('已刪除');
            setRecords(prev => prev.filter(r => r.id !== id));
            if (editingId === id) { setShowForm(false); setEditingId(null); resetForm(); }
        }
    }

    function startEdit(rec: PaymentRecord) {
        const isCustomItem = !ITEM_OPTIONS.slice(0, -1).includes(rec.item) && rec.item !== '其他';
        setEditingId(rec.id);
        const selectedStudent = students.find(s => s.id === rec.student_id);
        setStudentSearch(selectedStudent ? `${selectedStudent.chinese_name} (${selectedStudent.grade})` : '');
        setFormData({
            student_id: rec.student_id,
            item: ITEM_OPTIONS.includes(rec.item) ? rec.item : '其他',
            item_custom: isCustomItem ? rec.item : '',
            amount: String(rec.amount),
            paid_date: rec.paid_date,
            payment_method: rec.payment_method,
            status: rec.status,
            note: rec.note ?? '',
        });
        setShowForm(true);
    }

    function resetForm() {
        setFormData({
            student_id: '',
            item: '學費',
            item_custom: '',
            amount: '',
            paid_date: new Date().toISOString().split('T')[0],
            payment_method: 'cash',
            status: 'paid',
            note: '',
        });
        setStudentSearch('');
        setShowStudentDropdown(false);
    }

    const role = currentUser?.role as string;
    const isAdmin = ADMIN_ROLES.includes(role);
    const isParent = role === 'parent';

    // Filtered records for admin list
    const filteredRecords = records.filter(r => {
        const nameMatch = !searchName || r.student?.chinese_name?.includes(searchName);
        const itemMatch = !filterItem || r.item === filterItem || (filterItem === '其他' && !ITEM_OPTIONS.slice(0, -1).includes(r.item));
        const statusMatch = !filterStatus || r.status === filterStatus;
        return nameMatch && itemMatch && statusMatch;
    });

    // Stats
    const paidTotal = records.filter(r => r.status === 'paid').reduce((s, r) => s + Number(r.amount), 0);
    const pendingTotal = records.filter(r => r.status !== 'paid').reduce((s, r) => s + Number(r.amount), 0);

    // Filtered students for dropdown
    const filteredStudents = students.filter(s =>
        studentSearch === '' ||
        s.chinese_name.includes(studentSearch) ||
        s.grade.includes(studentSearch)
    );

    // Batch: unique classes & students in selected class
    const allClasses = Array.from(new Set(students.map(s => s.grade).filter(Boolean))).sort();
    const batchClassStudents = batchClass ? students.filter(s => s.grade === batchClass) : [];

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <LoadingSpinner />
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 pb-12">
            {/* Header */}
            <div className="bg-white border-b shadow-sm sticky top-0 z-20">
                <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">💰</span>
                        <div>
                            <h1 className="font-black text-gray-800 text-lg leading-tight">繳費紀錄</h1>
                            <p className="text-xs text-gray-400">
                                {isParent ? '查看孩子的繳費與待繳項目' : '學費收款登錄・待繳查詢'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => router.push('/')}
                        className="text-sm text-gray-500 hover:text-gray-800 font-bold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
                    >
                        ← 回首頁
                    </button>
                </div>
            </div>

            <div className="max-w-6xl mx-auto p-4">

                {/* === ADMIN VIEW === */}
                {isAdmin && (
                    <div className="flex flex-col lg:flex-row gap-5 mt-2">

                        {/* Left: List */}
                        <div className="flex-1 min-w-0 space-y-4">

                            {/* Filter bar + Add button */}
                            <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
                                <div className="flex flex-wrap gap-2 flex-1">
                                    <input
                                        type="text"
                                        placeholder="搜尋學生姓名..."
                                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 w-36"
                                        style={{ '--tw-ring-color': BRAND } as any}
                                        value={searchName}
                                        onChange={e => setSearchName(e.target.value)}
                                    />
                                    <select
                                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                                        value={filterItem}
                                        onChange={e => setFilterItem(e.target.value)}
                                    >
                                        <option value="">全部項目</option>
                                        {ITEM_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                    <select
                                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                                        value={filterStatus}
                                        onChange={e => setFilterStatus(e.target.value)}
                                    >
                                        <option value="">全部狀態</option>
                                        {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                    </select>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <button
                                        onClick={() => { setShowBatchForm(true); setShowForm(false); setEditingId(null); resetForm(); }}
                                        className="px-4 py-2 text-sm font-bold rounded-xl shadow-sm transition hover:opacity-90 border-2"
                                        style={{ borderColor: BRAND, color: BRAND, backgroundColor: 'white' }}
                                    >
                                        📋 批次新增
                                    </button>
                                    <button
                                        onClick={() => { setEditingId(null); resetForm(); setShowForm(true); setShowBatchForm(false); }}
                                        className="px-4 py-2 text-white text-sm font-bold rounded-xl shadow-sm transition hover:opacity-90"
                                        style={{ backgroundColor: BRAND }}
                                    >
                                        + 新增繳費紀錄
                                    </button>
                                </div>
                            </div>

                            {/* Record cards */}
                            {filteredRecords.length === 0 ? (
                                <EmptyState title="目前無繳費紀錄" sub="點選「+ 新增繳費紀錄」開始新增" />
                            ) : (
                                <div className="space-y-3">
                                    {filteredRecords.map(rec => (
                                        <div
                                            key={rec.id}
                                            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col md:flex-row md:items-center gap-3"
                                        >
                                            {/* Student + Class */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                                    <span className="font-black text-gray-800">{rec.student?.chinese_name}</span>
                                                    <span className="text-xs px-2 py-0.5 rounded-full text-white font-bold" style={{ backgroundColor: BRAND }}>
                                                        {rec.student?.grade}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 flex-wrap text-sm text-gray-600">
                                                    <span className="font-bold">{rec.item}</span>
                                                    <span className="font-black" style={{ color: BRAND }}>{formatAmount(rec.amount)}</span>
                                                    <span className="text-gray-400">{rec.paid_date}</span>
                                                    <span className="text-gray-400">
                                                        {METHOD_OPTIONS.find(m => m.value === rec.payment_method)?.label ?? rec.payment_method}
                                                    </span>
                                                    <StatusBadge status={rec.status} />
                                                </div>
                                                {rec.note && (
                                                    <p className="text-xs text-gray-400 mt-1">備注：{rec.note}</p>
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div className="flex gap-2 shrink-0">
                                                <button
                                                    onClick={() => startEdit(rec)}
                                                    className="text-xs font-bold text-indigo-500 hover:text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition border border-indigo-100"
                                                >
                                                    編輯
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(rec.id)}
                                                    className="text-xs font-bold text-red-400 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition border border-red-100"
                                                >
                                                    刪除
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Stats */}
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-6">
                                <div>
                                    <p className="text-xs text-gray-400 mb-1">已收金額總計</p>
                                    <p className="text-xl font-black text-green-600">{formatAmount(paidTotal)}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 mb-1">待收金額總計</p>
                                    <p className="text-xl font-black text-orange-500">{formatAmount(pendingTotal)}</p>
                                </div>
                            </div>
                        </div>

                        {/* Right: Form / Batch */}
                        <div className="lg:w-80 shrink-0">
                            {/* === 批次新增面板 === */}
                            {showBatchForm && (
                                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden sticky top-20">
                                    <div className="p-4 text-white font-black text-base flex justify-between items-center" style={{ backgroundColor: BRAND }}>
                                        <span>📋 批次新增繳費</span>
                                        <button onClick={() => setShowBatchForm(false)} className="bg-white/20 hover:bg-white/30 rounded-full w-7 h-7 flex items-center justify-center text-sm">✕</button>
                                    </div>
                                    <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(100vh-8rem)]">
                                        {/* Step 1: 選班級 */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">① 選擇班級</label>
                                            <select
                                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                                                value={batchClass}
                                                onChange={e => {
                                                    const cls = e.target.value;
                                                    setBatchClass(cls);
                                                    const ids = students.filter(s => s.grade === cls).map(s => s.id);
                                                    setBatchSelected(new Set(ids));
                                                }}
                                            >
                                                <option value="">-- 選擇班級 --</option>
                                                {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>

                                        {/* Step 2: 學生清單 */}
                                        {batchClass && (
                                            <div>
                                                <div className="flex justify-between items-center mb-2">
                                                    <label className="text-xs font-bold text-gray-600">② 選擇學生（{batchSelected.size}/{batchClassStudents.length}）</label>
                                                    <button
                                                        type="button"
                                                        className="text-xs font-bold"
                                                        style={{ color: BRAND }}
                                                        onClick={() => {
                                                            if (batchSelected.size === batchClassStudents.length) {
                                                                setBatchSelected(new Set());
                                                            } else {
                                                                setBatchSelected(new Set(batchClassStudents.map(s => s.id)));
                                                            }
                                                        }}
                                                    >
                                                        {batchSelected.size === batchClassStudents.length ? '全部取消' : '全選'}
                                                    </button>
                                                </div>
                                                <div className="border border-gray-100 rounded-xl overflow-hidden max-h-44 overflow-y-auto">
                                                    {batchClassStudents.map(s => (
                                                        <label key={s.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                                                            <input
                                                                type="checkbox"
                                                                checked={batchSelected.has(s.id)}
                                                                onChange={e => {
                                                                    const next = new Set(batchSelected);
                                                                    if (e.target.checked) next.add(s.id); else next.delete(s.id);
                                                                    setBatchSelected(next);
                                                                }}
                                                                className="w-4 h-4 accent-current"
                                                                style={{ accentColor: BRAND }}
                                                            />
                                                            <span className="text-sm font-bold text-gray-800">{s.chinese_name}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Step 3: 費用設定 */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">③ 費用設定</label>
                                            <div className="space-y-3 border border-gray-100 rounded-xl p-3">
                                                <div>
                                                    <label className="block text-xs text-gray-500 mb-1">項目</label>
                                                    <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={batchForm.item} onChange={e => setBatchForm(f => ({ ...f, item: e.target.value }))}>
                                                        {ITEM_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                                    </select>
                                                    {batchForm.item === '其他' && (
                                                        <input type="text" placeholder="項目名稱..." className="w-full mt-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={batchForm.item_custom} onChange={e => setBatchForm(f => ({ ...f, item_custom: e.target.value }))} />
                                                    )}
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-500 mb-1">金額 (NT$)</label>
                                                    <input type="number" min="0" placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={batchForm.amount} onChange={e => setBatchForm(f => ({ ...f, amount: e.target.value }))} />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-500 mb-1">繳費日期</label>
                                                    <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={batchForm.paid_date} onChange={e => setBatchForm(f => ({ ...f, paid_date: e.target.value }))} />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-500 mb-1">付款方式</label>
                                                    <div className="flex gap-2">
                                                        {METHOD_OPTIONS.map(m => (
                                                            <button key={m.value} type="button" onClick={() => setBatchForm(f => ({ ...f, payment_method: m.value }))}
                                                                className="flex-1 py-1.5 text-xs font-bold rounded-lg border transition"
                                                                style={batchForm.payment_method === m.value ? { backgroundColor: BRAND, borderColor: BRAND, color: 'white' } : { borderColor: '#e5e7eb', color: '#6b7280' }}>
                                                                {m.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-500 mb-1">狀態</label>
                                                    <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={batchForm.status} onChange={e => setBatchForm(f => ({ ...f, status: e.target.value }))}>
                                                        {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-500 mb-1">備注（選填）</label>
                                                    <textarea rows={2} placeholder="補充說明..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" value={batchForm.note} onChange={e => setBatchForm(f => ({ ...f, note: e.target.value }))} />
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            disabled={batchLoading || batchSelected.size === 0 || !batchForm.amount}
                                            onClick={handleBatchSave}
                                            className="w-full py-3 text-white font-black rounded-xl transition hover:opacity-90 disabled:opacity-50"
                                            style={{ backgroundColor: BRAND }}
                                        >
                                            {batchLoading ? '處理中...' : `為 ${batchSelected.size} 位學生新增`}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {showForm ? (
                                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden sticky top-20">
                                    <div
                                        className="p-4 text-white font-black text-base flex justify-between items-center"
                                        style={{ backgroundColor: BRAND }}
                                    >
                                        <span>{editingId ? '✏️ 編輯繳費紀錄' : '➕ 新增繳費紀錄'}</span>
                                        <button
                                            onClick={() => { setShowForm(false); setEditingId(null); resetForm(); }}
                                            className="bg-white/20 hover:bg-white/30 rounded-full w-7 h-7 flex items-center justify-center text-sm"
                                        >✕</button>
                                    </div>

                                    <form onSubmit={handleSave} className="p-5 space-y-4">

                                        {/* Student searchable select */}
                                        <div className="relative">
                                            <label className="block text-xs font-bold text-gray-600 mb-1">學生 *</label>
                                            <input
                                                type="text"
                                                placeholder="輸入姓名或班級搜尋..."
                                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                                                value={studentSearch}
                                                onChange={e => {
                                                    setStudentSearch(e.target.value);
                                                    setFormData(prev => ({ ...prev, student_id: '' }));
                                                    setShowStudentDropdown(true);
                                                }}
                                                onFocus={() => setShowStudentDropdown(true)}
                                            />
                                            {formData.student_id && (
                                                <div className="absolute right-3 top-7 text-green-500 text-xs font-bold">✓</div>
                                            )}
                                            {showStudentDropdown && (
                                                <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                                    {filteredStudents.length === 0 ? (
                                                        <div className="px-3 py-2 text-xs text-gray-400">找不到學生</div>
                                                    ) : (
                                                        filteredStudents.map(s => (
                                                            <button
                                                                key={s.id}
                                                                type="button"
                                                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between items-center"
                                                                onClick={() => {
                                                                    setFormData(prev => ({ ...prev, student_id: s.id }));
                                                                    setStudentSearch(`${s.chinese_name} (${s.grade})`);
                                                                    setShowStudentDropdown(false);
                                                                }}
                                                            >
                                                                <span className="font-bold text-gray-800">{s.chinese_name}</span>
                                                                <span className="text-xs text-gray-400">{s.grade}</span>
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Item */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">項目 *</label>
                                            <select
                                                required
                                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                                                value={formData.item}
                                                onChange={e => setFormData(prev => ({ ...prev, item: e.target.value }))}
                                            >
                                                {ITEM_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                            </select>
                                            {formData.item === '其他' && (
                                                <input
                                                    type="text"
                                                    placeholder="請輸入項目名稱..."
                                                    className="w-full mt-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                                                    value={formData.item_custom}
                                                    onChange={e => setFormData(prev => ({ ...prev, item_custom: e.target.value }))}
                                                />
                                            )}
                                        </div>

                                        {/* Amount */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">金額 (NT$) *</label>
                                            <input
                                                type="number"
                                                required
                                                min="0"
                                                step="0.01"
                                                placeholder="0"
                                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                                                value={formData.amount}
                                                onChange={e => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                                            />
                                        </div>

                                        {/* Paid date */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">繳費日期 *</label>
                                            <input
                                                type="date"
                                                required
                                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                                                value={formData.paid_date}
                                                onChange={e => setFormData(prev => ({ ...prev, paid_date: e.target.value }))}
                                            />
                                        </div>

                                        {/* Payment method */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-2">付款方式 *</label>
                                            <div className="flex gap-3 flex-wrap">
                                                {METHOD_OPTIONS.map(m => (
                                                    <label
                                                        key={m.value}
                                                        className={`cursor-pointer flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border transition ${
                                                            formData.payment_method === m.value
                                                                ? 'border-current text-white'
                                                                : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                                        }`}
                                                        style={formData.payment_method === m.value ? { backgroundColor: BRAND, borderColor: BRAND } : {}}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name="payment_method"
                                                            value={m.value}
                                                            checked={formData.payment_method === m.value}
                                                            onChange={e => setFormData(prev => ({ ...prev, payment_method: e.target.value }))}
                                                            className="hidden"
                                                        />
                                                        {m.label}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Status */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">狀態 *</label>
                                            <select
                                                required
                                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                                                value={formData.status}
                                                onChange={e => setFormData(prev => ({ ...prev, status: e.target.value }))}
                                            >
                                                {STATUS_OPTIONS.map(s => (
                                                    <option key={s.value} value={s.value}>{s.label}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Note */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">備注（選填）</label>
                                            <textarea
                                                rows={3}
                                                placeholder="補充說明..."
                                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                                                value={formData.note}
                                                onChange={e => setFormData(prev => ({ ...prev, note: e.target.value }))}
                                            />
                                        </div>

                                        <div className="flex gap-3">
                                            <button
                                                type="submit"
                                                disabled={formLoading || !formData.student_id}
                                                className="flex-1 py-3 text-white font-black rounded-xl transition hover:opacity-90 disabled:opacity-50"
                                                style={{ backgroundColor: BRAND }}
                                            >
                                                {formLoading ? '儲存中...' : editingId ? '更新記錄' : '儲存記錄'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { setShowForm(false); setEditingId(null); resetForm(); }}
                                                className="px-4 py-3 border border-gray-200 text-gray-500 font-bold rounded-xl hover:bg-gray-50 transition"
                                            >
                                                取消
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            ) : (
                                <div className="bg-white rounded-2xl shadow-sm border-2 border-dashed border-gray-200 p-10 text-center text-gray-400 sticky top-20">
                                    <div className="text-5xl mb-3 opacity-40">💰</div>
                                    <p className="font-bold text-sm">點選「+ 新增繳費紀錄」</p>
                                    <p className="text-xs mt-1">或點選左側記錄的「編輯」</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* === PARENT VIEW === */}
                {isParent && (
                    <div className="mt-4 space-y-6">
                        {myChildren.length === 0 ? (
                            <EmptyState title="尚未綁定學生" sub="請聯絡行政人員完成家長綁定" />
                        ) : (
                            <>
                                {myChildren.map(child => {
                                    const childRecords = records.filter(r => r.student_id === child.id);
                                    const childPaid = childRecords.filter(r => r.status === 'paid').reduce((s, r) => s + Number(r.amount), 0);
                                    const childPending = childRecords.filter(r => r.status !== 'paid').reduce((s, r) => s + Number(r.amount), 0);

                                    return (
                                        <div key={child.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                            {/* Section header */}
                                            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                                                <span className="font-black text-gray-800 text-base">{child.chinese_name}</span>
                                                <span className="text-xs px-2 py-0.5 rounded-full text-white font-bold" style={{ backgroundColor: BRAND }}>
                                                    {child.grade}
                                                </span>
                                            </div>

                                            {childRecords.length === 0 ? (
                                                <div className="px-5 py-8 text-center text-gray-400 text-sm">目前無繳費紀錄</div>
                                            ) : (
                                                <>
                                                    {/* Table */}
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-sm">
                                                            <thead>
                                                                <tr className="bg-gray-50 text-xs text-gray-500 font-bold">
                                                                    <th className="text-left px-5 py-3">項目</th>
                                                                    <th className="text-right px-5 py-3">金額</th>
                                                                    <th className="text-left px-5 py-3">繳費日期</th>
                                                                    <th className="text-left px-5 py-3">付款方式</th>
                                                                    <th className="text-left px-5 py-3">狀態</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {childRecords.map(rec => (
                                                                    <tr key={rec.id} className="border-t border-gray-50 hover:bg-gray-50/50 transition">
                                                                        <td className="px-5 py-3 font-bold text-gray-800">{rec.item}</td>
                                                                        <td className="px-5 py-3 text-right font-black" style={{ color: BRAND }}>
                                                                            {formatAmount(rec.amount)}
                                                                        </td>
                                                                        <td className="px-5 py-3 text-gray-500">{rec.paid_date}</td>
                                                                        <td className="px-5 py-3 text-gray-500">
                                                                            {METHOD_OPTIONS.find(m => m.value === rec.payment_method)?.label ?? rec.payment_method}
                                                                        </td>
                                                                        <td className="px-5 py-3">
                                                                            <StatusBadge status={rec.status} />
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    {/* Child stats */}
                                                    <div className="px-5 py-4 border-t border-gray-100 flex gap-6 bg-gray-50/50">
                                                        <div>
                                                            <p className="text-xs text-gray-400">已繳總計</p>
                                                            <p className="font-black text-green-600">{formatAmount(childPaid)}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs text-gray-400">待繳總計</p>
                                                            <p className="font-black text-orange-500">{formatAmount(childPending)}</p>
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Toast */}
            {toast && (
                <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-white font-bold transition-all ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
                    {toast.msg}
                </div>
            )}
        </div>
    );
}
