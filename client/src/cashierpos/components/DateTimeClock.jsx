/**
 * DateTimeClock.jsx
 * --------------------------------------------------------------------------
 * Live date + time shown in the header clock chip. Updates every second and
 * renders the compact "Fri, 03 Jul 2026 — 10:42 AM" style used by the
 * cashier-screen header in the design.
 */
import React, { useEffect, useState } from "react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatClock(now) {
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes} ${ampm}`;
}

export default function DateTimeClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const date = `${DAYS[now.getDay()]}, ${String(now.getDate()).padStart(2, "0")} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <div className="datetime" aria-label="Current date and time">
      <span className="datetime__date">{date}</span>
      <span className="datetime__sep" aria-hidden="true">{"\u2014"}</span>
      <span className="datetime__clock">{formatClock(now)}</span>
    </div>
  );
}