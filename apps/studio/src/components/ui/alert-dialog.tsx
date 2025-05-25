import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SubmitOnEnter } from "@/components/ui/submit-on-enter";
import { type ReactNode, useMemo } from "react";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleXIcon,
  InfoIcon,
} from "lucide-react";

interface AlertDialogProps {
  open: boolean;
  title: string;
  type: "success" | "info" | "warning" | "error";
  buttonText?: string;
  onOpenChange: (open: boolean) => void;
  description: ReactNode;
  children?: ReactNode;
}

export function AlertDialog({
  open,
  onOpenChange,
  buttonText = "Ok",
  description,
  type,
  children,
}: AlertDialogProps) {
  const handleClose = () => {
    onOpenChange(false);
  };

  const titleIcon = useMemo(() => {
    switch (type) {
      case "success":
        return <CircleCheckIcon className="h-6 w-6" color="green"/>;
      case "info":
        return <InfoIcon className="h-6 w-6" color="blue"/>;
      case "warning":
        return <CircleAlertIcon className="h-6 w-6" color="yellow"/>;
      case "error":
        return <CircleXIcon className="h-6 w-6" color="red"/>;
    }
  }, [type]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SubmitOnEnter onSubmit={handleClose}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-x-2">
              {titleIcon}
              {type.toUpperCase()}
            </DialogTitle>
            {description && (
              <DialogDescription>{description}</DialogDescription>
            )}
          </DialogHeader>

          {children && <div className="py-4">{children}</div>}

          <DialogFooter>
            <Button onClick={handleClose}>{buttonText}</Button>
          </DialogFooter>
        </DialogContent>
      </SubmitOnEnter>
    </Dialog>
  );
}
