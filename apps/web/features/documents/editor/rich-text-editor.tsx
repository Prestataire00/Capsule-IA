'use client';

import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import {
  Bold,
  Italic,
  Strikethrough,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Highlighter,
  Table as TableIcon,
  ImagePlus,
  GitBranch,
  Undo,
  Redo,
} from 'lucide-react';
import { TemplateVariable, decorateRawTags } from './template-variable-node';
import { ConditionalBlock } from './conditional-block-node';
import { VariablesSidePanel } from './variables-side-panel';

function Btn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded transition ${
        active
          ? 'bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300'
          : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
      }`}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />;

function Toolbar({ editor }: { editor: Editor }) {
  const insertImage = () => {
    const url = window.prompt("URL de l'image");
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };
  return (
    <div className="flex items-center flex-wrap gap-0.5 border-b border-zinc-200/60 dark:border-zinc-800 px-2 py-1.5 bg-zinc-50/60 dark:bg-zinc-950/40">
      <Btn title="Gras" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="w-3.5 h-3.5" />
      </Btn>
      <Btn title="Italique" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="w-3.5 h-3.5" />
      </Btn>
      <Btn title="Souligné" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="w-3.5 h-3.5" />
      </Btn>
      <Btn title="Barré" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="w-3.5 h-3.5" />
      </Btn>
      <Btn title="Surligner" active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()}>
        <Highlighter className="w-3.5 h-3.5" />
      </Btn>
      <Sep />
      <Btn title="Titre 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1 className="w-3.5 h-3.5" />
      </Btn>
      <Btn title="Titre 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="w-3.5 h-3.5" />
      </Btn>
      <Btn title="Titre 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 className="w-3.5 h-3.5" />
      </Btn>
      <Btn title="Liste à puces" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="w-3.5 h-3.5" />
      </Btn>
      <Btn title="Liste numérotée" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="w-3.5 h-3.5" />
      </Btn>
      <Sep />
      <Btn title="Aligner à gauche" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
        <AlignLeft className="w-3.5 h-3.5" />
      </Btn>
      <Btn title="Centrer" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
        <AlignCenter className="w-3.5 h-3.5" />
      </Btn>
      <Btn title="Aligner à droite" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
        <AlignRight className="w-3.5 h-3.5" />
      </Btn>
      <Btn title="Justifier" active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}>
        <AlignJustify className="w-3.5 h-3.5" />
      </Btn>
      <Sep />
      <Btn title="Insérer un tableau" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <TableIcon className="w-3.5 h-3.5" />
      </Btn>
      <Btn title="Insérer une image (URL)" onClick={insertImage}>
        <ImagePlus className="w-3.5 h-3.5" />
      </Btn>
      <Btn title="Bloc conditionnel" onClick={() => editor.chain().focus().insertConditionalBlock('').run()}>
        <GitBranch className="w-3.5 h-3.5" />
      </Btn>
      <Sep />
      <Btn title="Annuler" onClick={() => editor.chain().focus().undo().run()}>
        <Undo className="w-3.5 h-3.5" />
      </Btn>
      <Btn title="Rétablir" onClick={() => editor.chain().focus().redo().run()}>
        <Redo className="w-3.5 h-3.5" />
      </Btn>
    </div>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Rédigez votre document… insérez des variables depuis le panneau de droite.',
  showVariablesPanel = true,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  showVariablesPanel?: boolean;
}) {
  const editor = useEditor({
    immediatelyRender: false, // requis en SSR Next.js
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight,
      Image,
      Placeholder.configure({ placeholder }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TemplateVariable,
      ConditionalBlock,
    ],
    content: decorateRawTags(value || ''),
    editorProps: {
      attributes: {
        class:
          'doc-sheet prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[480px] px-6 py-5',
      },
    },
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg overflow-hidden">
        {editor && <Toolbar editor={editor} />}
        <EditorContent editor={editor} />
      </div>
      {showVariablesPanel && (
        <aside className="lg:sticky lg:top-4 h-fit max-h-[80vh] bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg p-3">
          <p className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2 font-medium">
            Variables
          </p>
          <VariablesSidePanel
            onInsert={(slug) => editor?.chain().focus().insertTemplateVariable(slug).run()}
          />
        </aside>
      )}
    </div>
  );
}
