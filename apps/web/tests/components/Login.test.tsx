import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Login } from '../../src/components/Login';

vi.mock('../../src/lib/AuthContext', () => ({
  useAuth: () => ({
    signIn: vi.fn(),
    signInLocal: vi.fn()
  })
}));

describe('Login', () => {
  it('shows a privacy policy stub when the privacy link is selected', () => {
    render(<Login />);

    fireEvent.click(screen.getByRole('button', { name: /privacy policy/i }));

    expect(screen.getByRole('heading', { name: /privacy policy/i })).toBeInTheDocument();
    expect(screen.getByText(/POPIA/i)).toBeInTheDocument();
  });
});
