import { useRef } from "react";

const MAX_GAP_MS = 320;
const MAX_MOVE_PX = 24;

export function useDoubleTap(onDoubleTap: () => void) {
  const last = useRef<{ at: number; x: number; y: number } | null>(null);

  return {
    onPointerUp: (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      const now = event.timeStamp;
      const prev = last.current;
      if (prev && now - prev.at < MAX_GAP_MS && Math.hypot(event.clientX - prev.x, event.clientY - prev.y) < MAX_MOVE_PX) {
        last.current = null;
        onDoubleTap();
        return;
      }
      last.current = { at: now, x: event.clientX, y: event.clientY };
    },
  };
}
