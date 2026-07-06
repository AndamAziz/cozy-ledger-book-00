import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventAlertBanner, type CalendarEvent } from './EventAlertBanner';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { TooltipProvider } from '@/components/ui/tooltip';

function renderBanner(events: CalendarEvent[]) {
  return render(
    <LanguageProvider>
      <TooltipProvider>
        <EventAlertBanner events={events} loading={false} />
      </TooltipProvider>
    </LanguageProvider>,
  );
}

// Real-world NFP release fixture: Actual 57K missed the 110K forecast (previous 172K).
// Missing forecast → weaker USD → bullish gold. Released 1 hour ago so it lands in
// the "last 24h" window with a confident TradingView match.
const nfpReleased: CalendarEvent = {
  title: 'Non-Farm Employment Change',
  country: 'USD',
  impact: 'High',
  date: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  forecast: '110K',
  previous: '172K',
  actual: '57K',
  actualConfidence: 'high',
};

describe('EventAlertBanner — released NFP', () => {
  it('renders the released Actual figure with forecast and previous', () => {
    renderBanner([nfpReleased]);
    expect(screen.getByText('Latest results')).toBeInTheDocument();
    expect(screen.getByText(/Actual: 57K/)).toBeInTheDocument();
    expect(screen.getByText(/Forecast: 110K/)).toBeInTheDocument();
    expect(screen.getByText(/Previous: 172K/)).toBeInTheDocument();
  });

  it('renders the auto-generated bullish-gold explanation', () => {
    renderBanner([nfpReleased]);
    expect(
      screen.getByText('Weaker than forecast → bearish for USD, bullish for Gold'),
    ).toBeInTheDocument();
  });

  it('shows a High match confidence badge for a confidently matched actual', () => {
    renderBanner([nfpReleased]);
    expect(screen.getByText('High match')).toBeInTheDocument();
  });

  it('labels the explanation with beat/miss logic (forecast available)', () => {
    renderBanner([nfpReleased]);
    expect(screen.getByText('Beat/miss logic')).toBeInTheDocument();
  });

  it('reveals the method tooltip on interaction', async () => {
    const user = userEvent.setup();
    renderBanner([nfpReleased]);
    await user.hover(screen.getByRole('button', { name: /how this call was made/i }));
    const tips = await screen.findAllByText(/Compared Actual vs Forecast \(beat\/miss logic\)/);
    expect(tips.length).toBeGreaterThan(0);
  });

  it('uses direction logic when no forecast is present', () => {
    renderBanner([{ ...nfpReleased, forecast: '' }]);
    expect(screen.getByText('Direction logic')).toBeInTheDocument();
  });

  it('shows "Actual unavailable" when the actual figure is not confidently matched', () => {
    renderBanner([{ ...nfpReleased, actual: '', actualConfidence: undefined }]);
    const badges = screen.getAllByText('Actual unavailable');
    expect(badges.length).toBeGreaterThan(0);
    expect(screen.queryByText(/Actual: 57K/)).not.toBeInTheDocument();
  });
});
