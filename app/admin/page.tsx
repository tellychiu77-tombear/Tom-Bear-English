'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
    const router = useRouter();
    const [pendingUsers, setPendingUsers] = useState<any[]>([]);
    const [activeStaff, setActiveStaff] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null); // Store ID of item being acted on

    useEffect(() => {
        checkAccessAndFetchData();
    }, []);

    const checkAccessAndFetchData = async () => {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
            router.push('/');
            return;
        }

        // Verify Director Role
        const { data: userData, error } = await supabase
            .from('users')
            .select('role')
            .eq('id', session.user.id)
            .single();

        if (error || userData?.role !== 'director') {
            alert('Access Denied: Only Directors can access this page.');
            router.push('/');
            return;
        }

        fetchUsers();
    };

    const fetchUsers = async () => {
        setLoading(true);
        // Fetch Pending
        const { data: pending } = await supabase
            .from('users')
            .select('*')
            .eq('role', 'pending')
            .order('created_at', { ascending: false });

        setPendingUsers(pending || []);

        // Fetch Active Staff (Teacher/Manager)
        const { data: staff } = await supabase
            .from('users')
            .select('*')
            .in('role', ['teacher', 'manager'])
            .order('role', { ascending: true }); // Manager first usually (alphabetical: manager < teacher)

        setActiveStaff(staff || []);
        setLoading(false);
    };

    const updateUserRole = async (userId: string, newRole: string) => {
        if (!confirm(`Are you sure you want to promote this user to ${newRole}?`)) return;
        setActionLoading(userId);

        const { error } = await supabase
            .from('users')
            .update({ role: newRole })
            .eq('id', userId);

        if (error) {
            alert('Error updating role: ' + error.message);
        } else {
            fetchUsers();
        }
        setActionLoading(null);
    };

    const removeUser = async (userId: string) => {
        if (!confirm('Are you sure you want to REMOVE this user? This cannot be undone.')) return;
        setActionLoading(userId);

        // Note: Check if RLS allows deletion. Usually admins/directors should have policy.
        // We are deleting from 'users' table which is our profile table. 
        // Sync with Auth user deletion often requires server-side admin API, 
        // but for this "users" table row, we can try deleting it. 
        // Ideally we should also delete from auth.users via an Edge Function, but let's stick to the 'users' table requirement.

        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', userId);

        if (error) {
            alert('Error removing user: ' + error.message);
        } else {
            fetchUsers();
        }
        setActionLoading(null);
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Loading Staff Data...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 font-sans p-4 md:p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-3xl font-bold text-gray-800">人事審核與管理 (Staff Management)</h1>
                    <button
                        onClick={() => router.push('/')}
                        className="bg-white border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100"
                    >
                        Back to Dashboard
                    </button>
                </div>

                {/* Section 1: Pending Applications */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-8 overflow-hidden">
                    <div className="bg-yellow-50 px-6 py-4 border-b border-yellow-100 flex items-center gap-2">
                        <span className="text-2xl">⏳</span>
                        <h2 className="text-xl font-bold text-yellow-800">New Applications (Pending)</h2>
                        <span className="text-sm bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full ml-2">
                            {pendingUsers.length}
                        </span>
                    </div>

                    <div className="p-6">
                        {pendingUsers.length === 0 ? (
                            <p className="text-gray-400 italic">No pending applications.</p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {pendingUsers.map(user => (
                                    <div key={user.id} className="border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="mb-4">
                                            {/* In a real app we might fetch email from Auth or store it in users table. 
                                               Assuming 'name' or some identifier is in 'users'. 
                                               If contact_info has email, use it. */}
                                            <p className="font-bold text-lg text-gray-800">{user.name || 'Unknown Name'}</p>
                                            <p className="text-sm text-gray-500">ID: {user.id.substring(0, 8)}...</p>
                                            <p className="text-xs text-gray-400 mt-1">
                                                Registered: {new Date(user.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <button
                                                onClick={() => updateUserRole(user.id, 'teacher')}
                                                disabled={actionLoading === user.id}
                                                className="bg-green-100 text-green-700 hover:bg-green-200 py-2 rounded font-medium text-sm transition-colors"
                                            >
                                                Approve as Teacher
                                            </button>
                                            <button
                                                onClick={() => updateUserRole(user.id, 'manager')}
                                                disabled={actionLoading === user.id}
                                                className="bg-blue-100 text-blue-700 hover:bg-blue-200 py-2 rounded font-medium text-sm transition-colors"
                                            >
                                                Approve as Manager
                                            </button>
                                            <button
                                                onClick={() => removeUser(user.id)}
                                                disabled={actionLoading === user.id}
                                                className="bg-red-50 text-red-600 hover:bg-red-100 py-2 rounded font-medium text-sm transition-colors"
                                            >
                                                Reject / Delete
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Section 2: Active Staff */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-green-50 px-6 py-4 border-b border-green-100 flex items-center gap-2">
                        <span className="text-2xl">👥</span>
                        <h2 className="text-xl font-bold text-green-800">Current Staff (Active)</h2>
                        <span className="text-sm bg-green-200 text-green-800 px-2 py-0.5 rounded-full ml-2">
                            {activeStaff.length}
                        </span>
                    </div>

                    <div className="p-0">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-gray-500 font-medium text-sm border-b border-gray-100">
                                <tr>
                                    <th className="px-6 py-4">Name / ID</th>
                                    <th className="px-6 py-4">Role</th>
                                    <th className="px-6 py-4">Joined</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {activeStaff.map(staff => (
                                    <tr key={staff.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-gray-800">{staff.name || 'No Name'}</div>
                                            <div className="text-xs text-gray-400">{staff.id}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-xs uppercase font-bold
                                                ${staff.role === 'manager' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}
                                            `}>
                                                {staff.role}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {new Date(staff.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => removeUser(staff.id)}
                                                disabled={actionLoading === staff.id}
                                                className="text-red-500 hover:text-red-700 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded text-sm transition-all"
                                            >
                                                Fire / Remove
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {activeStaff.length === 0 && (
                            <div className="p-8 text-center text-gray-400">No active staff members found.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
