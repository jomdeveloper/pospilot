
/**
 * CustomerDialog.jsx
 * --------------------------------------------------------------------------
 * Allows the cashier to pick a customer type (Walk-in default / Member / Senior /
 * PWD) and enter the customer details. Members are looked up by their member
 * id; Senior / PWD require their discount id. Selecting Walk-in clears the
 * customer back to the default state.
 *
 * PosPilot integration: member lookup queries the live customers table via
 * findMemberByCode (wired to the API — no sample data).
 */
import React, { useEffect, useRef, useState } from "react";
import { usePos } from "../../context/PosContext";
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LIST, customerTypeLabel } from "../../data/customerTypes";
import { findMemberByCode } from "../../data/members";
import Icon from "../Icon.jsx";
import Dialog from "./Dialog.jsx";

export default function CustomerDialog() {
  const { state, actions } = usePos();
  const [type, setType] = useState(
    state.customerType && state.customerType !== "walkin" ? state.customerType : "walkin"
  );
  const [name, setName] = useState(state.customer || "");
  const [id, setId] = useState(state.customerId || "");
  // Member lookup state (only meaningful while type === "member").
  const [memberInfo, setMemberInfo] = useState(null);
  const [memberNotFound, setMemberNotFound] = useState(false);
  // Member must be explicitly confirmed (via checkbox) before saving.
  const [memberConfirmed, setMemberConfirmed] = useState(false);
  const close = () => actions.closeDialog();
  const active = CUSTOMER_TYPES[type];
  const typeRefs = useRef([]);

  const setCustomer = (customerName, customerType, customerId) => {
    actions.setCustomer({
      name: customerName,
      customerType,
      customerId
    });
  };

  const pickType = (lt) => {
    if (lt.id === type) return;
    setType(lt.id);
    setId("");
    setMemberInfo(null);
    setMemberNotFound(false);
    setMemberConfirmed(false);
    // Selecting Walk-in switches back to the default cleared customer.
    if (lt.id === "walkin") {
      setCustomer(null, "walkin", "");
    }
  };

  /** Look up a member by the entered member id. On a hit, auto-fill the name. */
  const searchMember = async () => {
    const mid = id.trim();
    if (!mid) {
      setMemberInfo(null);
      setMemberNotFound(true);
      setMemberConfirmed(false);
      return;
    }
    const hit = await findMemberByCode(mid);
    setMemberInfo(hit);
    setMemberNotFound(!hit);
    // A fresh search result needs re-confirming before it can be saved.
    setMemberConfirmed(false);
    if (hit) setName(hit.name);
  };

  /** Editing the id clears any stale lookup result until they search again. */
  const onIdChange = (value) => {
    setId(value);
    setMemberInfo(null);
    setMemberNotFound(false);
    setMemberConfirmed(false);
  };
// ArrowLeft / ArrowRight cycle the customer type segments (Walk-in, Member,
  // Senior, PWD). Text inputs keep their normal arrow behaviour, so typing in
  // the Member ID / name / discount-id fields is never interrupted.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const inField = e.target && e.target.closest("input, textarea, select");
      if (inField) return;
      e.preventDefault();
      e.stopPropagation();
      const idx = CUSTOMER_TYPE_LIST.findIndex((t) => t.id === type);
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const next = (idx + dir + CUSTOMER_TYPE_LIST.length) % CUSTOMER_TYPE_LIST.length;
      pickType(CUSTOMER_TYPE_LIST[next]);
      // Move visible focus onto the newly selected segment.
      const el = typeRefs.current[next];
      if (el) el.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const save = () => {
    // Member: a successful lookup AND the confirmation checkbox are required.
    if (type === "member") {
      const mid = id.trim();
      if (!mid || !memberInfo) {
        actions.showToast("Enter a valid member ID and press Find", false, "error");
        return;
      }
      if (!memberConfirmed) {
        actions.showToast("Check the box to confirm this member", false, "error");
        return;
      }
      setCustomer(memberInfo.name, "member", mid);
      close();
      actions.showToast("Member: " + memberInfo.name, false, "user");
      return;
    }

    // Senior / PWD: a customer name AND a valid discount id are required.
    if (type === "senior" || type === "pwd") {
      const v = name.trim();
      const custId = id.trim();
      if (!v) {
        actions.showToast("Enter the customer name", false, "error");
        return;
      }
      if (!custId) {
        actions.showToast("Enter the " + active.idLabel, false, "error");
        return;
      }
      setCustomer(v, type, custId);
      close();
      actions.showToast(customerTypeLabel(type) + ": " + v, false, "user");
      return;
    }

    // Walk-in: clears back to the default.
    setCustomer(null, "walkin", "");
    close();
    actions.showToast("Customer cleared (Walk-in)", false, "user");
  };
return (
    <Dialog
      className="dialog--customer"
      title="Customer"
      onClose={close}
      footer={
        <>
          <button type="button" className="dialog-btn dialog-btn--ghost" onClick={close}>
            Cancel
          </button>
          <button type="button" className="dialog-btn dialog-btn--primary" onClick={save}>
            Set Customer
          </button>
        </>
      }
    >
      <div className="cust-type" role="tablist" aria-label="Customer type">
        {CUSTOMER_TYPE_LIST.map((lt, i) => {
          const selected = lt.id === type;
          return (
            <button
              key={lt.id}
              type="button"
              role="radio"
              aria-checked={selected}
              ref={(el) => (typeRefs.current[i] = el)}
              className={"cust-type__btn" + (selected ? " is-active" : "")}
              onClick={() => pickType(lt)}
            >
              <span className="cust-type__icon" aria-hidden="true">
                <Icon name={lt.icon} />
              </span>
              <strong className="cust-type__name">{lt.label}</strong>
              <span className="cust-type__hint">{lt.hint}</span>
            </button>
          );
        })}
      </div>

      {type === "member" && (
        <div className="member-search">
          <div className="form-row">
            <label htmlFor="dlg-memberid">Member ID</label>
            <input
              id="dlg-memberid"
              type="text"
              value={id}
              placeholder="e.g. MB-1001"
              onChange={(e) => onIdChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  searchMember();
                }
              }}
            />
          </div>
          <button type="button" className="price-check__btn" onClick={searchMember}>
            Find
          </button>

          {memberNotFound && (
            <p className="dialog__hint price-check__notfound">
              No member found for &quot;{id.trim()}&quot;.
            </p>
          )}

          {memberInfo && (
            <label className={"member-card" + (memberConfirmed ? " is-confirmed" : "")}>
              <div className="member-card__main">
                <span className="member-card__id">{memberInfo.id}</span>
                <span className="member-card__name">{memberInfo.name}</span>
                <span className="member-card__meta">
                  {memberInfo.tier} member · {memberInfo.points} pts
                </span>
              </div>
              <span className="member-card__found">Found</span>
              <span className="member-card__check">
                <input
                  type="checkbox"
                  checked={memberConfirmed}
                  onChange={(e) => setMemberConfirmed(e.target.checked)}
                />
                Confirm
              </span>
            </label>
          )}
        </div>
      )}

      {type !== "member" && (
        <div className="form-row">
          <label htmlFor="dlg-customer">Customer name</label>
          <input
            id="dlg-customer"
            type="text"
            value={name}
            placeholder={type === "walkin" ? "Walk-in customer" : "e.g. Juan Dela Cruz"}
            disabled={type === "walkin"}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            }}
          />
        </div>
      )}

      {(type === "senior" || type === "pwd") && (
        <div className="form-row">
          <label htmlFor="dlg-custid">{active.idLabel}</label>
          <input
            id="dlg-custid"
            type="text"
            value={id}
            placeholder={active.idPlaceholder}
            onChange={(e) => setId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            }}
          />
        </div>
      )}
    </Dialog>
  );
}
