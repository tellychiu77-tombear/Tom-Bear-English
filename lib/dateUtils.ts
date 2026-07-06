// 本地日期工具
// ⚠️ 之前全站用 new Date().toISOString().split('T')[0] 取「今天」，
// 但 toISOString() 回傳 UTC 時間，台灣（UTC+8）凌晨 00:00–08:00 會取到「昨天」，
// 影響點名、成績登錄、繳費日期、請假預設值。統一改用本函式。
export function localDateStr(d: Date = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
