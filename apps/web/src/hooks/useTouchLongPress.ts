import { useRef, useCallback } from 'react';

interface UseTouchLongPressOptions {
  onLongPress: (e: React.MouseEvent | React.TouchEvent) => void;
  onClick?: (e: React.MouseEvent | React.TouchEvent) => void;
  threshold?: number;
}

export function useTouchLongPress({
  onLongPress,
  onClick,
  threshold = 500,
}: UseTouchLongPressOptions) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef<boolean>(false);
  const isMovedRef = useRef<boolean>(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastTouchTimeRef = useRef<number>(0);
  const lastScrollTimeRef = useRef<number>(0);
  const lastClickTimeRef = useRef<number>(0);

  const start = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const isTouch = 'touches' in e;

      // Filter out synthetic mouse events triggered by touch screens within 400ms
      if (!isTouch && Date.now() - lastTouchTimeRef.current < 400) {
        return;
      }

      if (isTouch) {
        lastTouchTimeRef.current = Date.now();
      }

      isLongPressRef.current = false;
      isMovedRef.current = false;

      const clientX = 'touches' in e ? e.touches[0]?.clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0]?.clientY : (e as React.MouseEvent).clientY;
      startPosRef.current = { x: clientX || 0, y: clientY || 0 };

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        // Trigger long press ONLY if user did not move / scroll
        if (!isMovedRef.current) {
          isLongPressRef.current = true;
          onLongPress(e);
        }
      }, threshold);
    },
    [onLongPress, threshold]
  );

  const move = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!startPosRef.current) return;
    const clientX = 'touches' in e ? e.touches[0]?.clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY : (e as React.MouseEvent).clientY;
    const dist = Math.hypot((clientX || 0) - startPosRef.current.x, (clientY || 0) - startPosRef.current.y);

    // If finger moved > 8px, user is scrolling or dragging!
    if (dist > 8) {
      isMovedRef.current = true;
      lastScrollTimeRef.current = Date.now();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  }, []);

  const clear = useCallback(
    (e: React.MouseEvent | React.TouchEvent, shouldTriggerClick = true) => {
      const isTouch = 'changedTouches' in e || 'touches' in e;

      // Filter out synthetic mouse events
      if (!isTouch && Date.now() - lastTouchTimeRef.current < 400) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        return;
      }

      if (isTouch) {
        lastTouchTimeRef.current = Date.now();
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      // CRITICAL: If finger moved (scrolling) or just finished scrolling within 120ms, do not trigger tap
      if (isMovedRef.current || Date.now() - lastScrollTimeRef.current < 120) {
        isMovedRef.current = false;
        return;
      }

      if (shouldTriggerClick && !isLongPressRef.current && onClick) {
        const now = Date.now();
        // Prevent rapid hardware bounce within 80ms while keeping fast POS tapping instant
        if (now - lastClickTimeRef.current > 80) {
          lastClickTimeRef.current = now;
          onClick(e);
        }
      }
    },
    [onClick]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Block synthetic click event after scrolling or touch
      if (Date.now() - lastScrollTimeRef.current < 120 || isMovedRef.current) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // If pure desktop mouse click (no touch in last 400ms):
      if (Date.now() - lastTouchTimeRef.current >= 400 && onClick) {
        const now = Date.now();
        if (now - lastClickTimeRef.current > 80) {
          lastClickTimeRef.current = now;
          onClick(e);
        }
      }
    },
    [onClick]
  );

  return {
    onMouseDown: start,
    onMouseUp: (e: React.MouseEvent) => clear(e, false),
    onMouseLeave: (e: React.MouseEvent) => clear(e, false),
    onTouchStart: start,
    onTouchMove: move,
    onTouchEnd: (e: React.TouchEvent) => clear(e, true),
    onClick: handleClick,
  };
}
