import * as React from "react";
import { cn } from "@/lib/utils"; // Assuming you have the cn utility

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
        className={cn("flex flex-col h-full mx-auto w-full", className)}
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
    return (
      <header
        ref={ref}
        className={cn("p-4 border-b w-full", className)}
        {...props}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">{children}</div>
        </div>
      </header>
    );
  },
);
PageHeader.displayName = "PageHeader";

const PageContent = React.forwardRef<HTMLDivElement, PageContentProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("flex-1", className)} {...props}>
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
        className={cn("p-4 bg-white border-t border-gray-200", className)}
        {...props}
      >
        {children}
      </footer>
    );
  },
);
PageFooter.displayName = "PageFooter";

export { Page, PageHeader, PageContent, PageFooter };
