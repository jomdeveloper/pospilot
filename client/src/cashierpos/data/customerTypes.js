/**
 * customerTypes.js
 * --------------------------------------------------------------------------
 * Shared definition of the customer types available on the POS. Selecting a
 * type drives the Customer dialog's tile picker, the sidebar customer badge
 * and the receipt discount line. "walkin" is the default (a cleared customer).
 */
export const CUSTOMER_TYPES = {
  walkin: {
    id: "walkin",
    label: "Walk-in",
    hint: "Default",
    icon: "user",
    discountPct: 0
  },
  member: {
    id: "member",
    label: "Member",
    hint: "Loyalty rewards",
    icon: "member",
    discountPct: 0,
    idLabel: "Member ID",
    idPlaceholder: "e.g. MB-1001"
  },
  senior: {
    id: "senior",
    label: "Senior",
    hint: "20% discount",
    icon: "senior",
    discountPct: 0.2,
    idLabel: "Senior Citizen ID",
    idPlaceholder: "e.g. SC-000001"
  },
  pwd: {
    id: "pwd",
    label: "PWD",
    hint: "20% discount",
    icon: "pwd",
    discountPct: 0.2,
    idLabel: "PWD ID",
    idPlaceholder: "e.g. PWD-000001"
  }
};

/** Order shown in the Customer dialog picker. */
export const CUSTOMER_TYPE_LIST = [
  CUSTOMER_TYPES.walkin,
  CUSTOMER_TYPES.member,
  CUSTOMER_TYPES.senior,
  CUSTOMER_TYPES.pwd
];

/** Statutory discount rate applied to Senior / PWD sales. */
export const CUSTOMER_DISCOUNT_RATE = 0.2;

/** Human label for a customer type id. */
export function customerTypeLabel(type) {
  const t = CUSTOMER_TYPES[type];
  return t ? t.label : "Walk-in";
}