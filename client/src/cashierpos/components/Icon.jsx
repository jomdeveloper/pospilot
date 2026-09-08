/**
 * Icon.jsx
 * --------------------------------------------------------------------------
 * Inline SVG icon registry, ported 1:1 from the ICONS map in the vanilla
 * `app.js`. The icon `name` matches the `icon` field in functionButtons data.
 */
import React from "react";

const ICONS = {
  search: '<path d="M11 3a8 8 0 1 0 0 16a8 8 0 0 0 0-16z"/><path d="M21 21l-4.35-4.35"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/>',
  percent: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.6"/><circle cx="17" cy="17" r="2.6"/>',
  qty: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  void: '<path d="M6 6l12 12M18 6L6 18"/>',
  hold: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  pause: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  recall: '<path d="M4 12a8 8 0 1 1 2.34 5.66"/><path d="M2 4v5h5"/><path d="M12 8v4l3 2"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9h.01M18 15h.01"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  member: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><circle cx="9" cy="11" r="2.5"/><path d="M4.5 17a5 5 0 0 1 9 0"/><path d="M15 9h6M15 12.5h4M17 15h2"/>',
  senior: '<path d="M12 3.5l1.6 3.4 3.7.5-2.7 2.6.7 3.7-3.3-1.8-3.3 1.8.7-3.7-2.7-2.6 3.7-.5z"/><path d="M12 2.8v2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.2 9a3 3 0 0 1 5.8 1c0 2-3 1.8-3 4"/><path d="M12 17h.01"/>',
  warning: '<path d="M12 3.5l9 16H3z"/><path d="M12 9v5M12 17h.01"/>',
  cancel: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  receipt: '<path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  pwd: '<circle cx="12" cy="6.5" r="2.5"/><path d="M12 9v5.5M12 14.5l-2.8 4M12 14.5l2.8 2.6M8.2 11h7.6"/><circle cx="7.5" cy="19" r="1.4"/><circle cx="16.5" cy="18" r="1.6"/>'
};

export default function Icon({ name, className }) {
  return (
    <svg
      className={className || ""}
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[name] || ICONS.more }}
    />
  );
}