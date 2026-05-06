// PermitChip — placeholder. PR 5에서 History row에 사용.
interface PermitChipProps {
  count: number;
}

export function PermitChip({ count }: PermitChipProps) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-pwc-orange-wash border border-pwc-orange/30 text-pwc-orange uppercase tracking-wider">
      허가서 {count}
    </span>
  );
}
