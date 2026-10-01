import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

vi.mock('@/components/ThemeProvider', () => ({ useTheme: () => ({ t: (k) => `t:${k}` }) }));

let explode = true;
function Page() {
  if (explode) throw new Error('boom');
  return <p>page content</p>;
}

test('a crash shows a translated way out instead of a blank screen', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  explode = true;
  render(<ErrorBoundary resetKey="Expenses"><Page /></ErrorBoundary>);
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByText('t:errTitle')).toBeTruthy();
  expect(screen.getByText('t:errRetry')).toBeTruthy();
});

test('Try again re-renders the page', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  explode = true;
  render(<ErrorBoundary resetKey="Expenses"><Page /></ErrorBoundary>);
  explode = false;
  fireEvent.click(screen.getByText('t:errRetry'));
  expect(screen.getByText('page content')).toBeTruthy();
});

test('moving to another page clears the error', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  explode = true;
  const { rerender } = render(<ErrorBoundary resetKey="Expenses"><Page /></ErrorBoundary>);
  explode = false;
  rerender(<ErrorBoundary resetKey="Dashboard"><Page /></ErrorBoundary>);
  expect(screen.getByText('page content')).toBeTruthy();
});
