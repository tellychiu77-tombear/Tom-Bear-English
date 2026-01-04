'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Trash2 } from 'lucide-react';

// Define local type or use database type
type ContactBookItem = {
    id: string;
    title: string;
    content: string;
    created_at: string;
};

export default function ContactBookPage() {
    const [posts, setPosts] = useState<ContactBookItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const router = useRouter();

    const fetchPosts = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('contact_books')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching posts:', error);
        } else {
            setPosts((data as any) || []);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchPosts();
    }, []);

    const handlePost = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !content.trim() || submitting) return;

        setSubmitting(true);

        // Using explicit cast to any to avoid type inference issues during prototype
        const { error } = await (supabase
            .from('contact_books') as any)
            .insert({
                title,
                content,
            });

        if (error) {
            console.error('Error posting:', error);
            alert('Failed to post message.');
        } else {
            setTitle('');
            setContent('');
            fetchPosts(); // Refresh list
        }
        setSubmitting(false);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this post?')) return;

        const { error } = await supabase
            .from('contact_books')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting:', error);
            alert('Failed to delete post.');
        } else {
            fetchPosts(); // Refresh list
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <header className="bg-white shadow px-6 py-4 flex items-center gap-4 sticky top-0 z-10">
                <button
                    onClick={() => router.push('/dashboard')}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    aria-label="Back to Dashboard"
                >
                    <ArrowLeft className="text-gray-600" />
                </button>
                <h1 className="text-xl font-bold text-gray-800">Contact Book (聯絡簿)</h1>
            </header>

            <main className="flex-1 max-w-3xl mx-auto w-full p-6 space-y-8">

                {/* Input Section (Teacher Only - simplified for prototype as visible to all for now) */}
                <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-700 mb-4">New Announcement</h2>
                    <form onSubmit={handlePost} className="space-y-4">
                        <div>
                            <input
                                type="text"
                                placeholder="Title (標題)"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                required
                            />
                        </div>
                        <div>
                            <textarea
                                placeholder="Content (內容)..."
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg h-32 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                required
                            />
                        </div>
                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={submitting}
                                className={`px-6 py-2 rounded-lg text-white font-medium transition-transform active:scale-95 ${submitting
                                        ? 'bg-blue-300 cursor-not-allowed'
                                        : 'bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg'
                                    }`}
                            >
                                {submitting ? 'Posting...' : 'Post Announcement'}
                            </button>
                        </div>
                    </form>
                </section>

                {/* List Section */}
                <section className="space-y-4">
                    <h2 className="text-lg font-semibold text-gray-700 mb-2">Recent Announcements</h2>

                    {loading ? (
                        <div className="text-center py-8 text-gray-400">Loading...</div>
                    ) : posts.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 bg-white rounded-xl border border-dashed border-gray-300">
                            No announcements yet.
                        </div>
                    ) : (
                        posts.map((post) => (
                            <div key={post.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow relative group">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="text-xl font-bold text-gray-800">{post.title}</h3>
                                    <span className="text-sm text-gray-400 whitespace-nowrap ml-4">
                                        {new Date(post.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                                <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">{post.content}</p>

                                <div className="mt-4 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => handleDelete(post.id)}
                                        className="flex items-center gap-1 text-red-500 hover:text-red-600 px-3 py-1 rounded hover:bg-red-50 transition-colors text-sm"
                                    >
                                        <Trash2 size={16} />
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </section>
            </main>
        </div>
    );
}
