/**
 * auditLog.ts
 *
 * Offline-first helper for writing audit log entries.
 *
 * When ONLINE  → writes directly to Supabase audit_logs; also saves locally
 *                so we always have a local copy.
 * When OFFLINE → queues the entry in db.localAuditLogs (syncStatus='pending').
 *                syncStore will push these on reconnect.
 */
import { v4 as uuidv4 } from 'uuid'
import { supabase } from './supabase'
import { db } from './db'

interface AuditPayload {
    actionType: string
    performedBy: string | null | undefined
    branchId: string | null | undefined
    referenceTable: string
    notes: string
    metadata: Record<string, unknown>
}

export async function logAudit(payload: AuditPayload): Promise<void> {
    const localId = uuidv4()
    const createdAt = new Date().toISOString()

    // Always persist locally first
    await db.localAuditLogs.add({
        localId,
        actionType: payload.actionType,
        performedBy: payload.performedBy ?? null,
        branchId: payload.branchId ?? null,
        referenceTable: payload.referenceTable,
        notes: payload.notes,
        metadata: payload.metadata,
        syncStatus: 'pending',
        createdAt,
    })

    if (!navigator.onLine) {
        console.log(`[auditLog] Offline — queued audit log locally: ${payload.actionType}`)
        return
    }

    // Fire-and-forget to Supabase
    supabase.from('audit_logs').insert({
        action_type: payload.actionType,
        performed_by: payload.performedBy ?? null,
        branch_id: payload.branchId ?? null,
        reference_table: payload.referenceTable,
        notes: payload.notes,
        metadata: payload.metadata,
        created_at: createdAt,
    }).then(({ error }) => {
        if (error) {
            console.warn('[auditLog] Supabase insert failed — log stays in local queue', error)
        } else {
            // Mark local copy as synced
            db.localAuditLogs.update(localId, { syncStatus: 'synced' }).catch(() => { })
        }
    })
}
