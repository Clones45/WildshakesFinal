'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createAnnouncement(formData: FormData) {
  const supabase = await createClient()

  const title              = formData.get('title') as string
  const body               = formData.get('body') as string
  const priority           = formData.get('priority') as string
  const target             = formData.get('target') as string
  const target_franchise_id = formData.get('target_franchise_id') as string | null

  if (!title?.trim() || !body?.trim()) {
    return { error: 'Title and message body are required.' }
  }

  const { error } = await supabase.from('announcements').insert({
    title,
    body,
    priority: priority || 'normal',
    target: target || 'all',
    target_franchise_id: target === 'specific' ? target_franchise_id : null,
  })

  if (error) return { error: error.message }

  revalidatePath('/broadcast')
  return { success: true }
}

export async function deactivateAnnouncement(announcementId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('announcements')
    .update({ is_active: false })
    .eq('id', announcementId)

  if (error) return { error: error.message }
  revalidatePath('/broadcast')
  return { success: true }
}
