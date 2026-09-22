import { Flower2 } from "lucide-react";
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <Flower2 size={30} strokeWidth={1.75} aria-hidden />
      </span>
      <span>
        SIGCA<small>Tu espacio creativo</small>
      </span>
    </span>
  );
}
