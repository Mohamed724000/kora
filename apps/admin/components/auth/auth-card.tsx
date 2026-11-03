import type { ReactNode } from 'react';

type AuthCardProps = {
  children: ReactNode;
  description: string;
  eyebrow?: string;
  title: string;
  wide?: boolean;
};

export function AuthCard({
  children,
  description,
  eyebrow = 'Accès sécurisé',
  title,
  wide = false,
}: Readonly<AuthCardProps>) {
  return (
    <section className={`auth-card${wide ? ' auth-card--wide' : ''}`}>
      <header className="auth-card__header">
        <p className="admin-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}
