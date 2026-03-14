import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import App from '../App';

describe('smoke', () => {
  it('renders the app without crashing', () => {
    const { container } = render(<App />);
    expect(container).toBeTruthy();
  });
});
