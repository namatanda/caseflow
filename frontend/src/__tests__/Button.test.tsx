import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../components/common/Button';

describe('Button', () => {
  it('renders children correctly', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('handles click events', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(<Button onClick={handleClick}>Click me</Button>);

    await user.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies default props', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByText('Click me');

    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('MuiButton-contained');
  });

  it('passes through additional props', () => {
    render(<Button disabled>Click me</Button>);
    const button = screen.getByText('Click me');

    expect(button).toBeDisabled();
  });
});