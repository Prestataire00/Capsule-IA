'use client';

import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Columns3,
  Heading2,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Redo,
  Rows3,
  Strikethrough,
  Table as TableIcon,
  Trash2,
  Underline as UnderlineIcon,
  Undo,
} from 'lucide-react';
import { CONTENU_RICHE } from './contenu-riche';

const POLICES = [
  { label: 'Police du site', value: '' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
];

const TAILLES = [
  { label: 'Taille normale', value: '' },
  { label: 'Petite', value: '12px' },
  { label: 'Grande', value: '18px' },
  { label: 'Très grande', value: '24px' },
];

const COULEURS_TEXTE = [
  { nom: 'Rouge', valeur: '#dc2626' },
  { nom: 'Orange', valeur: '#ea580c' },
  { nom: 'Vert', valeur: '#16a34a' },
  { nom: 'Bleu', valeur: '#2563eb' },
  { nom: 'Violet', valeur: '#7c3aed' },
];

const SURLIGNAGES = [
  { nom: 'Jaune', valeur: '#fef08a' },
  { nom: 'Vert', valeur: '#bbf7d0' },
  { nom: 'Rose', valeur: '#fbcfe8' },
  { nom: 'Bleu', valeur: '#bfdbfe' },
];

const menu =
  'text-[12px] h-7 px-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500/30';

function Bouton({
  titre,
  actif,
  onClick,
  children,
}: {
  titre: string;
  actif?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={titre}
      aria-label={titre}
      aria-pressed={actif}
      // Garde la sélection dans l'éditeur au moment du clic.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`w-7 h-7 grid place-items-center rounded-md transition ${
        actif
          ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
          : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
      }`}
    >
      {children}
    </button>
  );
}

function Pastille({ nom, couleur, actif, onClick }: { nom: string; couleur: string; actif: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={nom}
      aria-label={nom}
      aria-pressed={actif}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={{ backgroundColor: couleur }}
      className={`w-5 h-5 rounded-full border transition ${
        actif ? 'border-zinc-900 dark:border-white ring-2 ring-orange-500/40' : 'border-zinc-300 dark:border-zinc-600 hover:scale-110'
      }`}
    />
  );
}

const Sep = () => <span className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" aria-hidden />;

function BarreOutils({ editor }: { editor: Editor }) {
  const style = editor.getAttributes('textStyle') as { fontFamily?: string; fontSize?: string; color?: string };
  const surlignage = editor.getAttributes('highlight') as { color?: string };
  const dansTableau = editor.isActive('table');

  const lien = () => {
    const actuel = (editor.getAttributes('link') as { href?: string }).href ?? '';
    const url = window.prompt('Adresse du lien (laisser vide pour le retirer)', actuel);
    if (url === null) return;
    if (url.trim() === '') editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  return (
    <div className="flex items-center flex-wrap gap-1 border-b border-zinc-200/70 dark:border-zinc-800 px-2 py-1.5 bg-zinc-50/70 dark:bg-zinc-950/40">
      <select
        aria-label="Police"
        value={style.fontFamily ?? ''}
        onChange={(e) =>
          e.target.value
            ? editor.chain().focus().setFontFamily(e.target.value).run()
            : editor.chain().focus().unsetFontFamily().run()
        }
        className={`${menu} max-w-[9.5rem]`}
      >
        {POLICES.map((p) => (
          <option key={p.label} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Taille du texte"
        value={style.fontSize ?? ''}
        onChange={(e) =>
          e.target.value
            ? editor.chain().focus().setFontSize(e.target.value).run()
            : editor.chain().focus().unsetFontSize().run()
        }
        className={menu}
      >
        {TAILLES.map((t) => (
          <option key={t.label} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <Sep />
      <Bouton titre="Gras" actif={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="w-3.5 h-3.5" />
      </Bouton>
      <Bouton titre="Italique" actif={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="w-3.5 h-3.5" />
      </Bouton>
      <Bouton titre="Souligné" actif={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="w-3.5 h-3.5" />
      </Bouton>
      <Bouton titre="Barré" actif={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="w-3.5 h-3.5" />
      </Bouton>
      <Bouton titre="Intertitre" actif={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="w-3.5 h-3.5" />
      </Bouton>
      <Sep />
      <span className="inline-flex items-center gap-1" role="group" aria-label="Couleur du texte">
        {COULEURS_TEXTE.map((c) => (
          <Pastille
            key={c.valeur}
            nom={`Texte ${c.nom.toLowerCase()}`}
            couleur={c.valeur}
            actif={style.color === c.valeur}
            onClick={() =>
              style.color === c.valeur
                ? editor.chain().focus().unsetColor().run()
                : editor.chain().focus().setColor(c.valeur).run()
            }
          />
        ))}
      </span>
      <Sep />
      <span className="inline-flex items-center gap-1" role="group" aria-label="Surligner">
        <Highlighter className="w-3.5 h-3.5 text-zinc-500" aria-hidden />
        {SURLIGNAGES.map((c) => (
          <Pastille
            key={c.valeur}
            nom={`Surligner en ${c.nom.toLowerCase()}`}
            couleur={c.valeur}
            actif={editor.isActive('highlight') && surlignage.color === c.valeur}
            onClick={() => editor.chain().focus().toggleHighlight({ color: c.valeur }).run()}
          />
        ))}
      </span>
      <Sep />
      <Bouton titre="Liste à puces" actif={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="w-3.5 h-3.5" />
      </Bouton>
      <Bouton titre="Liste numérotée" actif={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="w-3.5 h-3.5" />
      </Bouton>
      <Bouton titre="Aligner à gauche" actif={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
        <AlignLeft className="w-3.5 h-3.5" />
      </Bouton>
      <Bouton titre="Centrer" actif={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
        <AlignCenter className="w-3.5 h-3.5" />
      </Bouton>
      <Bouton titre="Aligner à droite" actif={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
        <AlignRight className="w-3.5 h-3.5" />
      </Bouton>
      <Bouton titre="Lien" actif={editor.isActive('link')} onClick={lien}>
        <Link2 className="w-3.5 h-3.5" />
      </Bouton>
      <Sep />
      <Bouton
        titre="Insérer un tableau"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <TableIcon className="w-3.5 h-3.5" />
      </Bouton>
      {dansTableau && (
        <>
          <Bouton titre="Ajouter une ligne" onClick={() => editor.chain().focus().addRowAfter().run()}>
            <Rows3 className="w-3.5 h-3.5" />
          </Bouton>
          <Bouton titre="Ajouter une colonne" onClick={() => editor.chain().focus().addColumnAfter().run()}>
            <Columns3 className="w-3.5 h-3.5" />
          </Bouton>
          <Bouton titre="Supprimer la ligne" onClick={() => editor.chain().focus().deleteRow().run()}>
            <Minus className="w-3.5 h-3.5" />
          </Bouton>
          <Bouton titre="Supprimer le tableau" onClick={() => editor.chain().focus().deleteTable().run()}>
            <Trash2 className="w-3.5 h-3.5" />
          </Bouton>
        </>
      )}
      <Sep />
      <Bouton titre="Annuler" onClick={() => editor.chain().focus().undo().run()}>
        <Undo className="w-3.5 h-3.5" />
      </Bouton>
      <Bouton titre="Rétablir" onClick={() => editor.chain().focus().redo().run()}>
        <Redo className="w-3.5 h-3.5" />
      </Bouton>
    </div>
  );
}

/** Détail d'une tâche en texte riche : police, gras, souligné, surlignage, tableaux. */
export function TaskDescriptionEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const editor = useEditor({
    immediatelyRender: false, // requis en SSR Next.js
    // La barre d'outils reflète la sélection : elle doit se redessiner à chaque frappe.
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Précisez la tâche : contexte, étapes, informations utiles…' }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value,
    editorProps: {
      attributes: {
        'aria-label': 'Détail de la tâche',
        class: `${CONTENU_RICHE} min-h-[120px] max-h-[420px] overflow-y-auto px-3 py-2 text-[13px] text-zinc-900 dark:text-zinc-100 focus:outline-none`,
      },
    },
    onUpdate: ({ editor: ed }) => onChange(ed.isEmpty ? '' : ed.getHTML()),
  });

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden focus-within:ring-2 focus-within:ring-orange-500/30">
      {editor && <BarreOutils editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
