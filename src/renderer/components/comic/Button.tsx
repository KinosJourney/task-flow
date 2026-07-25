import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'accent' | 'pop';
  size?: 'md' | 'sm';
  icon?: string;
  children: ReactNode;
}

export function Button({
  variant = 'default',
  size = 'md',
  icon,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  const variantClass =
    variant === 'accent' ? 'btn-accent' : variant === 'pop' ? 'btn-pop' : '';
  const sizeClass = size === 'sm' ? 'btn-sm' : '';
  return (
    <button className={`btn ${variantClass} ${sizeClass} ${className}`} {...rest}>
      {icon && <span>{icon}</span>}
      {children}
    </button>
  );
}
