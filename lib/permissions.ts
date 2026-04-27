// ============================================================
// 湯貝爾 權限系統
// ============================================================
// 三層結構：
//   1. HARDCODED_DEFAULTS  — 程式碼內建預設（最終備用）
//   2. role_configs (DB)   — 總園長可調整的職位預設
//   3. users.extra_permissions (DB) — 個人覆蓋（null=沿用, true=強制開, false=強制關）
// ============================================================

export type PermissionKey =
  | 'manageAnnouncements'   // 發布/編輯公告
  | 'viewAllStudents'       // 查看全部學生
  | 'editStudents'          // 編輯學生資料
  | 'approveLeave'          // 審核請假
  | 'viewGrades'            // 查看成績
  | 'editGrades'            // 登錄成績
  | 'fillContactBook'       // 填寫聯絡簿
  | 'viewPickupQueue'       // 接送戰情室（老師端）
  | 'viewManagerDashboard'  // 部門戰情室
  | 'manageUsers'           // 人事管理
  | 'chatWithParents'       // 親師對話
  | 'viewAttendance'        // 出缺席點名
  | 'viewProgress'          // 課程進度追蹤
  | 'viewPayments';         // 繳費紀錄

export const PERMISSION_META: Record<PermissionKey, { label: string; icon: string }> = {
  manageAnnouncements:  { label: '發布/編輯公告', icon: '📢' },
  viewAllStudents:      { label: '查看全部學生',  icon: '👥' },
  editStudents:         { label: '編輯學生資料',  icon: '✏️' },
  approveLeave:         { label: '審核請假',      icon: '📅' },
  viewGrades:           { label: '查看成績',      icon: '📊' },
  editGrades:           { label: '登錄成績',      icon: '📝' },
  fillContactBook:      { label: '填寫聯絡簿',    icon: '📒' },
  viewPickupQueue:      { label: '接送戰情室',    icon: '🚌' },
  viewManagerDashboard: { label: '部門戰情室',    icon: '💼' },
  manageUsers:          { label: '人事管理',      icon: '👤' },
  chatWithParents:      { label: '親師對話',      icon: '💬' },
  viewAttendance:       { label: '出缺席點名',    icon: '📋' },
  viewProgress:         { label: '課程進度追蹤',  icon: '📖' },
  viewPayments:         { label: '繳費紀錄',      icon: '💰' },
};

export const ALL_PERMISSION_KEYS = Object.keys(PERMISSION_META) as PermissionKey[];

// 職稱範本：每個角色的建議職稱選項
export const JOB_TITLE_PRESETS: Record<string, string[]> = {
  director:         ['總園長', '執行長', '校長'],
  english_director: ['英文部主任', '英語課程主任', '英文部長'],
  care_director:    ['安親部主任', '課輔主任', '安親部長'],
  admin:            ['行政人員', '行政組長', '教務秘書', '招生專員', '財務人員', '行政助理'],
  teacher:          ['老師', '英文老師', '數學老師', '科任老師', '班導師', '助教'],
  manager:          ['管理員', '系統管理員'],
  parent:           [],
};

// 程式碼內建預設（DB 讀不到時的最終備用）
export const HARDCODED_DEFAULTS: Record<string, Record<PermissionKey, boolean>> = {
  director: {
    manageAnnouncements: true,  viewAllStudents: true,  editStudents: true,
    approveLeave: true,  viewGrades: true,  editGrades: true,
    fillContactBook: true,  viewPickupQueue: true,  viewManagerDashboard: true,
    manageUsers: true,  chatWithParents: true,
    viewAttendance: true,  viewProgress: true,  viewPayments: true,
  },
  english_director: {
    manageAnnouncements: true,  viewAllStudents: true,  editStudents: true,
    approveLeave: true,  viewGrades: true,  editGrades: true,
    fillContactBook: true,  viewPickupQueue: true,  viewManagerDashboard: true,
    manageUsers: true,  chatWithParents: true,
    viewAttendance: true,  viewProgress: true,  viewPayments: true,
  },
  care_director: {
    manageAnnouncements: true,  viewAllStudents: true,  editStudents: true,
    approveLeave: true,  viewGrades: true,  editGrades: true,
    fillContactBook: true,  viewPickupQueue: true,  viewManagerDashboard: true,
    manageUsers: true,  chatWithParents: true,
    viewAttendance: true,  viewProgress: true,  viewPayments: true,
  },
  admin: {
    manageAnnouncements: true,  viewAllStudents: true,  editStudents: false,
    approveLeave: true,  viewGrades: true,  editGrades: false,
    fillContactBook: false,  viewPickupQueue: true,  viewManagerDashboard: true,
    manageUsers: true,  chatWithParents: true,
    viewAttendance: true,  viewProgress: true,  viewPayments: true,
  },
  admin_staff: {
    manageAnnouncements: false,  viewAllStudents: true,  editStudents: false,
    approveLeave: false,  viewGrades: true,  editGrades: false,
    fillContactBook: false,  viewPickupQueue: true,  viewManagerDashboard: true,
    manageUsers: false,  chatWithParents: true,
    viewAttendance: false,  viewProgress: false,  viewPayments: false,
  },
  teacher: {
    manageAnnouncements: true,  viewAllStudents: false,  editStudents: false,
    approveLeave: true,  viewGrades: true,  editGrades: true,
    fillContactBook: true,  viewPickupQueue: true,  viewManagerDashboard: false,
    manageUsers: false,  chatWithParents: true,
    viewAttendance: true,  viewProgress: true,  viewPayments: false,
  },
  manager: {
    manageAnnouncements: true,  viewAllStudents: true,  editStudents: true,
    approveLeave: true,  viewGrades: true,  editGrades: true,
    fillContactBook: true,  viewPickupQueue: true,  viewManagerDashboard: true,
    manageUsers: true,  chatWithParents: true,
    viewAttendance: true,  viewProgress: true,  viewPayments: true,
  },
  parent: {
    manageAnnouncements: false,  viewAllStudents: false,  editStudents: false,
    approveLeave: false,  viewGrades: false,  editGrades: false,
    fillContactBook: false,  viewPickupQueue: false,  viewManagerDashboard: false,
    manageUsers: false,  chatWithParents: true,
    viewAttendance: false,  viewProgress: true,  viewPayments: true,
  },
};

/**
 * 計算某個用戶的最終有效權限
 *
 * @param role            用戶角色字串
 * @param roleConfig      從 role_configs 表讀到的職位預設（可為 null）
 * @param extraPermissions 用戶個人覆蓋，格式：{ key: true | false }
 *                         只有明確設為 true/false 才會覆蓋，其餘沿用職位預設
 */
export function getEffectivePermissions(
  role: string,
  roleConfig: Record<string, boolean> | null,
  extraPermissions: Record<string, boolean> | null
): Record<PermissionKey, boolean> {
  // 家長/待審核：固定回傳家長權限，不允許覆蓋
  if (role === 'parent' || role === 'pending') {
    return { ...HARDCODED_DEFAULTS['parent'] };
  }

  const defaults = roleConfig ?? HARDCODED_DEFAULTS[role] ?? HARDCODED_DEFAULTS['parent'];
  const result = {} as Record<PermissionKey, boolean>;

  for (const key of ALL_PERMISSION_KEYS) {
    const override = extraPermissions?.[key];
    if (override === true || override === false) {
      result[key] = override; // 個人覆蓋優先
    } else {
      result[key] = defaults[key] ?? false;
    }
  }
  return result;
}

/**
 * 快速判斷單一權限（常用於 canEdit、canManage 等布林判斷）
 */
export function can(
  perm: PermissionKey,
  role: string,
  roleConfig: Record<string, boolean> | null,
  extraPermissions: Record<string, boolean> | null
): boolean {
  const effective = getEffectivePermissions(role, roleConfig, extraPermissions);
  return effective[perm] ?? false;
}

/**
 * 判斷是否為員工身份（非家長、非待審）
 */
export function isStaff(role: string): boolean {
  return !['parent', 'pending'].includes(role);
}
