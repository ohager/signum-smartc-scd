import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MonitorIcon } from "lucide-react";

/**
 * The studio is a multi-pane IDE (sidebar, editor, simulator, deploy rail) and
 * is not usable on phones or small tablets. Pure CSS (`lg:hidden`) rather than
 * `useIsMobile`, so it follows resizes and rotation without a re-render.
 */
export function SmallScreenNotice() {
  return (
    <div className="px-6 pt-4 lg:hidden">
      <Alert>
        <MonitorIcon />
        <AlertTitle>Best on a larger screen</AlertTitle>
        <AlertDescription>
          <p>
            SmartC Studio is built for desktop use. On small screens the editor, simulator and
            deployment views won't have enough room — please switch to a laptop or desktop.
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}
