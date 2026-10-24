import { useEffect } from 'react';

/**
 * Hook to enable Enter-key navigation across form inputs, dropdowns, and buttons.
 * When Enter is pressed on an input/select, focus is moved to the next visible focusable element.
 */
export function useEnterKeyNavigation() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;

      const activeEl = document.activeElement as HTMLElement;
      if (!activeEl) return;

      const isInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT' || activeEl.tagName === 'TEXTAREA';
      if (!isInput) return;

      // Textareas should allow native Enter behavior for newlines
      if (activeEl.tagName === 'TEXTAREA') return;

      // Prevent default form submission on Enter
      e.preventDefault();

      // Locate all visible focusable form elements inside the current context (modal/form or page body)
      const container = activeEl.closest('[role="dialog"]') || activeEl.closest('form') || document.body;
      const allElements = Array.from(
        container.querySelectorAll('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])')
      ) as HTMLElement[];

      // Filter out elements that are hidden (no size) or excluded from tab index
      const focusableElements = allElements.filter(el => {
        const style = window.getComputedStyle(el);
        return el.offsetWidth > 0 && 
               el.offsetHeight > 0 && 
               el.getAttribute('tabindex') !== '-1' &&
               style.display !== 'none' &&
               style.visibility !== 'hidden';
      });

      const index = focusableElements.indexOf(activeEl);
      if (index > -1) {
        const nextEl = focusableElements[index + 1];
        if (nextEl) {
          nextEl.focus();
          if (nextEl.tagName === 'INPUT') {
            (nextEl as HTMLInputElement).select?.();
          }
        }
      }
    };

    // Use capturing phase (true) to intercept the event before other handlers prevent it
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);
}
