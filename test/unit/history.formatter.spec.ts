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
          tagsCount: 2,
          eventsCount: 2,
        },
        {
          entryDate: new Date('2026-03-11T00:00:00.000Z'),
          moodScore: 5,
          energyScore: 5,
          stressScore: 5,
          hasNote: false,
          tagsCount: 0,
          eventsCount: 0,
        },
      ],
      { title: telegramCopy.history.moreTitle },
    );

    expect(text).toContain(telegramCopy.history.moreTitle);
    expect(text).toContain('📅 <b>12.03.2026</b>');
    expect(text).toContain('настроение <b>7</b> · энергия <b>6</b> · стресс <b>4</b>');
    expect(text).toContain('😴 <b>Сон</b>: 7.5 ч · качество 8');
    expect(text).toContain('📝 заметка · 🏷 2 тега · 🗂 2 события');
    expect(text).toContain('📅 <b>11.03.2026</b>');
    expect(text).toContain('🗂 0 событий');
  });
});
