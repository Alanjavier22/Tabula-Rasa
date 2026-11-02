const SkeletonRow = () => {
  return (
    <div className="flex items-center justify-between p-3 bg-surface rounded-xl animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-surface-strong" />
        <div className="space-y-2">
          <div className="h-4 w-32 bg-surface-strong rounded" />
          <div className="h-3 w-24 bg-surface-strong rounded" />
        </div>
      </div>
      <div className="h-6 w-20 bg-surface-strong rounded" />
    </div>
  );
};

export default SkeletonRow;
