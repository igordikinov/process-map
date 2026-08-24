import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../src/App';
import { ru } from '../src/i18n/ru';

describe('App', () => {
  it('renders the app title', () => {
    render(<App />);
    expect(screen.getByText(ru.appTitle)).toBeInTheDocument();
  });
});
