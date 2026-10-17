"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <section className="panel"><h1>No se pudo consultar el reporte</h1><p role="alert">Revisa la conexión e intenta nuevamente.</p><button className="button primary" onClick={reset}>Reintentar</button></section>;}
