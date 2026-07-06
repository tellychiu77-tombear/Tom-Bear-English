'use client';

// ⚠️ 此頁已於 2026-07-02 除役：
// 舊版人事頁，使用已廢棄的 classes／class_assignments 表（migration 003 將移除），
// 功能已由 /admin（人事管理）與 /schedule（排課／班級指派）取代。
// 原始碼保留在 git 歷史（commit 5105a93 之前）。現在一律導回首頁。

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DeprecatedStaffRedirect() {
    const router = useRouter();
    useEffect(() => { router.replace('/'); }, [router]);
    return <div className="p-10 text-center text-gray-400 font-bold">此頁面已停用，正在返回首頁…</div>;
}
