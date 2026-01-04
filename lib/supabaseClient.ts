import { createClient } from '@supabase/supabase-js'

// 這裡確保網址前後沒有任何引號，只有單引號包住整串字
const supabaseUrl = 'https://peuftkzxuxvdtixhudda.supabase.co'

const supabaseAnonKey = 'sb_publishable_WROtS6nWPZz3SQMCtUfV4A_nwSdrLkl'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)