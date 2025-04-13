import { cn } from "@/lib/utils";

interface Props extends React.HTMLAttributes<HTMLDivElement> {}

export const LoadingSpinner = ({ className, ...props }: Props) => {
  return (
    <div
      className={cn("flex items-center justify-center", className)}
      {...props}
    >
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
    </div>
  );
};
