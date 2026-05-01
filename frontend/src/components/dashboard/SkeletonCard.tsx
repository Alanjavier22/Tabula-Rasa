interface SkeletonCardProps {
  height?: string;
}

const SkeletonCard = ({ height = 'h-32' }: SkeletonCardProps) => {
  return (
    <div className={`${height} bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 animate-pulse`} />
  );
};

export default SkeletonCard;
