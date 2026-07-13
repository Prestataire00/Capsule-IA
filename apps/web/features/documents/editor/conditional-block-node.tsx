'use client';

// Bloc conditionnel : « Si <variable renseignée> alors <contenu> ». Sérialisé en
// `<div data-condition="slug">…</div>` ; à la génération, le serveur garde le
// contenu si la variable {slug} est non vide, sinon retire le bloc.
import { Node as TiptapNode, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { TEMPLATE_VARIABLES } from '@/features/documents/templates/variables';

const CONDITION_OPTIONS = TEMPLATE_VARIABLES.map((v) => ({ value: v.slug, label: v.label }));

function ConditionalBlockView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const condition = (node.attrs as { condition: string }).condition;
  return (
    <NodeViewWrapper
      as="div"
      className="my-2 rounded-md border-2 border-cyan-400/60 bg-cyan-50/50 dark:bg-cyan-950/20 overflow-hidden"
      data-condition={condition}
    >
      <div
        className="flex items-center gap-2 px-3 py-1.5 bg-cyan-100/60 dark:bg-cyan-900/30 border-b border-cyan-300/60 text-xs"
        contentEditable={false}
      >
        <span className="font-bold text-cyan-700 dark:text-cyan-300">Si</span>
        <select
          className="flex-1 bg-white dark:bg-zinc-900 border border-cyan-300 dark:border-cyan-800 rounded px-2 py-0.5 text-xs"
          value={condition || ''}
          onChange={(e) => updateAttributes({ condition: e.target.value })}
        >
          <option value="">— choisir une variable —</option>
          {CONDITION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="text-cyan-700 dark:text-cyan-300">est renseignée</span>
        <button
          type="button"
          onClick={() => deleteNode()}
          className="text-cyan-700 hover:text-red-600 transition-colors text-base leading-none px-1"
          title="Supprimer le bloc"
        >
          ×
        </button>
      </div>
      <div className="px-3 py-2 text-xs">
        <span className="font-bold text-cyan-700 dark:text-cyan-300 mr-2">Alors</span>
        <NodeViewContent className="inline-block min-w-[100px] align-top" />
      </div>
    </NodeViewWrapper>
  );
}

export const ConditionalBlock = TiptapNode.create({
  name: 'conditionalBlock',
  group: 'block',
  content: 'inline*',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      condition: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-condition') || '',
        renderHTML: (attrs: { condition: string }) => ({ 'data-condition': attrs.condition }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-condition]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const condition = (node.attrs as { condition: string }).condition;
    return ['div', mergeAttributes(HTMLAttributes, { 'data-condition': condition }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ConditionalBlockView);
  },

  addCommands() {
    return {
      insertConditionalBlock:
        (condition = '') =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ commands }: { commands: any }) =>
          commands.insertContent({
            type: this.name,
            attrs: { condition },
            content: [{ type: 'text', text: ' ' }],
          }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  },
});

declare module '@tiptap/core' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Commands<ReturnType> {
    conditionalBlock: {
      insertConditionalBlock: (condition?: string) => ReturnType;
    };
  }
}
