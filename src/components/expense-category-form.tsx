"use client";
import { useState,useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { saveExpenseCategory } from "@/features/expenses/actions";
import type { ExpenseCategory } from "@/features/expenses/domain";
export function ExpenseCategoryForm({id,category}:{id:string;category?:ExpenseCategory}) {
  const router=useRouter();const [pending,start]=useTransition();const [error,setError]=useState("");
  return <form className="panel quote-form expense-category-form" onSubmit={async event=>{event.preventDefault();const data=new FormData(event.currentTarget);const payload={name:String(data.get("name")??""),description:String(data.get("description")??""),is_active:data.get("is_active")==="on"};
    if(category?.is_active&&!payload.is_active){const Swal=(await import("sweetalert2")).default;const answer=await Swal.fire({title:"Desactivar categoría",text:"Se conservará en los gastos existentes y dejará de estar disponible para nuevos registros.",showCancelButton:true,confirmButtonText:"Desactivar",cancelButtonText:"Volver",confirmButtonColor:"#DD0675"});if(!answer.isConfirmed)return;}
    setError("");start(async()=>{try{const result=await saveExpenseCategory(id,category?.revision??0,payload);if(result.error){setError(result.error);return;}toast.success("Categoría guardada");router.push("/categorias-gastos");router.refresh();}catch{setError("No se pudo conectar. Conservamos tus datos.");}});
  }}><h2>{category?"Editar categoría":"Nueva categoría"}</h2>{error&&<p className="message error" role="alert">{error}</p>}<fieldset className="quote-fields" disabled={pending}><label>Nombre<input name="name" required maxLength={100} defaultValue={category?.name??""}/></label><label>Descripción<textarea name="description" maxLength={1000} defaultValue={category?.description??""}/></label><label className="check-label"><input name="is_active" type="checkbox" defaultChecked={category?.is_active??true}/>Activa</label><button className="button primary"><Save size={18}/>{pending?"Guardando…":"Guardar categoría"}</button></fieldset></form>;
}
