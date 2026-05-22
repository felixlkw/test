interface RuleLineProps {
  className?: string;
}

export default function RuleLine({ className = "" }: RuleLineProps) {
  return <div className={`h-px bg-hoban-primary w-full ${className}`} />;
}
