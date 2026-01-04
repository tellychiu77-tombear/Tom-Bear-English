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
            users: {
                Row: {
                    id: string
                    role: 'admin' | 'teacher' | 'parent'
                    name: string | null
                    contact_info: Json | null
                    created_at: string
                }
                Insert: {
                    id: string
                    role?: 'admin' | 'teacher' | 'parent'
                    name?: string | null
                    contact_info?: Json | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    role?: 'admin' | 'teacher' | 'parent'
                    name?: string | null
                    contact_info?: Json | null
                    created_at?: string
                }
            }
            students: {
                Row: {
                    id: string
                    parent_id: string
                    name: string
                    school_grade: string | null
                    profile_details: Json | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    parent_id: string
                    name: string
                    school_grade?: string | null
                    profile_details?: Json | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    parent_id?: string
                    name?: string
                    school_grade?: string | null
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
                    created_at: string
                }
                Insert: {
                    id?: string
                    content: string
                    sender_id: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    content?: string
                    sender_id?: string
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
                    student_name: string
                    exam_name: string
                    subject: string
                    score: number
                    created_at: string
                }
                Insert: {
                    id?: string
                    student_name: string
                    exam_name: string
                    subject: string
                    score: number
                    created_at?: string
                }
                Update: {
                    id?: string
                    student_name?: string
                    exam_name?: string
                    subject?: string
                    score?: number
                    created_at?: string
                }
            }
        }
    }
}
