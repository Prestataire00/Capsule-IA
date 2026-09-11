import { FileText } from 'lucide-react';

/** Ouvre le BPF officiel (PDF Cerfa 10443*17) : à la fois imprimable et téléchargeable. */
export function PrintButton({ year }: { year: number }) {
  return (
    <a
      href={`/api/bpf/${year}/bpf.pdf`}
      target="_blank"
      rel="noopener noreferrer"
      className="print:hidden bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 inline-flex items-center gap-2"
    >
      <FileText className="w-4 h-4" />
      PDF officiel (Cerfa 10443*17)
    </a>
  );
}
