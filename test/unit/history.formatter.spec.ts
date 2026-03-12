import { formatHistoryEntries, telegramCopy } from '../../src/telegram/telegram.copy';

describe('formatHistoryEntries', () => {
  it('renders compact history items without losing meaning', () => {
    const text = formatHistoryEntries(
      [
        {
          entryDate: new Date('2026-03-12T00:00:00.000Z'),
          moodScore: 7,
          energyScore: 6,
          stressScore: 4,
          sleepHours: 7.5,
          sleepQuality: 8,
          hasNote: true,
          eventsCount: 2,
        },
        {
          entryDate: new Date('2026-03-11T00:00:00.000Z'),
          moodScore: 5,
          energyScore: 5,
          stressScore: 5,
          hasNote: false,
          eventsCount: 0,
        },
      ],
      { title: telegramCopy.history.moreTitle },
    );

    expect(text).toContain(telegramCopy.history.moreTitle);
    expect(text).toContain('• 12.03.2026');
    expect(text).toContain('Настр./Энерг./Стресс: 7/6/4');
    expect(text).toContain('Сон: 7.5 ч, качество 8');
    expect(text).toContain('Заметка: есть · События: 2');
    expect(text).toContain('• 11.03.2026');
    expect(text).toContain('Заметка: — · События: 0');
  });
});
