import type { ReactNode } from "react";
import Footer from "@/components/landing/Footer";
import Nav from "@/components/landing/Nav";
import s from "../landing.module.css";

// The marketing site: every page shares the instrument-bar nav and footer.
// The map at /map/ sits outside this group as its own full-screen app.
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className={s.page}>
      <Nav />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
