import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import BaseAssetTabs from './BaseAssetTabs';
import { UIProvider } from '../contexts/UIContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

test('renders tabs and handles clicks', async () => {
  render(
    <QueryClientProvider client={queryClient}>
      <UIProvider>
        <BaseAssetTabs />
      </UIProvider>
    </QueryClientProvider>
  );

  // Wait for the tabs to render
  await screen.findByText('resume.md');

  expect(screen.getByText('resume.md')).toBeInTheDocument();
  expect(screen.getByText('personalinfo.md')).toBeInTheDocument();
});
