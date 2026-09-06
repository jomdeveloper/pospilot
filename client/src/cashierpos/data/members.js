/**
 * members.js — DB-driven member lookup (PosPilot `customers` table)
 * --------------------------------------------------------------------------
 * Members live in the `customers` table (customer_type = 'Member', with a
 * member_id). Every lookup here queries the live API — there is NO bundled
 * sample data, so the till uses the real customer database.
 *
 * A member record shape:
 *   {
 *     id:         string – the member id the cashier enters / scans,
 *     name:       string – member's full name,
 *     tier:       string – membership tier,
 *     points:     number – current reward-points balance,
 *     customerId: number – the PosPilot customers.id that owns this member
 *   }
 */
import { api } from "../../api";

/** Map a PosPilot `customers` row into the member shape the dialogs expect. */
function toMember(row) {
  if (!row) return null;
  return {
    id: row.member_id ? String(row.member_id) : String(row.id),
    name: row.name || "",
    tier: "Member",
    points: Number(row.member_points || row.points || 0) || 0,
    customerId: row.id,
  };
}

function isMemberRow(row) {
  if (!row) return false;
  const type = String(row.customer_type || "").trim().toLowerCase();
  return type === "member" || type === "membership";
}

/**
 * Resolve a single member by an exact member id from the database.
 * @param {string} id - member id (trimmed, case-insensitive).
 * @returns {Promise<object|null>} the matched member or null.
 */
export async function findMemberByCode(id) {
  const q = String(id || "").trim();
  if (!q) return null;
  const lowerId = q.toLowerCase();
  try {
    const customers = await api.getCustomers(q);
    const hit = (customers || []).find(
      (c) =>
        isMemberRow(c) &&
        String(c.member_id || "").trim().toLowerCase() === lowerId
    );
    return toMember(hit || null);
  } catch (err) {
    return null;
  }
}

/**
 * Search members by id or name in the database.
 * @param {string} query
 * @param {number} limit - cap the number of results.
 * @returns {Promise<object[]>}
 */
export async function searchMembers(query, limit = 8) {
  const q = String(query || "").trim();
  if (!q) return [];
  try {
    const customers = await api.getCustomers(q);
    return (customers || [])
      .filter((c) => isMemberRow(c) && c.member_id)
      .map(toMember)
      .filter(Boolean)
      .slice(0, limit);
  } catch (err) {
    return [];
  }
}