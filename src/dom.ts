import { parseLength } from './geometry';

type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** append(), das null/false-Einträge überspringt. */
export function put(el: HTMLElement, ...children: Child[]) {
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
}

export interface NumOpts {
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  length?: boolean; // erlaubt Eingaben wie "2,5 m"
  digits?: number;
}

/** Zahlenfeld mit Beschriftung; ruft onChange bei Enter/Verlassen auf. */
export function numField(label: string, value: number, onChange: (v: number) => void, o: NumOpts = {}): HTMLElement {
  const fmt = (v: number) => String(Math.round(v * 10 ** (o.digits ?? 1)) / 10 ** (o.digits ?? 1)).replace('.', ',');
  const input = h('input', { type: 'text', inputMode: 'decimal', value: fmt(value) }) as HTMLInputElement;
  const commit = () => {
    const raw = input.value;
    let v = o.length ? parseLength(raw) : parseFloat(raw.replace(',', '.'));
    if (v === null || isNaN(v)) {
      input.value = fmt(value);
      return;
    }
    if (o.min !== undefined) v = Math.max(o.min, v);
    if (o.max !== undefined) v = Math.min(o.max, v);
    input.value = fmt(v);
    if (v !== value) {
      value = v;
      onChange(v);
    }
  };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      commit();
      input.select();
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = (o.step ?? 1) * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
      const cur = parseFloat(input.value.replace(',', '.')) || 0;
      input.value = fmt(cur + step);
      commit();
    }
  });
  input.addEventListener('focus', () => input.select());
  return h('label', { class: 'field' }, h('span', {}, label), o.unit ? h('div', { class: 'unit', 'data-unit': o.unit }, input) : input);
}

export function textField(label: string, value: string, onChange: (v: string) => void): HTMLElement {
  const input = h('input', { type: 'text', value }) as HTMLInputElement;
  input.addEventListener('change', () => onChange(input.value));
  input.addEventListener('keydown', (e) => e.stopPropagation());
  return h('label', { class: 'field' }, h('span', {}, label), input);
}

export function selectField(label: string, value: string, options: { value: string; label: string }[], onChange: (v: string) => void): HTMLElement {
  const sel = h('select', {}, ...options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label))) as HTMLSelectElement;
  sel.addEventListener('change', () => onChange(sel.value));
  return h('label', { class: 'field' }, h('span', {}, label), sel);
}

export function colorField(label: string, value: string, onChange: (v: string) => void, presets: string[] = []): HTMLElement {
  const input = h('input', { type: 'color', value }) as HTMLInputElement;
  input.addEventListener('change', () => onChange(input.value));
  return h(
    'div',
    { class: 'field' },
    h('span', {}, label),
    h(
      'div',
      { class: 'colors' },
      input,
      ...presets.map((c) => h('button', { class: 'c', style: `background:${c}`, title: c, onclick: () => onChange(c) })),
    ),
  );
}

export function checkbox(label: string, value: boolean, onChange: (v: boolean) => void, title = ''): HTMLElement {
  const input = h('input', { type: 'checkbox', checked: value }) as HTMLInputElement;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'chk', title }, input, label);
}

export function download(name: string, data: string, mime = 'application/json') {
  const a = document.createElement('a');
  a.href = data.startsWith('data:') ? data : URL.createObjectURL(new Blob([data], { type: mime }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const back = () => document.getElementById('modalBack')!;
export function openModal(content: HTMLElement, onClose?: () => void) {
  const m = document.getElementById('modal')!;
  m.innerHTML = '';
  m.append(content);
  back().hidden = false;
  const close = (e: MouseEvent) => {
    if (e.target === back()) closeModal();
  };
  back().onclick = close;
  modalClose = onClose ?? null;
}
let modalClose: (() => void) | null = null;
export function closeModal() {
  back().hidden = true;
  modalClose?.();
  modalClose = null;
}
export function modalOpen() {
  return !back().hidden;
}
