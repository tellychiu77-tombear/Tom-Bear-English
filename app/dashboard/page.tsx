'use client';

// ⚠️ 此頁已於 2026-07-02 除役：
// 舊版接送頁，使用已廢棄的 pick_up_queue 表（現行系統用 pickup_requests），
// 且含有會建立孤兒學生資料的舊表單。原始碼保留在 git 歷史（commit 5105a93 之前）。
// 現在一律導回首頁。

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DeprecatedDashboardRedirect() {
    const router = useRouter();
    useEffect(() => { router.replace('/'); }, [router]);
    return <div className="p-10 text-center text-gray-400 font-bold">此頁面已停用，正在返回首頁…</div>;
}
