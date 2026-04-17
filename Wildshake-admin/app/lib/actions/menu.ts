'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ── Products (live POS menu) ──────────────────────────────────────────────────

export async function createProduct(formData: FormData) {
  const supabase = await createClient()
  const name        = formData.get('name') as string
  const category    = formData.get('category') as string
  const price       = parseFloat(formData.get('price') as string)
  const image_url   = (formData.get('image_url') as string) || null
  const is_available = formData.get('is_available') !== 'false'

  if (!name || !category || isNaN(price)) return { error: 'Name, category, and price are required.' }

  const { error } = await supabase.from('products').insert({ name, category, price, image_url, is_available })
  if (error) return { error: error.message }

  revalidatePath('/menu')
  return { success: true }
}

export async function updateProduct(id: string, formData: FormData) {
  const supabase = await createClient()
  const name        = formData.get('name') as string
  const category    = formData.get('category') as string
  const price       = parseFloat(formData.get('price') as string)
  const image_url   = (formData.get('image_url') as string) || null
  const is_available = formData.get('is_available') === 'true'

  const { error } = await supabase
    .from('products')
    .update({ name, category, price, image_url, is_available })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/menu')
  return { success: true }
}

export async function toggleProductAvailability(id: string, is_available: boolean) {
  const supabase = await createClient()
  const { error } = await supabase.from('products').update({ is_available }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/menu')
  return { success: true }
}

export async function deleteProduct(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/menu')
  return { success: true }
}

// ── menu_items (pricing reference table) ─────────────────────────────────────

export async function updateMenuItemPrice(id: string, formData: FormData) {
  const supabase = await createClient()
  const new_price  = parseInt(formData.get('new_price') as string)
  const old_price  = parseInt(formData.get('old_price') as string)

  const { error } = await supabase
    .from('menu_items')
    .update({ new_price, old_price })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/menu')
  return { success: true }
}
