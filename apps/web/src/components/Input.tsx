import { useId, type ChangeEventHandler, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  className?: string;
  value?: string | number;
  type?: string;
  required?: boolean;
  onChange?: ChangeEventHandler<HTMLInputElement>;
}

export function Input({ label, className = '', ...props }: InputProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1 w-full">
      {label && (
        <label htmlFor={id} className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {label}
        </label>
      )}
      <input
        id={id}
        {...props}
        className={`px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${className}`}
      />
    </div>
  );
}
