import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EngagementPrompt } from '../src/components/EngagementPrompt';
import { EvidenceBadge, SourceBadge } from '../src/components/ui';

const check = (kind: 'video_presence' | 'reading_question') => ({
  checkId: 'c1',
  kind,
  trigger: 'rapid_scroll' as const,
  issuedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
});

describe('EngagementPrompt', () => {
  it('reading question: reports correctness and explains there is no penalty', async () => {
    const onRespond = vi.fn();
    render(
      <EngagementPrompt
        check={check('reading_question')}
        question={{ question: 'What does a function return without return?', options: ['0', 'None'], correctIndex: 1, explanation: '', source: 'author' }}
        onRespond={onRespond}
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/wrong answer never removes time/i)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('0'));
    await userEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(onRespond).toHaveBeenCalledWith(false);
  });

  it('video presence check offers a single accessible confirmation', async () => {
    const onRespond = vi.fn();
    render(<EngagementPrompt check={check('video_presence')} onRespond={onRespond} />);
    const btn = screen.getByRole('button', { name: /I'm here/ });
    expect(btn).toHaveFocus();
    await userEvent.click(btn);
    expect(onRespond).toHaveBeenCalledWith(undefined);
  });

  it('renders nothing without a pending check', () => {
    const { container } = render(<EngagementPrompt check={null} onRespond={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('evidence labels', () => {
  it('labels inference source exactly as reported', () => {
    render(
      <>
        <SourceBadge source="on_device" />
        <SourceBadge source="in_cloud" />
        <SourceBadge source="unknown" />
        <EvidenceBadge type="self_reported" />
      </>,
    );
    expect(screen.getByText('On-device (SDK-reported)')).toBeInTheDocument();
    expect(screen.getByText('Cloud (SDK-reported)')).toBeInTheDocument();
    expect(screen.getByText('Source not reported')).toBeInTheDocument();
    expect(screen.getByText('Self-reported')).toBeInTheDocument();
  });
});
