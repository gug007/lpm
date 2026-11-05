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
      <h2 className="mt-4 mb-0.5 text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
        {title}
      </h2>
      <ul className={listClassName}>
        {links.map(({ href, label }) => (
          <li key={href}>
            <NavLink href={href} className={linkClassName}>
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
