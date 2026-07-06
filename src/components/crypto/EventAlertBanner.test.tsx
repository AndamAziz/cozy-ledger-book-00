import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventAlertBanner, type CalendarEvent } from './EventAlertBanner';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { TooltipProvider } from '@/components/ui/tooltip';

const LANGUAGE_STORAGE_KEY = 'central-tech-platform-language';

beforeEach(() => {
  localStorage.clear();
});

function renderBanner(events: CalendarEvent[], lang: 'en' | 'ku' = 'en') {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
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

// NFP that BEAT expectations: Actual 200K > Forecast 110K → stronger USD, bearish gold.
const nfpBeat: CalendarEvent = {
  ...nfpReleased,
  actual: '200K',
};

describe('EventAlertBanner — NFP confidence states (USD + Gold)', () => {
  it('High match (miss): shows High badge + bearish-USD / bullish-Gold call', () => {
    renderBanner([{ ...nfpReleased, actualConfidence: 'high' }]);
    expect(screen.getByText('High match')).toBeInTheDocument();
    expect(screen.getByText(/Actual: 57K/)).toBeInTheDocument();
    const call = screen.getByText('Weaker than forecast → bearish for USD, bullish for Gold');
    expect(call).toHaveTextContent(/bearish for USD/);
    expect(call).toHaveTextContent(/bullish for Gold/);
  });

  it('High match (beat): shows High badge + bullish-USD / bearish-Gold call', () => {
    renderBanner([{ ...nfpBeat, actualConfidence: 'high' }]);
    expect(screen.getByText('High match')).toBeInTheDocument();
    expect(screen.getByText(/Actual: 200K/)).toBeInTheDocument();
    const call = screen.getByText('Stronger than forecast → bullish for USD, bearish for Gold');
    expect(call).toHaveTextContent(/bullish for USD/);
    expect(call).toHaveTextContent(/bearish for Gold/);
  });

  it('Likely match (miss): shows Likely badge + bearish-USD / bullish-Gold call', () => {
    renderBanner([{ ...nfpReleased, actualConfidence: 'medium' }]);
    expect(screen.getByText('Likely')).toBeInTheDocument();
    expect(screen.queryByText('High match')).not.toBeInTheDocument();
    expect(screen.getByText(/Actual: 57K/)).toBeInTheDocument();
    const call = screen.getByText('Weaker than forecast → bearish for USD, bullish for Gold');
    expect(call).toHaveTextContent(/bearish for USD/);
    expect(call).toHaveTextContent(/bullish for Gold/);
  });

  it('Likely match (beat): shows Likely badge + bullish-USD / bearish-Gold call', () => {
    renderBanner([{ ...nfpBeat, actualConfidence: 'medium' }]);
    expect(screen.getByText('Likely')).toBeInTheDocument();
    expect(screen.queryByText('High match')).not.toBeInTheDocument();
    const call = screen.getByText('Stronger than forecast → bullish for USD, bearish for Gold');
    expect(call).toHaveTextContent(/bullish for USD/);
    expect(call).toHaveTextContent(/bearish for Gold/);
  });

  it('Actual unavailable: shows unavailable badge and hides USD + Gold call', () => {
    renderBanner([{ ...nfpReleased, actual: '', actualConfidence: undefined }]);
    expect(screen.getAllByText('Actual unavailable').length).toBeGreaterThan(0);
    expect(screen.queryByText('High match')).not.toBeInTheDocument();
    expect(screen.queryByText('Likely')).not.toBeInTheDocument();
    // Neither the USD nor the Gold directional call should render without an actual.
    expect(screen.queryByText(/for USD/)).not.toBeInTheDocument();
    expect(screen.queryByText(/for Gold/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Actual: 57K/)).not.toBeInTheDocument();
  });
});
