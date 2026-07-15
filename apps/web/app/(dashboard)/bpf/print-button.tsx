import { FileText } from 'lucide-react';

/** Ouvre le BPF officiel (PDF Cerfa 10443*17) : à la fois imprimable et téléchargeable. */
export function PrintButton({ year }: { year: number }) {
  return (
    <a
      href={`/api/bpf/${year}/bpf.pdf`}
      target="_blank"
      rel="noopener noreferrer"
      className="print:hidden inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm"
    >
      <FileText className="w-3.5 h-3.5" />
      PDF officiel (Cerfa 10443*17)
    </a>
  );
}
