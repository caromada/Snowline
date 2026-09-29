import s from "@/app/landing.module.css";

// The page's section marker: a trail-sign fingerboard on a post. The board
// carries the section label and points the way the content runs.
export default function Signpost({
  label,
  dir = "right",
  className,
}: {
  label: string;
  dir?: "left" | "right";
  className?: string;
}) {
  return (
    <div className={`${s.signpost} ${dir === "left" ? s.signpostLeft : ""} ${className ?? ""}`}>
      <span className={s.signpostBoard}>{label}</span>
      <span className={s.signpostPost} aria-hidden="true" />
    </div>
  );
}
