export const deliveryTypes={pickup:'Retiro',shipping:'Envío',personal_delivery:'Entrega personal'} as const;
export const shipmentStates={pending:'Pendiente',preparing:'Preparando',shipped:'Despachado',delivered:'Entregado',cancelled:'Cancelado'} as const;
export type Shipment={id:string;order_id:string;delivery_type:keyof typeof deliveryTypes;status:keyof typeof shipmentStates;delivery_address:string|null;courier:string|null;tracking_number:string|null;notes:string|null;shipped_at:string|null;delivered_at:string|null;cancelled_at:string|null;cancel_reason:string|null;revision:number;created_at:string};
export type ShippingFinance={paid_by:'business'|'customer_direct';cost_crc:string|null;expense_id:string|null;expense_status:string|null;expense_amount_crc:string|null};
export type ShippingOperation='create'|'edit'|'advance'|'back'|'cancel'|'correct'|'finance'|'link';
