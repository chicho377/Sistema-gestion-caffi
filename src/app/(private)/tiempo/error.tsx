"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <section className="panel"><h1>No se pudo cargar el tiempo</h1><p role="alert">Las sesiones permanecen guardadas. Comprueba la conexión.</p><button className="button primary" onClick={reset}>Reintentar</button></section>;}
