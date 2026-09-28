"use client";

import { useEffect } from "react";
import { MAP_PATH } from "@/lib/paths";

// The map used to live at "/". Old shared links like /?pass=glen still land
// on the right pass.
export default function LegacyRedirect() {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.has("pass") || q.has("date")) window.location.replace(MAP_PATH + window.location.search);
  }, []);
  return null;
}
