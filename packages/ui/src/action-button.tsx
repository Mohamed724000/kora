import type { ButtonHTMLAttributes } from 'react';

export type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
};

export function ActionButton({
  className,
  type = 'button',
  variant = 'primary',
  ...props
}: ActionButtonProps) {
  const classes = ['kp-action-button', `kp-action-button--${variant}`, className]
    .filter(Boolean)
    .join(' ');

  return <button className={classes} type={type} {...props} />;
}
