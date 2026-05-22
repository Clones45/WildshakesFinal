import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://jhicfriososaaxebktzv.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoaWNmcmlvc29zYWF4ZWJrdHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NTg4NDUsImV4cCI6MjA4ODIzNDg0NX0.Q6Oj1ofcAriSHmsnQfAzmh-e0qBIakWOaBvEj9y_m-0'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function run() {
    console.log('Fetching branch_menu_availability...')
    const { data, error } = await supabase
        .from('branch_menu_availability')
        .select('product_id, is_available, stock_qty')
        .eq('branch_id', '907ae3eb-a83c-44c5-90d7-55e1f6a47538') // test with the Gensan - Main ID

    if (error) {
        console.error('Error fetching branch_menu_availability:', error)
    } else {
        console.log('Success! Data:', data)
    }
}

run()
