import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MonitorIcon } from "lucide-react";
import { t } from "@/i18n/runtime";

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
        <AlertTitle>{t("home.smallScreen.title")}</AlertTitle>
        <AlertDescription>
          <p>
            {t("home.smallScreen.body")}
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}
