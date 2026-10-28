interface SkeletonChartProps {
  height?: string;
}

const SkeletonChart = ({ height = 'h-64' }: SkeletonChartProps) => {
  return (
    <div className={`${height} bg-surface  rounded-2xl border border-line animate-pulse`} />
  );
};

export default SkeletonChart;
