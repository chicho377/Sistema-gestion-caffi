export type Pause = {id?:string;paused_at:string;resumed_at:string|null};
export type WorkSession = {id:string;order_id:string;order_item_id:string|null;user_id:string;worker_name:string;activity:string|null;status:'running'|'paused'|'finished';started_at:string;finished_at:string|null;worked_seconds:number|null;elapsed_seconds:number;revision:number;pauses:Pause[]};
export type WorkRead = {server_now:string;can_start:boolean;sessions:WorkSession[];active_order_number?:string|null};
export type WorkOperation = 'start'|'pause'|'resume'|'finish'|'historical'|'correct';
export const duration = (seconds:number) => `${Math.floor(seconds/3600)}:${String(Math.floor(seconds%3600/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
