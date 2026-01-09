export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string
                    email: string
                    full_name: string | null
                    phone: string | null
                    role: 'admin' | 'director' | 'manager' | 'teacher' | 'parent' | 'admin_staff' | 'pending'
                    department: 'english' | 'after_school' | 'general' | null
                    job_title: string | null
                    responsible_classes: string[] | null
                    created_at: string
                }
                Insert: {
                    id: string
                    email: string
                    full_name?: string | null
                    phone?: string | null
                    role?: 'admin' | 'director' | 'manager' | 'teacher' | 'parent' | 'admin_staff' | 'pending'
                    department?: 'english' | 'after_school' | 'general' | null
                    job_title?: string | null
                    responsible_classes?: string[] | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    email?: string
                    full_name?: string | null
                    phone?: string | null
                    role?: 'admin' | 'director' | 'manager' | 'teacher' | 'parent' | 'admin_staff' | 'pending'
                    department?: 'english' | 'after_school' | 'general' | null
                    job_title?: string | null
                    responsible_classes?: string[] | null
                    created_at?: string
                }
            }
            students: {
                Row: {
                    id: string
                    parent_id: string
                    chinese_name: string
                    grade: string | null
                    profile_details: Json | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    parent_id: string
                    chinese_name: string
                    grade?: string | null
                    profile_details?: Json | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    parent_id?: string
                    chinese_name?: string
                    grade?: string | null
                    profile_details?: Json | null
                    created_at?: string
                }
            }
            pick_up_queue: {
                Row: {
                    id: string
                    student_id: string
                    status: 'pending' | 'arrived' | 'completed'
                    acc_timestamp: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    student_id: string
                    status?: 'pending' | 'arrived' | 'completed'
                    acc_timestamp?: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    student_id?: string
                    status?: 'pending' | 'arrived' | 'completed'
                    acc_timestamp?: string
                    created_at?: string
                }
            }
            messages: {
                Row: {
                    id: string
                    content: string
                    sender_id: string
                    receiver_id?: string
                    is_read?: boolean
                    created_at: string
                }
                Insert: {
                    id?: string
                    content: string
                    sender_id: string
                    receiver_id?: string
                    is_read?: boolean
                    created_at?: string
                }
                Update: {
                    id?: string
                    content?: string
                    sender_id?: string
                    receiver_id?: string
                    is_read?: boolean
                    created_at?: string
                }
            }
            contact_books: {
                Row: {
                    id: string
                    title: string
                    content: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    title: string
                    content: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    title?: string
                    content?: string
                    created_at?: string
                }
            }
            exam_results: {
                Row: {
                    id: string
                    student_id: string
                    student_name: string
                    exam_name: string
                    subject: string
                    score: number
                    exam_date: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    student_id: string
                    student_name: string
                    exam_name: string
                    subject: string
                    score: number
                    exam_date?: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    student_id?: string
                    student_name?: string
                    exam_name?: string
                    subject?: string
                    score?: number
                    exam_date?: string
                    created_at?: string
                }
            }
            leave_requests: {
                Row: {
                    id: string
                    student_id: string
                    type: string
                    reason: string | null
                    start_date: string
                    end_date: string
                    status: 'pending' | 'approved' | 'rejected'
                    created_at: string
                }
                Insert: {
                    id?: string
                    student_id: string
                    type: string
                    reason?: string | null
                    start_date: string
                    end_date: string
                    status?: 'pending' | 'approved' | 'rejected'
                    created_at?: string
                }
                Update: {
                    id?: string
                    student_id?: string
                    type?: string
                    reason?: string | null
                    start_date?: string
                    end_date?: string
                    status?: 'pending' | 'approved' | 'rejected'
                    created_at?: string
                }
            },
            announcements: {
                Row: {
                    id: string
                    title: string
                    content: string
                    priority: 'normal' | 'urgent'
                    audience: 'all' | 'staff' | 'parent'
                    author_id: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    title: string
                    content: string
                    priority?: 'normal' | 'urgent'
                    audience?: 'all' | 'staff' | 'parent'
                    author_id: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    title?: string
                    content?: string
                    priority?: 'normal' | 'urgent'
                    audience?: 'all' | 'staff' | 'parent'
                    author_id?: string
                    created_at?: string
                }
            },
            announcement_reads: {
                Row: {
                    id: string
                    announcement_id: string
                    user_id: string
                    read_at: string
                }
                Insert: {
                    id?: string
                    announcement_id: string
                    user_id: string
                    read_at?: string
                }
                Update: {
                    id?: string
                    announcement_id?: string
                    user_id?: string
                    read_at?: string
                }
            }
        }
    }
}
