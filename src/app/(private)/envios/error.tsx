"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <section className="panel"><h1>No se pudo cargar el envío</h1><p role="alert">Verifica la conexión y vuelve a intentarlo. Los datos guardados se conservan.</p><button className="button primary" onClick={reset}>Reintentar</button></section>;}
