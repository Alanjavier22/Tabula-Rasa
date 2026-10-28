interface SkeletonCardProps {
  height?: string;
}

const SkeletonCard = ({ height = 'h-32' }: SkeletonCardProps) => {
  return (
    <div className={`${height} bg-surface  rounded-2xl border border-line animate-pulse`} />
  );
};

export default SkeletonCard;
