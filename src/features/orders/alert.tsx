"use client";
import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { businessDate, deliveryAlert } from "./domain";
export function QuoteAlert({ date, status, today }: { date: string; status: string; today: string }) {
  const [day, setDay] = useState(today);
  useEffect(() => { const update = () => setDay(businessDate()); const timer = setInterval(update, 30000); window.addEventListener("focus", update); return () => { clearInterval(timer); window.removeEventListener("focus", update); }; }, []);
  const alert = deliveryAlert(date, status, day);
  return alert ? <span className={`quote-alert ${alert.tone}`}><TriangleAlert size={16}/>{alert.text}</span> : null;
}
