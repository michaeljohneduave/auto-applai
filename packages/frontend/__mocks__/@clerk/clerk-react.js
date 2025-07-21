import { vi } from 'vitest';

vi.mock('@clerk/clerk-react', () => ({
  ClerkProvider: ({ children }) => <div>{children}</div>,
  SignedIn: ({ children }) => <div>{children}</div>,
  SignedOut: ({ children }) => <div>{children}</div>,
  UserButton: () => <div />,
  useUser: () => ({
    isSignedIn: false,
    user: null,
    isLoaded: true,
  }),
}));
