const SkeletonRow = () => {
  return (
    <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-xl animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-slate-600/50" />
        <div className="space-y-2">
          <div className="h-4 w-32 bg-slate-600/50 rounded" />
          <div className="h-3 w-24 bg-slate-600/50 rounded" />
        </div>
      </div>
      <div className="h-6 w-20 bg-slate-600/50 rounded" />
    </div>
  );
};

export default SkeletonRow;
