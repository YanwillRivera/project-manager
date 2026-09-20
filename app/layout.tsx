import type { Metadata } from "next";
import "./globals.css";

/*
  Layout raíz de Next.js: define el documento HTML compartido por todas las
  rutas. La página se renderiza dentro de `children`; aquí no se mantiene
  estado ni se ejecuta lógica de negocio.
*/

export const metadata: Metadata = {
  /* Metadatos usados por el navegador y por los motores de búsqueda. */
  title: "Project Manager",
  description: "Construction project management dashboard",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
