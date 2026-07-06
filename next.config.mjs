/** @type {import('next').NextConfig} */
const nextConfig = {
    // eslint 警告暫時不擋 build（規則尚未整理，之後收緊）
    eslint: {
        ignoreDuringBuilds: true,
    },
    // ✅ 已移除 typescript.ignoreBuildErrors：型別錯誤已全數修復，
    // 從現在起 build 會擋下型別錯誤，避免壞碼上線。
};

export default nextConfig;
