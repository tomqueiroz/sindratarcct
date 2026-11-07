import { NavLink, type NavLinkProps } from "react-router-dom";

import { cn } from "@/lib/utils";

type AppNavLinkProps = Omit<NavLinkProps, "className"> & {
  className?: string;
  activeClassName?: string;
  inactiveClassName?: string;
};

export function AppNavLink({
  className,
  activeClassName,
  inactiveClassName,
  ...props
}: AppNavLinkProps) {
  return (
    <NavLink
      {...props}
      className={({ isActive }: { isActive: boolean }) =>
        cn(className, isActive ? activeClassName : inactiveClassName)
      }
    />
  );
}
