interface SkeletonChartProps {
  height?: string;
}

const SkeletonChart = ({ height = 'h-64' }: SkeletonChartProps) => {
  return (
    <div className={`${height} bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 animate-pulse`} />
  );
};

export default SkeletonChart;
