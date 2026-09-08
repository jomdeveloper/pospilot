/**
 * functions.js
 * ------------------------------------------------------------------
 * Data-driven definition of the function buttons used in the BOTTOM
 * panel. Kept as pure data so the UI (HTML/JS or later React)
 * can simply `.map()` over them.
 *
 * In a React + Vite conversion this becomes:
 *   src/data/functionButtons.js
 *
 * Shape:
 *   {
 *     key:  string   – the function-key label shown on the button,
 *     name: string   – button label,
 *     icon: string   – icon name resolved by the icon renderer,
 *     action: string – identifier matched by app.js to an action handler
 *   }
 */

/**
 * The BOTTOM panel is the single F-key row: F1..F3, F5..F7, DEL (Remove
 * Item) then F10 (More Actions). Secondary actions that used to live on
 * the right column (Keyboard, About/Help, Cancel Transaction) and the row
 * (F6 Hold) and (F7 Recall) remain available through the function row.
 */
export const BOTTOM_FUNCTION_BUTTONS = [
  { key: "F2",  name: "Search",          icon: "tag",     action: "productSearch" },
  { key: "F3",  name: "Quantity",        icon: "qty",     action: "quantity" },
  { key: "F4",  name: "Customer",        icon: "user",    action: "customer" },
  { key: "F5",  name: "Discount",        icon: "percent", action: "discount" },
  { key: "F6",  name: "Hold",            icon: "hold",    action: "hold" },
  { key: "F7",  name: "Recall",          icon: "recall",  action: "recall" },
  { key: "DEL", name: "Remove",          icon: "void",    action: "void", danger: true },
  { key: "F10", name: "More",            icon: "more",    action: "more" }
];