import type { Metadata } from "next";
import { Toaster } from "sonner";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/coiny/400.css";
import "@fontsource/chewy/400.css";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "SIGCA · Tu espacio creativo", template: "%s · SIGCA" },
  description: "Gestión privada para un emprendimiento de crochet.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <a className="skip-link" href="#main-content">
          Saltar al contenido
        </a>
        {children}
        <Toaster richColors position="top-center" closeButton />
      </body>
    </html>
  );
}
