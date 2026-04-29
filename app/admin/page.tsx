'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import {
    PERMISSION_META, ALL_PERMISSION_KEYS, JOB_TITLE_PRESETS,
    HARDCODED_DEFAULTS, PermissionKey
} from '../../lib/permissions';
import { useToast, TOAST_CLASSES } from '../../lib/useToast';

const ENGLISH_CLASS_OPTIONS = [
    { value: 'NONE', label: '❌ 無英文主修 (純課後輔導)' },
    ...Array.from({ length: 26 }, (_, i) => ({
        value: `CEI-${String.fromCharCode(65 + i)}`,
        label: `CEI-${String.fromCharCode(65 + i)}`
    }))
];

const ROLE_CONFIG_ROLES = [
    { key: 'admin',            label: '💼 行政人員' },
    { key: 'teacher',          label: '👩‍🏫 老師' },
    { key: 'english_director', label: '🇬🇧 英文主任' },
    { key: 'care_director',    label: '🧸 安親主任' },
];

export default function AdminPage() {
    const router = useRouter();
    const [users, setUsers] = useState<any[]>([]);
    const [allStudents, setAllStudents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [accessChecked, setAccessChecked] = useState(false);
    const [hasAccess, setHasAccess] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentUser, setCurrentUser] = useState<any>(null);
    const { toast, showToast } = useToast();

    // Tab
    const [activeTab, setActiveTab] = useState<'users' | 'rolePerms'>('users');
    const [userSubTab, setUserSubTab] = useState<'staff' | 'parents' | 'pending'>('staff');

    // 綁定申請
    const [linkRequests, setLinkRequests] = useState<any[]>([]);

    // Modal 狀態
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<any>(null);
    const [selectedRole, setSelectedRole] = useState('parent');
    const [isApproved, setIsApproved] = useState(false);
    const [targetIsSuperAdmin, setTargetIsSuperAdmin] = useState(false);

    // 姓名
    const [editingName, setEditingName] = useState('');

    // 老師專屬
    const [editingTeacherType, setEditingTeacherType] = useState('');
    const [editingAvailableDays, setEditingAvailableDays] = useState<number[]>([]);

    // 職稱
    const [editingJobTitle, setEditingJobTitle] = useState('');

    // 個人權限覆蓋：null=沿用預設, true=強制開, false=強制關
    const [editingExtraPerms, setEditingExtraPerms] = useState<Record<string, boolean | null>>({});

    // 子女管理
    const [userChildren, setUserChildren] = useState<any[]>([]);
    const [newChildData, setNewChildData] = useState({ chinese_name: '', english_name: '', english_class: 'CEI-A', is_after_school: false });
    const [isEditChildOpen, setIsEditChildOpen] = useState(false);
    const [editingChild, setEditingChild] = useState<any>(null);
    const [teacherClasses, setTeacherClasses] = useState<string[]>([]);

    // 分頁
    const [staffPage, setStaffPage] = useState(0);
    const [parentsPage, setParentsPage] = useState(0);

    // 職位權限設定 Tab
    const [roleConfigs, setRoleConfigs] = useState<Record<string, Record<string, boolean>>>({});
    const [selectedRoleConfigRole, setSelectedRoleConfigRole] = useState('admin');
    const [editingRolePerms, setEditingRolePerms] = useState<Record<string, boolean>>({});
    const [savingRoleConfig, setSavingRoleConfig] = useState(false);

    useEffect(() => { checkAccess(); }, []);
    useEffect(() => { setStaffPage(0); setParentsPage(0); }, [searchTerm]);

    async function checkAccess() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/'); return; }
        const { data: userData } = await supabase.from('users').select('*').eq('id', session.user.id).single();
        const allowed = ['director', 'english_director', 'care_director', 'admin'];
        if (!userData || !allowed.includes(userData.role)) {
            router.push('/'); return;
        }
        setHasAccess(true);
        setAccessChecked(true);
        setCurrentUser(userData);
        fetchUsers();
        fetchRoleConfigs();
        fetchLinkRequests();
    }

    async function fetchUsers() {
        setLoading(true);
        const { data: usersData, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
        const { data: studentsData } = await supabase.from('students').select('id, parent_id, parent_id_2, chinese_name, grade');
        if (error) showToast('讀取失敗', 'error');
        else { setUsers(usersData || []); setAllStudents(studentsData || []); }
        setLoading(false);
    }

    async function fetchLinkRequests() {
        const { data } = await supabase
            .from('student_link_requests')
            .select(`*, parent:users!parent_id(email, name), student:students!matched_student_id(chinese_name, english_name, grade)`)
            .order('created_at', { ascending: false });
        setLinkRequests(data || []);
    }

    async function handleApproveLinkRequest(req: any) {
        try {
            // 綁定學生
            await supabase.from('students').update({ parent_id: req.parent_id }).eq('id', req.matched_student_id);
            // 標記已審核
            await supabase.from('student_link_requests').update({ status: 'approved', reviewed_by: currentUser.id }).eq('id', req.id);
            await logAction('審核綁定申請', `批准 ${req.parent?.email} 綁定 ${req.student?.chinese_name}`);
            fetchLinkRequests();
            fetchUsers();
            showToast('✅ 已批准，學生已連結至家長帳號');
        } catch (e: any) { showToast('❌ ' + e.message, 'error'); }
    }

    async function handleRejectLinkRequest(req: any) {
        const note = prompt('退回原因（可不填）：');
        if (note === null) return;
        await supabase.from('student_link_requests').update({ status: 'rejected', reviewed_by: currentUser.id, review_note: note }).eq('id', req.id);
        await logAction('退回綁定申請', `退回 ${req.parent?.email} 的申請`);
        fetchLinkRequests();
    }

    async function fetchRoleConfigs() {
        const { data } = await supabase.from('role_configs').select('*');
        if (data) {
            const map: Record<string, Record<string, boolean>> = {};
            data.forEach((row: any) => { map[row.role] = row.permissions || {}; });
            setRoleConfigs(map);
            const initPerms = map['admin'] || (HARDCODED_DEFAULTS['admin'] as Record<string, boolean>);
            setEditingRolePerms({ ...initPerms });
        }
    }

    async function logAction(action: string, details: string) {
        await supabase.from('system_logs').insert({ operator_email: currentUser?.email, action, details });
    }

    async function openEditModal(user: any) {
        setEditingUser(user);
        setSelectedRole(user.role);
        setIsApproved(user.is_approved || false);
        setTargetIsSuperAdmin(user.is_super_admin || false);
        setEditingName(user.name || '');
        setEditingJobTitle(user.job_title || '');
        setEditingTeacherType(user.teacher_type || '');
        setEditingAvailableDays(user.available_days || []);
        setEditingExtraPerms(user.extra_permissions || {});
        try { setTeacherClasses(JSON.parse(user.responsible_classes || '[]')); }
        catch { setTeacherClasses([]); }
        setNewChildData({ chinese_name: '', english_name: '', english_class: 'CEI-A', is_after_school: false });
        const { data: children } = await supabase.from('students').select('*').or(`parent_id.eq.${user.id},parent_id_2.eq.${user.id}`);
        setUserChildren(children || []);
        setIsModalOpen(true);
    }

    async function handleSaveUserConfig() {
        if (!editingUser) return;
        try {
            const cleanedExtraPerms: Record<string, boolean> = {};
            Object.entries(editingExtraPerms).forEach(([k, v]) => {
                if (v === true || v === false) cleanedExtraPerms[k] = v;
            });
            const updates: any = {
                name: editingName.trim() || null,
                role: selectedRole,
                is_approved: isApproved,
                job_title: editingJobTitle.trim() || null,
                extra_permissions: cleanedExtraPerms,
            };
            if (['teacher', 'english_director', 'care_director'].includes(selectedRole)) {
                updates.responsible_classes = JSON.stringify(teacherClasses);
                updates.teacher_type = editingTeacherType || null;
                updates.available_days = editingAvailableDays;
            }
            if (currentUser.is_super_admin && ['director', 'english_director', 'care_director', 'admin'].includes(selectedRole)) {
                updates.is_super_admin = targetIsSuperAdmin;
            }
            if (selectedRole === 'parent') updates.is_super_admin = false;
            const { error } = await supabase.from('users').update(updates).eq('id', editingUser.id);
            if (error) throw error;
            await logAction('更新用戶設定', `更新 ${editingUser.email} → 角色:${selectedRole}, 職稱:${editingJobTitle}`);
            showToast('✅ 設定已更新');
            fetchUsers();
            setIsModalOpen(false);
        } catch (e: any) { showToast('❌ 失敗: ' + e.message, 'error'); }
    }

    function selectRoleConfigRole(role: string) {
        setSelectedRoleConfigRole(role);
        const current = roleConfigs[role] || (HARDCODED_DEFAULTS[role] as Record<string, boolean>) || {};
        setEditingRolePerms({ ...current });
    }

    async function saveRoleConfig() {
        setSavingRoleConfig(true);
        try {
            const { error } = await supabase.from('role_configs').upsert({
                role: selectedRoleConfigRole, permissions: editingRolePerms, updated_at: new Date().toISOString()
            });
            if (error) throw error;
            setRoleConfigs(prev => ({ ...prev, [selectedRoleConfigRole]: editingRolePerms }));
            await logAction('修改職位權限', `修改 ${selectedRoleConfigRole} 的預設權限`);
            showToast('✅ 職位預設權限已儲存');
        } catch (e: any) { showToast('❌ 失敗: ' + e.message, 'error'); }
        setSavingRoleConfig(false);
    }

    async function handleAddChild() {
        if (!newChildData.chinese_name) { showToast('請輸入姓名', 'info'); return; }
        try {
            let finalGrade = newChildData.english_class;
            if (finalGrade === 'NONE') finalGrade = newChildData.is_after_school ? '課後輔導' : '未分類';
            else if (newChildData.is_after_school) finalGrade += ', 課後輔導';
            const { data, error } = await supabase.from('students').insert({
                chinese_name: newChildData.chinese_name, english_name: newChildData.english_name,
                grade: finalGrade, parent_id: editingUser.id, school_grade: '國小 一年級'
            }).select();
            if (error) throw error;
            await logAction('新增子女', `新增學生：${newChildData.chinese_name}`);
            setUserChildren([...userChildren, data[0]]);
            setNewChildData({ chinese_name: '', english_name: '', english_class: 'CEI-A', is_after_school: false });
            fetchUsers();
        } catch (e: any) { showToast('❌ ' + e.message, 'error'); }
    }

    function openEditChild(child: any) {
        let eng = 'CEI-A', after = false;
        if (child.grade) {
            if (child.grade.includes('課後輔導')) after = true;
            let temp = child.grade.replace(', 課後輔導', '').replace('課後輔導', '').trim();
            if (temp.endsWith(',')) temp = temp.slice(0, -1);
            eng = (temp !== '' && temp !== '未分類') ? temp : 'NONE';
        }
        setEditingChild({ id: child.id, chinese_name: child.chinese_name, english_name: child.english_name || '', english_class: eng, is_after_school: after });
        setIsEditChildOpen(true);
    }

    async function handleSaveChild() {
        if (!editingChild) return;
        try {
            let finalGrade = editingChild.english_class;
            if (finalGrade === 'NONE') finalGrade = editingChild.is_after_school ? '課後輔導' : '未分類';
            else if (editingChild.is_after_school) finalGrade += ', 課後輔導';
            const { error } = await supabase.from('students').update({
                chinese_name: editingChild.chinese_name, english_name: editingChild.english_name, grade: finalGrade
            }).eq('id', editingChild.id);
            if (error) throw error;
            await logAction('修改學生資料', `修改 ID ${editingChild.id}`);
            setUserChildren(userChildren.map(c => c.id === editingChild.id ? { ...c, ...editingChild, grade: finalGrade } : c));
            setIsEditChildOpen(false);
            fetchUsers();
        } catch (e: any) { showToast('❌ ' + e.message, 'error'); }
    }

    async function handleUnbindChild(id: string, name: string) {
        if (!confirm(`確定要解除與 ${name} 的綁定嗎？`)) return;
        try {
            const child = userChildren.find(c => c.id === id);
            const updates: any = {};
            if (child.parent_id === editingUser.id) updates.parent_id = null;
            if (child.parent_id_2 === editingUser.id) updates.parent_id_2 = null;
            await supabase.from('students').update(updates).eq('id', id);
            await logAction('解除綁定', `解除 ${editingUser.email} 與 ${name}`);
            setUserChildren(userChildren.filter(c => c.id !== id));
            fetchUsers();
        } catch (e: any) { showToast('❌ ' + e.message, 'error'); }
    }

    function toggleClass(cls: string) {
        setTeacherClasses(prev => prev.includes(cls) ? prev.filter(c => c !== cls) : [...prev, cls]);
    }

    async function handleDeleteUser(id: string, email: string) {
        if (!confirm(`⚠️ 確定要刪除 ${email} 嗎？此動作無法復原。`)) return;
        if (currentUser.id === id) { showToast('❌ 您不能刪除自己的帳號', 'error'); return; }
        const { error } = await supabase.from('users').delete().eq('id', id);
        if (error) showToast('刪除失敗', 'error');
        else { await logAction('刪除用戶', `刪除使用者 ${email}`); fetchUsers(); }
    }

    const getTeacherClasses = (jsonString: string) => {
        try {
            const classes = JSON.parse(jsonString || '[]');
            if (classes.length === 0) return <span className="text-gray-400 text-xs">尚無班級</span>;
            return classes.map((c: string) => (
                <span key={c} className="mr-1 inline-block bg-orange-100 text-orange-700 text-[10px] px-1.5 py-0.5 rounded border border-orange-200">{c.replace('CEI-', '')}</span>
            ));
        } catch { return null; }
    };

    const getParentChildren = (userId: string) => {
        const children = allStudents.filter(s => s.parent_id === userId || s.parent_id_2 === userId);
        if (children.length === 0) return <span className="text-gray-400 text-xs">尚無綁定</span>;
        return children.map(c => (
            <span key={c.id} className="mr-1 inline-block bg-blue-50 text-blue-600 text-[10px] px-1.5 py-0.5 rounded border border-blue-100 font-bold">{c.chinese_name}</span>
        ));
    };

    const getRoleBadge = (role: string) => {
        const map: Record<string, { label: string; cls: string }> = {
            parent:           { label: '🏠 家長',      cls: 'bg-green-100 text-green-700 border-green-200' },
            teacher:          { label: '👩‍🏫 老師',     cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
            director:         { label: '👑 總園長',     cls: 'bg-amber-100 text-amber-700 border-amber-200' },
            english_director: { label: '🇬🇧 英文主任', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
            care_director:    { label: '🧸 安親主任',   cls: 'bg-pink-100 text-pink-700 border-pink-200' },
            admin:            { label: '💼 行政人員',   cls: 'bg-gray-100 text-gray-700 border-gray-200' },
        };
        const { label, cls } = map[role] || { label: role, cls: 'bg-gray-100 text-gray-600 border-gray-200' };
        return <span className={`px-2 py-0.5 rounded text-xs font-black border inline-block ${cls}`}>{label}</span>;
    };

    // 三段切換按鈕元件
    function TriToggle({ permKey, roleDefault }: { permKey: string; roleDefault: boolean }) {
        const val = editingExtraPerms[permKey] ?? null;
        const set = (v: boolean | null) => setEditingExtraPerms(prev => ({ ...prev, [permKey]: v }));
        return (
            <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs font-bold flex-shrink-0">
                <button onClick={() => set(null)}  className={`px-2.5 py-1.5 transition ${val === null  ? 'bg-slate-300 text-slate-700' : 'bg-white text-gray-400 hover:bg-gray-50'}`}>依預設</button>
                <button onClick={() => set(true)}  className={`px-2.5 py-1.5 border-x border-gray-200 transition ${val === true  ? 'bg-green-500 text-white' : 'bg-white text-gray-400 hover:bg-green-50'}`}>強制開</button>
                <button onClick={() => set(false)} className={`px-2.5 py-1.5 transition ${val === false ? 'bg-red-500 text-white'   : 'bg-white text-gray-400 hover:bg-red-50'}`}>強制關</button>
            </div>
        );
    }

    const PAGE_SIZE = 30;
    const pendingRequests = linkRequests.filter(r => r.status === 'pending');
    const pendingUsers = users.filter(u => u.role === 'pending');
    const totalPendingCount = pendingUsers.length + pendingRequests.length;
    const staffRoles = ['teacher', 'english_director', 'care_director', 'director', 'admin', 'manager'];
    const filteredStaff = users.filter(u =>
        staffRoles.includes(u.role) &&
        ((u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
         (u.name || '').includes(searchTerm) ||
         (u.role || '').includes(searchTerm) ||
         (u.job_title || '').includes(searchTerm))
    );
    const filteredParents = users.filter(u =>
        u.role === 'parent' &&
        ((u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
         (u.name || '').includes(searchTerm))
    );

    const staffTotalPages = Math.ceil(filteredStaff.length / PAGE_SIZE);
    const parentsTotalPages = Math.ceil(filteredParents.length / PAGE_SIZE);
    const pagedStaff = filteredStaff.slice(staffPage * PAGE_SIZE, (staffPage + 1) * PAGE_SIZE);
    const pagedParents = filteredParents.slice(parentsPage * PAGE_SIZE, (parentsPage + 1) * PAGE_SIZE);

    if (!accessChecked) return <div className="p-10 text-center font-bold text-gray-400">驗證中...</div>;
    if (!hasAccess) return null;
    if (loading) return <div className="p-10 text-center font-bold text-gray-400">載入中...</div>;

    return (
        <div className="min-h-screen bg-[#F3F4F6] p-4 md:p-6 font-sans">
            {toast && (
                <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-white font-bold text-sm ${TOAST_CLASSES[toast.type]}`}>
                    {toast.msg}
                </div>
            )}
            <div className="max-w-7xl mx-auto">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                    <h1 className="text-3xl font-black text-gray-800">👥 人事管理系統</h1>
                    <div className="flex gap-3 w-full md:w-auto">
                        <button onClick={() => router.push('/')} className="bg-white text-gray-600 px-4 py-2 rounded-xl font-bold border border-gray-200 hover:bg-gray-50 transition whitespace-nowrap shadow-sm">🏠 回首頁</button>
                        {currentUser?.is_super_admin && (
                            <button onClick={() => router.push('/admin/logs')} className="bg-gray-800 text-white px-4 py-2 rounded-xl font-bold hover:bg-black transition whitespace-nowrap shadow-lg">📜 監控日誌</button>
                        )}
                        <input type="text" placeholder="🔍 搜尋帳號/職稱..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="p-2 w-full border rounded-xl font-bold" />
                    </div>
                </div>

                {/* 🔔 待審核提示橫幅 */}
                {totalPendingCount > 0 && (
                    <button onClick={() => { setActiveTab('users'); setUserSubTab('pending'); }}
                        className="w-full bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mb-5 flex items-center gap-3 hover:bg-orange-100 transition text-left">
                        <span className="w-2.5 h-2.5 rounded-full bg-orange-400 animate-pulse shrink-0" />
                        <p className="text-sm font-bold text-orange-800 flex-1">
                            有 <strong>{totalPendingCount}</strong> 件待審核事項
                            {pendingUsers.length > 0 && <span className="ml-1 text-orange-600">（{pendingUsers.length} 個新帳號）</span>}
                            {pendingRequests.length > 0 && <span className="ml-1 text-orange-600">（{pendingRequests.length} 件綁定申請）</span>}
                        </p>
                        <span className="text-xs font-bold text-orange-500 shrink-0">前往審核 →</span>
                    </button>
                )}

                {/* Tab Bar + Content */}
                <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                    <div className="flex border-b">
                        <button onClick={() => setActiveTab('users')} className={`px-6 py-4 text-sm font-bold transition ${activeTab === 'users' ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
                            👥 帳號管理
                        </button>
                        {currentUser?.role === 'director' && (
                            <button onClick={() => setActiveTab('rolePerms')} className={`px-6 py-4 text-sm font-bold transition ${activeTab === 'rolePerms' ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
                                🔐 職位權限設定
                            </button>
                        )}
                    </div>

                    {/* ── 帳號管理 Tab ── */}
                    {activeTab === 'users' && (
                        <div>
                            {/* Sub-tab bar */}
                            <div className="flex border-b bg-gray-50 px-4 gap-1 pt-2">
                                <button onClick={() => setUserSubTab('staff')} className={`px-5 py-2.5 text-sm font-bold rounded-t-lg transition ${userSubTab === 'staff' ? 'bg-white border border-b-white border-gray-200 text-indigo-600 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>
                                    👨‍🏫 老師 / 員工 <span className="ml-1.5 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{filteredStaff.length}</span>
                                </button>
                                <button onClick={() => setUserSubTab('parents')} className={`px-5 py-2.5 text-sm font-bold rounded-t-lg transition ${userSubTab === 'parents' ? 'bg-white border border-b-white border-gray-200 text-indigo-600 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>
                                    👪 家長 <span className="ml-1.5 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{filteredParents.length}</span>
                                </button>
                                <button onClick={() => setUserSubTab('pending')} className={`px-5 py-2.5 text-sm font-bold rounded-t-lg transition ${userSubTab === 'pending' ? 'bg-white border border-b-white border-gray-200 text-orange-600 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>
                                    ⏳ 待審核
                                    {totalPendingCount > 0 && (
                                        <span className="ml-1.5 text-xs bg-orange-500 text-white px-1.5 py-0.5 rounded-full animate-pulse">{totalPendingCount}</span>
                                    )}
                                </button>
                            </div>

                            {/* ── 老師/員工 Sub-tab ── */}
                            {userSubTab === 'staff' && (
                                <>
                                <table className="w-full text-left">
                                    <thead className="bg-gray-50 border-b">
                                        <tr>
                                            <th className="p-4 text-xs font-black text-gray-500">姓名 / EMAIL</th>
                                            <th className="p-4 text-xs font-black text-gray-500">角色 / 職稱</th>
                                            <th className="p-4 text-xs font-black text-gray-500">負責班級</th>
                                            <th className="p-4 text-xs font-black text-gray-500 text-right">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pagedStaff.map(u => (
                                            <tr key={u.id} className="border-t hover:bg-gray-50">
                                                <td className="p-4">
                                                    {u.name && <div className="font-black text-sm text-gray-900">{u.name}</div>}
                                                    <div className={`text-sm ${u.name ? 'text-gray-400 text-xs' : 'font-bold text-gray-800'}`}>{u.email}</div>
                                                    {u.is_super_admin && <span className="inline-block mt-1 text-[10px] bg-red-100 text-red-600 px-1.5 rounded font-bold border border-red-200">SUPER</span>}
                                                    {!u.is_approved && <span className="inline-block mt-1 ml-1 text-[10px] bg-yellow-100 text-yellow-700 px-1.5 rounded font-bold border border-yellow-200">待審核</span>}
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex flex-col gap-1">
                                                        {getRoleBadge(u.role)}
                                                        {u.job_title && <span className="text-xs text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded w-fit">{u.job_title}</span>}
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    {['teacher', 'english_director', 'care_director'].includes(u.role) && (
                                                        <div className="flex flex-wrap items-center gap-1">
                                                            {getTeacherClasses(u.responsible_classes)}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-4 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={() => openEditModal(u)} className="text-indigo-600 font-bold text-xs hover:bg-indigo-50 px-3 py-1.5 rounded border border-indigo-200 transition">⚙️ 設定</button>
                                                        <button onClick={() => handleDeleteUser(u.id, u.email)} className="text-red-500 font-bold text-xs hover:bg-red-50 px-3 py-1.5 rounded border border-red-200 transition">刪除</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {staffTotalPages > 1 && (
                                    <div className="flex justify-center items-center gap-2 py-3 border-t bg-gray-50">
                                        <button onClick={() => setStaffPage(p => Math.max(0, p - 1))} disabled={staffPage === 0} className="px-3 py-1 rounded border text-sm font-bold disabled:opacity-40 hover:bg-white">← 上一頁</button>
                                        <span className="text-sm text-gray-500 font-bold">{staffPage + 1} / {staffTotalPages}</span>
                                        <button onClick={() => setStaffPage(p => Math.min(staffTotalPages - 1, p + 1))} disabled={staffPage >= staffTotalPages - 1} className="px-3 py-1 rounded border text-sm font-bold disabled:opacity-40 hover:bg-white">下一頁 →</button>
                                    </div>
                                )}
                                </>
                            )}

                            {/* ── 家長 Sub-tab ── */}
                            {userSubTab === 'parents' && (
                                <div>
                                    {/* 家長清單 */}
                                    <table className="w-full text-left">
                                        <thead className="bg-gray-50 border-b">
                                            <tr>
                                                <th className="p-4 text-xs font-black text-gray-500">姓名 / EMAIL</th>
                                                <th className="p-4 text-xs font-black text-gray-500">已綁定學生</th>
                                                <th className="p-4 text-xs font-black text-gray-500 text-right">操作</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pagedParents.map(u => (
                                                <tr key={u.id} className="border-t hover:bg-gray-50">
                                                    <td className="p-4">
                                                        {u.name && <div className="font-black text-sm text-gray-900">{u.name}</div>}
                                                        <div className={`text-sm ${u.name ? 'text-gray-400 text-xs' : 'font-bold text-gray-800'}`}>{u.email}</div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex flex-wrap gap-1">
                                                            {getParentChildren(u.id)}
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <button onClick={() => openEditModal(u)} className="text-indigo-600 font-bold text-xs hover:bg-indigo-50 px-3 py-1.5 rounded border border-indigo-200 transition">⚙️ 設定</button>
                                                            <button onClick={() => handleDeleteUser(u.id, u.email)} className="text-red-500 font-bold text-xs hover:bg-red-50 px-3 py-1.5 rounded border border-red-200 transition">刪除</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {parentsTotalPages > 1 && (
                                        <div className="flex justify-center items-center gap-2 py-3 border-t bg-gray-50">
                                            <button onClick={() => setParentsPage(p => Math.max(0, p - 1))} disabled={parentsPage === 0} className="px-3 py-1 rounded border text-sm font-bold disabled:opacity-40 hover:bg-white">← 上一頁</button>
                                            <span className="text-sm text-gray-500 font-bold">{parentsPage + 1} / {parentsTotalPages}</span>
                                            <button onClick={() => setParentsPage(p => Math.min(parentsTotalPages - 1, p + 1))} disabled={parentsPage >= parentsTotalPages - 1} className="px-3 py-1 rounded border text-sm font-bold disabled:opacity-40 hover:bg-white">下一頁 →</button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── 待審核 Sub-tab ── */}
                            {userSubTab === 'pending' && (
                                <div className="p-5 space-y-6">
                                    {totalPendingCount === 0 ? (
                                        <div className="py-16 text-center">
                                            <div className="text-5xl mb-3 opacity-30">✅</div>
                                            <p className="text-sm font-bold text-gray-400">目前沒有待審核事項</p>
                                            <p className="text-xs text-gray-300 mt-1">所有帳號與綁定申請已處理完畢</p>
                                        </div>
                                    ) : (
                                        <>
                                            {/* 新帳號審核 */}
                                            {pendingUsers.length > 0 && (
                                                <div>
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <h3 className="text-sm font-black text-gray-700">🆕 新帳號審核</h3>
                                                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">{pendingUsers.length} 個等待開通</span>
                                                    </div>
                                                    <div className="space-y-3">
                                                        {pendingUsers.map(u => {
                                                            const isTeacher = u.pending_role === 'teacher';
                                                            return (
                                                            <div key={u.id} className="bg-white border border-orange-200 rounded-xl p-4">
                                                                <div className="flex items-start gap-4">
                                                                    {/* Avatar + 身分 badge */}
                                                                    <div className="shrink-0 flex flex-col items-center gap-1.5">
                                                                        <div className="w-11 h-11 rounded-full flex items-center justify-center text-base font-black shrink-0"
                                                                            style={{ backgroundColor: isTeacher ? '#EBF4EE' : '#EFF6FF', color: isTeacher ? '#1A4B2E' : '#1D4ED8' }}>
                                                                            {(u.name || u.email || '?')[0].toUpperCase()}
                                                                        </div>
                                                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                                                                            style={{ backgroundColor: isTeacher ? '#EBF4EE' : '#EFF6FF', color: isTeacher ? '#1A4B2E' : '#1D4ED8' }}>
                                                                            {isTeacher ? '👩‍🏫 員工' : '👪 家長'}
                                                                        </span>
                                                                    </div>
                                                                    {/* 詳細資訊 */}
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                                                            <p className="font-black text-gray-800 text-sm">
                                                                                {u.name || <span className="text-gray-400 italic font-normal">未填姓名</span>}
                                                                            </p>
                                                                        </div>
                                                                        <p className="text-xs text-gray-500">{u.email}</p>
                                                                        {u.phone && <p className="text-xs text-gray-500 mt-0.5">📞 {u.phone}</p>}
                                                                        <p className="text-[10px] text-gray-400 mt-1">申請時間：{new Date(u.created_at).toLocaleString('zh-TW')}</p>
                                                                    </div>
                                                                    {/* 操作按鈕 */}
                                                                    <div className="flex flex-col gap-2 shrink-0">
                                                                        <button
                                                                            onClick={() => {
                                                                                openEditModal(u);
                                                                                setIsApproved(true);
                                                                                // 自動帶入申請的角色
                                                                                setSelectedRole(u.pending_role === 'teacher' ? 'teacher' : 'parent');
                                                                            }}
                                                                            className="text-xs font-bold px-4 py-2 rounded-lg text-white transition hover:opacity-90 whitespace-nowrap"
                                                                            style={{ backgroundColor: '#1A4B2E' }}
                                                                        >
                                                                            ⚙️ 審核開通
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleDeleteUser(u.id, u.email)}
                                                                            className="text-xs font-bold px-3 py-1.5 rounded-lg text-red-500 border border-red-200 hover:bg-red-50 transition whitespace-nowrap"
                                                                        >
                                                                            ✕ 拒絕
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* 家長綁定申請 */}
                                            {pendingRequests.length > 0 && (
                                                <div>
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <h3 className="text-sm font-black text-gray-700">🔗 家長綁定申請</h3>
                                                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">{pendingRequests.length} 件待審核</span>
                                                    </div>
                                                    <div className="space-y-3">
                                                        {pendingRequests.map(req => (
                                                            <div key={req.id} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-4">
                                                                <div className="flex-1 space-y-1.5">
                                                                    <div className="font-bold text-sm text-gray-800">
                                                                        👤 {req.parent?.name || req.parent?.email}
                                                                        <span className="text-gray-400 font-normal text-xs ml-2">{req.parent?.email}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 text-xs">
                                                                        <span className="text-gray-500">申請綁定：</span>
                                                                        <span className="font-bold text-gray-700">{req.submitted_chinese_name} {req.submitted_english_name}</span>
                                                                        <span className="text-gray-400">（電話：{req.submitted_phone}）</span>
                                                                    </div>
                                                                    {req.student ? (
                                                                        <div className="flex items-center gap-2 text-xs">
                                                                            <span className="text-green-600 font-bold">✅ 系統比對到：</span>
                                                                            <span className="font-bold text-gray-800">{req.student.chinese_name} {req.student.english_name}</span>
                                                                            <span className="bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">{req.student.grade}</span>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="text-xs text-orange-600 font-bold">⚠️ 未自動比對到學生，請手動確認</div>
                                                                    )}
                                                                    <p className="text-[10px] text-gray-400">申請時間：{new Date(req.created_at).toLocaleString('zh-TW')}</p>
                                                                </div>
                                                                <div className="flex gap-2 shrink-0">
                                                                    {req.matched_student_id && (
                                                                        <button onClick={() => handleApproveLinkRequest(req)} className="bg-green-600 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-green-700 transition">✅ 確認綁定</button>
                                                                    )}
                                                                    <button onClick={() => handleRejectLinkRequest(req)} className="bg-white text-red-500 text-xs font-bold px-4 py-2 rounded-lg border border-red-200 hover:bg-red-50 transition">❌ 退回</button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── 職位權限設定 Tab ── */}
                    {activeTab === 'rolePerms' && (
                        <div className="p-6">
                            <p className="text-sm text-gray-500 mb-5">調整每個職位的預設功能開關。個人額外授權優先，職位預設影響該職位所有未另設定的人。</p>
                            <div className="flex flex-wrap gap-2 mb-6">
                                {ROLE_CONFIG_ROLES.map(r => (
                                    <button key={r.key} onClick={() => selectRoleConfigRole(r.key)}
                                        className={`px-4 py-2 rounded-xl text-sm font-bold border-2 transition ${selectedRoleConfigRole === r.key ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-indigo-300'}`}>
                                        {r.label}
                                    </button>
                                ))}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                                {ALL_PERMISSION_KEYS.map(key => (
                                    <div key={key} className="flex justify-between items-center p-3 rounded-xl border border-gray-100 hover:bg-gray-50">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">{PERMISSION_META[key].icon}</span>
                                            <span className="text-sm font-bold text-gray-700">{PERMISSION_META[key].label}</span>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" className="sr-only peer"
                                                checked={editingRolePerms[key] ?? false}
                                                onChange={e => setEditingRolePerms(prev => ({ ...prev, [key]: e.target.checked }))} />
                                            <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500 after:shadow"></div>
                                        </label>
                                    </div>
                                ))}
                            </div>
                            <button onClick={saveRoleConfig} disabled={savingRoleConfig}
                                className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition disabled:opacity-50">
                                {savingRoleConfig ? '儲存中...' : '💾 儲存職位預設權限'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── 編輯 Modal ── */}
            {isModalOpen && editingUser && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center z-10">
                            <div>
                                <h3 className="font-black text-xl text-gray-800">{editingUser.name || '用戶設定'}</h3>
                                <p className="text-xs text-gray-500">{editingUser.email}</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 font-bold text-gray-500">✕</button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* 0. 姓名 */}
                            <div>
                                <label className="block text-xs font-black text-gray-400 mb-2 uppercase">0. 真實姓名</label>
                                <input
                                    type="text"
                                    value={editingName}
                                    onChange={e => setEditingName(e.target.value)}
                                    placeholder="例：王小明"
                                    className="w-full p-3 border rounded-xl font-bold bg-gray-50 focus:ring-2 focus:ring-indigo-300 outline-none"
                                />
                                <p className="text-xs text-gray-400 mt-1">顯示於排課系統、聯絡簿、聊天等所有位置</p>
                            </div>

                            {/* 1. 角色 */}
                            <div>
                                <label className="block text-xs font-black text-gray-400 mb-2 uppercase">1. 系統角色（決定基礎權限）</label>
                                <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)} className="w-full p-3 border rounded-xl font-bold bg-gray-50">
                                    <option value="parent">🏠 家長</option>
                                    <option value="teacher">👩‍🏫 老師</option>
                                    <option disabled>──────────</option>
                                    <option value="director">👑 總園長</option>
                                    <option value="english_director">🇬🇧 英文部主任</option>
                                    <option value="care_director">🧸 安親部主任</option>
                                    <option value="admin">💼 行政人員</option>
                                </select>
                                <div className={`mt-3 p-3 rounded-xl border flex items-center justify-between ${isApproved ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                                    <div>
                                        <p className={`font-bold text-sm ${isApproved ? 'text-green-700' : 'text-gray-500'}`}>{isApproved ? '✅ 帳號已啟用' : '⛔ 停用/審核中'}</p>
                                        <p className="text-xs text-gray-400">{isApproved ? '使用者可正常登入' : '使用者將看到審核中畫面'}</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={isApproved} onChange={e => setIsApproved(e.target.checked)} className="sr-only peer" />
                                        <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                                    </label>
                                </div>
                                {currentUser.is_super_admin && ['director', 'english_director', 'care_director', 'admin'].includes(selectedRole) && (
                                    <div className="mt-3 flex items-center gap-2 bg-red-50 p-3 rounded-xl border border-red-100">
                                        <input type="checkbox" checked={targetIsSuperAdmin} onChange={e => setTargetIsSuperAdmin(e.target.checked)} className="accent-red-600 w-5 h-5" />
                                        <span className="font-bold text-red-700 text-sm">👑 授予最高權限</span>
                                    </div>
                                )}
                            </div>

                            {/* 2. 職稱 */}
                            {selectedRole !== 'parent' && (
                                <div>
                                    <label className="block text-xs font-black text-gray-400 mb-2 uppercase">2. 顯示職稱（選填）</label>
                                    <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                                        {(JOB_TITLE_PRESETS[selectedRole] || []).length > 0 && (
                                            <div className="flex flex-wrap gap-2 mb-3">
                                                {(JOB_TITLE_PRESETS[selectedRole] || []).map((t: string) => (
                                                    <button key={t} onClick={() => setEditingJobTitle(t)}
                                                        className={`px-3 py-1 rounded-full text-xs font-bold border transition ${editingJobTitle === t ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'}`}>
                                                        {t}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        <input type="text" value={editingJobTitle} maxLength={20}
                                            onChange={e => setEditingJobTitle(e.target.value)}
                                            placeholder="或手動輸入職稱..."
                                            className="w-full p-2.5 border border-indigo-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-300" />
                                        <p className="text-xs text-indigo-400 mt-1">職稱顯示於 Header、聊天室、聯絡簿等位置（最多 20 字）</p>
                                    </div>
                                </div>
                            )}

                            {/* 3. 負責班級 */}
                            {['teacher', 'english_director', 'care_director'].includes(selectedRole) && (
                                <div>
                                    <label className="block text-xs font-black text-gray-400 mb-2 uppercase">3. 負責班級</label>
                                    <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                            {ENGLISH_CLASS_OPTIONS.filter(o => o.value !== 'NONE').map(opt => (
                                                <label key={opt.value} className="flex items-center gap-2 bg-white p-2 rounded border cursor-pointer hover:border-indigo-400">
                                                    <input type="checkbox" checked={teacherClasses.includes(opt.value)} onChange={() => toggleClass(opt.value)} className="accent-indigo-600" />
                                                    <span className="text-xs font-bold">{opt.label.split('-')[1]}</span>
                                                </label>
                                            ))}
                                            <label className="flex items-center gap-2 bg-white p-2 rounded border cursor-pointer hover:border-indigo-400 col-span-2">
                                                <input type="checkbox" checked={teacherClasses.includes('課後輔導')} onChange={() => toggleClass('課後輔導')} className="accent-indigo-600" />
                                                <span className="text-xs font-bold">課後輔導</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 3b. 老師類型與可來天數 */}
                            {['teacher', 'english_director', 'care_director'].includes(selectedRole) && (
                                <div>
                                    <label className="block text-xs font-black text-gray-400 mb-2 uppercase">3b. 老師類型與可來天數</label>
                                    <div className="bg-teal-50 p-4 rounded-xl border border-teal-100 space-y-4">
                                        {/* 老師類型 */}
                                        <div>
                                            <p className="text-xs font-bold text-teal-700 mb-2">老師類型</p>
                                            <div className="grid grid-cols-3 gap-2">
                                                {[
                                                    { value: 'foreign', label: '🌎 外籍老師' },
                                                    { value: 'external', label: '🏃 外聘老師' },
                                                    { value: 'staff', label: '🏫 全職員工' },
                                                ].map(opt => (
                                                    <button
                                                        key={opt.value}
                                                        type="button"
                                                        onClick={() => setEditingTeacherType(opt.value)}
                                                        className={`p-2 rounded-lg border-2 text-xs font-bold transition ${editingTeacherType === opt.value ? 'border-teal-500 bg-teal-500 text-white' : 'border-gray-200 bg-white text-gray-500 hover:border-teal-300'}`}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        {/* 可來天數 */}
                                        <div>
                                            <p className="text-xs font-bold text-teal-700 mb-2">可來天數（可多選）</p>
                                            <div className="flex gap-2">
                                                {[
                                                    { day: 1, label: '一' },
                                                    { day: 2, label: '二' },
                                                    { day: 3, label: '三' },
                                                    { day: 4, label: '四' },
                                                    { day: 5, label: '五' },
                                                ].map(({ day, label }) => (
                                                    <button
                                                        key={day}
                                                        type="button"
                                                        onClick={() => setEditingAvailableDays(prev =>
                                                            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
                                                        )}
                                                        className={`flex-1 py-2 rounded-lg border-2 text-sm font-black transition ${editingAvailableDays.includes(day) ? 'border-teal-500 bg-teal-500 text-white' : 'border-gray-200 bg-white text-gray-500 hover:border-teal-300'}`}
                                                    >
                                                        週{label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 4. 個人權限覆蓋 */}
                            {selectedRole !== 'parent' && selectedRole !== 'director' && (
                                <div>
                                    <label className="block text-xs font-black text-gray-400 mb-1 uppercase">4. 個人權限覆蓋</label>
                                    <p className="text-xs text-gray-400 mb-3">「依預設」沿用職位設定；「強制開/關」無論職位預設為何都生效</p>
                                    <div className="border rounded-xl overflow-hidden">
                                        {ALL_PERMISSION_KEYS.map((key, idx) => {
                                            const roleDef = ((roleConfigs[selectedRole] ?? HARDCODED_DEFAULTS[selectedRole] ?? {}) as Record<string, boolean>)[key] ?? false;
                                            return (
                                                <div key={key} className={`flex justify-between items-center px-4 py-3 gap-3 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-base flex-shrink-0">{PERMISSION_META[key].icon}</span>
                                                        <span className="text-sm font-bold text-gray-700 truncate">{PERMISSION_META[key].label}</span>
                                                        <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${roleDef ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                                                            預設{roleDef ? '開' : '關'}
                                                        </span>
                                                    </div>
                                                    <TriToggle permKey={key} roleDefault={roleDef} />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* 5. 子女管理（家長） */}
                            {selectedRole === 'parent' && (
                                <div>
                                    <label className="block text-xs font-black text-gray-400 mb-3 uppercase">2. 子女管理</label>
                                    <div className="space-y-2 mb-4">
                                        {userChildren.map(child => (
                                            <div key={child.id} className="flex justify-between items-center p-3 bg-white rounded-xl border shadow-sm">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">{child.chinese_name?.[0]}</div>
                                                    <div>
                                                        <div className="font-bold text-sm">{child.chinese_name} <span className="text-gray-400 text-xs">{child.english_name}</span></div>
                                                        <div className="text-[10px] text-indigo-500 font-bold bg-indigo-50 px-1.5 py-0.5 rounded w-fit">{child.grade}</div>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button onClick={() => openEditChild(child)} className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded text-xs font-bold hover:bg-gray-200 border">✏️ 編輯</button>
                                                    <button onClick={() => handleUnbindChild(child.id, child.chinese_name)} className="bg-red-50 text-red-500 px-3 py-1.5 rounded text-xs font-bold hover:bg-red-100 border border-red-100">解除</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 space-y-2">
                                        <h5 className="font-bold text-indigo-800 text-xs">➕ 新增子女並綁定</h5>
                                        <div className="flex gap-2">
                                            <input placeholder="中文名（必填）" value={newChildData.chinese_name} onChange={e => setNewChildData({ ...newChildData, chinese_name: e.target.value })} className="w-1/2 p-2 border rounded-lg text-sm font-bold" />
                                            <input placeholder="英文名（選填）" value={newChildData.english_name} onChange={e => setNewChildData({ ...newChildData, english_name: e.target.value })} className="w-1/2 p-2 border rounded-lg text-sm font-bold" />
                                        </div>
                                        <div className="flex gap-2">
                                            <select value={newChildData.english_class} onChange={e => setNewChildData({ ...newChildData, english_class: e.target.value })} className="flex-1 p-2 border rounded-lg text-sm font-bold">
                                                {ENGLISH_CLASS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </select>
                                            <label className="flex items-center gap-2 bg-white px-3 py-2 border rounded-lg cursor-pointer">
                                                <input type="checkbox" checked={newChildData.is_after_school} onChange={e => setNewChildData({ ...newChildData, is_after_school: e.target.checked })} className="accent-indigo-600" />
                                                <span className="text-xs font-bold whitespace-nowrap">課後輔導</span>
                                            </label>
                                        </div>
                                        <button onClick={handleAddChild} className="w-full bg-indigo-600 text-white py-2 rounded-lg font-bold text-sm hover:bg-indigo-700">確認新增</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="sticky bottom-0 bg-white border-t px-6 py-4">
                            <button onClick={handleSaveUserConfig} className="w-full py-3 bg-black text-white rounded-xl font-bold hover:bg-gray-800 transition">💾 儲存所有設定</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 子女編輯視窗 */}
            {isEditChildOpen && editingChild && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
                        <h4 className="font-black text-lg mb-4 text-center text-gray-800">編輯學生資料</h4>
                        <div className="space-y-3 mb-6">
                            <input value={editingChild.chinese_name} onChange={e => setEditingChild({ ...editingChild, chinese_name: e.target.value })} placeholder="中文姓名" className="w-full p-2 border rounded-lg font-bold" />
                            <input value={editingChild.english_name} onChange={e => setEditingChild({ ...editingChild, english_name: e.target.value })} placeholder="英文姓名" className="w-full p-2 border rounded-lg font-bold" />
                            <select value={editingChild.english_class} onChange={e => setEditingChild({ ...editingChild, english_class: e.target.value })} className="w-full p-2 border rounded-lg font-bold">
                                {ENGLISH_CLASS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border cursor-pointer">
                                <input type="checkbox" checked={editingChild.is_after_school} onChange={e => setEditingChild({ ...editingChild, is_after_school: e.target.checked })} className="w-5 h-5 accent-indigo-600" />
                                <span className="font-bold text-sm">參加課後輔導</span>
                            </label>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setIsEditChildOpen(false)} className="flex-1 py-2.5 bg-gray-100 rounded-xl font-bold text-gray-500">取消</button>
                            <button onClick={handleSaveChild} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-bold">確認修改</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
