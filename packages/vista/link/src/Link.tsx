import React, { MouseEvent } from "react";
import { useRouter } from "next/router";

/**
 * Determines whether a URL is external.
 * External URLs start with a scheme (http://, https://, //) or a mailto: / tel: link.
 */
function isExternal(url: string): boolean {
  // Trim whitespace
  const trimmed = url.trim().toLowerCase();

  // Protocol‑relative URLs (e.g. //example.com)
  if (trimmed.startsWith("//")) return true;

  // Absolute URLs with a scheme
  if (/^[a-z][a-z0-9+.-]*:/.test(trimmed)) return true;

  // Mailto / tel links
  if (trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) return true;

  return false;
}

export interface LinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  /** Destination URL. */
  href: string;
  /** Optional click handler that runs before navigation. */
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * Vista Link component – client‑side navigation for internal routes.
 *
 * For external URLs (http(s)://, //, mailto:, tel:) the component behaves like a
 * normal `<a>` element – it does **not** intercept the click, preserving the
 * expected full‑page navigation or browser handling.
 *
 * For internal URLs (relative paths or absolute paths starting with `/`) the
 * click is intercepted and `next/router` is used to perform a client‑side
 * navigation without a full reload.
 *
 * The component also adds `rel="noopener noreferrer"` automatically when
 * `target="_blank"` is used on external links for security.
 */
export const Link: React.FC<LinkProps> = ({
  href,
  onClick,
  target,
  rel,
  children,
  ...rest
}) => {
  const router = useRouter();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Allow user‑provided onClick to run first.
    if (onClick) onClick(e);
    // If the user already called preventDefault, respect it.
    if (e.defaultPrevented) return;

    // Do not intercept external URLs or links that explicitly request a new tab/window.
    if (isExternal(href) || target === "_blank") return;

    // Prevent the default anchor navigation and use Next.js router for client‑side navigation.
    e.preventDefault();
    router.push(href);
  };

  // When the link is external and opens in a new tab, ensure safe rel attributes.
  const safeRel =
    isExternal(href) && target === "_blank"
      ? `${rel ?? ""} noopener noreferrer`.trim()
      : rel;

  return (
    <a
      href={href}
      onClick={handleClick}
      target={target}
      rel={safeRel}
      {...rest}
    >
      {children}
    </a>
  );
};
