type Child = Node | string | null | undefined | false;

/** Tiny hyperscript helper; text always goes through textContent/Text nodes (never innerHTML). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string; onclick?: (e: Event) => void; [k: string]: unknown } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'onclick') el.addEventListener('click', v as EventListener);
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
