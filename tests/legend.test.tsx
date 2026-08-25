// Тесты легенды (SPEC §4.6, задача process-map-jl8, макет — левый нижний
// угол артбордов A1/A2). Компонент чистый — без React Flow и без store.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Legend } from '../src/components/Legend';
import { ru } from '../src/i18n/ru';

describe('Legend', () => {
  it('показывает все 4 пункта условных обозначений в блоке с aria-label', () => {
    render(<Legend />);

    const group = screen.getByRole('group', { name: ru.legend.ariaLabel });
    expect(group).toBeInTheDocument();
    expect(screen.getByText(ru.legend.step)).toBeInTheDocument();
    expect(screen.getByText(ru.legend.data)).toBeInTheDocument();
    expect(screen.getByText(ru.legend.integration)).toBeInTheDocument();
    expect(screen.getByText(ru.legend.warning)).toBeInTheDocument();
  });

  it('не содержит фокусируемых элементов — легенда не интерактивна', () => {
    const { container } = render(<Legend />);
    expect(container.querySelectorAll('button, a, [tabindex]')).toHaveLength(0);
  });
});
