import { Activity } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode, MouseEventHandler } from 'react';
import type { ButtonVariant } from '../types';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
  isLoading?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95',
  secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
  danger: 'bg-red-500 text-white hover:bg-red-600',
  outline: 'border border-slate-200 text-slate-600 hover:bg-slate-50'
};

export function Button({
  children,
  variant = 'primary',
  className = '',
  isLoading = false,
  type = 'button',
  disabled,
  ...props
}: ButtonProps) {
  const base = 'px-4 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50';
  return (
    <button
      type={type}
      disabled={isLoading || disabled}
      className={`${base} ${variants[variant]} ${className}`}
      {...props}
    >
      {isLoading ? <Activity className="animate-spin" size={18} /> : children}
    </button>
  );
}
