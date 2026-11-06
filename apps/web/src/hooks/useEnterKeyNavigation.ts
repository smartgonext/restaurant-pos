import { useEffect } from 'react';

/**
 * Universal POS & ERP Keyboard-Friendly Navigation Hook.
 * 
 * Rules:
 * 1. Enter on any field -> advances smoothly to the next visible field (input, select, textarea).
 * 2. Does NOT hijack dropdowns with intrusive OS popups; select gets focus, user can cycle with arrows, Enter advances.
 * 3. Inside a dropdown (<select>):
 *    - PageDown / DownArrow: cycles down options and triggers reactive onChange.
 *    - PageUp / UpArrow: cycles up options and triggers reactive onChange.
 *    - Enter: commits the selected value and moves to the next field.
 * 4. On the last field of a form/modal -> Enter moves focus to the Primary Submit/Save/OK button.
 * 5. On the Primary Button -> Enter triggers click() naturally to save/create/submit.
 * 6. Shift + Enter -> moves focus to the previous field.
 * 7. When a modal opens -> auto-focuses the first editable field after render.
 * 8. Singleton protected -> Never fires duplicate times even if called across multiple components.
 */
export function useEnterKeyNavigation() {
  useEffect(() => {
    // Singleton guard: prevent duplicate listeners when mounted in App + child pages
    if ((window as any).__agy_enter_nav_active) {
      return;
    }
    (window as any).__agy_enter_nav_active = true;

    // Helper to check if an element is a secondary/cancel/close/helper button to skip during forward flow
    const isSecondaryOrCancel = (el: HTMLElement) => {
      if (el.tagName !== 'BUTTON' && !(el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'button')) {
        return false;
      }
      if (el.getAttribute('data-enter-ignore') === 'true' || el.getAttribute('tabindex') === '-1') {
        return true;
      }

      const text = el.textContent?.trim().toLowerCase() || '';
      const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
      const title = el.getAttribute('title')?.toLowerCase() || '';
      const className = el.className.toLowerCase();

      const skipWords = [
        'cancel', 'close', 'dismiss', 'back', 'no', 'exit',
        'dark', 'light', 'theme', 'register', 'open register',
        'mode', 'refresh', 'sync', 'fullscreen', 'display',
        'auto', 'auto generate', 'ai photo', 'lib', 'discard'
      ];
      const matchesText = skipWords.some((word) => text === word || ariaLabel.includes(word) || title.includes(word));
      const hasCloseIcon = Boolean(el.querySelector('svg.lucide-x') || el.querySelector('svg[data-icon="x"]'));
      const matchesClass = className.includes('cancel') || className.includes('close-btn');

      return matchesText || hasCloseIcon || matchesClass;
    };

    // Helper to determine if an element is visible and interactive
    const isInteractive = (el: HTMLElement) => {
      if ((el as any).disabled || el.getAttribute('tabindex') === '-1' || el.getAttribute('data-enter-ignore') === 'true') {
        return false;
      }

      const tagName = el.tagName;
      if (tagName === 'INPUT') {
        const inputType = (el as HTMLInputElement).type?.toLowerCase();
        // Checkboxes, radios, file uploads are handled separately, not in Enter text navigation sequence
        if (['hidden', 'file', 'image', 'checkbox', 'radio'].includes(inputType)) return false;
      }

      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const hasSize = (rect.width > 0 && rect.height > 0) || (el.offsetWidth > 0 && el.offsetHeight > 0);
      const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';

      return hasSize && isVisible;
    };

    // Keydown handler
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement;
      if (!activeEl) return;

      const isSelect = activeEl.tagName === 'SELECT';
      const isInput = activeEl.tagName === 'INPUT' && !['button', 'submit', 'reset', 'checkbox', 'radio'].includes((activeEl as HTMLInputElement).type);
      const isTextArea = activeEl.tagName === 'TEXTAREA';
      const isButton = activeEl.tagName === 'BUTTON';

      // ──────────────────────────────────────────────────────────────────────────
      // 1. PageDown / PageUp navigation on <select> dropdowns
      // ──────────────────────────────────────────────────────────────────────────
      if (isSelect && (e.key === 'PageDown' || e.key === 'PageUp')) {
        const sel = activeEl as HTMLSelectElement;
        if (sel.options.length > 0) {
          e.preventDefault();
          const step = e.key === 'PageDown' ? 1 : -1;
          const nextIndex = Math.max(0, Math.min(sel.options.length - 1, sel.selectedIndex + step));
          if (nextIndex !== sel.selectedIndex) {
            sel.selectedIndex = nextIndex;
            sel.dispatchEvent(new Event('input', { bubbles: true }));
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return;
        }
      }

      // ──────────────────────────────────────────────────────────────────────────
      // 2. Enter key navigation
      // ──────────────────────────────────────────────────────────────────────────
      if (e.key !== 'Enter') return;

      // In textareas: allow standard multiline Enter, navigate only on Ctrl+Enter
      if (isTextArea && !e.ctrlKey) return;

      // When focused on button: default Enter triggers click() naturally
      if (isButton) {
        return;
      }

      // Explicitly allow elements with data-enter-ignore or data-enter-action to handle their own Enter key
      if (
        activeEl.hasAttribute('data-enter-ignore') ||
        activeEl.getAttribute('data-enter-ignore') === 'true' ||
        activeEl.getAttribute('data-enter-action') === 'lookup' ||
        activeEl.getAttribute('data-enter-action') === 'search' ||
        activeEl.closest('[data-enter-ignore="true"]')
      ) {
        return;
      }

      // Only handle form controls (inputs, selects, ctrl-textareas)
      if (!isInput && !isSelect && !isTextArea) return;

      // Prevent premature form submission or newline and stop any competing handlers
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      // Find closest container: Modal Dialog > Active Form > Card/Container > Body
      const container =
        activeEl.closest('[role="dialog"]') ||
        activeEl.closest('.modal-content, [data-headlessui-state]') ||
        activeEl.closest('form') ||
        activeEl.closest('.card, .glass-card, [class*="modal"]') ||
        document.body;

      // Collect all potential form inputs, selects, and buttons inside container
      const allCandidates = Array.from(
        container.querySelectorAll<HTMLElement>(
          'input, select, textarea, button, [tabindex]'
        )
      );

      // Filter visible and interactive elements (ignore header/navigation bars if searching whole body)
      const visibleElements = allCandidates.filter((el) => {
        if (!isInteractive(el)) return false;
        if (container === document.body && el.closest('header, nav, [role="banner"], [data-header]')) {
          return false;
        }
        return true;
      });

      // Separate into field controls and action buttons
      const fields = visibleElements.filter((el) =>
        ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)
      );

      const actionButtons = visibleElements.filter((el) =>
        el.tagName === 'BUTTON' && !isSecondaryOrCancel(el) && !el.hasAttribute('disabled')
      );

      // Locate primary submit button (Save / Create / Submit / OK / Print / Update / Craft / Primary style)
      const primaryButton =
        container.querySelector<HTMLButtonElement>('[data-submit-btn="true"], button[type="submit"]:not([disabled])') ||
        actionButtons.find((btn) => {
          const type = (btn as HTMLButtonElement).type;
          const txt = (btn.textContent || '').trim().toLowerCase();
          const cls = btn.className.toLowerCase();
          return (
            type === 'submit' ||
            btn.hasAttribute('data-submit-btn') ||
            btn.getAttribute('data-submit-btn') === 'true' ||
            /^(save|submit|create|add|ok|print|settle|update|confirm|pay|proceed|done|craft)/i.test(txt) ||
            cls.includes('bg-[#a87fff]') ||
            cls.includes('btn-primary') ||
            cls.includes('bg-primary') ||
            cls.includes('bg-blue-600')
          );
        }) || actionButtons[actionButtons.length - 1];

      // Handle Shift + Enter (Reverse navigation)
      if (e.shiftKey) {
        const curIdx = fields.indexOf(activeEl);
        if (curIdx > 0) {
          const prevEl = fields[curIdx - 1];
          prevEl.focus();
          if (prevEl.tagName === 'INPUT') {
            (prevEl as HTMLInputElement).select?.();
          }
        }
        return;
      }

      // Forward Enter navigation
      const currentFieldIndex = fields.indexOf(activeEl);

      if (currentFieldIndex > -1 && currentFieldIndex < fields.length - 1) {
        // Next field exists
        const nextEl = fields[currentFieldIndex + 1];
        nextEl.focus();

        if (nextEl.tagName === 'INPUT') {
          (nextEl as HTMLInputElement).select?.();
        }
      } else if (currentFieldIndex === fields.length - 1) {
        // Last field reached -> Advance to Primary Action / OK button and trigger submit
        if (primaryButton && !primaryButton.hasAttribute('disabled')) {
          primaryButton.focus();
          primaryButton.click();
        }
      } else {
        // Field not directly matched in fields array: find first field positioned after activeEl in DOM
        const nextEl = fields.find((f) => Boolean(activeEl.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING));
        if (nextEl) {
          nextEl.focus();
          if (nextEl.tagName === 'INPUT') {
            (nextEl as HTMLInputElement).select?.();
          }
        } else if (primaryButton && !primaryButton.hasAttribute('disabled')) {
          primaryButton.focus();
          primaryButton.click();
        }
      }
    };

    // ──────────────────────────────────────────────────────────────────────────
    // 3. Auto-focus First Field on Modal Opening
    // ──────────────────────────────────────────────────────────────────────────
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList' && m.addedNodes.length > 0) {
          for (const node of Array.from(m.addedNodes)) {
            if (node instanceof HTMLElement) {
              const dialog = node.matches('[role="dialog"]') ? node : node.querySelector('[role="dialog"]');
              if (dialog) {
                setTimeout(() => {
                  const allCandidates = Array.from(
                    dialog.querySelectorAll<HTMLElement>(
                      'input:not([type="hidden"]):not([type="file"]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])'
                    )
                  );
                  const firstField = allCandidates.find(isInteractive);
                  if (firstField) {
                    firstField.focus();
                    if (firstField.tagName === 'INPUT') {
                      (firstField as HTMLInputElement).select?.();
                    }
                  }
                }, 80);
              }
            }
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Attach capturing listener so Enter key fires before bubbling stops
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      (window as any).__agy_enter_nav_active = false;
      observer.disconnect();
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);
}

export default useEnterKeyNavigation;
