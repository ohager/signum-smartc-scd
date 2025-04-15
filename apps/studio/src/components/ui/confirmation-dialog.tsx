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
import { type ReactNode } from "react";

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
  isConfirmDisabled?: boolean;
  children?: ReactNode;
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  title = "Confirm Action",
  description = "Do you really want to do this?",
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  isConfirmDisabled = false,
  children,
}: ConfirmationDialogProps) {
  const handleConfirm = () => {
    if (isConfirmDisabled) return;
    onConfirm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SubmitOnEnter onSubmit={handleConfirm} isEnabled={!isConfirmDisabled}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <DialogDescription>{description}</DialogDescription>
            )}
          </DialogHeader>

          {children && <div className="py-4">{children}</div>}

          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              {cancelText}
            </Button>
            <Button
              variant={variant === "destructive" ? "destructive" : "default"}
              onClick={handleConfirm}
              disabled={isConfirmDisabled}
            >
              {confirmText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </SubmitOnEnter>
    </Dialog>
  );
}
