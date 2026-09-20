import * as React from "react";
import { cn } from "@/lib/utils";
import { useMatch } from "react-router";
import { WorkflowRail } from "@/features/workflow/rail";

interface PageProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

interface PageHeaderProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

interface PageContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

interface PageFooterProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

const Page = React.forwardRef<HTMLDivElement, PageProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("flex flex-col h-full mx-auto w-full min-w-0", className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);
Page.displayName = "Page";

const PageHeader = React.forwardRef<HTMLElement, PageHeaderProps>(
  ({ className, children, ...props }, ref) => {
    // The home page has no contract to report on and keeps its own strip.
    const inProject = !!useMatch("/projects/:projectId/*");

    // The header carries identity and the rail, and nothing else. Features
    // used to push their buttons in here through a global atom, which is why
    // its contents depended on which one mounted last; each verb now belongs
    // to the surface it acts on.
    return (
      <header
        ref={ref}
        className={cn(
          // `py-0.5` rather than `p-4`: the rail is a 52px drawing, and 16px
          // of vertical padding leaves it nowhere to stand.
          "flex h-[60px] w-full shrink-0 items-center gap-4 border-b px-4 py-0.5",
          className,
        )}
        {...props}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {children}
        </div>
        {inProject && <WorkflowRail />}
      </header>
    );
  },
);
PageHeader.displayName = "PageHeader";

const PageContent = React.forwardRef<HTMLDivElement, PageContentProps>(
  ({ className, children, ...props }, ref) => {
    return (
      // `min-h-0` is the whole point: without it a flex child refuses to
      // shrink below its content, and every editor inside scrolls the page
      // instead of itself.
      <div
        ref={ref}
        className={cn("flex min-h-0 flex-1 flex-col", className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);
PageContent.displayName = "PageContent";

const PageFooter = React.forwardRef<HTMLElement, PageFooterProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <footer
        ref={ref}
        className={cn("p-4 bg-[var(--bg2)] border-t border-[var(--border-1)]", className)}
        {...props}
      >
        {children}
      </footer>
    );
  },
);
PageFooter.displayName = "PageFooter";

export { Page, PageHeader, PageContent, PageFooter };
