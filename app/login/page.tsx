'use client';

// ⚠️ 此頁已於 2026-07-06 除役：
// 舊版藍色「補習班管理系統」登入頁，與首頁 / 的綠色湯貝爾品牌登入頁重複且風格不一致。
// 全 app 沒有任何連結指向 /login，僅能由網址直達。統一導回首頁的登入畫面。
// 原始碼保留在 git 歷史。

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DeprecatedLoginRedirect() {
    const router = useRouter();
    useEffect(() => { router.replace('/'); }, [router]);
    return <div className="p-10 text-center text-gray-400 font-bold">正在前往登入頁…</div>;
}
