/**
 * DialogHost.jsx
 * --------------------------------------------------------------------------
 * Switches the active dialog type (from `state.dialog`) to its component.
 * Renders nothing when no dialog is open.
 */
import React from "react";
import { usePos } from "../../context/PosContext";
import CustomerDialog from "./CustomerDialog.jsx";
import QuantityDialog from "./QuantityDialog.jsx";
import AddQuantityDialog from "./AddQuantityDialog.jsx";
import DiscountDialog from "./DiscountDialog.jsx";
import VoidDialog from "./VoidDialog.jsx";
import PriceCheckDialog from "./PriceCheckDialog.jsx";
import ProductSearchDialog from "./ProductSearchDialog.jsx";
import RecallDialog from "./RecallDialog.jsx";
import PaymentDialog from "./PaymentDialog.jsx";
import MoreDialog from "./MoreDialog.jsx";
import AboutDialog from "./AboutDialog.jsx";
import PrinterSettingsDialog from "./PrinterSettingsDialog.jsx";
import CancelTransactionDialog from "./CancelTransactionDialog.jsx";
import OpenRegisterDialog from "./OpenRegisterDialog.jsx";
import CashMovementDialog from "./CashMovementDialog.jsx";
import CloseRegisterDialog from "./CloseRegisterDialog.jsx";
import ItemNotFoundDialog from "./ItemNotFoundDialog.jsx";

export default function DialogHost() {
  const { state, runtime } = usePos();
  const dialog = state.dialog;

  if (!dialog) return null;

  switch (dialog.type) {
    case "openRegister":
      return <OpenRegisterDialog key="openRegister" terminal={(runtime && runtime.terminal) || "POS-02"} />;
    case "cashIn":
    case "cashOut":
    case "cashDrop":
      return <CashMovementDialog key={"cash-" + dialog.type} dialog={dialog} />;
    case "closeRegister":
      return <CloseRegisterDialog key="closeRegister" />;
    case "notFound":
      return <ItemNotFoundDialog key={"notFound-" + (dialog.code || "unknown")} dialog={dialog} />;
    case "customer":
      return <CustomerDialog key="customer" />;
    case "quantity":
      return <QuantityDialog key={"quantity-" + dialog.lineId} dialog={dialog} />;
    case "addQuantity":
      return <AddQuantityDialog key={"addQuantity-" + dialog.product.sku} dialog={dialog} />;
    case "discount":
      return <DiscountDialog key={"discount-" + dialog.lineId} dialog={dialog} />;
    case "void":
      return <VoidDialog key={"void-" + dialog.lineId} dialog={dialog} />;
    case "priceCheck":
      return <PriceCheckDialog key="priceCheck" />;
    case "productSearch":
      return <ProductSearchDialog key="productSearch" />;
    case "recall":
      return <RecallDialog key="recall" />;
    case "payment":
      return <PaymentDialog key={"payment-" + dialog.method} dialog={dialog} />;
    case "more":
      return <MoreDialog key="more" />;
    case "about":
      return <AboutDialog key="about" />;
    case "printerSettings":
      return <PrinterSettingsDialog key="printerSettings" />;
    case "cancelTransaction":
      return <CancelTransactionDialog key="cancelTransaction" />;
    default:
      return null;
  }
}