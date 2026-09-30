import type { Action } from 'svelte/action';

/**
 * Focus (and select) an element when it mounts — e.g. the first input in a modal.
 *
 * The HTML `autofocus` attribute only fires on initial page load, not when an
 * element is inserted dynamically (`{#if}`), so modals need this instead.
 *
 * Usage: <input use:autofocus />  or  <input use:autofocus={{ select: false }} />
 */
export const autofocus: Action<HTMLElement, { select?: boolean } | undefined> = (node, params) => {
  // rAF so focus runs after the node is in the DOM (and any open transition starts).
  const raf = requestAnimationFrame(() => {
    node.focus();
    const select = params?.select ?? true;
    if (select && (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) {
      node.select();
    }
  });
  return {
    destroy() {
      cancelAnimationFrame(raf);
    }
  };
};
