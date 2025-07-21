import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import App from './App';
import { UIProvider } from './contexts/UIContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';

vi.mock('@clerk/clerk-react', () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SignedIn: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SignedOut: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SignInButton: () => <button type="button">Sign in</button>,
  UserButton: () => <div />,
  useUser: () => ({
    isSignedIn: false,
    user: null,
    isLoaded: true,
  }),
}));

const queryClient = new QueryClient();

test('renders sign in button when signed out', () => {
  render(
    <QueryClientProvider client={queryClient}>
      <UIProvider>
        <App />
      </UIProvider>
    </QueryClientProvider>
  );

  expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
});


