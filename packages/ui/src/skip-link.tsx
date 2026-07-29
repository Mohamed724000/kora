import type { AnchorHTMLAttributes } from 'react';

export type SkipLinkProps = AnchorHTMLAttributes<HTMLAnchorElement>;

export function SkipLink({ className, ...props }: SkipLinkProps) {
  const classes = ['kp-skip-link', className].filter(Boolean).join(' ');

  return <a className={classes} {...props} />;
}
