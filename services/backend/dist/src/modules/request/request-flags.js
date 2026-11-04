"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHARED_CONTACT_PATIENTS = exports.RAPID_SUBMISSION_LIMIT = exports.DUPLICATE_WINDOW_DAYS = void 0;
exports.detectFlags = detectFlags;
exports.DUPLICATE_WINDOW_DAYS = 14;
exports.RAPID_SUBMISSION_LIMIT = 3;
exports.SHARED_CONTACT_PATIENTS = 3;
async function detectFlags(tx, requestId) {
    const found = [];
    const add = async (type, matched, detail) => {
        const res = await tx.query(`INSERT INTO req.request_flag (request_id, flag_type, matched_request_id, detail) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT DO NOTHING`, [requestId, type, matched, JSON.stringify(detail)]);
        if (res.rowCount)
            found.push(type);
    };
    const dup = await tx.query(`SELECT o.id, o.reference_no FROM req.blood_request r
       JOIN req.blood_request o ON o.id <> r.id AND o.deleted_at IS NULL AND o.status NOT IN ('Draft', 'Rejected', 'Cancelled', 'Closed', 'Unable to fulfil')
        AND o.requested_blood_group = r.requested_blood_group AND o.component = r.component
        AND o.created_at > now() - make_interval(days => $2)
        AND (o.patient_id = r.patient_id OR (o.contact_phone IS NOT NULL AND o.contact_phone = r.contact_phone))
      WHERE r.id = $1 ORDER BY o.created_at DESC LIMIT 5`, [requestId, exports.DUPLICATE_WINDOW_DAYS]);
    for (const d of dup.rows)
        await add('DUPLICATE_ACTIVE', d.id, { referenceNo: d.reference_no });
    const rapid = await tx.query(`SELECT count(*)::int AS n FROM req.blood_request o JOIN req.blood_request r ON r.created_by_user_id = o.created_by_user_id
      WHERE r.id = $1 AND o.submitted_at > now() - interval '24 hours' AND o.id <> r.id`, [requestId]);
    if (rapid.rows[0].n >= exports.RAPID_SUBMISSION_LIMIT)
        await add('RAPID_SUBMISSION', null, { submittedLast24h: rapid.rows[0].n + 1 });
    const shared = await tx.query(`SELECT count(DISTINCT o.patient_id)::int AS n FROM req.blood_request r
       JOIN req.blood_request o ON o.contact_phone = r.contact_phone AND o.created_at > now() - interval '7 days'
      WHERE r.id = $1 AND r.contact_phone IS NOT NULL`, [requestId]);
    if (shared.rows[0].n >= exports.SHARED_CONTACT_PATIENTS)
        await add('SHARED_CONTACT', null, { patients: shared.rows[0].n });
    return found;
}
//# sourceMappingURL=request-flags.js.map