'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function ContactBook() {
    const router = useRouter();
    const [posts, setPosts] = useState<any[]>([]);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(false);

    // Fetch posts on load
    useEffect(() => {
        fetchPosts();
    }, []);

    const fetchPosts = async () => {
        const { data, error } = await supabase
            .from('contact_books')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) console.error('Error fetching posts:', error);
        else setPosts(data || []);
    };

    const handlePost = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const { error } = await (supabase.from('contact_books') as any).insert([
            { title, content }
        ]);

        if (error) {
            alert('Error posting announcement: ' + error.message);
        } else {
            setTitle('');
            setContent('');
            fetchPosts();
        }
        setLoading(false);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this post?')) return;

        const { error } = await supabase
            .from('contact_books')
            .delete()
            .eq('id', id);

        if (error) {
            alert('Error deleting post: ' + error.message);
        } else {
            fetchPosts();
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8 font-sans">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-800">📝 電子聯絡簿</h1>
                    <button
                        onClick={() => router.push('/')}
                        className="text-gray-500 hover:text-gray-700 font-medium"
                    >
                        ← 回首頁
                    </button>
                </div>

                {/* Input Form */}
                <div className="bg-white p-6 rounded-xl shadow-sm mb-8 border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-700 mb-4">發布新公告</h2>
                    <form onSubmit={handlePost} className="space-y-4">
                        <div>
                            <input
                                type="text"
                                placeholder="標題"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                                required
                            />
                        </div>
                        <div>
                            <textarea
                                placeholder="內容詳情..."
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                className="w-full p-3 border border-gray-200 rounded-lg h-32 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
                        >
                            {loading ? '發布中...' : '發布公告'}
                        </button>
                    </form>
                </div>

                {/* Posts List */}
                <div className="space-y-6">
                    {posts.map((post) => (
                        <div key={post.id} className="bg-white p-6 rounded-xl shadow-md border-l-4 border-orange-400 relative group">
                            <button
                                onClick={() => handleDelete(post.id)}
                                className="absolute top-4 right-4 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                            >
                                刪除
                            </button>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">{post.title}</h3>
                            <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">{post.content}</p>
                            <div className="mt-4 text-xs text-gray-400">
                                發布於: {new Date(post.created_at).toLocaleString('zh-TW')}
                            </div>
                        </div>
                    ))}
                    {posts.length === 0 && (
                        <div className="text-center text-gray-400 py-12">
                            尚無公告，請嘗試發布第一則訊息！
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
