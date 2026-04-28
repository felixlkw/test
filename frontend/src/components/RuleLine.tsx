interface RuleLineProps {
  className?: string;
}

export default function RuleLine({ className = "" }: RuleLineProps) {
  return <div className={`h-px bg-pwc-orange w-full ${className}`} />;
}
