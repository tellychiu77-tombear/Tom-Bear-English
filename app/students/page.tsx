'use client';
import { useRouter } from 'next/navigation';

export default function StudentsPlaceholder() {
    const router = useRouter();

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
            <div className="text-6xl mb-4">🚧</div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">The Student Profiles is under construction</h1>
            <p className="text-gray-600 mb-6">We are working hard to bring you this feature.</p>
            <button
                onClick={() => router.push('/')}
                className="px-6 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors"
            >
                Back to Home
            </button>
        </div>
    );
}
