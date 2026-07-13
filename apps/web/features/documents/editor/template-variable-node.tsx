'use client';

// Nœud TipTap « variable » : affiche {slug} sous forme de PASTILLE visuelle
// (le libellé humain), à la manière de Sosafe. Sérialisé en `<span data-tag>`
// contenant `{slug}` — reconverti en token brut à l'enregistrement.
import { Node as TiptapNode, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { TEMPLATE_VARIABLES } from '@/features/documents/templates/variables';

const SYSTEM_LABELS: Record<string, string> = Object.fromEntries(
  TEMPLATE_VARIABLES.map((v) => [v.slug, v.label]),
);

function lookupLabel(name: string): string {
  return SYSTEM_LABELS[name] ?? name;
}

function isKnownTag(name: string): boolean {
  return Boolean(SYSTEM_LABELS[name]);
}

function PillView({ node, deleteNode, selected }: NodeViewProps) {
  const name = (node.attrs as { name: string }).name;
  return (
    <NodeViewWrapper
      as="span"
      className={`inline-flex items-center align-baseline px-1.5 py-0.5 mx-0.5 rounded-md text-[0.85em] font-semibold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 cursor-grab select-none ${
        selected ? 'ring-2 ring-violet-400 ring-offset-1' : ''
      }`}
      data-tag={name}
      title={`{${name}} — double-clic pour retirer`}
      contentEditable={false}
      draggable
      onDoubleClick={() => deleteNode()}
    >
      {lookupLabel(name)}
    </NodeViewWrapper>
  );
}

export const TemplateVariable = TiptapNode.create({
  name: 'templateVariable',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      name: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-tag'),
        renderHTML: (attrs: { name: string | null }) => (attrs.name ? { 'data-tag': attrs.name } : {}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-tag]',
        getAttrs: (el) => {
          const name = (el as HTMLElement).getAttribute('data-tag');
          return name ? { name } : false;
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const name = (node.attrs as { name: string }).name;
    return ['span', mergeAttributes(HTMLAttributes, { 'data-tag': name }), `{${name}}`];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PillView);
  },

  addCommands() {
    return {
      insertTemplateVariable:
        (name: string) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ commands }: { commands: any }) =>
          commands.insertContent({ type: this.name, attrs: { name } }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  },
});

declare module '@tiptap/core' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Commands<ReturnType> {
    templateVariable: {
      insertTemplateVariable: (name: string) => ReturnType;
    };
  }
}

const KNOWN_TAGS_RE = /\{([a-z_][a-z0-9_]*)\}/g;

// Convertit les `{slug}` bruts d'un HTML stocké en `<span data-tag>` afin que
// TipTap les reparse en pastilles au chargement d'un modèle existant.
export function decorateRawTags(html: string): string {
  if (!html || !html.includes('{')) return html;
  if (typeof document === 'undefined') return html;
  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html');
  const root = doc.getElementById('__root');
  if (!root) return html;

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textsToProcess: Text[] = [];
  let cur: Node | null;
  while ((cur = walker.nextNode())) {
    let parent: Node | null = cur.parentNode;
    let alreadyWrapped = false;
    while (parent && parent !== root) {
      if (parent instanceof HTMLElement && parent.hasAttribute('data-tag')) {
        alreadyWrapped = true;
        break;
      }
      parent = parent.parentNode;
    }
    if (!alreadyWrapped && (cur.textContent || '').includes('{')) {
      textsToProcess.push(cur as Text);
    }
  }

  for (const textNode of textsToProcess) {
    const text = textNode.textContent || '';
    KNOWN_TAGS_RE.lastIndex = 0;
    if (!KNOWN_TAGS_RE.test(text)) continue;
    KNOWN_TAGS_RE.lastIndex = 0;
    const frag = doc.createDocumentFragment();
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    let replaced = false;
    while ((m = KNOWN_TAGS_RE.exec(text)) !== null) {
      const name = m[1];
      const full = m[0];
      if (!name || !isKnownTag(name)) continue;
      if (m.index > lastIndex) frag.appendChild(doc.createTextNode(text.slice(lastIndex, m.index)));
      const span = doc.createElement('span');
      span.setAttribute('data-tag', name);
      span.textContent = full;
      frag.appendChild(span);
      lastIndex = m.index + full.length;
      replaced = true;
    }
    if (!replaced) continue;
    if (lastIndex < text.length) frag.appendChild(doc.createTextNode(text.slice(lastIndex)));
    textNode.replaceWith(frag);
  }
  return root.innerHTML;
}

// À l'enregistrement : reconvertit les pastilles `<span data-tag=slug>…</span>`
// en tokens bruts `{slug}` pour le pipeline de rendu serveur (renderTemplate).
export function pillsToTokens(html: string): string {
  if (typeof document === 'undefined') return html;
  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html');
  const root = doc.getElementById('__root');
  if (!root) return html;
  root.querySelectorAll('span[data-tag]').forEach((span) => {
    const name = span.getAttribute('data-tag');
    span.replaceWith(doc.createTextNode(name ? `{${name}}` : ''));
  });
  return root.innerHTML;
}
