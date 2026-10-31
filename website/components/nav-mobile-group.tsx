import { NavLink } from "./nav-link";

export type NavMobileGroupSpec = {
  title: string;
  links: { href: string; label: string }[];
  listClassName: string;
  linkClassName: string;
};

export function NavMobileGroup({
  title,
  links,
  listClassName,
  linkClassName,
}: NavMobileGroupSpec) {
  return (
    <div>
      <p className="mt-4 mb-0.5 text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
        {title}
      </p>
      <div className={listClassName}>
        {links.map(({ href, label }) => (
          <NavLink key={href} href={href} className={linkClassName}>
            {label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
